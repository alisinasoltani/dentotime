from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination
from rest_framework.exceptions import PermissionDenied

from accounts.permissions import IsAdminRole
from accounts.models import User, NormalUser
from messaging.models import MessageThread, Message, MessageAttachment
from .permissions import IsParticipantOrAdmin
from .serializers import (
    ThreadListSerializer, MessageSerializer, MessageCreateSerializer, AdminThreadUpdateSerializer, GuestMessageSerializer
)
from rest_framework.generics import RetrieveUpdateDestroyAPIView

from django.utils import timezone
from core.sms_service import send_new_message

from rest_framework.permissions import AllowAny

class MessageCursorPagination(CursorPagination):
    page_size = 50
    ordering = "-created_at"

class ThreadListView(generics.ListAPIView):
    serializer_class = ThreadListSerializer
    permission_classes = (IsParticipantOrAdmin,)

    def get_queryset(self):
        user = self.request.user
        qs = MessageThread.objects.select_related("participant", "assigned_admin")
        
        if user.is_admin_role:
            qs = qs.all()
        else:
            qs = qs.filter(participant=user)
            
        # Annotate unread count: messages not sent by this user and not read
        return qs.annotate(
            unread_count=Count(
                "messages",
                filter=Q(messages__read_by_recipient=False) & ~Q(messages__sender=user)
            )
        ).order_by("-last_message_at")

class ThreadGetOrCreateView(APIView):
    """Get or create a thread for the current user/doctor."""
    permission_classes = (IsParticipantOrAdmin,)

    def post(self, request):
        user = request.user
        thread_type = (
            MessageThread.ThreadType.DOCTOR_ADMIN
            if user.is_doctor_role
            else MessageThread.ThreadType.USER_ADMIN
        )
        
        # Check if doctor is allowed to chat
        if user.is_doctor_role:
            doctor_profile = user.doctor_profile
            if not doctor_profile.chat_enabled:
                raise PermissionDenied("Your chat privileges are disabled. Wait for admin approval.")

        thread, created = MessageThread.objects.get_or_create(
            participant=user,
            thread_type=thread_type,
            status=MessageThread.Status.OPEN,
        )
        
        return Response(ThreadListSerializer(thread).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

class MessageListCreateView(generics.ListCreateAPIView):
    pagination_class = MessageCursorPagination
    permission_classes = (IsParticipantOrAdmin,)

    def get_serializer_class(self):
        if self.request.method == "POST":
            return MessageCreateSerializer
        return MessageSerializer

    def get_queryset(self):
        thread = get_object_or_404(MessageThread, pk=self.kwargs["pk"])
        if not (self.request.user.is_admin_role or thread.participant_id == self.request.user.id):
            return Message.objects.none()
        return Message.objects.filter(thread=thread).prefetch_related("attachments").order_by("created_at")

    @transaction.atomic
    def perform_create(self, serializer):
        thread = get_object_or_404(MessageThread, pk=self.kwargs["pk"])
        
        if not (self.request.user.is_admin_role or thread.participant_id == self.request.user.id):
            raise PermissionDenied("You do not have access to this thread.")
        
        
        sender = self.request.user
        time_str = timezone.now().strftime("%H:%M")
        
        if sender.is_admin_role:
            send_new_message(thread.participant.phone_number, time_str)
        else:
            admin_phones = User.objects.filter(role="ADMIN", is_active=True).values_list('phone_number', flat=True)
            for phone in admin_phones:
                send_new_message(phone, time_str)
            
        if self.request.user.is_doctor_role:
            doctor_profile = self.request.user.doctor_profile
            if not doctor_profile.chat_enabled:
                raise PermissionDenied("Your chat privileges are disabled. Wait for admin approval.")

        sender_type = Message.SenderType.ADMIN if self.request.user.is_admin_role else (
            Message.SenderType.DOCTOR if self.request.user.is_doctor_role else Message.SenderType.USER
        )

        # Pass thread/sender to serializer's create method. 
        # Attachments are handled automatically by the serializer now!
        serializer.save(
            thread=thread,
            sender=self.request.user,
            sender_type=sender_type
        )
    def create(self, request, *args, **kwargs):
        """Override create to return the full MessageSerializer in the response."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        # Re-fetch the message with attachments to serialize for the response
        message = Message.objects.get(pk=serializer.instance.pk)
        response_serializer = MessageSerializer(message, context=self.get_serializer_context())
        
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

class ThreadMarkReadView(APIView):
    permission_classes = (IsParticipantOrAdmin,)

    def patch(self, request, pk):
        thread = get_object_or_404(MessageThread, pk=pk)
        
        if not (request.user.is_admin_role or thread.participant_id == request.user.id):
            return Response({"detail": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)
            
        Message.objects.filter(thread=thread, read_by_recipient=False).exclude(sender=request.user).update(
            read_by_recipient=True, read_at=timezone.now()
        )
        return Response({"detail": "Marked as read."})

class AdminThreadUpdateView(RetrieveUpdateDestroyAPIView):
    """Admin view to update or delete a thread."""
    queryset = MessageThread.objects.all()
    serializer_class = AdminThreadUpdateSerializer
    permission_classes = (IsAdminRole,)

class GuestMessageView(APIView):
    """Allows unauthenticated users to send a message to admins."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = GuestMessageSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        data = serializer.validated_data
        phone = data["phone_number"]
        first_name = data["first_name"]
        last_name = data["last_name"]
        body = data["body"]

        # ۱. پیدا کردن کاربر یا ساخت کاربر جدید
        user, created = NormalUser.objects.get_or_create(
            phone_number=phone,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "role": "USER",
            }
        )

        # اگر کاربر قبلاً وجود داشت اما اسمش عوض شده، آپدیتش می‌کنیم
        if not created:
            user.first_name = first_name
            user.last_name = last_name
            user.save(update_fields=["first_name", "last_name"])

        # ۲. پیدا کردن یا ایجاد ترد چت
        thread, thread_created = MessageThread.objects.get_or_create(
            participant=user,
            thread_type=MessageThread.ThreadType.USER_ADMIN,
            status=MessageThread.Status.OPEN
        )

        # ۳. ذخیره پیام
        Message.objects.create(
            thread=thread,
            sender=user,
            sender_type=Message.SenderType.USER,
            body=body
        )

        # ۴. ارسال پیامک به ادمین‌ها
        time_str = timezone.now().strftime("%H:%M")
        admin_phones = User.objects.filter(role="ADMIN", is_active=True).values_list('phone_number', flat=True)
        for admin_phone in admin_phones:
            send_new_message(admin_phone, time_str)

        return Response({"detail": "پیام شما با موفقیت ارسال شد."}, status=status.HTTP_201_CREATED)
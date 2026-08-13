from datetime import datetime, timezone as datetime_timezone

from django.conf import settings
from django.db import transaction
from django.db.models import (
    Count,
    DateTimeField,
    F,
    OuterRef,
    Prefetch,
    Q,
    Subquery,
    TextField,
    Value,
)
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdminRole
from core.sms_service import queue_new_message
from messaging.models import Message, MessageAttachment, MessageThread, ThreadReadState
from messaging.permissions import CanCreateOwnThread, IsParticipantOrAdmin
from messaging.realtime import publish_message_event
from messaging.serializers import (
    AdminThreadUpdateSerializer,
    GuestMessageSerializer,
    MessageCreateSerializer,
    MessageSerializer,
    ThreadListSerializer,
)


class MessageCursorPagination(CursorPagination):
    page_size = 50
    ordering = ("-created_at", "-id")


def _visible_message_filter(user):
    query = Q(messages__is_deleted=False)
    if not user.is_admin_role:
        query &= Q(messages__visibility=Message.Visibility.PARTICIPANTS)
    return query


def _message_queryset(*, thread, user):
    queryset = Message.objects.filter(thread=thread, is_deleted=False)
    if not user.is_admin_role:
        queryset = queryset.filter(visibility=Message.Visibility.PARTICIPANTS)
    return queryset.select_related("sender").prefetch_related(
        Prefetch(
            "attachments",
            queryset=MessageAttachment.objects.filter(is_deleted=False).select_related(
                "asset"
            ),
        )
    )


def _get_visible_thread(*, user, thread_id, for_update=False):
    queryset = MessageThread.objects.filter(deleted_at__isnull=True).select_related(
        "participant"
    )
    if for_update:
        queryset = queryset.select_for_update(of=("self",))
    if not user.is_admin_role:
        queryset = queryset.filter(participant_id=user.pk)
    return get_object_or_404(queryset, pk=thread_id)


def _queue_notifications(*, sender, thread, visibility):
    if visibility != Message.Visibility.PARTICIPANTS:
        return
    time_str = timezone.localtime().strftime("%H:%M")
    if sender.is_admin_role:
        phones = [thread.participant.phone_number] if thread.participant_id else []
    else:
        phones = list(
            User.objects.filter(role=User.Role.ADMIN, is_active=True).values_list(
                "phone_number", flat=True
            )
        )
    def dispatch_notifications():
        for phone in phones:
            queue_new_message(phone, time_str)

    transaction.on_commit(dispatch_notifications)


class ThreadListView(generics.ListAPIView):
    serializer_class = ThreadListSerializer
    permission_classes = (IsParticipantOrAdmin,)

    def get_queryset(self):
        user = self.request.user
        queryset = MessageThread.objects.filter(deleted_at__isnull=True).select_related(
            "participant", "assigned_admin"
        )
        if user.is_admin_role:
            search = self.request.query_params.get("search", "").strip()
            if search:
                queryset = queryset.filter(
                    Q(participant__first_name__icontains=search)
                    | Q(participant__last_name__icontains=search)
                    | Q(participant__phone_number__icontains=search)
                    | Q(guest_first_name__icontains=search)
                    | Q(guest_last_name__icontains=search)
                    | Q(guest_phone__icontains=search)
                )
        else:
            queryset = queryset.filter(participant=user)

        read_at = ThreadReadState.objects.filter(
            thread_id=OuterRef("pk"), user=user
        ).values("last_read_at")[:1]
        visible_messages = Message.objects.filter(
            thread_id=OuterRef("pk"), is_deleted=False
        )
        if not user.is_admin_role:
            visible_messages = visible_messages.filter(
                visibility=Message.Visibility.PARTICIPANTS
            )
        last_message = visible_messages.order_by("-created_at", "-id").values("body")[:1]

        epoch = datetime(1970, 1, 1, tzinfo=datetime_timezone.utc)
        queryset = queryset.annotate(
            _read_cursor_at=Coalesce(
                Subquery(read_at, output_field=DateTimeField()),
                Value(epoch, output_field=DateTimeField()),
            ),
            _last_message=Coalesce(
                Subquery(last_message, output_field=TextField()),
                Value(""),
                output_field=TextField(),
            ),
        )
        visible_filter = _visible_message_filter(user)
        return queryset.annotate(
            unread_count=Count(
                "messages",
                filter=(
                    visible_filter
                    & Q(messages__created_at__gt=F("_read_cursor_at"))
                    & ~Q(messages__sender=user)
                ),
            )
        ).order_by("-last_message_at", "-created_at", "-id")


class ThreadGetOrCreateView(APIView):
    permission_classes = (CanCreateOwnThread,)

    @transaction.atomic
    def post(self, request):
        user = request.user
        thread_type = (
            MessageThread.ThreadType.DOCTOR_ADMIN
            if user.is_doctor_role
            else MessageThread.ThreadType.USER_ADMIN
        )
        if user.is_doctor_role and not user.doctor_profile.chat_enabled:
            raise PermissionDenied(
                "Your chat privileges are disabled. Wait for admin approval."
            )

        thread, created = MessageThread.objects.get_or_create(
            participant=user,
            thread_type=thread_type,
            status=MessageThread.Status.OPEN,
            deleted_at=None,
        )
        thread.unread_count = 0
        thread._last_message = ""
        return Response(
            ThreadListSerializer(thread).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class MessageListCreateView(generics.ListCreateAPIView):
    pagination_class = MessageCursorPagination
    permission_classes = (IsParticipantOrAdmin,)

    def get_thread(self, *, for_update=False):
        cached = getattr(self, "_message_thread", None)
        if cached is not None and not for_update:
            return cached
        thread = _get_visible_thread(
            user=self.request.user,
            thread_id=self.kwargs["pk"],
            for_update=for_update,
        )
        self._message_thread = thread
        return thread

    def get_serializer_class(self):
        return MessageCreateSerializer if self.request.method == "POST" else MessageSerializer

    def get_queryset(self):
        thread = self.get_thread()
        return _message_queryset(thread=thread, user=self.request.user).order_by(
            "-created_at", "-id"
        )

    @transaction.atomic
    def perform_create(self, serializer):
        thread = self.get_thread(for_update=True)
        sender = self.request.user
        if sender.is_doctor_role and not sender.doctor_profile.chat_enabled:
            raise PermissionDenied(
                "Your chat privileges are disabled. Wait for admin approval."
            )
        sender_type = (
            Message.SenderType.ADMIN
            if sender.is_admin_role
            else Message.SenderType.DOCTOR
            if sender.is_doctor_role
            else Message.SenderType.USER
        )
        message = serializer.save(thread=thread, sender=sender, sender_type=sender_type)
        _queue_notifications(
            sender=sender,
            thread=thread,
            visibility=message.visibility,
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        message = (
            Message.objects.select_related("sender")
            .prefetch_related(
                Prefetch(
                    "attachments",
                    queryset=MessageAttachment.objects.filter(is_deleted=False).select_related(
                        "asset"
                    ),
                )
            )
            .get(pk=serializer.instance.pk)
        )
        response_serializer = MessageSerializer(
            message, context=self.get_serializer_context()
        )
        response_data = response_serializer.data
        publish_message_event(thread_id=message.thread_id, message_data=response_data)
        return Response(response_data, status=status.HTTP_201_CREATED)


class MessageDeltaView(APIView):
    permission_classes = (IsParticipantOrAdmin,)

    def get(self, request, pk):
        thread = _get_visible_thread(user=request.user, thread_id=pk)
        after = request.query_params.get("after", "").strip()
        if not after:
            raise ValidationError({"after": "A server-issued message cursor is required."})
        cursor_queryset = Message.objects.filter(thread=thread, is_deleted=False)
        if not request.user.is_admin_role:
            cursor_queryset = cursor_queryset.filter(
                visibility=Message.Visibility.PARTICIPANTS
            )
        cursor_message = get_object_or_404(
            cursor_queryset.only("id", "created_at"), pk=after
        )
        visible = _message_queryset(thread=thread, user=request.user)
        try:
            requested_limit = int(request.query_params.get("limit", settings.CHAT_DELTA_PAGE_SIZE))
        except (TypeError, ValueError) as exc:
            raise ValidationError({"limit": "Enter a valid integer."}) from exc
        limit = max(1, min(requested_limit, settings.CHAT_DELTA_PAGE_SIZE))
        rows = list(
            visible.filter(
                Q(created_at__gt=cursor_message.created_at)
                | Q(created_at=cursor_message.created_at, id__gt=cursor_message.id)
            ).order_by("created_at", "id")[: limit + 1]
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        data = MessageSerializer(rows, many=True, context={"request": request}).data
        return Response(
            {
                "cursor": str(rows[-1].pk) if rows else str(cursor_message.pk),
                "has_more": has_more,
                "results": data,
            }
        )


class ThreadMarkReadView(APIView):
    permission_classes = (IsParticipantOrAdmin,)

    @transaction.atomic
    def patch(self, request, pk):
        queryset = MessageThread.objects.filter(deleted_at__isnull=True).select_for_update()
        if not request.user.is_admin_role:
            queryset = queryset.filter(participant_id=request.user.id)
        thread = get_object_or_404(queryset, pk=pk)
        now = timezone.now()
        ThreadReadState.objects.update_or_create(
            thread=thread,
            user=request.user,
            defaults={"last_read_at": now},
        )
        return Response({"last_read_at": now})


class AdminThreadUpdateView(generics.RetrieveUpdateDestroyAPIView):
    queryset = MessageThread.objects.select_related("participant", "assigned_admin")
    serializer_class = AdminThreadUpdateSerializer
    permission_classes = (IsAdminRole,)

    @transaction.atomic
    def perform_destroy(self, instance):
        thread = MessageThread.objects.select_for_update().get(pk=instance.pk)
        if thread.deleted_at is None:
            thread.deleted_at = timezone.now()
            thread.deleted_by = self.request.user
            thread.status = MessageThread.Status.ARCHIVED
            thread.save(
                update_fields=("deleted_at", "deleted_by", "status", "updated_at")
            )


class GuestMessageView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request):
        serializer = GuestMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.save()
        message_data = MessageSerializer(message, context={"request": request}).data
        publish_message_event(thread_id=message.thread_id, message_data=message_data)
        phones = list(
            User.objects.filter(role=User.Role.ADMIN, is_active=True).values_list(
                "phone_number", flat=True
            )
        )
        time_str = timezone.localtime().strftime("%H:%M")
        for phone in phones:
            queue_new_message(phone, time_str)
        return Response(
            {"detail": "پیام شما با موفقیت ارسال شد."},
            status=status.HTTP_201_CREATED,
        )

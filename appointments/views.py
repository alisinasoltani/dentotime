from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter, OrderingFilter
from collections import defaultdict
from datetime import datetime
from rest_framework.permissions import AllowAny

from accounts.models import NormalUser
from accounts.permissions import IsNormalUser, IsAdminRole
from accounts.models import User
from .models import AppointmentSlot, Appointment
from .serializers import (
    AppointmentSlotSerializer, AppointmentCreateSerializer, AppointmentListSerializer,
    AppointmentCancelSerializer, AdminAppointmentUpdateSerializer, GuestAppointmentCreateSerializer
)
from core.sms_service import send_appt_approved, send_appt_rejected, send_admin_alert

class SlotListView(generics.ListAPIView):
    serializer_class = AppointmentSlotSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    
    def get_queryset(self):
        qs = AppointmentSlot.objects.filter(status=AppointmentSlot.Status.AVAILABLE)
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)
        return qs.order_by("start_at")


class AdminSlotListCreateView(generics.ListCreateAPIView):
    """Admin view to list and create appointment slots."""
    serializer_class = AppointmentSlotSerializer

    def get_queryset(self):
        qs = AppointmentSlot.objects.all()
        start_date = self.request.query_params.get("start_date")
        end_date = self.request.query_params.get("end_date")
        if start_date:
            qs = qs.filter(date__gte=start_date)
        if end_date:
            qs = qs.filter(date__lte=end_date)
        return qs.order_by("start_at")


class AppointmentCreateView(generics.CreateAPIView):
    serializer_class = AppointmentCreateSerializer
    permission_classes = (IsNormalUser,)

    @transaction.atomic
    def perform_create(self, serializer):
        # The serializer already fetched the slot via slot_id, 
        # so we just need to lock it by its primary key.
        slot = serializer.validated_data["slot"]
        locked_slot = AppointmentSlot.objects.select_for_update().get(pk=slot.pk)
        
        if locked_slot.status != AppointmentSlot.Status.AVAILABLE:
            raise ValidationError({"slot_id": "This slot was just booked. Please select another."})
            
        # Save the appointment
        serializer.save(patient=self.request.user.normaluser, status=Appointment.Status.PENDING)
        
        # Update the locked slot
        locked_slot.status = AppointmentSlot.Status.BOOKED
        locked_slot.save(update_fields=["status"])

class MyAppointmentListView(generics.ListAPIView):
    serializer_class = AppointmentListSerializer
    permission_classes = (IsNormalUser,)

    def get_queryset(self):
        return Appointment.objects.filter(patient=self.request.user.normaluser).order_by("-slot__start_at")


class AppointmentCancelView(APIView):
    permission_classes = (IsNormalUser,)

    def post(self, request, pk):
        appointment = get_object_or_404(Appointment, pk=pk, patient=request.user.normaluser)
        
        if not appointment.can_be_cancelled_by_user():
            return Response(
                {"detail": "This appointment cannot be cancelled based on the system policy."}, 
                status=status.HTTP_403_FORBIDDEN
            )
            
        serializer = AppointmentCancelSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                appointment.status = Appointment.Status.CANCELLED
                appointment.cancelled_by = request.user
                appointment.cancelled_at = timezone.now()
                appointment.cancellation_reason = serializer.validated_data.get("cancellation_reason", "")
                appointment.save()
                
                slot = appointment.slot
                slot.status = AppointmentSlot.Status.AVAILABLE
                slot.save(update_fields=["status"])
                
            return Response({"detail": "Appointment cancelled successfully."})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminAppointmentListView(generics.ListAPIView):
    serializer_class = AppointmentListSerializer
    permission_classes = (IsAdminRole,)
    filter_backends = [OrderingFilter]
    ordering_fields = ["slot__start_at", "created_at"]
    
    def get_queryset(self):
        qs = Appointment.objects.select_related("patient", "slot")
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        start_date = self.request.query_params.get("start_date")
        if start_date:
            qs = qs.filter(slot__date__gte=start_date)
        end_date = self.request.query_params.get("end_date")
        if end_date:
            qs = qs.filter(slot__date__lte=end_date)
        return qs


class AdminAppointmentUpdateView(generics.UpdateAPIView):
    serializer_class = AdminAppointmentUpdateSerializer
    permission_classes = (IsAdminRole,)
    queryset = Appointment.objects.all()

    @transaction.atomic
    def perform_update(self, serializer):
        old_status = serializer.instance.status
        instance = serializer.save()
        new_status = instance.status
        
        if new_status == Appointment.Status.APPROVED and old_status != Appointment.Status.APPROVED:
            instance.approved_by = self.request.user
            instance.approved_at = timezone.now()
            instance.save(update_fields=["approved_by", "approved_at"])
            
            # ارسال پیامک تایید نوبت
            date_str = instance.slot.date.strftime("%Y-%m-%d")
            time_str = instance.slot.start_at.strftime("%H:%M")
            send_appt_approved(instance.patient.phone_number, date_str, time_str)
            
        if new_status in [Appointment.Status.REJECTED, Appointment.Status.CANCELLED] and \
           old_status not in [Appointment.Status.REJECTED, Appointment.Status.CANCELLED]:
            slot = instance.slot
            slot.status = AppointmentSlot.Status.AVAILABLE
            slot.save(update_fields=["status"])
            
            # ارسال پیامک رد نوبت
            date_str = instance.slot.date.strftime("%Y-%m-%d")
            send_appt_rejected(instance.patient.phone_number, date_str)


class AdminAppointmentCalendarView(APIView):
    """Returns appointments grouped by date for calendar rendering."""
    permission_classes = (IsAdminRole,)

    def get(self, request):
        month_str = request.query_params.get("month")
        if not month_str:
            return Response({"detail": "Month parameter (YYYY-MM) is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            year, month = map(int, month_str.split("-"))
            start_date = datetime(year, month, 1).date()
            if month == 12:
                end_date = datetime(year + 1, 1, 1).date()
            else:
                end_date = datetime(year, month + 1, 1).date()
        except ValueError:
            return Response({"detail": "Invalid month format. Use YYYY-MM."}, status=status.HTTP_400_BAD_REQUEST)
        
        appointments = Appointment.objects.filter(
            slot__date__gte=start_date,
            slot__date__lt=end_date
        ).select_related("patient", "slot").order_by("slot__start_at")
        
        calendar_data = defaultdict(list)
        for appt in appointments:
            date_str = appt.slot.date.isoformat()
            calendar_data[date_str].append(AppointmentListSerializer(appt, context={"request": request}).data)
            
        return Response(calendar_data)
    
class GuestAppointmentCreateView(generics.CreateAPIView):
    """Allows unauthenticated users to book an appointment."""
    serializer_class = GuestAppointmentCreateSerializer
    permission_classes = [AllowAny]
    authentication_classes = [] # <--- هیچ توکنی بررسی نشود

    @transaction.atomic
    def perform_create(self, serializer):
        slot = serializer.validated_data["slot"]
        phone = serializer.validated_data["phone_number"]
        first_name = serializer.validated_data["first_name"]
        last_name = serializer.validated_data["last_name"]
        reason = serializer.validated_data.get("reason", "")

        # قفل کردن اسلات برای جلوگیری از رزرو همزمان
        locked_slot = AppointmentSlot.objects.select_for_update().get(pk=slot.pk)
        
        admin_phones = User.objects.filter(role="ADMIN", is_active=True).values_list('phone_number', flat=True)
        for phone in admin_phones:
            send_admin_alert(phone, "نوبت جدید")

        if locked_slot.status != AppointmentSlot.Status.AVAILABLE:
            raise ValidationError({"slot_id": "این زمان در همین لحظه توسط شخص دیگری رزرو شد."})

        # پیدا کردن کاربر موجود یا ساخت کاربر جدید (بدون رمز عبور)
        user, created = NormalUser.objects.get_or_create(
            phone_number=phone,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "role": "USER",
            }
        )

        # اگر کاربر قبلاً ثبت‌نام کرده اما اسمش عوض شده، آپدیتش می‌کنیم
        if not created:
            user.first_name = first_name
            user.last_name = last_name
            user.save(update_fields=["first_name", "last_name"])

        # ثبت نوبت
        appointment = Appointment.objects.create(
            patient=user,
            slot=locked_slot,
            status=Appointment.Status.PENDING,
            reason=reason
        )

        # تغییر وضعیت اسلات به رزرو شده
        locked_slot.status = AppointmentSlot.Status.BOOKED
        locked_slot.save(update_fields=["status"])

        # پاسخ به فرانت‌اند
        serializer.instance = appointment
        
class AdminSlotDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Admin view to retrieve, update, or delete a specific slot."""
    serializer_class = AppointmentSlotSerializer
    permission_classes = (IsAdminRole,)
    queryset = AppointmentSlot.objects.all()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # Prevent deletion of a slot that is already booked
        if instance.status == AppointmentSlot.Status.BOOKED:
            return Response(
                {"detail": "امکان حذف زمانی که برای آن نوبت رزرو شده وجود ندارد."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)
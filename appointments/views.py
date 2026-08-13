from django.utils import timezone
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter, OrderingFilter
from collections import defaultdict
from datetime import datetime, timedelta
from rest_framework.permissions import AllowAny

from accounts.models import NormalUser
from accounts.permissions import IsNormalUser, IsAdminRole
from .availability import clinic_today, generate_availability, validate_date_range
from .models import (
    AppointmentSlot,
    Appointment,
    AvailabilityBreak,
    AvailabilityOverride,
    WeeklyAvailabilityRule,
)
from .serializers import (
    AppointmentSlotSerializer, AppointmentCreateSerializer, AppointmentListSerializer,
    AppointmentCancelSerializer, AdminAppointmentUpdateSerializer, GuestAppointmentCreateSerializer,
    AvailabilityBreakSerializer, AvailabilityGenerationSerializer,
    AvailabilityOverrideSerializer, WeeklyAvailabilityRuleSerializer,
)
from .services import (
    CancellationNotAllowed,
    IdempotencyConflict,
    InvalidTransition,
    SlotUnavailable,
    book_appointment,
    cancel_patient_appointment,
    parse_idempotency_key,
    transition_appointment,
)


def requested_date_range(request, *, default_days=31):
    today = clinic_today()
    raw_start = request.query_params.get("start_date")
    raw_end = request.query_params.get("end_date")
    try:
        start_date = datetime.strptime(raw_start, "%Y-%m-%d").date() if raw_start else today
        end_date = (
            datetime.strptime(raw_end, "%Y-%m-%d").date()
            if raw_end
            else start_date + timedelta(days=default_days - 1)
        )
    except ValueError as exc:
        raise ValidationError({"detail": "Dates must use YYYY-MM-DD."}) from exc
    validate_date_range(start_date, end_date)
    return start_date, end_date

class SlotListView(generics.ListAPIView):
    serializer_class = AppointmentSlotSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    
    def get_queryset(self):
        start_date, end_date = requested_date_range(self.request)
        return AppointmentSlot.objects.filter(
            status=AppointmentSlot.Status.AVAILABLE,
            date__range=(start_date, end_date),
            start_at__gt=timezone.now(),
        ).order_by("start_at", "capacity_index")


class AdminSlotListCreateView(generics.ListCreateAPIView):
    """Admin view to list and create appointment slots."""
    serializer_class = AppointmentSlotSerializer
    permission_classes = (IsAdminRole,)

    def get_queryset(self):
        start_date, end_date = requested_date_range(self.request)
        return AppointmentSlot.objects.filter(
            date__range=(start_date, end_date)
        ).order_by("start_at", "capacity_index")


class WeeklyAvailabilityRuleListCreateView(generics.ListCreateAPIView):
    serializer_class = WeeklyAvailabilityRuleSerializer
    permission_classes = (IsAdminRole,)
    queryset = WeeklyAvailabilityRule.objects.order_by("weekday", "start_time", "pk")


class WeeklyAvailabilityRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WeeklyAvailabilityRuleSerializer
    permission_classes = (IsAdminRole,)
    queryset = WeeklyAvailabilityRule.objects.all()


class AvailabilityBreakListCreateView(generics.ListCreateAPIView):
    serializer_class = AvailabilityBreakSerializer
    permission_classes = (IsAdminRole,)

    def get_queryset(self):
        queryset = AvailabilityBreak.objects.select_related("rule").order_by(
            "rule__weekday", "start_time", "pk"
        )
        if rule_id := self.request.query_params.get("rule"):
            queryset = queryset.filter(rule_id=rule_id)
        return queryset


class AvailabilityBreakDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AvailabilityBreakSerializer
    permission_classes = (IsAdminRole,)
    queryset = AvailabilityBreak.objects.select_related("rule")


class AvailabilityOverrideListCreateView(generics.ListCreateAPIView):
    serializer_class = AvailabilityOverrideSerializer
    permission_classes = (IsAdminRole,)
    queryset = AvailabilityOverride.objects.order_by("date", "pk")


class AvailabilityOverrideDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AvailabilityOverrideSerializer
    permission_classes = (IsAdminRole,)
    queryset = AvailabilityOverride.objects.all()


class AvailabilityGenerateView(APIView):
    permission_classes = (IsAdminRole,)

    def post(self, request):
        serializer = AvailabilityGenerationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        start_date = serializer.validated_data["start_date"]
        end_date = serializer.validated_data["end_date"]
        validate_date_range(start_date, end_date)
        if start_date < clinic_today():
            raise ValidationError({"start_date": "Past availability cannot be generated."})
        result = generate_availability(start_date=start_date, end_date=end_date)
        return Response(
            {
                "timezone": "Asia/Tehran",
                "created": result.created,
                "updated": result.updated,
                "removed": result.removed,
                "total": result.total,
            }
        )


class AppointmentCreateView(APIView):
    permission_classes = (IsNormalUser,)

    def post(self, request):
        serializer = AppointmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            key = parse_idempotency_key(request.headers.get("Idempotency-Key"))
            result = book_appointment(
                patient=request.user.normaluser,
                slot_id=serializer.validated_data["slot_id"],
                reason=serializer.validated_data.get("reason", ""),
                idempotency_key=key,
            )
        except AppointmentSlot.DoesNotExist:
            return Response({"slot_id": "Slot not found."}, status=status.HTTP_404_NOT_FOUND)
        except SlotUnavailable as exc:
            return Response({"slot_id": str(exc)}, status=status.HTTP_409_CONFLICT)
        except IdempotencyConflict as exc:
            return Response({"idempotency_key": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(
            AppointmentListSerializer(result.appointment, context={"request": request}).data,
            status=status.HTTP_201_CREATED if result.created else status.HTTP_200_OK,
        )

class MyAppointmentListView(generics.ListAPIView):
    serializer_class = AppointmentListSerializer
    permission_classes = (IsNormalUser,)

    def get_queryset(self):
        return Appointment.objects.filter(
            patient=self.request.user.normaluser
        ).select_related("patient", "slot").order_by("-slot__start_at")


class AppointmentCancelView(APIView):
    permission_classes = (IsNormalUser,)

    def post(self, request, pk):
        serializer = AppointmentCancelSerializer(data=request.data)
        if serializer.is_valid():
            try:
                cancel_patient_appointment(
                    appointment_id=pk,
                    patient=request.user.normaluser,
                    reason=serializer.validated_data.get("cancellation_reason", ""),
                )
            except Appointment.DoesNotExist:
                return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
            except CancellationNotAllowed:
                return Response(
                    {"detail": "This appointment cannot be cancelled based on the system policy."},
                    status=status.HTTP_403_FORBIDDEN,
                )
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
    queryset = Appointment.objects.select_related("patient", "slot")

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(
            instance, data=request.data, partial=kwargs.pop("partial", False)
        )
        serializer.is_valid(raise_exception=True)
        target_status = serializer.validated_data.get("status", instance.status)
        admin_notes = serializer.validated_data.get("admin_notes")
        try:
            result = transition_appointment(
                appointment_id=instance.pk,
                target_status=target_status,
                actor=request.user,
                admin_notes=admin_notes,
            )
        except InvalidTransition as exc:
            return Response({"status": str(exc)}, status=status.HTTP_409_CONFLICT)
        output = self.get_serializer(result.appointment)
        return Response(output.data)


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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            key = parse_idempotency_key(request.headers.get("Idempotency-Key"))
        except IdempotencyConflict as exc:
            return Response({"idempotency_key": str(exc)}, status=status.HTTP_409_CONFLICT)
        slot_id = serializer.validated_data["slot_id"]
        phone = serializer.validated_data["phone_number"]
        first_name = serializer.validated_data["first_name"]
        last_name = serializer.validated_data["last_name"]
        reason = serializer.validated_data.get("reason", "")

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

        try:
            result = book_appointment(
                patient=user,
                slot_id=slot_id,
                reason=reason,
                idempotency_key=key,
            )
        except AppointmentSlot.DoesNotExist:
            return Response({"slot_id": "Slot not found."}, status=status.HTTP_404_NOT_FOUND)
        except SlotUnavailable as exc:
            return Response({"slot_id": str(exc)}, status=status.HTTP_409_CONFLICT)
        except IdempotencyConflict as exc:
            return Response({"idempotency_key": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(
            AppointmentListSerializer(result.appointment, context={"request": request}).data,
            status=status.HTTP_201_CREATED if result.created else status.HTTP_200_OK,
        )
        
class AdminSlotDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Admin view to retrieve, update, or delete a specific slot."""
    serializer_class = AppointmentSlotSerializer
    permission_classes = (IsAdminRole,)
    queryset = AppointmentSlot.objects.all()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        
        # Prevent deletion of a slot that is already booked
        if instance.appointments.filter(
            status__in=[Appointment.Status.PENDING, Appointment.Status.APPROVED]
        ).exists():
            return Response(
                {"detail": "امکان حذف زمانی که برای آن نوبت رزرو شده وجود ندارد."},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

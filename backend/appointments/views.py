from django.utils import timezone
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter, OrderingFilter
from datetime import datetime, timedelta
from rest_framework.permissions import AllowAny
from django.db import transaction
from django.db.models import Count, Q
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404

from accounts.models import OTPChallenge
from accounts.otp import consume_grant
from accounts.permissions import IsNormalUser, IsAdminRole, IsDoctorRole
from .availability import clinic_today, generate_availability, validate_date_range
from .captcha import (
    GENERIC_CAPTCHA_ERROR,
    create_booking_captcha,
    enforce_guest_booking_throttles,
    verify_and_consume_captcha,
)
from .models import (
    AppointmentSlot,
    Appointment,
    AvailabilityBreak,
    AvailabilityOverride,
    DoctorAvailabilityRule,
    WeeklyAvailabilityRule,
)
from .serializers import (
    AppointmentSlotSerializer, AppointmentCreateSerializer, AppointmentListSerializer,
    AppointmentAttendanceSerializer, AppointmentCancelSerializer,
    AdminAppointmentUpdateSerializer, AppointmentClaimSerializer,
    AvailabilityBreakSerializer, AvailabilityGenerationSerializer,
    AvailabilityOverrideSerializer, WeeklyAvailabilityRuleSerializer,
    DoctorAvailabilityGenerateSerializer, DoctorAvailabilityRuleSerializer,
)
from .doctor_availability import (
    BookedAvailabilityError,
    generate_doctor_availability,
    remove_doctor_day,
    remove_doctor_slot,
)
from .services import (
    CancellationNotAllowed,
    IdempotencyConflict,
    InvalidTransition,
    SlotUnavailable,
    book_appointment,
    cancel_patient_appointment,
    claim_guest_appointments,
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
        queryset = AppointmentSlot.objects.filter(
            status=AppointmentSlot.Status.AVAILABLE,
            date__range=(start_date, end_date),
            start_at__gt=timezone.now(),
        )
        if doctor_id := self.request.query_params.get("doctor_id"):
            queryset = queryset.filter(
                Q(doctor_id=doctor_id) | Q(doctor__isnull=True)
            )
        return queryset.order_by("start_at", "capacity_index")


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
    permission_classes = (AllowAny,)

    def post(self, request):
        if request.user.is_authenticated and not request.user.is_normal_user:
            return Response(
                {"detail": "Only patient accounts can create appointments."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = AppointmentCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        try:
            key = parse_idempotency_key(request.headers.get("Idempotency-Key"))
            is_guest = not request.user.is_authenticated
            is_idempotent_retry = Appointment.objects.filter(
                idempotency_key=key
            ).only("pk").exists()
            if is_guest:
                patient = None
                if not is_idempotent_retry:
                    phone = serializer.validated_data["phone_number"]
                    enforce_guest_booking_throttles(request, phone)
                    verify_and_consume_captcha(
                        request,
                        challenge_id=serializer.validated_data["captcha_challenge_id"],
                        answer=serializer.validated_data["captcha_answer"],
                    )
            else:
                patient = request.user.normaluser
            result = book_appointment(
                patient=patient,
                doctor=serializer.validated_data.get("doctor"),
                slot_id=serializer.validated_data["slot_id"],
                reason=serializer.validated_data.get("reason", ""),
                idempotency_key=key,
                contact_phone_number=serializer.validated_data.get("phone_number"),
                contact_first_name=serializer.validated_data.get("first_name"),
                contact_last_name=serializer.validated_data.get("last_name", ""),
            )
        except AppointmentSlot.DoesNotExist:
            return Response({"slot_id": "Slot not found."}, status=status.HTTP_404_NOT_FOUND)
        except SlotUnavailable as exc:
            return Response({"slot_id": str(exc)}, status=status.HTTP_409_CONFLICT)
        except IdempotencyConflict as exc:
            return Response({"idempotency_key": str(exc)}, status=status.HTTP_409_CONFLICT)
        except ValueError:
            return Response(
                {"captcha_answer": GENERIC_CAPTCHA_ERROR},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                **AppointmentListSerializer(
                    result.appointment, context={"request": request}
                ).data,
                "authenticated": not is_guest,
            },
            status=status.HTTP_201_CREATED if result.created else status.HTTP_200_OK,
        )


class BookingCaptchaCreateView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def post(self, request):
        challenge, image_data_url = create_booking_captcha(request)
        response = Response(
            {
                "challenge_id": str(challenge.pk),
                "image_data_url": image_data_url,
                "expires_in": int((challenge.expires_at - timezone.now()).total_seconds()),
            },
            status=status.HTTP_201_CREATED,
        )
        response["Cache-Control"] = "no-store, private"
        response["Pragma"] = "no-cache"
        return response


class AppointmentClaimView(APIView):
    permission_classes = (IsNormalUser,)

    def post(self, request):
        serializer = AppointmentClaimSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                consume_grant(
                    token=serializer.validated_data["otp_token"],
                    raw_phone=request.user.phone_number,
                    purpose=OTPChallenge.Purpose.APPOINTMENT_CLAIM,
                    allow_consumed=True,
                )
                claimed, total = claim_guest_appointments(
                    patient=request.user.normaluser
                )
        except (ValueError, DjangoValidationError) as exc:
            return Response({"otp_token": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"claimed": claimed, "total": total})

class MyAppointmentListView(generics.ListAPIView):
    serializer_class = AppointmentListSerializer
    permission_classes = (IsNormalUser,)

    def get_queryset(self):
        return Appointment.objects.filter(
            patient=self.request.user.normaluser
        ).select_related("patient", "doctor", "slot").order_by("-slot__start_at")


class DoctorAppointmentListView(generics.ListAPIView):
    """List only appointments assigned to the authenticated doctor."""

    serializer_class = AppointmentListSerializer
    permission_classes = (IsDoctorRole,)

    def get_queryset(self):
        queryset = (
            Appointment.objects.filter(doctor_id=self.request.user.pk)
            .select_related("patient", "doctor", "slot")
        )
        raw_date = self.request.query_params.get("date")
        if raw_date:
            try:
                clinic_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
            except ValueError as exc:
                raise ValidationError({"date": "Date must use YYYY-MM-DD."}) from exc
            queryset = queryset.filter(slot__date=clinic_date)
        return queryset.order_by("-slot__start_at", "-id")


class DoctorAppointmentCalendarView(APIView):
    permission_classes = (IsDoctorRole,)

    def get(self, request):
        month_str = request.query_params.get("month", "")
        raw_start = request.query_params.get("start_date")
        raw_end = request.query_params.get("end_date")
        try:
            if raw_start or raw_end:
                if not raw_start or not raw_end:
                    raise ValueError
                month_start = datetime.strptime(raw_start, "%Y-%m-%d").date()
                range_end = datetime.strptime(raw_end, "%Y-%m-%d").date()
                validate_date_range(month_start, range_end)
                next_month = range_end + timedelta(days=1)
            else:
                month_start = datetime.strptime(month_str, "%Y-%m").date().replace(day=1)
                next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        except ValueError as exc:
            raise ValidationError(
                {"detail": "Use month=YYYY-MM or a complete YYYY-MM-DD date range."}
            ) from exc
        rows = (
            Appointment.objects.filter(
                doctor_id=request.user.pk,
                slot__date__gte=month_start,
                slot__date__lt=next_month,
            )
            .values("slot__date")
            .annotate(
                total=Count("id"),
                pending=Count("id", filter=Q(status=Appointment.Status.PENDING)),
                approved=Count("id", filter=Q(status=Appointment.Status.APPROVED)),
                cancelled=Count("id", filter=Q(status=Appointment.Status.CANCELLED)),
            )
            .order_by("slot__date")
        )
        return Response(
            {
                "month": month_str or None,
                "start_date": month_start,
                "end_date": next_month - timedelta(days=1),
                "days": [
                    {
                        "date": row["slot__date"],
                        "total": row["total"],
                        "pending": row["pending"],
                        "approved": row["approved"],
                        "cancelled": row["cancelled"],
                    }
                    for row in rows
                ],
            }
        )


class DoctorAppointmentCancelView(APIView):
    permission_classes = (IsDoctorRole,)

    def post(self, request, pk):
        serializer = AppointmentCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = get_object_or_404(
            Appointment.objects.only("id", "doctor_id"),
            pk=pk,
            doctor_id=request.user.pk,
        )
        try:
            result = transition_appointment(
                appointment_id=appointment.pk,
                target_status=Appointment.Status.CANCELLED,
                actor=request.user,
            )
        except InvalidTransition as exc:
            return Response({"status": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(
            AppointmentListSerializer(
                result.appointment,
                context={"request": request},
            ).data
        )


class DoctorAvailabilityView(APIView):
    permission_classes = (IsDoctorRole,)

    def get(self, request):
        start_date, end_date = requested_date_range(request, default_days=1)
        slots = (
            AppointmentSlot.objects.filter(
                doctor_id=request.user.pk,
                date__range=(start_date, end_date),
            )
            .select_related("doctor")
            .order_by("start_at", "pk")
        )
        rules = DoctorAvailabilityRule.objects.filter(
            doctor_id=request.user.pk,
            is_active=True,
            starts_on__lte=end_date,
            ends_on__gte=start_date,
        )
        return Response(
            {
                "timezone": "Asia/Tehran",
                "slots": AppointmentSlotSerializer(slots, many=True).data,
                "rules": DoctorAvailabilityRuleSerializer(rules, many=True).data,
            }
        )

    def post(self, request):
        serializer = DoctorAvailabilityGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        validate_date_range(data["start_date"], data["end_date"])
        if data["end_date"] < clinic_today():
            raise ValidationError({"end_date": "Past availability cannot be created."})
        result = generate_doctor_availability(
            doctor=request.user.doctor_profile,
            **data,
        )
        return Response(
            {
                "timezone": "Asia/Tehran",
                "created": result.created,
                "restored": result.restored,
                "existing": result.existing,
                "skipped_past": result.skipped_past,
                "rules_created": result.rules_created,
            },
            status=status.HTTP_201_CREATED,
        )


def _booked_removal_response(exc):
    return Response(
        {
            "detail": exc.message,
            "booked_count": exc.booked_count,
            "date": exc.clinic_date,
            "appointments_filter": f"/doctor/appointments?date={exc.clinic_date.isoformat()}",
        },
        status=status.HTTP_409_CONFLICT,
    )


class DoctorAvailabilitySlotDeleteView(APIView):
    permission_classes = (IsDoctorRole,)

    def delete(self, request, pk):
        try:
            result = remove_doctor_slot(
                doctor=request.user.doctor_profile,
                slot_id=pk,
            )
        except AppointmentSlot.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        except BookedAvailabilityError as exc:
            return _booked_removal_response(exc)
        return Response({"removed": result.removed, "blocked": result.blocked})


class DoctorAvailabilityDayDeleteView(APIView):
    permission_classes = (IsDoctorRole,)

    def delete(self, request, clinic_date):
        try:
            parsed_date = datetime.strptime(clinic_date, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValidationError({"date": "Date must use YYYY-MM-DD."}) from exc
        try:
            result = remove_doctor_day(
                doctor=request.user.doctor_profile,
                clinic_date=parsed_date,
            )
        except BookedAvailabilityError as exc:
            return _booked_removal_response(exc)
        return Response({"removed": result.removed, "blocked": result.blocked})


class AppointmentAttendanceView(APIView):
    permission_classes = (IsNormalUser,)

    def post(self, request, pk):
        serializer = AppointmentAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            appointment = get_object_or_404(
                Appointment.objects.select_for_update(of=("self",)).select_related(
                    "slot", "doctor"
                ),
                pk=pk,
                patient=request.user.normaluser,
            )
            if appointment.doctor_id is None:
                return Response(
                    {"detail": "This appointment is not linked to a doctor."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if appointment.slot.end_at > timezone.now():
                return Response(
                    {"detail": "Attendance can be confirmed only after the appointment ends."},
                    status=status.HTTP_409_CONFLICT,
                )
            if appointment.status in {
                Appointment.Status.CANCELLED,
                Appointment.Status.REJECTED,
                Appointment.Status.NO_SHOW,
            }:
                return Response(
                    {"detail": "Attendance cannot be changed for this appointment."},
                    status=status.HTTP_409_CONFLICT,
                )

            appointment.attendance_status = (
                Appointment.AttendanceStatus.ATTENDED
                if serializer.validated_data["attended"]
                else Appointment.AttendanceStatus.DID_NOT_ATTEND
            )
            appointment.attendance_confirmed_at = timezone.now()
            appointment.save(
                update_fields=[
                    "attendance_status", "attendance_confirmed_at", "updated_at"
                ]
            )
        return Response(AppointmentListSerializer(appointment, context={"request": request}).data)


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
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = [
        "patient__first_name",
        "patient__last_name",
        "patient__phone_number",
        "contact_first_name",
        "contact_last_name",
        "contact_phone_number",
    ]
    ordering_fields = ["slot__start_at", "created_at"]
    ordering = ["-slot__start_at", "-id"]
    
    def get_queryset(self):
        qs = Appointment.objects.select_related("patient", "doctor", "slot")
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        raw_start = self.request.query_params.get("start_date")
        raw_end = self.request.query_params.get("end_date")
        try:
            start_date = (
                datetime.strptime(raw_start, "%Y-%m-%d").date() if raw_start else None
            )
            end_date = (
                datetime.strptime(raw_end, "%Y-%m-%d").date() if raw_end else None
            )
        except ValueError as exc:
            raise ValidationError({"detail": "Dates must use YYYY-MM-DD."}) from exc
        if start_date and end_date:
            validate_date_range(start_date, end_date)
        if start_date:
            qs = qs.filter(slot__date__gte=start_date)
        if end_date:
            qs = qs.filter(slot__date__lte=end_date)
        return qs.order_by("-slot__start_at", "-id")


class AdminAppointmentUpdateView(generics.UpdateAPIView):
    serializer_class = AdminAppointmentUpdateSerializer
    permission_classes = (IsAdminRole,)
    queryset = Appointment.objects.select_related("patient", "doctor", "slot")

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
    """Return bounded daily aggregates for one Gregorian calendar month."""
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
        
        days = Appointment.objects.filter(
            slot__date__gte=start_date,
            slot__date__lt=end_date
        ).values("slot__date").annotate(
            total=Count("pk"),
            pending=Count("pk", filter=Q(status=Appointment.Status.PENDING)),
            approved=Count("pk", filter=Q(status=Appointment.Status.APPROVED)),
            rejected=Count("pk", filter=Q(status=Appointment.Status.REJECTED)),
            cancelled=Count("pk", filter=Q(status=Appointment.Status.CANCELLED)),
            completed=Count("pk", filter=Q(status=Appointment.Status.COMPLETED)),
            no_show=Count("pk", filter=Q(status=Appointment.Status.NO_SHOW)),
        ).order_by("slot__date")
        return Response(
            {
                "month": month_str,
                "days": [
                    {"date": row.pop("slot__date").isoformat(), **row}
                    for row in days
                ],
            }
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

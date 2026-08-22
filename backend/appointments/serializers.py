from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from .availability import validate_break, validate_rule_overlap
from .models import (
    AppointmentSlot,
    Appointment,
    AvailabilityBreak,
    AvailabilityOverride,
    ClinicSchedule,
    DoctorAvailabilityRule,
    WeeklyAvailabilityRule,
)
from accounts.models import Doctor, User
from accounts.validators import normalize_phone_number

class AppointmentSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppointmentSlot
        fields = (
            "id", "doctor", "date", "start_at", "end_at", "status", "capacity_index",
            "generated_by_schedule",
        )
        read_only_fields = ("doctor", "capacity_index", "generated_by_schedule")

    def validate(self, attrs):
        start_at = attrs.get("start_at", getattr(self.instance, "start_at", None))
        end_at = attrs.get("end_at", getattr(self.instance, "end_at", None))
        clinic_date = attrs.get("date", getattr(self.instance, "date", None))
        doctor = attrs.get("doctor", getattr(self.instance, "doctor", None))
        if start_at and end_at and start_at >= end_at:
            raise serializers.ValidationError({"end_at": "end_at must be after start_at."})
        if start_at and clinic_date and start_at.astimezone(ZoneInfo("Asia/Tehran")).date() != clinic_date:
            raise serializers.ValidationError({"date": "date must match the Tehran-local start time."})
        if start_at and (self.instance is None or "start_at" in attrs) and start_at <= timezone.now():
            raise serializers.ValidationError({"start_at": "Past slots cannot be created or moved."})
        if start_at and end_at:
            overlap = AppointmentSlot.objects.filter(
                doctor=doctor,
                capacity_index=getattr(self.instance, "capacity_index", 1),
                status__in=[AppointmentSlot.Status.AVAILABLE, AppointmentSlot.Status.BOOKED],
                start_at__lt=end_at,
                end_at__gt=start_at,
            )
            if self.instance:
                overlap = overlap.exclude(pk=self.instance.pk)
            if overlap.exists():
                raise serializers.ValidationError({"start_at": "This slot overlaps an existing slot."})
        return attrs

    def validate_status(self, value):
        instance = self.instance
        if value == AppointmentSlot.Status.BOOKED and (
            instance is None or instance.status != AppointmentSlot.Status.BOOKED
        ):
            raise serializers.ValidationError("BOOKED is managed by the booking service.")
        if instance and instance.appointments.filter(
            status__in=[Appointment.Status.PENDING, Appointment.Status.APPROVED]
        ).exists() and value != AppointmentSlot.Status.BOOKED:
            raise serializers.ValidationError("A slot with an active booking must remain BOOKED.")
        return value

class AppointmentCreateSerializer(serializers.Serializer):
    slot_id = serializers.IntegerField(write_only=True)
    doctor_id = serializers.PrimaryKeyRelatedField(
        source="doctor",
        queryset=Doctor.objects.filter(
            is_active=True,
            verification_status=Doctor.VerificationStatus.APPROVED,
        ),
        required=False,
        allow_null=True,
    )
    reason = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    phone_number = serializers.CharField(required=False, write_only=True)
    first_name = serializers.CharField(required=False, max_length=150, write_only=True)
    last_name = serializers.CharField(required=False, max_length=150, allow_blank=True, write_only=True)
    captcha_challenge_id = serializers.UUIDField(required=False, write_only=True)
    captcha_answer = serializers.CharField(required=False, max_length=12, write_only=True, trim_whitespace=True)

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            if not user.is_normal_user:
                raise serializers.ValidationError(
                    {"detail": "Only patient accounts can create appointments."}
                )
            return attrs

        required = ("phone_number", "first_name", "captcha_challenge_id", "captcha_answer")
        missing = [field for field in required if not attrs.get(field)]
        if missing:
            raise serializers.ValidationError(
                {field: "This field is required for guest bookings." for field in missing}
            )
        attrs["phone_number"] = normalize_phone_number(attrs["phone_number"])
        return attrs

class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "first_name",
            "last_name",
            "phone_number",
            "profile_picture",
        )


class AppointmentDoctorSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Doctor
        fields = ("id", "first_name", "last_name", "display_name")

class AppointmentListSerializer(serializers.ModelSerializer):
    slot = AppointmentSlotSerializer(read_only=True)
    patient = PatientSerializer(read_only=True)
    doctor = AppointmentDoctorSerializer(read_only=True)
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = (
            "id", "patient", "doctor", "contact_phone_number", "contact_first_name",
            "contact_last_name", "slot", "status", "reason",
            "attendance_status", "attendance_confirmed_at", "created_at",
            "approved_at", "cancelled_at", "can_cancel", "admin_notes"
        )

    def get_can_cancel(self, obj):
        request = self.context.get("request")
        if request and obj.patient_id and request.user == obj.patient:
            return obj.can_be_cancelled_by_user()
        if (
            request
            and request.user.is_authenticated
            and request.user.is_doctor_role
            and obj.doctor_id == request.user.pk
        ):
            return obj.status in {
                Appointment.Status.PENDING,
                Appointment.Status.APPROVED,
            }
        return False

class AppointmentCancelSerializer(serializers.Serializer):
    cancellation_reason = serializers.CharField(required=False, allow_blank=True)


class AppointmentAttendanceSerializer(serializers.Serializer):
    attended = serializers.BooleanField()

class AdminAppointmentUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = ("status", "admin_notes")

    def validate(self, attrs):
        # Require admin_notes if status is being set to REJECTED
        if attrs.get("status") == Appointment.Status.REJECTED and not attrs.get("admin_notes"):
            raise serializers.ValidationError({
                "admin_notes": "A rejection reason is required when rejecting an appointment."
            })
        return attrs
    
class AppointmentClaimSerializer(serializers.Serializer):
    otp_token = serializers.CharField(write_only=True)


class WeeklyAvailabilityRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = WeeklyAvailabilityRule
        fields = (
            "id", "weekday", "start_time", "end_time", "slot_duration_minutes",
            "capacity", "is_active",
        )

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end and start >= end:
            raise serializers.ValidationError({"end_time": "end_time must be after start_time."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        schedule, _ = ClinicSchedule.objects.get_or_create(pk=1)
        schedule = ClinicSchedule.objects.select_for_update().get(pk=schedule.pk)
        if validated_data.get("is_active", True):
            validate_rule_overlap(schedule_id=schedule.pk, **{
                key: validated_data[key] for key in ("weekday", "start_time", "end_time")
            })
        return WeeklyAvailabilityRule.objects.create(schedule=schedule, **validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        ClinicSchedule.objects.select_for_update().get(pk=instance.schedule_id)
        values = {
            "weekday": validated_data.get("weekday", instance.weekday),
            "start_time": validated_data.get("start_time", instance.start_time),
            "end_time": validated_data.get("end_time", instance.end_time),
        }
        if validated_data.get("is_active", instance.is_active):
            validate_rule_overlap(
                schedule_id=instance.schedule_id, exclude_pk=instance.pk, **values
            )
        return super().update(instance, validated_data)


class AvailabilityBreakSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvailabilityBreak
        fields = ("id", "rule", "start_time", "end_time")

    def validate(self, attrs):
        rule = attrs.get("rule", getattr(self.instance, "rule", None))
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if rule and start and end:
            validate_break(
                rule=rule,
                start_time=start,
                end_time=end,
                exclude_pk=getattr(self.instance, "pk", None),
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        rule = validated_data["rule"]
        ClinicSchedule.objects.select_for_update().get(pk=rule.schedule_id)
        validate_break(rule=rule, start_time=validated_data["start_time"], end_time=validated_data["end_time"])
        return AvailabilityBreak.objects.create(**validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        rule = validated_data.get("rule", instance.rule)
        ClinicSchedule.objects.select_for_update().get(pk=rule.schedule_id)
        validate_break(
            rule=rule,
            start_time=validated_data.get("start_time", instance.start_time),
            end_time=validated_data.get("end_time", instance.end_time),
            exclude_pk=instance.pk,
        )
        return super().update(instance, validated_data)


class AvailabilityOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvailabilityOverride
        fields = (
            "id", "date", "kind", "start_time", "end_time",
            "slot_duration_minutes", "capacity",
        )

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", None))
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        duration = attrs.get(
            "slot_duration_minutes", getattr(self.instance, "slot_duration_minutes", None)
        )
        capacity = attrs.get("capacity", getattr(self.instance, "capacity", None))
        if kind == AvailabilityOverride.Kind.CLOSED:
            attrs.update(
                start_time=None, end_time=None, slot_duration_minutes=None, capacity=None
            )
        elif kind == AvailabilityOverride.Kind.CUSTOM:
            if not all((start, end, duration, capacity)) or start >= end:
                raise serializers.ValidationError(
                    {"start_time": "Custom overrides require valid hours, duration, and capacity."}
                )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        schedule, _ = ClinicSchedule.objects.get_or_create(pk=1)
        ClinicSchedule.objects.select_for_update().get(pk=schedule.pk)
        return AvailabilityOverride.objects.create(schedule=schedule, **validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        ClinicSchedule.objects.select_for_update().get(pk=instance.schedule_id)
        return super().update(instance, validated_data)


class AvailabilityGenerationSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()


class DoctorAvailabilityRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorAvailabilityRule
        fields = (
            "id",
            "weekday",
            "start_time",
            "end_time",
            "slot_duration_minutes",
            "starts_on",
            "ends_on",
            "is_active",
        )
        read_only_fields = fields


class DoctorAvailabilityGenerateSerializer(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    weekdays = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6),
        min_length=1,
        max_length=7,
    )
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    slot_duration_minutes = serializers.IntegerField(min_value=5, max_value=480)
    save_as_routine = serializers.BooleanField(default=True)

    def validate_weekdays(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Weekdays must not contain duplicates.")
        return sorted(value)

    def validate(self, attrs):
        if attrs["start_date"] > attrs["end_date"]:
            raise serializers.ValidationError(
                {"end_date": "end_date must be on or after start_date."}
            )
        if attrs["start_time"] >= attrs["end_time"]:
            raise serializers.ValidationError(
                {"end_time": "end_time must be after start_time."}
            )
        start_minutes = attrs["start_time"].hour * 60 + attrs["start_time"].minute
        end_minutes = attrs["end_time"].hour * 60 + attrs["end_time"].minute
        if end_minutes - start_minutes < attrs["slot_duration_minutes"]:
            raise serializers.ValidationError(
                {"slot_duration_minutes": "The interval must contain at least one slot."}
            )
        return attrs

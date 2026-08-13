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
    WeeklyAvailabilityRule,
)
from accounts.models import User
from accounts.validators import validate_e164_phone

class AppointmentSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppointmentSlot
        fields = (
            "id", "date", "start_at", "end_at", "status", "capacity_index",
            "generated_by_schedule",
        )
        read_only_fields = ("capacity_index", "generated_by_schedule")

    def validate(self, attrs):
        start_at = attrs.get("start_at", getattr(self.instance, "start_at", None))
        end_at = attrs.get("end_at", getattr(self.instance, "end_at", None))
        clinic_date = attrs.get("date", getattr(self.instance, "date", None))
        if start_at and end_at and start_at >= end_at:
            raise serializers.ValidationError({"end_at": "end_at must be after start_at."})
        if start_at and clinic_date and start_at.astimezone(ZoneInfo("Asia/Tehran")).date() != clinic_date:
            raise serializers.ValidationError({"date": "date must match the Tehran-local start time."})
        if start_at and (self.instance is None or "start_at" in attrs) and start_at <= timezone.now():
            raise serializers.ValidationError({"start_at": "Past slots cannot be created or moved."})
        if start_at and end_at:
            overlap = AppointmentSlot.objects.filter(
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

class AppointmentCreateSerializer(serializers.ModelSerializer):
    slot_id = serializers.IntegerField(write_only=True)
    class Meta:
        model = Appointment
        fields = ("id", "slot_id", "reason")

class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "first_name", "last_name", "phone_number")

class AppointmentListSerializer(serializers.ModelSerializer):
    slot = AppointmentSlotSerializer(read_only=True)
    patient = PatientSerializer(read_only=True)
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = (
            "id", "patient", "slot", "status", "reason", 
            "created_at", "approved_at", "cancelled_at", "can_cancel", "admin_notes"
        )

    def get_can_cancel(self, obj):
        request = self.context.get("request")
        if request and request.user == obj.patient:
            return obj.can_be_cancelled_by_user()
        return False

class AppointmentCancelSerializer(serializers.Serializer):
    cancellation_reason = serializers.CharField(required=False, allow_blank=True)

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
    
class GuestAppointmentCreateSerializer(serializers.Serializer):
    """Serializer for unauthenticated users to book an appointment."""
    slot_id = serializers.IntegerField(write_only=True)
    phone_number = serializers.CharField(validators=[validate_e164_phone], write_only=True,)
    first_name = serializers.CharField(max_length=150, write_only=True,)
    last_name = serializers.CharField(max_length=150, write_only=True,)
    reason = serializers.CharField(required=False, allow_blank=True)


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

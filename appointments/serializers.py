from rest_framework import serializers
from .models import AppointmentSlot, Appointment
from accounts.models import User
from accounts.validators import validate_e164_phone

class AppointmentSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppointmentSlot
        fields = ("id", "date", "start_at", "end_at", "status")

class AppointmentCreateSerializer(serializers.ModelSerializer):
    slot_id = serializers.PrimaryKeyRelatedField(
        queryset=AppointmentSlot.objects.all(), # Let the view handle the availability check
        write_only=True,
        source="slot"
    )
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
    slot_id = serializers.PrimaryKeyRelatedField(
        queryset=AppointmentSlot.objects.all(),
        write_only=True,
        source="slot"
    )
    phone_number = serializers.CharField(validators=[validate_e164_phone], write_only=True,)
    first_name = serializers.CharField(max_length=150, write_only=True,)
    last_name = serializers.CharField(max_length=150, write_only=True,)
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        # بررسی اینکه آیا اسلات قبلاً رزرو شده است یا خیر
        slot = attrs.get("slot")
        if slot.status != AppointmentSlot.Status.AVAILABLE:
            raise serializers.ValidationError({"slot_id": "این زمان در همین لحظه توسط شخص دیگری رزرو شد."})
        return attrs
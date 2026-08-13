from rest_framework import serializers
from accounts.models import User
from messaging.models import MessageThread, Message, MessageAttachment
from core.models import SystemSettings
from accounts.validators import validate_e164_phone

class MessageAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageAttachment
        fields = ("id", "file_url", "file_key", "file_name", "file_size", "file_content_type", "is_3d_scan", "uploaded_at")
        read_only_fields = ("uploaded_at",)

    def validate_file_size(self, value):
        settings = SystemSettings.load()
        max_size = settings.doctor_attachment_max_size_mb * 1024 * 1024
        if value > max_size:
            raise serializers.ValidationError(f"File size exceeds the maximum limit of {settings.doctor_attachment_max_size_mb}MB.")
        return value

class MessageSerializer(serializers.ModelSerializer):
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    sender_phone = serializers.CharField(source="sender.phone_number", read_only=True)

    class Meta:
        model = Message
        fields = ("id", "thread", "sender", "sender_phone", "sender_type", "body", "read_by_recipient", "created_at", "attachments")
        read_only_fields = ("thread", "sender", "sender_type", "read_by_recipient", "created_at")

class MessageCreateSerializer(serializers.ModelSerializer):
    attachments = MessageAttachmentSerializer(many=True, required=False)

    class Meta:
        model = Message
        fields = ("id", "body", "attachments")
        read_only_fields = ("id",)

    def create(self, validated_data):
        # The 'thread' is passed from the view via serializer.save(thread=...)
        thread = validated_data.get("thread")
        attachments_data = validated_data.pop("attachments", [])
        
        # Check if attachments are being added to a non-doctor thread
        if thread and attachments_data and thread.thread_type != MessageThread.ThreadType.DOCTOR_ADMIN:
            raise serializers.ValidationError({"attachments": "Attachments are only allowed in Doctor-Admin threads."})
        
        # Create the message
        message = Message.objects.create(**validated_data)
        
        # Create the attachments linked to the message
        for att_data in attachments_data:
            MessageAttachment.objects.create(message=message, **att_data)
            
        return message

class ParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "phone_number", "first_name", "last_name", "role", "profile_picture")

class ThreadListSerializer(serializers.ModelSerializer):
    participant = ParticipantSerializer(read_only=True)
    assigned_admin = ParticipantSerializer(read_only=True)
    unread_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = MessageThread
        fields = ("id", "thread_type", "participant", "assigned_admin", "status", "created_at", "last_message_at", "unread_count")

class AdminThreadUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageThread
        fields = ("status", "assigned_admin")

    def validate_assigned_admin(self, value):
        if value is not None and not (
            value.is_active and value.is_admin_role
        ):
            raise serializers.ValidationError("assigned_admin must be an active administrator.")
        return value
        
class GuestMessageSerializer(serializers.Serializer):
    """Serializer for unauthenticated users sending a message from the footer."""
    phone_number = serializers.CharField(validators=[validate_e164_phone])
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    body = serializers.CharField()

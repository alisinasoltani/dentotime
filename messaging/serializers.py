from rest_framework import serializers
from accounts.models import User
from messaging.models import MessageThread, Message, MessageAttachment
from core.assets import AssetBindingError, lock_attachable_asset
from core.models import FileAsset
from accounts.validators import validate_e164_phone

class MessageAttachmentSerializer(serializers.ModelSerializer):
    asset_id = serializers.UUIDField(source="asset.id", read_only=True)
    file_name = serializers.CharField(source="asset.original_name", read_only=True)
    file_size = serializers.IntegerField(source="asset.expected_size", read_only=True)
    file_content_type = serializers.CharField(source="asset.claimed_mime", read_only=True)
    state = serializers.CharField(source="asset.state", read_only=True)
    scan_status = serializers.CharField(source="asset.scan_status", read_only=True)

    class Meta:
        model = MessageAttachment
        fields = (
            "id",
            "asset_id",
            "file_name",
            "file_size",
            "file_content_type",
            "state",
            "scan_status",
            "is_3d_scan",
            "uploaded_at",
        )
        read_only_fields = fields

class MessageSerializer(serializers.ModelSerializer):
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    sender_phone = serializers.CharField(source="sender.phone_number", read_only=True)

    class Meta:
        model = Message
        fields = ("id", "thread", "sender", "sender_phone", "sender_type", "body", "read_by_recipient", "created_at", "attachments")
        read_only_fields = ("thread", "sender", "sender_type", "read_by_recipient", "created_at")

class MessageCreateSerializer(serializers.ModelSerializer):
    asset_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=False,
        max_length=10,
        write_only=True,
    )

    class Meta:
        model = Message
        fields = ("id", "body", "asset_ids")
        read_only_fields = ("id",)

    def to_internal_value(self, data):
        if "attachments" in data or "file_url" in data or "file_key" in data:
            raise serializers.ValidationError(
                {"asset_ids": "Submit server-issued asset IDs, not attachment metadata."}
            )
        return super().to_internal_value(data)

    def validate(self, attrs):
        if not attrs.get("body", "").strip() and not attrs.get("asset_ids"):
            raise serializers.ValidationError("A message body or an attachment is required.")
        return attrs

    def create(self, validated_data):
        # The 'thread' is passed from the view via serializer.save(thread=...)
        thread = validated_data.get("thread")
        asset_ids = validated_data.pop("asset_ids", [])
        
        # Check if attachments are being added to a non-doctor thread
        if thread and asset_ids and thread.thread_type != MessageThread.ThreadType.DOCTOR_ADMIN:
            raise serializers.ValidationError({"attachments": "Attachments are only allowed in Doctor-Admin threads."})

        try:
            assets = [
                lock_attachable_asset(
                    asset_id=asset_id,
                    owner=validated_data["sender"],
                    purpose=FileAsset.Purpose.CHAT_ATTACHMENT,
                    thread=thread,
                )
                for asset_id in asset_ids
            ]
        except AssetBindingError as exc:
            raise serializers.ValidationError({"asset_ids": str(exc)}) from exc
        
        # Create the message
        message = Message.objects.create(**validated_data)
        
        # Create the attachments linked to the message
        scan_extensions = {".3dm", ".dcm", ".obj", ".ply", ".stl"}
        for asset in assets:
            extension = "." + asset.original_name.rsplit(".", 1)[-1].lower() if "." in asset.original_name else ""
            attachment = MessageAttachment(
                message=message,
                asset=asset,
                is_3d_scan=extension in scan_extensions,
            )
            attachment.full_clean()
            attachment.save()
            
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

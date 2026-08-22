from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from accounts.models import User
from accounts.validators import normalize_phone_number
from core.assets import AssetBindingError, lock_attachable_asset
from core.models import FileAsset
from messaging.models import Message, MessageAttachment, MessageThread


MAX_MESSAGE_LENGTH = 4000


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


class MessageSenderSerializer(serializers.Serializer):
    id = serializers.SerializerMethodField()
    role = serializers.CharField(source="sender_type")
    first_name = serializers.CharField(source="sender_first_name")
    last_name = serializers.CharField(source="sender_last_name")

    def get_id(self, obj):
        return str(obj.sender_id) if obj.sender_id else None


class MessageSerializer(serializers.ModelSerializer):
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    sender = MessageSenderSerializer(source="*", read_only=True)
    is_internal_note = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = (
            "id",
            "thread",
            "sender",
            "sender_type",
            "body",
            "visibility",
            "is_internal_note",
            "created_at",
            "attachments",
        )
        read_only_fields = fields

    def get_is_internal_note(self, obj):
        return obj.visibility == Message.Visibility.ADMINS_ONLY


class MessageCreateSerializer(serializers.ModelSerializer):
    body = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_MESSAGE_LENGTH,
        trim_whitespace=False,
    )
    visibility = serializers.ChoiceField(
        choices=Message.Visibility.choices,
        default=Message.Visibility.PARTICIPANTS,
    )
    asset_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=False,
        max_length=10,
        write_only=True,
    )

    class Meta:
        model = Message
        fields = ("id", "body", "visibility", "asset_ids")
        read_only_fields = ("id",)

    def to_internal_value(self, data):
        if "attachments" in data or "file_url" in data or "file_key" in data:
            raise serializers.ValidationError(
                {"asset_ids": "Submit server-issued asset IDs, not attachment metadata."}
            )
        return super().to_internal_value(data)

    def validate(self, attrs):
        request = self.context["request"]
        body = attrs.get("body", "")
        asset_ids = attrs.get("asset_ids", [])
        visibility = attrs.get("visibility", Message.Visibility.PARTICIPANTS)
        attrs["body"] = body.strip()

        if not attrs["body"] and not asset_ids:
            raise serializers.ValidationError("A message body or an attachment is required.")
        if visibility == Message.Visibility.ADMINS_ONLY:
            if not request.user.is_admin_role:
                raise serializers.ValidationError(
                    {"visibility": "Only administrators can create internal notes."}
                )
            if asset_ids:
                raise serializers.ValidationError(
                    {"asset_ids": "Internal notes cannot contain patient-visible attachments."}
                )
            if not attrs["body"]:
                raise serializers.ValidationError(
                    {"body": "Internal notes require a message body."}
                )
        return attrs

    def create(self, validated_data):
        thread = validated_data["thread"]
        asset_ids = validated_data.pop("asset_ids", [])
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

        sender = validated_data["sender"]
        validated_data["sender_first_name"] = sender.first_name
        validated_data["sender_last_name"] = sender.last_name
        message = Message.objects.create(**validated_data)

        scan_extensions = {".3dm", ".dcm", ".obj", ".ply", ".stl"}
        for asset in assets:
            extension = (
                "." + asset.original_name.rsplit(".", 1)[-1].lower()
                if "." in asset.original_name
                else ""
            )
            attachment = MessageAttachment(
                message=message,
                asset=asset,
                is_3d_scan=extension in scan_extensions,
            )
            attachment.full_clean()
            attachment.save()

        if message.visibility == Message.Visibility.PARTICIPANTS:
            MessageThread.objects.filter(pk=thread.pk).update(
                last_message_at=message.created_at,
                updated_at=timezone.now(),
            )
        return message


class ParticipantSerializer(serializers.ModelSerializer):
    specialty = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "phone_number",
            "first_name",
            "last_name",
            "role",
            "profile_picture",
            "specialty",
        )

    def get_specialty(self, obj):
        doctor = getattr(obj, "doctor_profile", None)
        return doctor.specialty if doctor else ""


class GuestContactSerializer(serializers.Serializer):
    phone_number = serializers.CharField(source="guest_phone")
    first_name = serializers.CharField(source="guest_first_name")
    last_name = serializers.CharField(source="guest_last_name")


class ThreadListSerializer(serializers.ModelSerializer):
    participant = serializers.SerializerMethodField()
    guest_contact = GuestContactSerializer(source="*", read_only=True)
    assigned_admin = ParticipantSerializer(read_only=True)
    unread_count = serializers.IntegerField(read_only=True, default=0)
    last_message = serializers.CharField(source="_last_message", read_only=True, default="")

    class Meta:
        model = MessageThread
        fields = (
            "id",
            "thread_type",
            "participant",
            "guest_contact",
            "assigned_admin",
            "status",
            "created_at",
            "last_message_at",
            "last_message",
            "unread_count",
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.thread_type == MessageThread.ThreadType.DIRECT:
            data["guest_contact"] = None
            data["assigned_admin"] = None
        elif instance.participant_id:
            data["guest_contact"] = None
        else:
            data["participant"] = None
        return data

    def get_participant(self, instance):
        participant = instance.participant
        if instance.thread_type == MessageThread.ThreadType.DIRECT:
            request = self.context.get("request")
            participant = (
                instance.direct_counterpart(request.user)
                if request and request.user.is_authenticated
                else None
            )
        return (
            ParticipantSerializer(participant, context=self.context).data
            if participant
            else None
        )


class ChatContactSerializer(ParticipantSerializer):
    is_pinned = serializers.SerializerMethodField()
    can_unpin = serializers.SerializerMethodField()

    class Meta(ParticipantSerializer.Meta):
        fields = ParticipantSerializer.Meta.fields + ("is_pinned", "can_unpin")

    def get_is_pinned(self, obj):
        return obj.pk in self.context.get("pinned_ids", set())

    def get_can_unpin(self, obj):
        return self.get_is_pinned(obj)


class DirectThreadCreateSerializer(serializers.Serializer):
    contact_id = serializers.PrimaryKeyRelatedField(
        source="contact",
        queryset=User.objects.filter(
            is_active=True,
            role__in=(User.Role.USER, User.Role.DOCTOR),
        ),
    )

    def validate_contact_id(self, value):
        if value.pk == self.context["request"].user.pk:
            raise serializers.ValidationError("You cannot start a conversation with yourself.")
        return value


class PinnedContactWriteSerializer(DirectThreadCreateSerializer):
    pass


class AdminThreadUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageThread
        fields = ("status", "assigned_admin")

    def validate_assigned_admin(self, value):
        if value is not None and not (value.is_active and value.is_admin_role):
            raise serializers.ValidationError(
                "assigned_admin must be an active administrator."
            )
        return value


class GuestMessageSerializer(serializers.Serializer):
    """A contact snapshot; this never creates or mutates an account."""

    phone_number = serializers.CharField(max_length=20)
    first_name = serializers.CharField(max_length=150, trim_whitespace=True)
    last_name = serializers.CharField(max_length=150, trim_whitespace=True)
    body = serializers.CharField(max_length=MAX_MESSAGE_LENGTH, trim_whitespace=True)

    def validate_phone_number(self, value):
        return normalize_phone_number(value)

    def validate_first_name(self, value):
        if not value:
            raise serializers.ValidationError("This field may not be blank.")
        return value

    def validate_last_name(self, value):
        if not value:
            raise serializers.ValidationError("This field may not be blank.")
        return value

    def validate_body(self, value):
        if not value:
            raise serializers.ValidationError("A message body is required.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        thread, _ = MessageThread.objects.select_for_update().get_or_create(
            participant=None,
            guest_phone=validated_data["phone_number"],
            thread_type=MessageThread.ThreadType.USER_ADMIN,
            status=MessageThread.Status.OPEN,
            deleted_at=None,
            defaults={
                "guest_first_name": validated_data["first_name"],
                "guest_last_name": validated_data["last_name"],
            },
        )
        changed_fields = []
        for field, incoming in (
            ("guest_first_name", validated_data["first_name"]),
            ("guest_last_name", validated_data["last_name"]),
        ):
            if getattr(thread, field) != incoming:
                setattr(thread, field, incoming)
                changed_fields.append(field)
        if changed_fields:
            thread.save(update_fields=(*changed_fields, "updated_at"))

        message = Message.objects.create(
            thread=thread,
            sender=None,
            sender_type=Message.SenderType.GUEST,
            sender_first_name=validated_data["first_name"],
            sender_last_name=validated_data["last_name"],
            body=validated_data["body"],
        )
        MessageThread.objects.filter(pk=thread.pk).update(
            last_message_at=message.created_at,
            updated_at=timezone.now(),
        )
        return message

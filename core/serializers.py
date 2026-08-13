from rest_framework import serializers
from core.models import FileAsset, SystemSettings


class FileAssetSerializer(serializers.ModelSerializer):
    """Public-safe metadata. Storage keys and permanent URLs never leave the API."""

    class Meta:
        model = FileAsset
        fields = (
            "id",
            "purpose",
            "original_name",
            "expected_size",
            "claimed_mime",
            "state",
            "scan_status",
            "created_at",
        )
        read_only_fields = fields


class UploadSessionCreateSerializer(serializers.Serializer):
    PURPOSE_MAP = {
        "chat_attachment": FileAsset.Purpose.CHAT_ATTACHMENT,
        "verification_document": FileAsset.Purpose.VERIFICATION_DOCUMENT,
        "profile_picture": FileAsset.Purpose.PROFILE_PICTURE,
    }

    client_upload_id = serializers.UUIDField()
    purpose = serializers.ChoiceField(choices=PURPOSE_MAP)
    file_name = serializers.CharField(max_length=255)
    file_size = serializers.IntegerField(min_value=1, max_value=1024 * 1024 * 1024)
    file_content_type = serializers.CharField(max_length=127)
    sha256 = serializers.RegexField(r"\A[0-9a-f]{64}\Z")
    thread_id = serializers.UUIDField(required=False)

    def validate_purpose(self, value):
        return self.PURPOSE_MAP[value]

    def validate(self, attrs):
        from core.uploads import UploadError, validate_upload_metadata

        try:
            attrs["file_content_type"] = validate_upload_metadata(
                purpose=attrs["purpose"],
                file_name=attrs["file_name"],
                file_size=attrs["file_size"],
                claimed_mime=attrs["file_content_type"],
                sha256=attrs["sha256"],
            )
        except UploadError as exc:
            raise serializers.ValidationError({"detail": str(exc)}) from exc
        return attrs


class UploadPartSpecSerializer(serializers.Serializer):
    part_number = serializers.IntegerField(min_value=1, max_value=10_000)
    checksum_sha256 = serializers.RegexField(r"\A[0-9a-f]{64}\Z")


class UploadPartBatchSerializer(serializers.Serializer):
    parts = UploadPartSpecSerializer(many=True, allow_empty=False, max_length=50)


class UploadedPartSerializer(UploadPartSpecSerializer):
    size = serializers.IntegerField(min_value=1)
    etag = serializers.CharField(max_length=255, trim_whitespace=False)

class SystemSettingsSerializer(serializers.ModelSerializer):
    """Serializer for the singleton SystemSettings table."""
    class Meta:
        model = SystemSettings
        fields = (
            "cancellation_enabled", 
            "cancellation_cutoff_hours", 
            "doctor_attachment_max_size_mb"
        )

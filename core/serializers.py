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

class SystemSettingsSerializer(serializers.ModelSerializer):
    """Serializer for the singleton SystemSettings table."""
    class Meta:
        model = SystemSettings
        fields = (
            "cancellation_enabled", 
            "cancellation_cutoff_hours", 
            "doctor_attachment_max_size_mb"
        )

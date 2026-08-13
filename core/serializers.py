from rest_framework import serializers
from core.models import SystemSettings

class FileUploadSerializer(serializers.Serializer):
    """Validates the file upload request."""
    PURPOSE_CHOICES = (
        ("chat_attachment", "Chat Attachment"),
        ("profile_picture", "Profile Picture"),
        ("verification_document", "Verification Document"),
    )
    
    purpose = serializers.ChoiceField(choices=PURPOSE_CHOICES, default="chat_attachment")
    file = serializers.FileField()

    def validate_file(self, value):
        settings = SystemSettings.load()
        max_size = settings.doctor_attachment_max_size_mb * 1024 * 1024
        if value.size > max_size:
            raise serializers.ValidationError(
                f"File size exceeds the maximum limit of {settings.doctor_attachment_max_size_mb}MB."
            )
        return value

class FileMetadataSerializer(serializers.Serializer):
    """Returns the structured payload to attach to a message or profile."""
    file_url = serializers.URLField()
    file_key = serializers.CharField(max_length=500)
    file_name = serializers.CharField(max_length=255)
    file_size = serializers.BigIntegerField()
    file_content_type = serializers.CharField(max_length=100, allow_blank=True)

class SystemSettingsSerializer(serializers.ModelSerializer):
    """Serializer for the singleton SystemSettings table."""
    class Meta:
        model = SystemSettings
        fields = (
            "cancellation_enabled", 
            "cancellation_cutoff_hours", 
            "doctor_attachment_max_size_mb"
        )
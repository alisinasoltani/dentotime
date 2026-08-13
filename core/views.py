from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from accounts.permissions import IsActiveAuthenticated, IsAdminRole, IsDoctorOrAdmin
from core.models import SystemSettings
from .serializers import SystemSettingsSerializer

# Allowed MIME types for medical files, documents, and media
ALLOWED_CONTENT_TYPES = {
    # Images
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp",
    # Documents
    "application/pdf", "application/msword", 
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", # .docx
    "application/vnd.ms-excel", 
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", # .xlsx
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", # .pptx
    "text/plain", "text/csv",
    # 3D & Medical
    "application/dicom", "application/octet-stream", "model/stl", "model/obj",
    # Audio & Video
    "video/mp4", "video/x-msvideo", "audio/mpeg", "audio/wav", "audio/ogg",
    # Archives
    "application/zip", "application/x-zip-compressed", "application/x-rar-compressed",
}

class FileUploadView(APIView):
    """Compatibility endpoint that refuses unsafe single-request uploads."""
    permission_classes = (IsDoctorOrAdmin,)

    def post(self, request):
        return Response(
            {
                "detail": (
                    "Single-request uploads are disabled. Create a resumable upload session "
                    "and bind the returned asset ID."
                )
            },
            status=status.HTTP_410_GONE,
        )


class SystemSettingsView(APIView):
    """Get or update system settings."""
    
    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [IsAdminRole()]
        return [IsActiveAuthenticated()]

    def get(self, request):
        settings_obj = SystemSettings.load()
        serializer = SystemSettingsSerializer(settings_obj)
        return Response(serializer.data)

    def patch(self, request):
        settings_obj = SystemSettings.load()
        serializer = SystemSettingsSerializer(settings_obj, data=request.data, partial=True)
        if serializer.is_valid():
            instance = serializer.save(updated_by=request.user)
            return Response(SystemSettingsSerializer(instance).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

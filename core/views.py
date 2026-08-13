import os
import uuid
from django.conf import settings
from django.core.files.storage import default_storage
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser

from accounts.permissions import IsAdminRole
from core.models import SystemSettings
from .serializers import FileUploadSerializer, FileMetadataSerializer, SystemSettingsSerializer

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
    """Handle direct file uploads to the local server."""
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser, FormParser) # Required for file uploads

    def post(self, request):
        serializer = FileUploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        purpose = data["purpose"]
        uploaded_file = data["file"]
        file_content_type = uploaded_file.content_type or "application/octet-stream"

        # Security: Only doctors and admins can upload files (Normal users cannot)
        if not (request.user.is_doctor_role or request.user.is_admin_role):
            raise PermissionDenied("You are not allowed to upload files.")

        # Security: Content-Type Allowlist
        if file_content_type not in ALLOWED_CONTENT_TYPES:
            return Response(
                {"detail": f"ارسال فایل با فرمت {file_content_type} مجاز نیست."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Generate local file path
        file_extension = uploaded_file.name.split(".")[-1] if "." in uploaded_file.name else ""
        unique_id = uuid.uuid4().hex
        
        # Note: If an admin uploads a chat attachment, we save it under the admin's folder
        if purpose == "chat_attachment":
            rel_path = f"uploads/doctors/{request.user.id}/chat/{unique_id}.{file_extension}"
        elif purpose == "verification_document":
            rel_path = f"uploads/doctors/{request.user.id}/verification/{unique_id}.{file_extension}"
        else:
            rel_path = f"uploads/profile_pictures/{request.user.id}/{unique_id}.{file_extension}"
        
        # Save file to local storage (MEDIA_ROOT)
        file_path = default_storage.save(rel_path, uploaded_file)
        
        # Construct the absolute URL to return to the frontend
        file_url = request.build_absolute_uri(settings.MEDIA_URL + file_path)

        metadata = {
            "file_url": file_url,
            "file_key": file_path, # We still return file_key for DB consistency
            "file_name": uploaded_file.name,
            "file_size": uploaded_file.size,
            "file_content_type": file_content_type,
        }
        
        response_serializer = FileMetadataSerializer(data=metadata)
        if response_serializer.is_valid():
            return Response(response_serializer.validated_data, status=status.HTTP_201_CREATED)
        return Response(response_serializer.errors, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class SystemSettingsView(APIView):
    """Get or update system settings."""
    
    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [IsAdminRole()]
        return [IsAuthenticated()]

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
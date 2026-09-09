from botocore.exceptions import BotoCoreError, ClientError
from django.core.cache import cache
from django.db import connection
from django.shortcuts import get_object_or_404
from django.db.models import Q
from rest_framework.permissions import AllowAny
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from accounts.permissions import IsActiveAuthenticated, IsAdminRole
from django.conf import settings

from core.downloads import AssetDownloadDenied, grant_asset_download
from core.models import FileAsset, SystemSettings, UploadSession
from messaging.models import MessageThread
from .serializers import (
    SystemSettingsSerializer,
    UploadPartBatchSerializer,
    UploadedPartSerializer,
    UploadSessionCreateSerializer,
)
from .uploads import (
    UploadError,
    UploadQuotaError,
    cancel_upload,
    complete_upload,
    create_upload_session,
    presign_parts,
    reconcile_uploaded_parts,
    record_uploaded_part,
)


class HealthView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = ()

    def get(self, request):
        return Response({"status": "ok"})


class ReadinessView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = ()

    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            cache_key = "readiness:probe"
            cache.set(cache_key, "ok", timeout=10)
            if cache.get(cache_key) != "ok":
                raise RuntimeError("shared cache round trip failed")
        except Exception:
            return Response({"status": "unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"status": "ready"})

class FileUploadView(APIView):
    """Compatibility endpoint that refuses unsafe single-request uploads."""
    permission_classes = (IsActiveAuthenticated,)

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


def _owned_session(request, pk):
    return get_object_or_404(
        UploadSession.objects.select_related("asset"),
        pk=pk,
        owner=request.user,
    )


def _session_payload(session, completed_parts=()):
    asset = session.asset
    return {
        "upload_id": str(session.pk),
        "client_upload_id": str(session.client_upload_id),
        "asset_id": str(asset.pk),
        "purpose": asset.purpose.lower(),
        "file_name": asset.original_name,
        "file_size": asset.expected_size,
        "file_content_type": asset.claimed_mime,
        "sha256": asset.sha256,
        "part_size": session.part_size,
        "expected_part_count": session.expected_part_count,
        "state": session.state,
        "asset_state": asset.state,
        "scan_status": asset.scan_status,
        "scan_error": asset.failed_reason if asset.state == FileAsset.State.FAILED else "",
        "expires_at": session.expires_at,
        "completed_parts": [
            {
                "part_number": part.part_number,
                "size": part.size,
                "etag": part.etag,
                "checksum_sha256": part.checksum_sha256,
            }
            for part in completed_parts
        ],
    }


def _upload_scope(request, data):
    purpose = data["purpose"]
    thread = None
    doctor = None
    if purpose == FileAsset.Purpose.CHAT_ATTACHMENT:
        thread_id = data.get("thread_id")
        if not thread_id:
            raise UploadError("thread_id is required for chat attachments.")
        queryset = MessageThread.objects.filter(deleted_at__isnull=True)
        if request.user.is_admin_role:
            queryset = queryset.exclude(thread_type=MessageThread.ThreadType.DIRECT)
        else:
            expected_thread_type = (
                MessageThread.ThreadType.DOCTOR_ADMIN
                if request.user.is_doctor_role
                else MessageThread.ThreadType.USER_ADMIN
            )
            queryset = queryset.filter(
                Q(participant=request.user, thread_type=expected_thread_type)
                | Q(
                    thread_type=MessageThread.ThreadType.DIRECT,
                    direct_participant_one=request.user,
                )
                | Q(
                    thread_type=MessageThread.ThreadType.DIRECT,
                    direct_participant_two=request.user,
                )
            )
        thread = get_object_or_404(queryset, pk=thread_id)
        if request.user.is_doctor_role and not request.user.doctor_profile.chat_enabled:
            raise UploadError("Only approved doctors can upload chat attachments.")
    elif purpose == FileAsset.Purpose.VERIFICATION_DOCUMENT:
        if not request.user.is_doctor_role:
            raise UploadError("Only doctors can upload verification documents.")
        doctor = request.user.doctor_profile
    elif data.get("thread_id"):
        raise UploadError("thread_id is only valid for chat attachments.")
    return thread, doctor


class UploadSessionCreateView(APIView):
    permission_classes = (IsActiveAuthenticated,)

    def post(self, request):
        serializer = UploadSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            thread, doctor = _upload_scope(request, data)
            session, created = create_upload_session(
                owner=request.user,
                client_upload_id=data["client_upload_id"],
                purpose=data["purpose"],
                file_name=data["file_name"],
                file_size=data["file_size"],
                claimed_mime=data["file_content_type"],
                sha256=data["sha256"],
                thread=thread,
                doctor=doctor,
            )
            completed = reconcile_uploaded_parts(session)
        except UploadError as exc:
            response_status = (
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
                if isinstance(exc, UploadQuotaError)
                else status.HTTP_400_BAD_REQUEST
            )
            return Response({"detail": str(exc)}, status=response_status)
        except (BotoCoreError, ClientError):
            return Response(
                {"detail": "Object storage is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            _session_payload(session, completed),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class UploadSessionDetailView(APIView):
    permission_classes = (IsActiveAuthenticated,)

    def get(self, request, pk):
        session = _owned_session(request, pk)
        try:
            completed = reconcile_uploaded_parts(session)
        except (BotoCoreError, ClientError):
            return Response(
                {"detail": "Object storage is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        session.refresh_from_db()
        return Response(_session_payload(session, completed))

    def delete(self, request, pk):
        session = _owned_session(request, pk)
        try:
            cancel_upload(session)
        except UploadError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UploadPartPresignView(APIView):
    permission_classes = (IsActiveAuthenticated,)

    def post(self, request, pk):
        session = _owned_session(request, pk)
        serializer = UploadPartBatchSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            parts = presign_parts(session, serializer.validated_data["parts"])
        except UploadError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"parts": parts})


class UploadPartRecordView(APIView):
    permission_classes = (IsActiveAuthenticated,)

    def post(self, request, pk):
        session = _owned_session(request, pk)
        serializer = UploadedPartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            part = record_uploaded_part(session, **serializer.validated_data)
        except UploadError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "part_number": part.part_number,
                "size": part.size,
                "etag": part.etag,
                "checksum_sha256": part.checksum_sha256,
            }
        )


class UploadCompleteView(APIView):
    permission_classes = (IsActiveAuthenticated,)

    def post(self, request, pk):
        session = _owned_session(request, pk)
        try:
            asset = complete_upload(session)
        except UploadError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        session.refresh_from_db()
        session.asset = asset
        return Response(_session_payload(session, session.recorded_parts.exclude(etag="")))


class LegacyFileConfirmView(APIView):
    permission_classes = (IsActiveAuthenticated,)

    def post(self, request):
        return Response(
            {"detail": "Storage keys cannot be confirmed. Use an owned upload session."},
            status=status.HTTP_400_BAD_REQUEST,
        )


class FileAssetDownloadView(APIView):
    permission_classes = (IsActiveAuthenticated,)

    def post(self, request, pk):
        asset = get_object_or_404(
            FileAsset.objects.select_related("scope_thread", "scope_doctor"),
            pk=pk,
        )
        try:
            url = grant_asset_download(
                asset=asset,
                actor=request.user,
                ip_address=request.META.get("REMOTE_ADDR"),
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
        except AssetDownloadDenied:
            # Do not reveal whether a protected asset exists or merely belongs to someone else.
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        except (BotoCoreError, ClientError):
            return Response(
                {"detail": "Private storage is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {"url": url, "expires_in": settings.AWS_S3_DOWNLOAD_EXPIRY_SECONDS},
            status=status.HTTP_200_OK,
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

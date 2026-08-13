from django.urls import path
from .views import (
    FileUploadView,
    FileAssetDownloadView,
    LegacyFileConfirmView,
    SystemSettingsView,
    UploadCompleteView,
    UploadPartPresignView,
    UploadPartRecordView,
    UploadSessionCreateView,
    UploadSessionDetailView,
)

urlpatterns = [
    path("files/upload/", FileUploadView.as_view(), name="file_upload"),
    path("files/assets/<uuid:pk>/download/", FileAssetDownloadView.as_view(), name="file_asset_download"),
    path("files/presign/", UploadSessionCreateView.as_view(), name="file_presign_compat"),
    path("files/confirm/", LegacyFileConfirmView.as_view(), name="file_confirm_compat"),
    path("files/uploads/", UploadSessionCreateView.as_view(), name="upload_session_create"),
    path("files/uploads/<uuid:pk>/", UploadSessionDetailView.as_view(), name="upload_session_detail"),
    path("files/uploads/<uuid:pk>/parts/presign/", UploadPartPresignView.as_view(), name="upload_part_presign"),
    path("files/uploads/<uuid:pk>/parts/record/", UploadPartRecordView.as_view(), name="upload_part_record"),
    path("files/uploads/<uuid:pk>/complete/", UploadCompleteView.as_view(), name="upload_complete"),
    path("settings/", SystemSettingsView.as_view(), name="system_settings"),
]

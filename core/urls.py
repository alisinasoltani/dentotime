from django.urls import path
from .views import FileUploadView, SystemSettingsView

urlpatterns = [
    path("files/upload/", FileUploadView.as_view(), name="file_upload"),
    path("settings/", SystemSettingsView.as_view(), name="system_settings"),
]
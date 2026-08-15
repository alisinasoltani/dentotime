from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    
    # Auth Routes
    path("api/v1/auth/", include("accounts.urls_auth")),
    
    # User & Doctor Management
    path("api/v1/users/", include("accounts.urls_users")),
    path("api/v1/doctors/", include("accounts.urls_doctors")),
    path("api/v1/admin/", include("accounts.urls_admin")),
    
    # Appointments
    path("api/v1/appointments/", include("appointments.urls")),
    path("api/v1/admin/appointments/", include("appointments.urls_admin")),
    
    # Chat / Messaging
    path("api/v1/chat/", include("messaging.urls")),
    path("api/v1/admin/chat/", include("messaging.urls_admin")),
    
    # Core utilities (files, settings)
    path("api/v1/", include("core.urls")),
    
]

if settings.ENABLE_SILK:
    urlpatterns.append(path("silk/", include("silk.urls", namespace="silk")))

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

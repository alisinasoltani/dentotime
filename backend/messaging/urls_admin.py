from django.urls import path
from .views import AdminThreadUpdateView

urlpatterns = [
    path("threads/<uuid:pk>/", AdminThreadUpdateView.as_view(), name="admin_thread_update"),
]
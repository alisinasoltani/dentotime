from django.urls import path
from .views import MeView, PasswordChangeView

urlpatterns = [
    path("me/", MeView.as_view(), name="me"),
    path("me/change-password/", PasswordChangeView.as_view(), name="change_password"),
]
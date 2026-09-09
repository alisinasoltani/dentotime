from django.urls import path
from .views import MeView, PasswordChangeOTPView, PasswordChangeView

urlpatterns = [
    path("me/", MeView.as_view(), name="me"),
    path("me/change-password/request-otp/", PasswordChangeOTPView.as_view(), name="change_password_request_otp"),
    path("me/change-password/", PasswordChangeView.as_view(), name="change_password"),
]

from django.urls import path
from .views import (
    AppointmentCancelView,
    AppointmentClaimView,
    AppointmentCreateView,
    BookingCaptchaCreateView,
    MyAppointmentListView,
    SlotListView,
)

urlpatterns = [
    path("slots/", SlotListView.as_view(), name="slot_list"),
    path("", AppointmentCreateView.as_view(), name="appointment_create"),
    path("captcha/", BookingCaptchaCreateView.as_view(), name="booking_captcha"),
    path("claim/", AppointmentClaimView.as_view(), name="claim_guest_appointments"),
    path("me/", MyAppointmentListView.as_view(), name="my_appointments"),
    path("<uuid:pk>/cancel/", AppointmentCancelView.as_view(), name="appointment_cancel"),
]

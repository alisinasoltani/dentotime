from django.urls import path
from .views import (
    AppointmentCancelView,
    AppointmentAttendanceView,
    AppointmentClaimView,
    AppointmentCreateView,
    BookingCaptchaCreateView,
    DoctorAppointmentListView,
    DoctorAppointmentCalendarView,
    DoctorAppointmentCancelView,
    DoctorAvailabilityDayDeleteView,
    DoctorAvailabilitySlotDeleteView,
    DoctorAvailabilityView,
    MyAppointmentListView,
    SlotListView,
)

urlpatterns = [
    path("slots/", SlotListView.as_view(), name="slot_list"),
    path("", AppointmentCreateView.as_view(), name="appointment_create"),
    path("captcha/", BookingCaptchaCreateView.as_view(), name="booking_captcha"),
    path("claim/", AppointmentClaimView.as_view(), name="claim_guest_appointments"),
    path("me/", MyAppointmentListView.as_view(), name="my_appointments"),
    path("doctor/", DoctorAppointmentListView.as_view(), name="doctor_appointments"),
    path(
        "doctor/calendar/",
        DoctorAppointmentCalendarView.as_view(),
        name="doctor_appointment_calendar",
    ),
    path(
        "doctor/<uuid:pk>/cancel/",
        DoctorAppointmentCancelView.as_view(),
        name="doctor_appointment_cancel",
    ),
    path(
        "doctor/availability/",
        DoctorAvailabilityView.as_view(),
        name="doctor_availability",
    ),
    path(
        "doctor/availability/slots/<int:pk>/",
        DoctorAvailabilitySlotDeleteView.as_view(),
        name="doctor_availability_slot_delete",
    ),
    path(
        "doctor/availability/days/<str:clinic_date>/",
        DoctorAvailabilityDayDeleteView.as_view(),
        name="doctor_availability_day_delete",
    ),
    path("<uuid:pk>/attendance/", AppointmentAttendanceView.as_view(), name="appointment_attendance"),
    path("<uuid:pk>/cancel/", AppointmentCancelView.as_view(), name="appointment_cancel"),
]

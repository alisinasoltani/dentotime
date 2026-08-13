from django.urls import path
from .views import (
    SlotListView, AppointmentCreateView, MyAppointmentListView, 
    AppointmentCancelView, GuestAppointmentCreateView
)

urlpatterns = [
    path("slots/", SlotListView.as_view(), name="slot_list"),
    path("", AppointmentCreateView.as_view(), name="appointment_create"),
    path("guest/", GuestAppointmentCreateView.as_view(), name="guest_appointment_create"),
    path("me/", MyAppointmentListView.as_view(), name="my_appointments"),
    path("<uuid:pk>/cancel/", AppointmentCancelView.as_view(), name="appointment_cancel"),
]
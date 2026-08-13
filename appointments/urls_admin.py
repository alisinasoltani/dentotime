from django.urls import path
from .views import (
    AdminAppointmentListView, AdminAppointmentUpdateView,
    AdminSlotListCreateView, AdminAppointmentCalendarView,
    AdminSlotDetailView
)

urlpatterns = [
    path("slots/", AdminSlotListCreateView.as_view(), name="admin_slot_list_create"),
    path("calendar/", AdminAppointmentCalendarView.as_view(), name="admin_appointment_calendar"),
    path("", AdminAppointmentListView.as_view(), name="admin_appointment_list"),
    path("<uuid:pk>/", AdminAppointmentUpdateView.as_view(), name="admin_appointment_update"),
    path("slots/<int:pk>/", AdminSlotDetailView.as_view(), name="admin_slot_detail"),
]
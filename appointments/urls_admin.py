from django.urls import path
from .views import (
    AdminAppointmentCalendarView,
    AdminAppointmentListView,
    AdminAppointmentUpdateView,
    AdminSlotDetailView,
    AdminSlotListCreateView,
    AvailabilityBreakDetailView,
    AvailabilityBreakListCreateView,
    AvailabilityGenerateView,
    AvailabilityOverrideDetailView,
    AvailabilityOverrideListCreateView,
    WeeklyAvailabilityRuleDetailView,
    WeeklyAvailabilityRuleListCreateView,
)

urlpatterns = [
    path("slots/", AdminSlotListCreateView.as_view(), name="admin_slot_list_create"),
    path("availability/rules/", WeeklyAvailabilityRuleListCreateView.as_view(), name="availability_rule_list"),
    path("availability/rules/<int:pk>/", WeeklyAvailabilityRuleDetailView.as_view(), name="availability_rule_detail"),
    path("availability/breaks/", AvailabilityBreakListCreateView.as_view(), name="availability_break_list"),
    path("availability/breaks/<int:pk>/", AvailabilityBreakDetailView.as_view(), name="availability_break_detail"),
    path("availability/overrides/", AvailabilityOverrideListCreateView.as_view(), name="availability_override_list"),
    path("availability/overrides/<int:pk>/", AvailabilityOverrideDetailView.as_view(), name="availability_override_detail"),
    path("availability/generate/", AvailabilityGenerateView.as_view(), name="availability_generate"),
    path("calendar/", AdminAppointmentCalendarView.as_view(), name="admin_appointment_calendar"),
    path("", AdminAppointmentListView.as_view(), name="admin_appointment_list"),
    path("<uuid:pk>/", AdminAppointmentUpdateView.as_view(), name="admin_appointment_update"),
    path("slots/<int:pk>/", AdminSlotDetailView.as_view(), name="admin_slot_detail"),
]

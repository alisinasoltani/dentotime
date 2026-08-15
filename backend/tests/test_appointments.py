import pytest
import uuid
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from appointments.models import AppointmentSlot, Appointment
from core.models import SystemSettings
from accounts.models import NormalUser


@pytest.mark.django_db
def test_cancel_appointment_policy_cutoff(authed_client, normal_user, system_settings):
    """
    TEST: Cancel Appointment Cutoff Policy
    DESCRIPTION: Verifies that a user cannot cancel an appointment if the current
                 time is inside the system's 24-hour cancellation cutoff window.
    EXAMPLE:
        System Setting: Cutoff = 24 hours
        Appointment: Starts in 12 hours
        Action: User attempts to cancel
        Expected Result: 403 Forbidden (Policy violation)
    """
    print("\n" + "="*50)
    print("Running: Cancel Appointment Cutoff Policy Test")
    print("="*50)
    
    system_settings.cancellation_cutoff_hours = 24
    system_settings.save()

    slot = AppointmentSlot.objects.create(
        date=timezone.now().date() + timedelta(days=1),
        start_at=timezone.now() + timedelta(hours=12),
        end_at=timezone.now() + timedelta(hours=13),
        status=AppointmentSlot.Status.BOOKED
    )
    appt = Appointment.objects.create(patient=normal_user, slot=slot, status=Appointment.Status.APPROVED)
    
    response = authed_client.post(f"/api/v1/appointments/{appt.id}/cancel/", {"cancellation_reason": "Test"})
    
    print(f"Response Status: {response.status_code} (Expected: 403)")
    assert response.status_code == 403
    assert "cannot be cancelled" in response.data["detail"]
    print("Result: PASSED\n")


@pytest.mark.django_db
def test_double_booking_race_condition(authed_client, normal_user):
    """
    TEST: Double Booking Race Condition
    DESCRIPTION: Verifies that two users trying to book the exact same time slot
                 simultaneously do not result in a double-booking.
    EXAMPLE:
        Slot: Available
        User 1: Books slot -> Success (201)
        User 2: Books slot -> Fails (400) "just booked"
    """
    print("\n" + "="*50)
    print("Running: Double Booking Race Condition Test")
    print("="*50)
    
    slot = AppointmentSlot.objects.create(
        date=timezone.now().date() + timedelta(days=5),
        start_at=timezone.now() + timedelta(days=5),
        end_at=timezone.now() + timedelta(days=5, hours=1),
        status=AppointmentSlot.Status.AVAILABLE
    )
    
    res1 = authed_client.post(
        "/api/v1/appointments/",
        {"slot_id": slot.id, "reason": "Race 1"},
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    print(f"User 1 booking attempt: {res1.status_code} (Expected: 201)")
    assert res1.status_code == 201
    
    user2 = NormalUser.objects.create_user(phone_number="+9999999999", password="TestPass123!", role="USER")
    client2 = APIClient()
    client2.force_authenticate(user=user2)
    
    res2 = client2.post(
        "/api/v1/appointments/",
        {"slot_id": slot.id, "reason": "Race 2"},
        HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()),
    )
    print(f"User 2 booking attempt: {res2.status_code} (Expected: 409)")
    
    assert res2.status_code == 409
    assert "no longer available" in str(res2.data["slot_id"])
    print("Result: PASSED\n")

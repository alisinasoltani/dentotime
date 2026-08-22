from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APIClient

from accounts.models import Doctor, DoctorReview, NormalUser, RatingParameter
from appointments.models import Appointment, AppointmentSlot


@pytest.mark.django_db
def test_rating_demo_seed_is_repeatable_and_creates_both_eligibility_states(monkeypatch):
    monkeypatch.setenv("DJANGO_ENVIRONMENT", "test")
    first_output = StringIO()
    call_command("seed_rating_demo", stdout=first_output)

    eligible_appointment = Appointment.objects.get(
        reason="[RATING_DEMO] eligible patient visit",
    )
    previous_slot = eligible_appointment.slot
    previous_slot.start_at -= timedelta(days=365)
    previous_slot.end_at -= timedelta(days=365)
    previous_slot.date = previous_slot.start_at.date()
    previous_slot.save(update_fields=("start_at", "end_at", "date"))

    call_command("seed_rating_demo", stdout=StringIO())
    assert not AppointmentSlot.objects.filter(pk=previous_slot.pk).exists()

    doctors = Doctor.objects.filter(
        username__in=[
            "arman-hosseini",
            "nazanin-karimi",
            "sara-moradi",
            "reza-ahmadi",
            "parisa-ebrahimi",
            "milad-sadeghi",
            "leila-rahmani",
            "nima-farhadi",
        ]
    )
    assert doctors.count() == 8
    assert Appointment.objects.filter(
        reason__startswith="[INITIAL_DATA] attended visit ",
        doctor__in=doctors,
        attendance_status=Appointment.AttendanceStatus.ATTENDED,
    ).count() == 24
    assert not Appointment.objects.filter(reason__startswith="[RATING_DEMO] review ").exists()
    active_parameter_count = RatingParameter.objects.filter(is_active=True).count()
    for doctor in doctors:
        reviews = DoctorReview.objects.filter(doctor=doctor)
        assert reviews.count() == 3
        assert all(review.answers.count() == active_parameter_count for review in reviews)

    target = doctors.get(username="arman-hosseini")
    eligible = NormalUser.objects.get(phone_number="+989121111101")
    blocked = NormalUser.objects.get(phone_number="+989121111102")
    assert eligible.check_password("DemoRating123!")
    assert blocked.check_password("DemoRating123!")

    client = APIClient()
    client.force_authenticate(eligible)
    eligible_response = client.get(f"/api/v1/doctors/{target.username}/review-eligibility/")
    client.force_authenticate(blocked)
    blocked_response = client.get(f"/api/v1/doctors/{target.username}/review-eligibility/")

    assert eligible_response.data["state"] == "ELIGIBLE"
    assert blocked_response.data["state"] == "UPCOMING_APPOINTMENT"
    assert "09121111101" in first_output.getvalue()
    assert "Seeded review list" in first_output.getvalue()


@pytest.mark.django_db
def test_rating_demo_seed_is_disabled_in_production(monkeypatch):
    monkeypatch.setenv("DJANGO_ENVIRONMENT", "production")

    with pytest.raises(CommandError, match="disabled outside development and test"):
        call_command("seed_rating_demo", stdout=StringIO())

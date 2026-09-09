"""Public content ownership and insurance/service booking contract."""
from datetime import timedelta
from uuid import uuid4

import pytest
from django.utils import timezone
from accounts.models import Doctor, DentalService, InsuranceProvider
from appointments.models import Appointment, AppointmentSlot

pytestmark = pytest.mark.django_db


@pytest.fixture
def choices(doctor_user):
    service = DentalService.objects.create(slug="qa-service", title="QA service", short_title="QA")
    insurance = InsuranceProvider.objects.create(name="QA insurance")
    doctor_user.verification_status = Doctor.VerificationStatus.APPROVED
    doctor_user.save()
    doctor_user.services.add(service)
    doctor_user.insurances.add(insurance)
    return service, insurance


@pytest.mark.parametrize("verification", Doctor.VerificationStatus.values)
def test_doctor_owns_all_public_profile_fields(doctor_client, doctor_user, choices, verification):
    service, insurance = choices
    doctor_user.verification_status = verification
    doctor_user.save()
    payload = {
        "specialty": "پزشک آزمایشی", "bio": "معرفی", "experience": "۱۰ سال",
        "education": "تحصیلات ثبت‌شده توسط پزشک", "clinical_history": "سابقه ثبت‌شده",
        "certifications": "گواهی ثبت‌شده", "clinic_name": "مطب", "address": "نشانی",
        "map_url": "https://www.openstreetmap.org/?mlat=35.7&mlon=51.4",
        "services": [service.pk], "insurances": [insurance.pk],
        "verification_status": "APPROVED", "role": "ADMIN", "is_active": False,
    }
    response = doctor_client.patch("/api/v1/doctors/me/profile/", payload, format="json")
    assert response.status_code == 200, response.data
    doctor_user.refresh_from_db()
    assert doctor_user.verification_status == verification
    assert doctor_user.role == "DOCTOR" and doctor_user.is_active
    for key in ("specialty", "bio", "experience", "education", "clinical_history", "certifications", "clinic_name", "address", "map_url"):
        assert getattr(doctor_user, key) == payload[key]
    assert doctor_client.get("/api/v1/doctors/me/profile/").data == response.data
    doctor_client.force_authenticate(user=None)
    public = doctor_client.get(f"/api/v1/doctors/{doctor_user.pk}/")
    assert public.status_code == (200 if verification == "APPROVED" else 404)
    if public.status_code == 200:
        assert public.data["education"] == payload["education"]


def test_profile_denies_other_roles_and_inactive_choices(api_client, normal_user, admin_user, doctor_user, choices):
    assert api_client.get("/api/v1/doctors/me/profile/").status_code == 401
    for user in (normal_user, admin_user):
        api_client.force_authenticate(user=user)
        assert api_client.patch("/api/v1/doctors/me/profile/", {"bio": "changed"}).status_code == 403
    service, insurance = choices
    service.is_active = insurance.is_active = False
    service.save()
    insurance.save()
    api_client.force_authenticate(user=doctor_user)
    response = api_client.patch("/api/v1/doctors/me/profile/", {"services": [service.pk], "insurances": [insurance.pk], "map_url": "javascript:alert(1)"}, format="json")
    assert response.status_code == 400
    assert set(response.data) == {"services", "insurances", "map_url"}
    assert api_client.patch("/api/v1/doctors/me/profile/", {"bio": "x" * 10001}, format="json").status_code == 400


def test_doctor_filter_requires_both_active_choices(api_client, doctor_user, choices):
    service, insurance = choices
    other = Doctor.objects.create_user(phone_number="+989120009876", role="DOCTOR", verification_status="APPROVED")
    other.services.add(service)
    params = {"service_id": service.pk, "insurance_id": insurance.pk}
    results = api_client.get("/api/v1/doctors/list/", params).data["results"]
    assert [item["id"] for item in results] == [doctor_user.pk]
    other.insurances.add(insurance)
    other.services.clear()
    assert api_client.get("/api/v1/doctors/list/", params).data["count"] == 1
    insurance.is_active = False
    insurance.save()
    assert api_client.get("/api/v1/doctors/list/", params).data["count"] == 0
    assert api_client.get("/api/v1/doctors/list/", {"service_id": "garbage"}).status_code == 400


@pytest.fixture
def booking(doctor_user, choices):
    start = timezone.now() + timedelta(days=2)
    slot = AppointmentSlot.objects.create(doctor=doctor_user, date=start.date(), start_at=start, end_at=start + timedelta(minutes=30))
    service, insurance = choices
    return {"slot_id": slot.pk, "doctor_id": doctor_user.pk, "service_id": service.pk, "insurance_id": insurance.pk}


def test_booking_persists_choices_and_idempotency(authed_client, booking, doctor_user):
    key = str(uuid4())
    response = authed_client.post("/api/v1/appointments/", booking, format="json", HTTP_IDEMPOTENCY_KEY=key)
    assert response.status_code == 201, response.data
    appointment = Appointment.objects.get(pk=response.data["id"])
    assert appointment.insurance_id == booking["insurance_id"]
    assert appointment.service_id == booking["service_id"]
    assert response.data["insurance"] == booking["insurance_id"]
    assert authed_client.post("/api/v1/appointments/", booking, format="json", HTTP_IDEMPOTENCY_KEY=key).status_code == 200
    different = InsuranceProvider.objects.create(name="different")
    doctor_user.insurances.add(different)
    assert authed_client.post("/api/v1/appointments/", {**booking, "insurance_id": different.pk}, format="json", HTTP_IDEMPOTENCY_KEY=key).status_code == 409
    assert Appointment.objects.filter(slot_id=booking["slot_id"]).count() == 1


@pytest.mark.parametrize("change", ["missing_insurance", "missing_service", "wrong_insurance", "wrong_service", "inactive_insurance", "inactive_service", "missing_doctor"])
def test_booking_cannot_bypass_matching(authed_client, booking, doctor_user, choices, change):
    service, insurance = choices
    if change.startswith("missing_"):
        booking.pop(change.removeprefix("missing_") + "_id")
    elif change == "wrong_insurance":
        doctor_user.insurances.clear()
    elif change == "wrong_service":
        doctor_user.services.clear()
    elif change == "inactive_insurance":
        insurance.is_active = False
        insurance.save()
    else:
        service.is_active = False
        service.save()
    response = authed_client.post("/api/v1/appointments/", booking, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid4()))
    assert response.status_code in (400, 409), response.data
    assert not Appointment.objects.filter(slot_id=booking["slot_id"]).exists()
    assert AppointmentSlot.objects.get(pk=booking["slot_id"]).status == "AVAILABLE"

from io import StringIO
from unittest.mock import patch

import pytest
from django.contrib.auth import authenticate
from django.core.management import CommandError, call_command
from django.db import connection
from moto import mock_aws
from rest_framework.test import APIClient

from accounts.models import Doctor, NormalUser, User
from appointments.models import Appointment, AppointmentSlot
from core.models import FileAsset
from core.object_storage import get_s3_client
from core.sms_service import send_otp
from demo.guard import require_demo
from demo.models import DemoSMS, DemoState
from demo.seed import DOCTORS, PASSWORD, PATIENTS, e164, seed
from messaging.models import Message, MessageThread


@pytest.fixture
def storage(settings):
    settings.AWS_S3_ENDPOINT_URL = "https://s3.amazonaws.com"
    settings.AWS_S3_PUBLIC_ENDPOINT_URL = "https://s3.amazonaws.com"
    with mock_aws():
        get_s3_client().create_bucket(Bucket="dentotime-demo")
        yield


@pytest.fixture
def baseline(db, storage):
    assert seed()


@pytest.mark.django_db
def test_repeat_keeps_changes_and_does_not_duplicate_or_delete(baseline):
    doctor = Doctor.objects.get(username="demo-doctor-pending")
    doctor.verification_status = "APPROVED"
    doctor.save()
    patient = NormalUser.objects.get(username="demo-user-new")
    patient.set_password("ChangedDuringPresentation2026!")
    patient.save()
    counts = [model.objects.count() for model in (User, Appointment, AppointmentSlot, Message, FileAsset)]
    assert not seed()
    assert [model.objects.count() for model in (User, Appointment, AppointmentSlot, Message, FileAsset)] == counts
    doctor.refresh_from_db()
    patient.refresh_from_db()
    assert doctor.verification_status == "APPROVED"
    assert patient.check_password("ChangedDuringPresentation2026!")


@pytest.mark.django_db
def test_every_account_authenticates_or_is_deliberately_inactive(baseline):
    for _, phone, _, active in PATIENTS:
        assert bool(authenticate(username=e164(phone), password=PASSWORD)) == active
    for _, phone, _, status, owner, active in DOCTORS:
        doctor = Doctor.objects.get(phone_number=e164(phone))
        assert doctor.verification_status == status
        assert doctor.account_owner == owner
        assert bool(authenticate(username=e164(phone), password=PASSWORD)) == active
    for phone in ("09120001001", "09120001002"):
        admin = authenticate(username=e164(phone), password=PASSWORD)
        assert admin.is_admin_role and not admin.is_superuser


@pytest.mark.django_db
def test_rating_and_verification_states_through_api(baseline):
    client = APIClient()
    for key, state in (("new", "NO_APPOINTMENT"), ("eligible", "ELIGIBLE"),
                       ("upcoming", "UPCOMING_APPOINTMENT"), ("confirm", "VISIT_CONFIRMATION_REQUIRED"),
                       ("reviewed", "ELIGIBLE"), ("no-show", "NO_APPOINTMENT")):
        client.force_authenticate(User.objects.get(username=f"demo-user-{key}"))
        response = client.get("/api/v1/doctors/demo-doctor-approved/review-eligibility/")
        assert response.status_code == 200
        assert response.data["state"] == state
        if key == "reviewed":
            assert len(response.data["existing_review"]["answers"]) == 7
    for key, _, _, state, _, active in DOCTORS:
        client.force_authenticate(User.objects.get(username=f"demo-doctor-{key}"))
        response = client.get("/api/v1/doctors/verification/")
        if active:
            assert response.status_code == 200
            assert response.data["verification_status"] == state
        else:
            assert response.status_code == 403
    assert set(Appointment.objects.values_list("status", flat=True)) == set(Appointment.Status.values)
    for row in Appointment.objects.select_related("slot", "patient"):
        row.full_clean()
    for thread in MessageThread.objects.all():
        thread.full_clean()


@pytest.mark.django_db
def test_internal_notes_and_documents_are_private(baseline):
    client = APIClient()
    patient = User.objects.get(username="demo-user-workflow")
    thread = MessageThread.objects.get(participant=patient)
    client.force_authenticate(patient)
    response = client.get(f"/api/v1/chat/threads/{thread.pk}/messages/")
    assert response.status_code == 200
    assert "یادداشت داخلی" not in str(response.data)
    asset = FileAsset.objects.filter(purpose="VERIFICATION_DOCUMENT").first()
    response = client.post(f"/api/v1/files/assets/{asset.pk}/download/")
    assert response.status_code in {403, 404}
    admin = User.objects.get(username="demo-admin-primary")
    client.force_authenticate(admin)
    response = client.post(f"/api/v1/files/assets/{asset.pk}/download/")
    assert response.status_code == 200
    assert FileAsset.objects.exclude(state="AVAILABLE", scan_status="CLEAN").count() == 0
    for asset in FileAsset.objects.all():
        body = get_s3_client().get_object(Bucket="dentotime-demo", Key=asset.storage_key)["Body"].read()
        assert len(body) == asset.expected_size


@pytest.mark.django_db
def test_failure_rolls_back_database_and_retry_succeeds(storage):
    with patch("demo.seed.document", side_effect=RuntimeError("Storage unavailable")):
        with pytest.raises(RuntimeError, match="Storage unavailable"):
            seed()
    assert not User.objects.exists()
    assert not DemoState.objects.exists()
    assert seed()


@pytest.mark.django_db
def test_refuses_existing_database(storage):
    original = User.objects.create_user(phone_number="+989120009999", password=PASSWORD, role="USER")
    with pytest.raises(CommandError, match="empty application database"):
        seed()
    assert User.objects.count() == 1
    assert User.objects.get(pk=original.pk).check_password(PASSWORD)


@pytest.mark.django_db
@pytest.mark.parametrize("attribute,value", [("IS_PRODUCTION", True), ("DEMO_MODE", False), ("DJANGO_ENVIRONMENT", "production"), ("AWS_STORAGE_BUCKET_NAME", "real-uploads")])
def test_demo_guard_rejects_unsafe_configuration(settings, attribute, value):
    setattr(settings, attribute, value)
    with pytest.raises(CommandError, match="isolated demo"):
        require_demo()


@pytest.mark.django_db
def test_guard_checks_actual_connection():
    with patch.dict(connection.settings_dict, NAME="real_database"):
        with pytest.raises(CommandError, match="isolated demo"):
            require_demo()


@pytest.mark.django_db
def test_sms_captures_real_otp_without_provider_traffic():
    with patch("core.sms_service.requests.post") as network:
        assert send_otp("09120001101", "18342")
        network.assert_not_called()
    assert DemoSMS.objects.get().parameters == [{"name": "Code", "value": "18342"}]
    output = StringIO()
    call_command("demo_sms", stdout=output)
    assert "18342" in output.getvalue()

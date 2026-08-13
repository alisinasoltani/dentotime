from dataclasses import dataclass
from datetime import timedelta
from typing import Callable

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Doctor, NormalUser, User
from appointments.models import Appointment, AppointmentSlot
from messaging.models import MessageThread


ActorName = str
ALL_AUTHENTICATED = frozenset(
    {"patient", "doctor_unverified", "doctor_rejected", "doctor_approved", "admin"}
)
DOCTORS = frozenset({"doctor_unverified", "doctor_rejected", "doctor_approved"})
MESSAGING = frozenset({"patient", "doctor_approved", "admin"})


@dataclass(frozen=True)
class EndpointCase:
    name: str
    method: str
    url: Callable[[dict], str]
    allowed: frozenset[ActorName]
    data: Callable[[dict], dict] = lambda _: {}


@pytest.fixture
def authorization_context(db):
    patient = NormalUser.objects.create_user(
        phone_number="+989120001001", password="PatientPass123!", role=User.Role.USER
    )
    other_patient = NormalUser.objects.create_user(
        phone_number="+989120001002", password="PatientPass123!", role=User.Role.USER
    )
    doctor_unverified = Doctor.objects.create_user(
        phone_number="+989120001003", password="DoctorPass123!", role=User.Role.DOCTOR
    )
    doctor_rejected = Doctor.objects.create_user(
        phone_number="+989120001004", password="DoctorPass123!", role=User.Role.DOCTOR
    )
    doctor_rejected.verification_status = Doctor.VerificationStatus.REJECTED
    doctor_rejected.save(update_fields=["verification_status"])
    doctor_approved = Doctor.objects.create_user(
        phone_number="+989120001005", password="DoctorPass123!", role=User.Role.DOCTOR
    )
    doctor_approved.verification_status = Doctor.VerificationStatus.APPROVED
    doctor_approved.save(update_fields=["verification_status"])
    admin = User.objects.create_superuser(
        phone_number="+989120001006", password="AdminPass123!"
    )

    starts_at = timezone.now() + timedelta(days=10)
    slot = AppointmentSlot.objects.create(
        date=starts_at.date(),
        start_at=starts_at,
        end_at=starts_at + timedelta(hours=1),
        status=AppointmentSlot.Status.BOOKED,
    )
    appointment = Appointment.objects.create(
        patient=patient,
        slot=slot,
        status=Appointment.Status.PENDING,
        reason="authorization test",
    )

    other_start = starts_at + timedelta(hours=2)
    other_slot = AppointmentSlot.objects.create(
        date=other_start.date(),
        start_at=other_start,
        end_at=other_start + timedelta(hours=1),
        status=AppointmentSlot.Status.BOOKED,
    )
    other_appointment = Appointment.objects.create(
        patient=other_patient,
        slot=other_slot,
        status=Appointment.Status.PENDING,
    )

    thread = MessageThread.objects.create(
        participant=patient,
        thread_type=MessageThread.ThreadType.USER_ADMIN,
    )
    other_thread = MessageThread.objects.create(
        participant=other_patient,
        thread_type=MessageThread.ThreadType.USER_ADMIN,
    )

    return {
        "patient": patient,
        "other_patient": other_patient,
        "doctor_unverified": doctor_unverified,
        "doctor_rejected": doctor_rejected,
        "doctor_approved": doctor_approved,
        "admin": admin,
        "slot": slot,
        "appointment": appointment,
        "other_appointment": other_appointment,
        "thread": thread,
        "other_thread": other_thread,
    }


@pytest.fixture(autouse=True)
def isolate_authorization_side_effects(monkeypatch, settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    cache.clear()
    for target in (
        "appointments.views.send_appt_approved",
        "appointments.views.send_appt_rejected",
        "appointments.views.send_admin_alert",
        "accounts.views.send_doctor_approved",
        "accounts.views.send_doctor_rejected",
        "messaging.views.send_new_message",
    ):
        monkeypatch.setattr(target, lambda *args, **kwargs: None)


ENDPOINTS = (
    EndpointCase("me_get", "get", lambda c: "/api/v1/users/me/", ALL_AUTHENTICATED),
    EndpointCase("me_patch", "patch", lambda c: "/api/v1/users/me/", ALL_AUTHENTICATED),
    EndpointCase("me_put", "put", lambda c: "/api/v1/users/me/", ALL_AUTHENTICATED),
    EndpointCase("password_change", "post", lambda c: "/api/v1/users/me/change-password/", ALL_AUTHENTICATED),
    EndpointCase("logout", "post", lambda c: "/api/v1/auth/logout/", ALL_AUTHENTICATED),
    EndpointCase("settings_get", "get", lambda c: "/api/v1/settings/", ALL_AUTHENTICATED),
    EndpointCase("settings_patch", "patch", lambda c: "/api/v1/settings/", frozenset({"admin"})),
    EndpointCase("verification_get", "get", lambda c: "/api/v1/doctors/verification/", DOCTORS),
    EndpointCase("verification_submit", "post", lambda c: "/api/v1/doctors/verification/submit/", DOCTORS),
    EndpointCase("patient_appointment_create", "post", lambda c: "/api/v1/appointments/", frozenset({"patient"})),
    EndpointCase("patient_appointment_list", "get", lambda c: "/api/v1/appointments/me/", frozenset({"patient"})),
    EndpointCase(
        "patient_appointment_cancel",
        "post",
        lambda c: f"/api/v1/appointments/{c['appointment'].pk}/cancel/",
        frozenset({"patient"}),
    ),
    EndpointCase(
        "like_doctor",
        "post",
        lambda c: f"/api/v1/doctors/{c['doctor_approved'].pk}/like/",
        frozenset({"patient"}),
    ),
    EndpointCase(
        "review_doctor",
        "post",
        lambda c: f"/api/v1/doctors/{c['doctor_approved'].pk}/reviews/",
        frozenset({"patient"}),
        lambda c: {"rating": 5, "comment": "good"},
    ),
    EndpointCase("thread_list", "get", lambda c: "/api/v1/chat/threads/", MESSAGING),
    EndpointCase(
        "thread_get_or_create",
        "post",
        lambda c: "/api/v1/chat/threads/get_or_create/",
        frozenset({"patient", "doctor_approved"}),
    ),
    EndpointCase(
        "thread_messages_get",
        "get",
        lambda c: f"/api/v1/chat/threads/{c['thread'].pk}/messages/",
        frozenset({"patient", "admin"}),
    ),
    EndpointCase(
        "thread_messages_post",
        "post",
        lambda c: f"/api/v1/chat/threads/{c['thread'].pk}/messages/",
        frozenset({"patient", "admin"}),
        lambda c: {"body": "authorization test"},
    ),
    EndpointCase(
        "thread_mark_read",
        "patch",
        lambda c: f"/api/v1/chat/threads/{c['thread'].pk}/read/",
        frozenset({"patient", "admin"}),
    ),
    EndpointCase("admin_users", "get", lambda c: "/api/v1/admin/users/", frozenset({"admin"})),
    EndpointCase("admin_doctors", "get", lambda c: "/api/v1/admin/doctors/", frozenset({"admin"})),
    EndpointCase(
        "admin_user_deactivate",
        "patch",
        lambda c: f"/api/v1/admin/users/{c['patient'].pk}/deactivate/",
        frozenset({"admin"}),
    ),
    EndpointCase(
        "admin_user_reactivate",
        "patch",
        lambda c: f"/api/v1/admin/users/{c['patient'].pk}/reactivate/",
        frozenset({"admin"}),
    ),
    EndpointCase(
        "admin_doctor_approve",
        "post",
        lambda c: f"/api/v1/admin/doctors/{c['doctor_unverified'].pk}/approve/",
        frozenset({"admin"}),
    ),
    EndpointCase(
        "admin_doctor_reject",
        "post",
        lambda c: f"/api/v1/admin/doctors/{c['doctor_unverified'].pk}/reject/",
        frozenset({"admin"}),
        lambda c: {"rejection_note": "invalid document"},
    ),
    EndpointCase("admin_slots_get", "get", lambda c: "/api/v1/admin/appointments/slots/", frozenset({"admin"})),
    EndpointCase("admin_slots_post", "post", lambda c: "/api/v1/admin/appointments/slots/", frozenset({"admin"})),
    EndpointCase(
        "admin_slot_get",
        "get",
        lambda c: f"/api/v1/admin/appointments/slots/{c['slot'].pk}/",
        frozenset({"admin"}),
    ),
    EndpointCase(
        "admin_slot_patch",
        "patch",
        lambda c: f"/api/v1/admin/appointments/slots/{c['slot'].pk}/",
        frozenset({"admin"}),
    ),
    EndpointCase(
        "admin_slot_put",
        "put",
        lambda c: f"/api/v1/admin/appointments/slots/{c['slot'].pk}/",
        frozenset({"admin"}),
    ),
    EndpointCase(
        "admin_slot_delete",
        "delete",
        lambda c: f"/api/v1/admin/appointments/slots/{c['slot'].pk}/",
        frozenset({"admin"}),
    ),
    EndpointCase("admin_appointments", "get", lambda c: "/api/v1/admin/appointments/", frozenset({"admin"})),
    EndpointCase(
        "admin_appointment_patch",
        "patch",
        lambda c: f"/api/v1/admin/appointments/{c['appointment'].pk}/",
        frozenset({"admin"}),
    ),
    EndpointCase(
        "admin_appointment_put",
        "put",
        lambda c: f"/api/v1/admin/appointments/{c['appointment'].pk}/",
        frozenset({"admin"}),
    ),
    EndpointCase("admin_calendar", "get", lambda c: "/api/v1/admin/appointments/calendar/?month=2030-01", frozenset({"admin"})),
    EndpointCase(
        "admin_thread_get",
        "get",
        lambda c: f"/api/v1/admin/chat/threads/{c['thread'].pk}/",
        frozenset({"admin"}),
    ),
    EndpointCase(
        "admin_thread_patch",
        "patch",
        lambda c: f"/api/v1/admin/chat/threads/{c['thread'].pk}/",
        frozenset({"admin"}),
    ),
    EndpointCase(
        "admin_thread_put",
        "put",
        lambda c: f"/api/v1/admin/chat/threads/{c['thread'].pk}/",
        frozenset({"admin"}),
    ),
    EndpointCase(
        "admin_thread_delete",
        "delete",
        lambda c: f"/api/v1/admin/chat/threads/{c['thread'].pk}/",
        frozenset({"admin"}),
    ),
    EndpointCase("file_upload", "post", lambda c: "/api/v1/files/upload/", frozenset({"doctor_unverified", "doctor_rejected", "doctor_approved", "admin"})),
)


@pytest.mark.django_db
@pytest.mark.parametrize("case", ENDPOINTS, ids=lambda case: case.name)
@pytest.mark.parametrize(
    "actor_name",
    ["guest", "patient", "doctor_unverified", "doctor_rejected", "doctor_approved", "admin"],
)
def test_endpoint_role_matrix(case, actor_name, authorization_context):
    client = APIClient()
    if actor_name != "guest":
        client.force_authenticate(authorization_context[actor_name])

    response = getattr(client, case.method)(
        case.url(authorization_context),
        case.data(authorization_context),
        format="json",
        REMOTE_ADDR=f"10.0.{len(case.name) % 250}.{len(actor_name) + 1}",
    )

    if actor_name in case.allowed:
        assert response.status_code not in {401, 403, 405}, response.data
    else:
        assert response.status_code in {401, 403, 404}, response.data


@pytest.mark.django_db
def test_public_endpoints_are_anonymous(authorization_context):
    client = APIClient()
    public_requests = (
        ("get", "/api/v1/appointments/slots/", {}),
        ("post", "/api/v1/appointments/guest/", {}),
        ("post", "/api/v1/chat/guest-message/", {}),
        ("post", "/api/v1/auth/signup/", {}),
        ("post", "/api/v1/auth/login/", {}),
        ("post", "/api/v1/auth/token/refresh/", {}),
        ("post", "/api/v1/auth/request-otp/", {}),
        ("post", "/api/v1/auth/verify-otp/", {}),
        ("post", "/api/v1/auth/reset-password/", {}),
        ("get", "/api/v1/doctors/list/", {}),
        ("get", f"/api/v1/doctors/{authorization_context['doctor_approved'].pk}/", {}),
        ("get", f"/api/v1/doctors/{authorization_context['doctor_approved'].pk}/reviews/", {}),
    )

    for method, url, data in public_requests:
        response = getattr(client, method)(url, data, format="json")
        assert response.status_code not in {401, 403}, (method, url, response.status_code)


@pytest.mark.django_db
def test_thread_and_appointment_object_ownership(authorization_context):
    client = APIClient()
    client.force_authenticate(authorization_context["patient"])

    other_thread_response = client.get(
        f"/api/v1/chat/threads/{authorization_context['other_thread'].pk}/messages/"
    )
    other_appointment_response = client.post(
        f"/api/v1/appointments/{authorization_context['other_appointment'].pk}/cancel/",
        {},
        format="json",
    )

    assert other_thread_response.status_code == 404
    assert other_appointment_response.status_code == 404


@pytest.mark.django_db
def test_assigned_admin_must_be_an_active_admin(authorization_context):
    client = APIClient()
    client.force_authenticate(authorization_context["admin"])
    url = f"/api/v1/admin/chat/threads/{authorization_context['thread'].pk}/"

    invalid = client.patch(
        url,
        {"assigned_admin": authorization_context["patient"].pk},
        format="json",
    )
    valid = client.patch(
        url,
        {"assigned_admin": authorization_context["admin"].pk},
        format="json",
    )

    assert invalid.status_code == 400
    assert valid.status_code == 200


@pytest.mark.django_db
def test_admin_cannot_change_another_administrator_activation(authorization_context):
    other_admin = User.objects.create_user(
        phone_number="+989120001098",
        password="AdminPass123!",
        role=User.Role.ADMIN,
        is_active=False,
    )
    client = APIClient()
    client.force_authenticate(authorization_context["admin"])

    deactivate = client.patch(f"/api/v1/admin/users/{other_admin.pk}/deactivate/")
    reactivate = client.patch(f"/api/v1/admin/users/{other_admin.pk}/reactivate/")

    assert deactivate.status_code == 403
    assert reactivate.status_code == 403
    other_admin.refresh_from_db()
    assert other_admin.is_active is False


@pytest.mark.django_db
def test_disabled_user_token_is_rejected():
    user = NormalUser.objects.create_user(
        phone_number="+989120001099", password="PatientPass123!", role=User.Role.USER
    )
    access_token = str(RefreshToken.for_user(user).access_token)
    user.is_active = False
    user.save(update_fields=["is_active"])

    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
    response = client.get("/api/v1/users/me/")

    assert response.status_code == 401


@pytest.mark.django_db
def test_forged_frontend_role_cannot_grant_admin_access(authorization_context):
    client = APIClient()
    client.force_authenticate(authorization_context["patient"])

    response = client.get(
        "/api/v1/admin/users/",
        HTTP_X_ROLE="ADMIN",
        HTTP_X_USER_ROLE="ADMIN",
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_inactive_approved_doctor_is_not_public_or_rateable(authorization_context):
    doctor = authorization_context["doctor_approved"]
    doctor.is_active = False
    doctor.save(update_fields=["is_active"])
    client = APIClient()

    assert client.get(f"/api/v1/doctors/{doctor.pk}/").status_code == 404
    assert client.get(f"/api/v1/doctors/{doctor.pk}/reviews/").status_code == 404

    client.force_authenticate(authorization_context["patient"])
    assert client.post(f"/api/v1/doctors/{doctor.pk}/like/").status_code == 404
    assert client.post(
        f"/api/v1/doctors/{doctor.pk}/reviews/",
        {"rating": 5, "comment": "hidden"},
        format="json",
    ).status_code == 404


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("actor_name", "purpose", "expected_status"),
    [
        ("patient", "profile_picture", 403),
        ("doctor_unverified", "verification_document", 201),
        ("doctor_unverified", "chat_attachment", 403),
        ("doctor_rejected", "verification_document", 201),
        ("doctor_approved", "chat_attachment", 201),
        ("admin", "chat_attachment", 201),
        ("admin", "verification_document", 403),
    ],
)
def test_upload_purpose_policy(
    actor_name,
    purpose,
    expected_status,
    authorization_context,
    settings,
    tmp_path,
):
    settings.MEDIA_ROOT = tmp_path
    settings.MEDIA_URL = "https://media.example.test/"
    client = APIClient()
    client.force_authenticate(authorization_context[actor_name])
    upload = SimpleUploadedFile("scan.pdf", b"%PDF-1.7 test", content_type="application/pdf")

    response = client.post(
        "/api/v1/files/upload/",
        {"purpose": purpose, "file": upload},
        format="multipart",
    )

    assert response.status_code == expected_status, response.data

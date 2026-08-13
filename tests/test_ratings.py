from concurrent.futures import ThreadPoolExecutor

import pytest
from django.db import IntegrityError, close_old_connections, connections, transaction
from rest_framework.test import APIClient

from accounts.models import Doctor, DoctorReview, NormalUser


def approve(doctor):
    doctor.verification_status = Doctor.VerificationStatus.APPROVED
    doctor.save(update_fields=("verification_status",))
    return doctor


def patient(index):
    return NormalUser.objects.create(
        phone_number=f"+98910{index:07d}",
        role="USER",
        first_name=f"Patient{index}",
        last_name=f"Family{index}",
    )


def rating_url(doctor):
    return f"/api/v1/doctors/{doctor.pk}/reviews/"


@pytest.mark.django_db
@pytest.mark.parametrize("value", [0, 6, -1, 2.5, "5", True, None])
def test_rating_rejects_values_outside_strict_integer_1_to_5(
    value, authed_client, doctor_user
):
    approve(doctor_user)
    payload = {"comment": "test"}
    if value is not None:
        payload["rating"] = value

    response = authed_client.post(rating_url(doctor_user), payload, format="json")

    assert response.status_code == 400
    assert "rating" in response.data


@pytest.mark.django_db
def test_patient_rating_is_an_idempotent_upsert(authed_client, normal_user, doctor_user):
    approve(doctor_user)

    created = authed_client.post(
        rating_url(doctor_user), {"rating": 1, "comment": "first"}, format="json"
    )
    updated = authed_client.post(
        rating_url(doctor_user), {"rating": 5, "comment": "updated"}, format="json"
    )

    assert created.status_code == 201
    assert updated.status_code == 200
    assert created.data["id"] == updated.data["id"]
    assert updated.data["rating"] == 5
    assert DoctorReview.objects.filter(doctor=doctor_user, user=normal_user).count() == 1


@pytest.mark.django_db
def test_only_patients_can_submit_ratings(api_client, doctor_user, admin_user):
    target = Doctor.objects.create(
        phone_number="+989199999901",
        role="DOCTOR",
        verification_status=Doctor.VerificationStatus.APPROVED,
    )
    for actor in (doctor_user, admin_user):
        api_client.force_authenticate(actor)
        assert api_client.post(
            rating_url(target), {"rating": 5}, format="json"
        ).status_code == 403
    api_client.force_authenticate(user=None)
    assert api_client.post(rating_url(target), {"rating": 5}, format="json").status_code == 401


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("is_active", "verification_status"),
    [
        (False, Doctor.VerificationStatus.APPROVED),
        (True, Doctor.VerificationStatus.NOT_SUBMITTED),
        (True, Doctor.VerificationStatus.PENDING),
        (True, Doctor.VerificationStatus.REJECTED),
    ],
)
def test_only_active_approved_doctors_can_be_rated(
    is_active, verification_status, authed_client, doctor_user
):
    doctor_user.is_active = is_active
    doctor_user.verification_status = verification_status
    doctor_user.save(update_fields=("is_active", "verification_status"))

    response = authed_client.post(rating_url(doctor_user), {"rating": 5}, format="json")

    assert response.status_code == 404


@pytest.mark.django_db(transaction=True)
def test_database_constraints_enforce_rating_range_and_uniqueness(normal_user, doctor_user):
    approve(doctor_user)
    DoctorReview.objects.create(doctor=doctor_user, user=normal_user, rating=3)

    with pytest.raises(IntegrityError), transaction.atomic():
        DoctorReview.objects.create(doctor=doctor_user, user=normal_user, rating=4)
    for invalid in (0, 6):
        with pytest.raises(IntegrityError), transaction.atomic():
            DoctorReview.objects.create(
                doctor=doctor_user,
                user=patient(100 + invalid),
                rating=invalid,
            )


@pytest.mark.django_db(transaction=True)
def test_concurrent_rating_updates_preserve_one_current_row(normal_user, doctor_user):
    approve(doctor_user)

    def submit(value):
        close_old_connections()
        actor = NormalUser.objects.get(pk=normal_user.pk)
        client = APIClient()
        client.force_authenticate(actor)
        response = client.post(rating_url(doctor_user), {"rating": value}, format="json")
        connections.close_all()
        return response.status_code

    with ThreadPoolExecutor(max_workers=5) as executor:
        statuses = list(executor.map(submit, [1, 2, 3, 4, 5]))

    assert all(code in {200, 201} for code in statuses)
    assert DoctorReview.objects.filter(doctor=doctor_user, user=normal_user).count() == 1
    assert DoctorReview.objects.get(doctor=doctor_user, user=normal_user).rating in range(1, 6)


@pytest.mark.django_db
def test_public_aggregates_are_not_multiplied_by_likes(doctor_user):
    approve(doctor_user)
    first, second = patient(1), patient(2)
    doctor_user.likes.add(first, second)
    DoctorReview.objects.create(doctor=doctor_user, user=first, rating=1)
    DoctorReview.objects.create(doctor=doctor_user, user=second, rating=5)

    response = APIClient().get("/api/v1/doctors/list/")
    item = next(row for row in response.data["results"] if row["id"] == doctor_user.pk)

    assert item["likes_count"] == 2
    assert item["vote_count"] == 2
    assert item["average_rating"] == 3.0


@pytest.mark.django_db
def test_like_toggle_returns_the_canonical_frontend_contract(
    authed_client, doctor_user
):
    approve(doctor_user)

    liked = authed_client.post(f"/api/v1/doctors/{doctor_user.pk}/like/")
    unliked = authed_client.post(f"/api/v1/doctors/{doctor_user.pk}/like/")

    assert liked.data["is_liked"] is True
    assert liked.data["likes_count"] == 1
    assert unliked.data["is_liked"] is False
    assert unliked.data["likes_count"] == 0


@pytest.mark.django_db
def test_public_reviews_are_paginated_and_do_not_expose_patient_identity(doctor_user):
    approve(doctor_user)
    for index in range(25):
        voter = patient(index + 10)
        DoctorReview.objects.create(
            doctor=doctor_user,
            user=voter,
            rating=index % 5 + 1,
            comment=f"review {index}",
        )

    response = APIClient().get(rating_url(doctor_user))

    assert response.status_code == 200
    assert response.data["count"] == 25
    assert len(response.data["results"]) == 20
    assert response.data["next"]
    public_row = response.data["results"][0]
    assert set(public_row) == {
        "id", "reviewer_display_name", "rating", "comment", "created_at", "updated_at"
    }
    assert "phone" not in str(response.data).lower()
    assert "+989" not in str(response.data)


@pytest.mark.django_db
def test_doctor_and_admin_voter_views_are_private_filterable_and_paginated(
    doctor_user, admin_user
):
    approve(doctor_user)
    for index in range(25):
        voter = patient(index + 1000)
        DoctorReview.objects.create(
            doctor=doctor_user,
            user=voter,
            rating=index % 5 + 1,
            comment=f"private {index}",
        )
    other_doctor = Doctor.objects.create(
        phone_number="+989199999902",
        role="DOCTOR",
        verification_status=Doctor.VerificationStatus.APPROVED,
    )
    DoctorReview.objects.create(doctor=other_doctor, user=patient(3000), rating=1)

    doctor_client = APIClient()
    doctor_client.force_authenticate(user=doctor_user)
    admin_client = APIClient()
    admin_client.force_authenticate(user=admin_user)
    own = doctor_client.get("/api/v1/doctors/ratings/?page_size=10&rating=5")
    admin = admin_client.get(
        f"/api/v1/admin/doctors/{doctor_user.pk}/ratings/?page_size=10&search=Patient100"
    )

    assert own.status_code == 200
    assert own.data["vote_count"] == 25
    assert own.data["average_rating"] == 3.0
    assert len(own.data["results"]) == 5
    assert all(row["rating"] == 5 for row in own.data["results"])
    assert set(own.data["results"][0]["voter"]) == {"id", "first_name", "last_name"}
    assert "phone" not in str(own.data).lower()
    assert admin.status_code == 200
    assert admin.data["vote_count"] == 25

    doctor_client.force_authenticate(user=doctor_user)
    assert doctor_client.get(
        f"/api/v1/admin/doctors/{doctor_user.pk}/ratings/"
    ).status_code == 403


@pytest.mark.django_db
def test_public_doctor_list_has_constant_query_count(
    django_assert_max_num_queries, doctor_user
):
    approve(doctor_user)
    for index in range(30):
        doctor = Doctor.objects.create(
            phone_number=f"+98920{index:07d}",
            role="DOCTOR",
            verification_status=Doctor.VerificationStatus.APPROVED,
        )
        voter = patient(index + 2000)
        DoctorReview.objects.create(doctor=doctor, user=voter, rating=5)

    with django_assert_max_num_queries(2):
        response = APIClient().get("/api/v1/doctors/list/")

    assert response.status_code == 200
    assert len(response.data["results"]) == 20

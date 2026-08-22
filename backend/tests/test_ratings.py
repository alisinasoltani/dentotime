from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from django.db import IntegrityError, close_old_connections, connections, transaction
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import (
    Doctor,
    DoctorReview,
    DoctorReviewAnswer,
    NormalUser,
    RatingParameter,
)
from appointments.models import Appointment, AppointmentSlot


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


def summary_url(doctor):
    return f"/api/v1/doctors/{doctor.pk}/rating-summary/"


def multipart_payload(*, star=5, recommendation=1, wait_time=1, comment=""):
    answers = []
    for parameter in RatingParameter.objects.filter(is_active=True):
        if parameter.input_type == RatingParameter.InputType.STAR:
            value = star
        elif parameter.input_type == RatingParameter.InputType.RECOMMENDATION:
            value = recommendation
        else:
            value = wait_time
        answers.append({"parameter_id": parameter.pk, "value": value})
    return {"answers": answers, "comment": comment}


def appointment_for(
    user,
    doctor,
    *,
    hours_from_now=-2,
    attendance=Appointment.AttendanceStatus.NOT_CONFIRMED,
    status=Appointment.Status.APPROVED,
):
    start = timezone.now() + timedelta(hours=hours_from_now)
    slot = AppointmentSlot.objects.create(
        date=start.astimezone().date(),
        start_at=start,
        end_at=start + timedelta(minutes=30),
        status=AppointmentSlot.Status.BOOKED,
    )
    return Appointment.objects.create(
        patient=user,
        doctor=doctor,
        slot=slot,
        contact_phone_number=user.phone_number,
        contact_first_name=user.first_name,
        contact_last_name=user.last_name,
        status=status,
        attendance_status=attendance,
        attendance_confirmed_at=(
            timezone.now()
            if attendance != Appointment.AttendanceStatus.NOT_CONFIRMED
            else None
        ),
    )


@pytest.mark.django_db
def test_seeded_rating_parameters_match_the_required_fixed_list():
    parameters = list(RatingParameter.objects.filter(is_active=True))
    assert [parameter.label for parameter in parameters] == [
        "نحوه برخورد پزشک",
        "توضیح پزشک در هنگام ویزیت",
        "مهارت پزشک در تشخیص و درمان",
        "فرآیند پذیرش و رفتار منشی",
        "شرایط محیطی",
        "پیشنهاد کاربران",
        "میانگین زمان انتظار",
    ]
    assert parameters[5].prompt == "آیا مراجعه به این پزشک را به دیگران توصیه می‌کنید؟"
    assert [option["label"] for option in parameters[6].options] == [
        "راس ساعت تا 15 دقیقه",
        "15 دقیقه تا 30 دقیقه",
        "30 دقیقه تا 1 ساعت",
        "بیشتر از 1 ساعت",
    ]


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("mutation", "expected_field"),
    [
        (lambda payload: payload["answers"].pop(), "answers"),
        (lambda payload: payload["answers"].append(payload["answers"][0].copy()), "answers"),
        (lambda payload: payload["answers"][0].update(value=0), "answers"),
        (lambda payload: payload["answers"][0].update(value=6), "answers"),
        (lambda payload: payload["answers"][0].update(value=True), "answers"),
        (lambda payload: payload["answers"][5].update(value=2), "answers"),
        (lambda payload: payload["answers"][6].update(value=4), "answers"),
        (lambda payload: payload["answers"][0].update(parameter_id=999999), "answers"),
        (lambda payload: payload.update(comment="x" * 2001), "comment"),
    ],
)
def test_multipart_rating_rejects_missing_duplicate_unknown_and_invalid_answers(
    mutation,
    expected_field,
    authed_client,
    normal_user,
    doctor_user,
):
    approve(doctor_user)
    appointment_for(
        normal_user,
        doctor_user,
        attendance=Appointment.AttendanceStatus.ATTENDED,
    )
    payload = multipart_payload()
    mutation(payload)

    response = authed_client.post(rating_url(doctor_user), payload, format="json")

    assert response.status_code == 400
    assert expected_field in response.data


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("setup", "state"),
    [
        (lambda user, doctor: None, "NO_APPOINTMENT"),
        (lambda user, doctor: appointment_for(user, doctor, hours_from_now=2), "UPCOMING_APPOINTMENT"),
        (lambda user, doctor: appointment_for(user, doctor), "VISIT_CONFIRMATION_REQUIRED"),
    ],
)
def test_review_eligibility_rejects_each_non_visited_state(
    setup,
    state,
    authed_client,
    normal_user,
    doctor_user,
):
    approve(doctor_user)
    setup(normal_user, doctor_user)

    eligibility = authed_client.get(
        f"/api/v1/doctors/{doctor_user.pk}/review-eligibility/"
    )
    submission = authed_client.post(
        rating_url(doctor_user), multipart_payload(), format="json"
    )

    assert eligibility.status_code == 200
    assert eligibility.data["state"] == state
    assert submission.status_code == 409
    assert submission.data["state"] == state
    assert not DoctorReview.objects.filter(doctor=doctor_user, user=normal_user).exists()


@pytest.mark.django_db
@pytest.mark.parametrize("invalid_status", ["CANCELLED", "REJECTED", "NO_SHOW"])
def test_cancelled_rejected_and_no_show_appointments_never_grant_rating_access(
    invalid_status,
    authed_client,
    normal_user,
    doctor_user,
):
    approve(doctor_user)
    appointment_for(
        normal_user,
        doctor_user,
        attendance=Appointment.AttendanceStatus.ATTENDED,
        status=invalid_status,
    )

    response = authed_client.post(
        rating_url(doctor_user), multipart_payload(), format="json"
    )

    assert response.status_code == 409
    assert response.data["state"] == "NO_APPOINTMENT"


@pytest.mark.django_db
def test_patient_multipart_rating_is_an_atomic_idempotent_upsert(
    authed_client,
    normal_user,
    doctor_user,
):
    approve(doctor_user)
    appointment_for(
        normal_user,
        doctor_user,
        attendance=Appointment.AttendanceStatus.ATTENDED,
    )

    created = authed_client.post(
        rating_url(doctor_user), multipart_payload(star=2, comment="first"), format="json"
    )
    updated = authed_client.post(
        rating_url(doctor_user),
        multipart_payload(star=5, recommendation=0, wait_time=3, comment="updated"),
        format="json",
    )

    assert created.status_code == 201
    assert updated.status_code == 200
    assert created.data["id"] == updated.data["id"]
    assert updated.data["rating"] == 5.0
    assert updated.data["comment"] == "updated"
    assert len(updated.data["answers"]) == RatingParameter.objects.filter(is_active=True).count()
    assert DoctorReview.objects.filter(doctor=doctor_user, user=normal_user).count() == 1


@pytest.mark.django_db
def test_overall_rating_is_the_mean_of_only_the_star_parameters(
    authed_client,
    normal_user,
    doctor_user,
):
    approve(doctor_user)
    appointment_for(
        normal_user,
        doctor_user,
        attendance=Appointment.AttendanceStatus.ATTENDED,
    )
    payload = multipart_payload(recommendation=0, wait_time=3)
    star_answers = [
        answer
        for answer in payload["answers"]
        if RatingParameter.objects.get(pk=answer["parameter_id"]).input_type == "STAR"
    ]
    for answer, value in zip(star_answers, [1, 2, 3, 4, 5], strict=True):
        answer["value"] = value

    response = authed_client.post(rating_url(doctor_user), payload, format="json")

    assert response.status_code == 201
    assert response.data["rating"] == 3.0


@pytest.mark.django_db
def test_rating_summary_keeps_parameters_recommendation_and_wait_time_separate(
    authed_client,
    normal_user,
    doctor_user,
):
    approve(doctor_user)
    appointment_for(
        normal_user,
        doctor_user,
        attendance=Appointment.AttendanceStatus.ATTENDED,
    )
    assert authed_client.post(
        rating_url(doctor_user),
        multipart_payload(star=4, recommendation=1, wait_time=2),
        format="json",
    ).status_code == 201

    response = APIClient().get(summary_url(doctor_user))

    assert response.status_code == 200
    assert response.data["average_rating"] == 4.0
    assert response.data["vote_count"] == 1
    assert response.data["recommendation_percentage"] == 100
    assert response.data["average_wait_time"]["label"] == "30 دقیقه تا 1 ساعت"
    star_rows = [row for row in response.data["parameters"] if row["input_type"] == "STAR"]
    assert len(star_rows) == 5
    assert all(row["average"] == 4.0 for row in star_rows)


@pytest.mark.django_db
def test_inactive_parameter_is_not_required_and_is_removed_on_review_update(
    authed_client,
    normal_user,
    doctor_user,
):
    approve(doctor_user)
    appointment_for(
        normal_user,
        doctor_user,
        attendance=Appointment.AttendanceStatus.ATTENDED,
    )
    parameter = RatingParameter.objects.get(key="environment")
    first = authed_client.post(rating_url(doctor_user), multipart_payload(), format="json")
    assert first.status_code == 201
    parameter.is_active = False
    parameter.save(update_fields=("is_active",))

    second_payload = multipart_payload(star=3)
    second = authed_client.post(rating_url(doctor_user), second_payload, format="json")

    assert second.status_code == 200
    assert all(answer["key"] != "environment" for answer in second.data["answers"])


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
            rating_url(target), multipart_payload(), format="json"
        ).status_code == 403
    api_client.force_authenticate(user=None)
    assert api_client.post(
        rating_url(target), multipart_payload(), format="json"
    ).status_code == 401


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
    is_active,
    verification_status,
    authed_client,
    doctor_user,
):
    doctor_user.is_active = is_active
    doctor_user.verification_status = verification_status
    doctor_user.save(update_fields=("is_active", "verification_status"))

    response = authed_client.post(
        rating_url(doctor_user), multipart_payload(), format="json"
    )

    assert response.status_code == 404


@pytest.mark.django_db(transaction=True)
def test_database_constraints_enforce_review_and_answer_integrity(normal_user, doctor_user):
    approve(doctor_user)
    review = DoctorReview.objects.create(doctor=doctor_user, user=normal_user, rating=3)
    parameter, _ = RatingParameter.objects.get_or_create(
        key="constraint_test",
        defaults={
            "label": "Constraint test",
            "input_type": RatingParameter.InputType.STAR,
            "position": 999,
        },
    )
    DoctorReviewAnswer.objects.create(review=review, parameter=parameter, value=3)

    with pytest.raises(IntegrityError), transaction.atomic():
        DoctorReview.objects.create(doctor=doctor_user, user=normal_user, rating=4)
    for invalid in (0, 6):
        with pytest.raises(IntegrityError), transaction.atomic():
            DoctorReview.objects.create(
                doctor=doctor_user,
                user=patient(100 + invalid),
                rating=invalid,
            )
    with pytest.raises(IntegrityError), transaction.atomic():
        DoctorReviewAnswer.objects.create(
            review=review,
            parameter=RatingParameter.objects.exclude(pk=parameter.pk).first(),
            value=6,
        )
    with pytest.raises(IntegrityError), transaction.atomic():
        DoctorReviewAnswer.objects.create(review=review, parameter=parameter, value=4)


@pytest.mark.django_db
def test_public_reviews_are_paginated_anonymous_and_include_multipart_answers(doctor_user):
    approve(doctor_user)
    parameters = list(RatingParameter.objects.filter(is_active=True))
    for index in range(25):
        voter = patient(index + 10)
        review = DoctorReview.objects.create(
            doctor=doctor_user,
            user=voter,
            rating=index % 5 + 1,
            comment=f"review {index}",
        )
        DoctorReviewAnswer.objects.bulk_create(
            [
                DoctorReviewAnswer(
                    review=review,
                    parameter=parameter,
                    value=(
                        index % 5 + 1
                        if parameter.input_type == "STAR"
                        else 1 if parameter.input_type == "RECOMMENDATION" else 0
                    ),
                )
                for parameter in parameters
            ]
        )

    response = APIClient().get(rating_url(doctor_user))

    assert response.status_code == 200
    assert response.data["count"] == 25
    assert len(response.data["results"]) == 20
    assert response.data["next"]
    public_row = response.data["results"][0]
    assert set(public_row) == {
        "id", "reviewer_display_name", "rating", "answers", "comment",
        "created_at", "updated_at",
    }
    assert len(public_row["answers"]) == 7
    assert "phone" not in str(response.data).lower()
    assert "+989" not in str(response.data)


@pytest.mark.django_db
def test_doctor_and_admin_voter_views_remain_private_filterable_and_paginated(
    doctor_user,
    admin_user,
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
    assert all(row["rating"] == 5.0 for row in own.data["results"])
    assert set(own.data["results"][0]["voter"]) == {"id", "first_name", "last_name"}
    assert "phone" not in str(own.data).lower()
    assert admin.status_code == 200
    assert admin.data["vote_count"] == 25

    assert doctor_client.get(
        f"/api/v1/admin/doctors/{doctor_user.pk}/ratings/"
    ).status_code == 403


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
def test_doctor_username_can_be_used_as_the_public_page_identifier(doctor_user):
    approve(doctor_user)
    doctor_user.username = "doctor-public-slug"
    doctor_user.save(update_fields=("username",))

    response = APIClient().get("/api/v1/doctors/doctor-public-slug/rating-summary/")

    assert response.status_code == 200
    assert response.data["vote_count"] == 0

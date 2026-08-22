from datetime import timedelta
import os

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import (
    Doctor,
    DoctorReview,
    DoctorReviewAnswer,
    NormalUser,
    RatingParameter,
)
from appointments.models import Appointment, AppointmentSlot


DEFAULT_PASSWORD = "DemoRating123!"

DEMO_PATIENTS = (
    ("eligible", "+989121111101", "کاربر", "مجاز"),
    ("blocked", "+989121111102", "کاربر", "بدون مراجعه"),
    ("maryam", "+989121111201", "مریم", "رضایی"),
    ("ali", "+989121111202", "علی", "صادقی"),
    ("aria", "+989121111203", "آریا", "فرهمند"),
)

DEMO_DOCTORS = (
    (
        "arman-hosseini", "+989131111201", "آرمان", "حسینی",
        (
            ("maryam", 5, "برخورد بسیار محترمانه بود و درباره روند درمان کامل توضیح دادند."),
            ("ali", 4, "درمان ریشه با دقت انجام شد و درد بعد از درمان خیلی کم بود."),
            ("aria", 5, "برای درمان مجدد مراجعه کردم؛ نتیجه عالی و زمان انتظار مناسب بود."),
        ),
    ),
    (
        "nazanin-karimi", "+989131111202", "نازنین", "کریمی",
        (
            ("maryam", 5, "طراحی روکش بسیار طبیعی بود و نتیجه از انتظارم بهتر شد."),
            ("ali", 4, "توضیحات دقیق و برخورد حرفه‌ای؛ پذیرش هم منظم انجام شد."),
            ("aria", 4, "کار باکیفیت بود و درباره مراقبت‌های بعد از درمان راهنمایی شدم."),
        ),
    ),
    (
        "sara-moradi", "+989131111203", "سارا", "مرادی",
        (
            ("maryam", 5, "با صبوری اضطراب کودک را کم کردند و تجربه خیلی خوبی داشتیم."),
            ("ali", 5, "محیط مناسب کودک و توضیحات روشن برای والدین بسیار عالی بود."),
            ("aria", 4, "رفتار تیم پذیرش خوب بود و فرزندم بدون ترس درمان شد."),
        ),
    ),
    (
        "reza-ahmadi", "+989131111204", "رضا", "احمدی",
        (
            ("maryam", 5, "جراحی با برنامه‌ریزی دقیق انجام شد و دوره نقاهت راحتی داشتم."),
            ("ali", 4, "پزشک باحوصله بود و همه مراحل جراحی را قبل از شروع توضیح داد."),
            ("aria", 4, "نتیجه درمان خوب بود؛ فقط زمان انتظار کمی طولانی شد."),
        ),
    ),
    (
        "parisa-ebrahimi", "+989131111205", "پریسا", "ابراهیمی",
        (
            ("maryam", 5, "روند ارتودنسی منظم و نتیجه لبخند بسیار رضایت‌بخش بود."),
            ("ali", 4, "در هر جلسه پیشرفت درمان را واضح توضیح می‌دادند."),
            ("aria", 5, "برخورد عالی، محیط تمیز و برنامه‌ریزی نوبت‌ها دقیق بود."),
        ),
    ),
    (
        "milad-sadeghi", "+989131111206", "میلاد", "صادقی",
        (
            ("maryam", 4, "درمان لثه با دقت انجام شد و آموزش مراقبت خانگی مفید بود."),
            ("ali", 5, "تشخیص دقیق و پیگیری بعد از درمان باعث اطمینان من شد."),
            ("aria", 4, "رفتار حرفه‌ای و نتیجه درمان خوب بود."),
        ),
    ),
    (
        "leila-rahmani", "+989131111207", "لیلا", "رحمانی",
        (
            ("maryam", 5, "تصویربرداری سریع انجام شد و گزارش بسیار کامل بود."),
            ("ali", 4, "محیط منظم و توضیحات پزشک درباره نتیجه تصویر واضح بود."),
            ("aria", 5, "بدون معطلی کار انجام شد و برخورد کارکنان عالی بود."),
        ),
    ),
    (
        "nima-farhadi", "+989131111208", "نیما", "فرهادی",
        (
            ("maryam", 4, "برای تشخیص ضایعه دهانی با دقت معاینه و راهنمایی شدم."),
            ("ali", 5, "توضیحات علمی و قابل فهم بود و درمان نتیجه خوبی داشت."),
            ("aria", 4, "پزشک صبور و دقیق بود و روند پیگیری منظم انجام شد."),
        ),
    ),
)

REQUIRED_PARAMETER_KEYS = {
    "doctor_manner",
    "doctor_explanation",
    "diagnosis_and_treatment",
    "reception_and_secretary",
    "environment",
    "recommendation",
    "wait_time",
}


class Command(BaseCommand):
    help = "Create repeatable demo doctors, multipart reviews, and two switchable rating users."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default=os.getenv("RATING_DEMO_PASSWORD", DEFAULT_PASSWORD),
            help="Password assigned to the two demo patients (development/test only).",
        )

    def handle(self, *args, **options):
        environment = os.getenv("DJANGO_ENVIRONMENT", "production").strip().lower()
        if environment not in {"development", "test"}:
            raise CommandError("seed_rating_demo is disabled outside development and test environments.")

        password = options["password"]
        if len(password) < 12:
            raise CommandError("The demo password must contain at least 12 characters.")

        with transaction.atomic():
            self._seed(password)

    def _seed(self, password):
        parameters = list(RatingParameter.objects.filter(is_active=True).order_by("position", "pk"))
        if {parameter.key for parameter in parameters} != REQUIRED_PARAMETER_KEYS:
            raise CommandError("Run migrations and restore the seven default active rating parameters first.")

        patients = {
            key: self._patient(phone, first_name, last_name, password)
            for key, phone, first_name, last_name in DEMO_PATIENTS
        }
        doctors = {
            slug: self._doctor(slug, phone, first_name, last_name, password)
            for slug, phone, first_name, last_name, _ in DEMO_DOCTORS
        }

        legacy_review_appointments = Appointment.objects.filter(
            reason__startswith="[RATING_DEMO] review "
        )
        legacy_slot_ids = list(legacy_review_appointments.values_list("slot_id", flat=True))
        legacy_review_appointments.delete()
        AppointmentSlot.objects.filter(
            pk__in=legacy_slot_ids,
            appointments__isnull=True,
        ).delete()

        anchor = timezone.now().replace(hour=9, minute=0, second=0, microsecond=0)
        seeded_rows = []
        for doctor_index, (slug, _, _, _, reviews) in enumerate(DEMO_DOCTORS):
            doctor = doctors[slug]
            for review_index, (patient_key, rating, comment) in enumerate(reviews):
                patient = patients[patient_key]
                visit_start = anchor - timedelta(days=30 + doctor_index * 4 + review_index)
                self._appointment(
                    patient=patient,
                    doctor=doctor,
                    start_at=visit_start,
                    capacity_index=100 + doctor_index * 4 + review_index,
                      reason=f"[INITIAL_DATA] attended visit {slug}",
                    status=Appointment.Status.COMPLETED,
                    attendance=Appointment.AttendanceStatus.ATTENDED,
                )
                review, _ = DoctorReview.objects.update_or_create(
                    doctor=doctor,
                    user=patient,
                    defaults={"rating": rating, "comment": comment},
                )
                review.answers.exclude(parameter__in=parameters).delete()
                for parameter in parameters:
                    value = self._answer_value(parameter, rating, review_index)
                    DoctorReviewAnswer.objects.update_or_create(
                        review=review,
                        parameter=parameter,
                        defaults={"value": value},
                    )
                DoctorReview.objects.filter(pk=review.pk).update(
                    created_at=visit_start + timedelta(hours=2),
                    updated_at=visit_start + timedelta(hours=2),
                )
                display_name = f"{patient.first_name} {patient.last_name}".strip()
                seeded_rows.append((slug, display_name, rating, comment))

        target = doctors["arman-hosseini"]
        self._appointment(
            patient=patients["eligible"],
            doctor=target,
            start_at=anchor - timedelta(days=7),
            capacity_index=190,
            reason="[RATING_DEMO] eligible patient visit",
            status=Appointment.Status.COMPLETED,
            attendance=Appointment.AttendanceStatus.ATTENDED,
        )
        self._appointment(
            patient=patients["blocked"],
            doctor=target,
            start_at=anchor + timedelta(days=7),
            capacity_index=191,
            reason="[RATING_DEMO] blocked patient future visit",
            status=Appointment.Status.APPROVED,
            attendance=Appointment.AttendanceStatus.NOT_CONFIRMED,
        )
        DoctorReview.objects.filter(
            doctor=target,
            user__in=[patients["eligible"], patients["blocked"]],
        ).delete()

        self.stdout.write(self.style.SUCCESS("Rating demo data is ready."))
        self.stdout.write(f"Eligible: 09121111101 / {password} -> /doctors/arman-hosseini")
        self.stdout.write(f"Blocked:  09121111102 / {password} -> /doctors/arman-hosseini")
        self.stdout.write("Seeded review list:")
        for slug, display_name, rating, comment in seeded_rows:
            self.stdout.write(f"- {slug} | {rating}/5 | {display_name} | {comment}")

    def _patient(self, phone, first_name, last_name, password):
        patient = NormalUser.objects.filter(phone_number=phone).first()
        if patient is None:
            patient = NormalUser.objects.create_user(
                phone_number=phone,
                password=password,
                role="USER",
                first_name=first_name,
                last_name=last_name,
            )
        else:
            patient.first_name = first_name
            patient.last_name = last_name
            patient.is_active = True
            patient.set_password(password)
            patient.save(update_fields=("first_name", "last_name", "is_active", "password"))
        return patient

    def _doctor(self, slug, phone, first_name, last_name, password):
        doctor = Doctor.objects.filter(username=slug).first()
        if doctor is None:
            doctor = Doctor.objects.filter(phone_number=phone).first()
        if doctor is None:
            doctor = Doctor.objects.create_user(
                phone_number=phone,
                password=password,
                role="DOCTOR",
                username=slug,
                first_name=first_name,
                last_name=last_name,
            )
        doctor.username = slug
        doctor.first_name = first_name
        doctor.last_name = last_name
        doctor.is_active = True
        doctor.account_owner = Doctor.AccountOwner.DOCTOR
        doctor.agreed_to_terms = True
        doctor.medical_registration_number = f"DEMO-{slug}"
        doctor.verification_status = Doctor.VerificationStatus.APPROVED
        doctor.set_password(password)
        doctor.save()
        return doctor

    def _appointment(
        self,
        *,
        patient,
        doctor,
        start_at,
        capacity_index,
        reason,
        status,
        attendance,
    ):
        slot, _ = AppointmentSlot.objects.update_or_create(
            start_at=start_at,
            capacity_index=capacity_index,
            defaults={
                "date": start_at.date(),
                "end_at": start_at + timedelta(minutes=45),
                "status": AppointmentSlot.Status.BOOKED,
            },
        )
        appointment = Appointment.objects.filter(
            patient=patient,
            doctor=doctor,
            reason=reason,
        ).first()
        previous_slot = appointment.slot if appointment is not None else None
        if appointment is None:
            appointment = Appointment(patient=patient, doctor=doctor, slot=slot, reason=reason)
        appointment.slot = slot
        appointment.status = status
        appointment.attendance_status = attendance
        appointment.attendance_confirmed_at = (
            slot.end_at if attendance != Appointment.AttendanceStatus.NOT_CONFIRMED else None
        )
        appointment.approved_at = slot.start_at - timedelta(days=2)
        appointment.save()
        if (
            previous_slot is not None
            and previous_slot.pk != slot.pk
            and not previous_slot.appointments.exists()
        ):
            previous_slot.delete()
        return appointment

    @staticmethod
    def _answer_value(parameter, rating, review_index):
        if parameter.input_type == RatingParameter.InputType.STAR:
            return rating
        if parameter.input_type == RatingParameter.InputType.RECOMMENDATION:
            return 1
        if parameter.input_type == RatingParameter.InputType.WAIT_TIME:
            option_values = [option["value"] for option in parameter.options]
            return option_values[min(review_index, len(option_values) - 1)]
        raise CommandError(f"Unsupported rating parameter type: {parameter.input_type}")

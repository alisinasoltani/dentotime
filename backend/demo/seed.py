"""Predictable, real domain records in an exclusively owned demo database."""

import hashlib
from datetime import datetime, time, timedelta
from io import BytesIO
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management import CommandError
from django.db import connection, transaction
from django.utils import timezone
from PIL import Image, ImageDraw

from accounts.models import (
    DentalService, Doctor, DoctorDocument, DoctorReview, DoctorReviewAnswer,
    InsuranceProvider, NormalUser, RatingParameter, User,
)
from appointments.doctor_availability import generate_doctor_availability
from appointments.models import Appointment, AppointmentSlot
from core.file_safety import scan_asset
from core.models import FileAsset, SystemSettings
from core.object_storage import get_s3_client
from demo.guard import require_demo
from demo.models import DemoState
from messaging.models import Message, MessageAttachment, MessageThread


VERSION = 1
PASSWORD = "DentoDemo2026!"
TEHRAN = ZoneInfo("Asia/Tehran")
# key, phone, display name, active
PATIENTS = (
    ("new", "09120001101", "کاربر تازه", True),
    ("workflow", "09120001102", "نوبت و گفتگو", True),
    ("eligible", "09120001103", "مجاز به امتیاز", True),
    ("upcoming", "09120001104", "نوبت آینده", True),
    ("confirm", "09120001105", "تأیید مراجعه", True),
    ("reviewed", "09120001106", "دارای نظر", True),
    ("no-show", "09120001107", "عدم مراجعه", True),
    ("inactive", "09120001108", "حساب غیرفعال", False),
)
# key, phone, name, verification, account owner, active
DOCTORS = (
    ("approved", "09120001201", "آرمان حسینی", "APPROVED", "DOCTOR", True),
    ("colleague", "09120001202", "نازنین کریمی", "APPROVED", "DOCTOR", True),
    ("pending", "09120001203", "در انتظار بررسی", "PENDING", "DOCTOR", True),
    ("rejected", "09120001204", "نیازمند اصلاح مدارک", "REJECTED", "DOCTOR", True),
    ("new", "09120001205", "ثبت مدارک جدید", "NOT_SUBMITTED", "DOCTOR", True),
    ("assistant", "09120001206", "دستیار پزشک", "APPROVED", "ASSISTANT", True),
    ("clinic", "09120001207", "کلینیک نمایشی", "APPROVED", "CLINIC", True),
    ("inactive", "09120001208", "پزشک غیرفعال", "APPROVED", "DOCTOR", False),
)


def e164(phone):
    return "+98" + phone[1:]


def actor(model, key, phone, name, role, **fields):
    return model.objects.create_user(
        phone_number=e164(phone), password=PASSWORD, username=f"demo-{role.lower()}-{key}",
        first_name=name, last_name="نمایشی", role=role, **fields,
    )


def appointment(patient, doctor, admin, key, start, status, attendance="NOT_CONFIRMED"):
    slot = AppointmentSlot.objects.create(
        doctor=doctor, start_at=start, end_at=start + timedelta(minutes=30),
        date=start.astimezone(TEHRAN).date(), capacity_index=50,
        status="AVAILABLE" if status in {"CANCELLED", "REJECTED"} else "BOOKED",
    )
    row = Appointment.objects.create(
        patient=patient, doctor=doctor, slot=slot, reason=f"[DEMO] {key}",
        contact_phone_number=patient.phone_number if patient else "+989120001199",
        contact_first_name=patient.first_name if patient else "مهمان نمایشی",
        status=status, attendance_status=attendance,
        attendance_confirmed_at=slot.end_at if attendance != "NOT_CONFIRMED" else None,
        approved_by=admin if status in {"APPROVED", "COMPLETED", "NO_SHOW"} else None,
        approved_at=start - timedelta(days=2) if status in {"APPROVED", "COMPLETED", "NO_SHOW"} else None,
        cancelled_by=patient if status == "CANCELLED" else None,
        cancelled_at=start - timedelta(days=1) if status == "CANCELLED" else None,
        cancellation_reason="لغو نمونه برای نمایش تاریخچه" if status == "CANCELLED" else "",
    )
    Appointment.objects.filter(pk=row.pk).update(created_at=start - timedelta(days=3))
    return row


def message(thread, sender, body, *, internal=False):
    return Message.objects.create(
        thread=thread, sender=sender, sender_type=sender.role if sender else "GUEST",
        sender_first_name=sender.first_name if sender else "مهمان نمایشی",
        body=body, visibility="ADMINS_ONLY" if internal else "PARTICIPANTS",
    )


def document(owner, key, *, thread=None):
    # Actual downloadable PNG, explicitly marked synthetic; verified through the real scanner.
    picture = Image.new("RGB", (800, 500), "white")
    draw = ImageDraw.Draw(picture)
    draw.text((45, 80), "DENTOTIME DEMO - SYNTHETIC DOCUMENT", fill="black", font_size=28)
    draw.text((45, 150), key, fill="black", font_size=22)
    draw.text((45, 240), "No real patient data. For local demonstration only.", fill="black", font_size=22)
    buffer = BytesIO()
    picture.save(buffer, format="PNG")
    payload = buffer.getvalue()
    digest = hashlib.sha256(payload).hexdigest()
    asset = FileAsset.objects.create(
        owner=owner, purpose="CHAT_ATTACHMENT" if thread else "VERIFICATION_DOCUMENT",
        scope_thread=thread, scope_doctor=None if thread else owner,
        original_name=f"demo-{key}.png", expected_size=len(payload), claimed_mime="image/png",
        sha256=digest, storage_key=f"demo/v{VERSION}/{key}.png", state="QUARANTINED",
        completed_at=timezone.now(),
    )
    get_s3_client().put_object(
        Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=asset.storage_key,
        Body=payload, ContentType="image/png",
    )
    asset = scan_asset(asset.pk)
    if asset.state != "AVAILABLE":
        raise CommandError(f"Demo document failed verification: {key}")
    return asset


def seed():
    require_demo()
    with transaction.atomic():
        # Serialize concurrent setup processes before inspecting the completion marker.
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(20260909)")
        state = DemoState.objects.first()
        if state:
            if state.version != VERSION:
                raise CommandError("Demo version changed. Run Start-Demo.ps1 -Reset to rebuild its baseline.")
            return False
        if User.objects.exists() or Appointment.objects.exists() or MessageThread.objects.exists() or FileAsset.objects.exists():
            raise CommandError("Demo initialization requires an empty application database; existing data was preserved.")
        if RatingParameter.objects.filter(is_active=True).count() != 7:
            raise CommandError("Run all migrations before initializing the demo.")

        admin = actor(User, "primary", "09120001001", "مدیر سامانه", "ADMIN")
        admin_two = actor(User, "support", "09120001002", "مدیر پشتیبانی", "ADMIN")
        patients = {key: actor(NormalUser, key, phone, name, "USER", is_active=active)
                    for key, phone, name, active in PATIENTS}
        doctors = {}
        now = timezone.now()
        today = now.astimezone(TEHRAN).date()
        for key, phone, name, status, owner, active in DOCTORS:
            doctor = actor(Doctor, key, phone, name, "DOCTOR", is_active=active)
            doctor.account_owner = owner
            doctor.clinic_name = "کلینیک نمایشی دنتوتایم"
            doctor.supervising_doctor_name = "آرمان حسینی" if owner == "ASSISTANT" else None
            doctor.specialty = "دندان‌پزشکی عمومی"
            doctor.bio = "این پروفایل صرفاً برای نمایش عملکرد سامانه است."
            doctor.address = "نشانی نمایشی؛ محل مراجعه واقعی نیست"
            doctor.experience = "اطلاعات آزمایشی"
            if key in {"approved", "colleague"}:
                photo = "arman-hosseini" if key == "approved" else "nazanin-karimi"
                doctor.profile_picture = f"/images/doctors/{photo}.webp"
            if status != "NOT_SUBMITTED":
                doctor.agreed_to_terms = True
                doctor.terms_accepted_at = now - timedelta(days=10)
                doctor.id_number = f"DEMO-{key}"
                doctor.medical_registration_number = f"DEMO-{key}"
                doctor.verification_submitted_at = now - timedelta(days=8)
                doctor.save()
                doctor = Doctor.objects.get(pk=doctor.pk)
            # Assign rejection after saving the registration number (Doctor.save has resubmit logic).
            doctor.verification_status = status
            if status in {"APPROVED", "REJECTED"}:
                doctor.verification_reviewer = admin
                doctor.verification_reviewed_at = now - timedelta(days=7)
            if status == "REJECTED":
                doctor.rejection_note = "نمونه: مدرک خوانا نیست؛ لطفاً تصویر جدید بارگذاری کنید."
            doctor.save()
            doctor.services.set(DentalService.objects.filter(slug__in=["general-dentistry", "consultation"]))
            doctor.insurances.set(InsuranceProvider.objects.filter(name__in=["آزاد", "تأمین اجتماعی"]))
            doctors[key] = doctor
            if status != "NOT_SUBMITTED":
                DoctorDocument.objects.create(doctor=doctor, asset=document(doctor, f"verification-{key}"))
            if active and status == "APPROVED":
                generate_doctor_availability(
                    doctor=doctor, start_date=today + timedelta(days=1), end_date=today + timedelta(days=14),
                    weekdays=list(range(7)), start_time=time(9), end_time=time(12),
                    slot_duration_minutes=30, save_as_routine=True,
                )

        main = doctors["approved"]
        anchor = datetime.combine(today, time(14), tzinfo=TEHRAN)
        for i, status in enumerate(Appointment.Status.values):
            past = status in {"COMPLETED", "NO_SHOW"}
            start = anchor + timedelta(days=-(i + 1) if past else i + 3)
            attendance = "ATTENDED" if status == "COMPLETED" else "DID_NOT_ATTEND" if status == "NO_SHOW" else "NOT_CONFIRMED"
            appointment(patients["workflow"], main, admin, status.lower(), start, status, attendance)
        appointment(patients["workflow"], main, admin, "cancellation-cutoff", now + timedelta(hours=2), "APPROVED")
        for key, days, status, attendance in (
            ("eligible", -12, "COMPLETED", "ATTENDED"),
            ("upcoming", 8, "APPROVED", "NOT_CONFIRMED"),
            ("confirm", -13, "APPROVED", "NOT_CONFIRMED"),
            ("reviewed", -14, "COMPLETED", "ATTENDED"),
            ("no-show", -15, "NO_SHOW", "DID_NOT_ATTEND"),
        ):
            appointment(patients[key], main, admin, key, anchor + timedelta(days=days), status, attendance)
        appointment(None, main, admin, "guest-claim", anchor + timedelta(days=9), "PENDING")
        for day in range(1, 15):
            for hour in (9, 10, 11):
                start = datetime.combine(today + timedelta(days=day), time(hour), tzinfo=TEHRAN)
                AppointmentSlot.objects.create(date=start.date(), start_at=start, end_at=start + timedelta(minutes=30))
        SystemSettings.objects.get_or_create(pk=1)

        review = DoctorReview.objects.create(doctor=main, user=patients["reviewed"], rating=4, comment="نظر نمایشی برای بررسی امتیازها و ویرایش نظر")
        for parameter in RatingParameter.objects.filter(is_active=True):
            value = 4 if parameter.input_type == "STAR" else 1 if parameter.input_type == "RECOMMENDATION" else parameter.options[0]["value"]
            DoctorReviewAnswer.objects.create(review=review, parameter=parameter, value=value)
        main.likes.add(patients["workflow"])

        for person in (patients["workflow"], main):
            thread = MessageThread.objects.create(
                participant=person, thread_type="USER_ADMIN" if person.role == "USER" else "DOCTOR_ADMIN",
                assigned_admin=admin, last_message_at=now,
            )
            for i in range(55):
                message(thread, person if i % 2 == 0 else admin, f"پیام نمایشی {i + 1}: پیگیری نوبت و پشتیبانی")
            message(thread, admin_two, "یادداشت داخلی؛ فقط مدیران باید این متن را ببینند.", internal=True)
            if person.role == "DOCTOR":
                asset = document(person, "support-attachment", thread=thread)
                msg = message(thread, person, "فایل نمونه برای بررسی دریافت امن پیوست")
                MessageAttachment.objects.create(message=msg, asset=asset)
        for counterpart in (patients["workflow"], doctors["colleague"]):
            one, two = sorted((main, counterpart), key=lambda user: user.pk)
            thread = MessageThread.objects.create(
                thread_type="DIRECT", direct_participant_one=one, direct_participant_two=two,
                last_message_at=now,
            )
            message(thread, main, "گفتگوی مستقیم نمایشی")
            message(thread, counterpart, "پیام دریافت شد.")
        guest = MessageThread.objects.create(
            thread_type="USER_ADMIN", guest_phone="+989120001199", guest_first_name="مهمان نمایشی", last_message_at=now,
        )
        message(guest, None, "برای پیگیری نوبت مهمان راهنمایی می‌خواهم.")
        DemoState.objects.create(pk=1, version=VERSION)
        return True

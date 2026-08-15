import os
import random
from datetime import timedelta
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from accounts.models import NormalUser, Doctor, User
from core.models import SystemSettings
from appointments.models import AppointmentSlot, Appointment
from messaging.models import MessageThread, Message

class Command(BaseCommand):
    help = "Populates the database with realistic Persian sample data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--confirm-destructive",
            action="store_true",
            help="Acknowledge that existing non-superuser data will be deleted.",
        )

    def handle(self, *args, **options):
        environment = os.getenv("DJANGO_ENVIRONMENT", "production").strip().lower()
        seeding_enabled = os.getenv("ALLOW_DESTRUCTIVE_SEEDING", "").strip().lower()
        seed_password = os.getenv("SEED_USER_PASSWORD", "")

        if environment not in {"development", "test"}:
            raise CommandError("populate_db is disabled outside development and test environments.")
        if seeding_enabled != "true":
            raise CommandError("Set ALLOW_DESTRUCTIVE_SEEDING=true to enable this command.")
        if not options["confirm_destructive"]:
            raise CommandError("Pass --confirm-destructive to acknowledge data deletion.")
        if len(seed_password) < 12:
            raise CommandError("SEED_USER_PASSWORD must contain at least 12 characters.")

        self.stdout.write(self.style.SUCCESS("شروع پاکسازی و ساخت دیتای تستی..."))

        # Clean up old data (except the superuser you created)
        User.objects.filter(is_superuser=False).delete()
        AppointmentSlot.objects.all().delete()
        MessageThread.objects.all().delete()

        # Ensure SystemSettings exists
        settings = SystemSettings.load()

        # 1. Create Admin User
        admin = User.objects.create_user(
            phone_number="+989120000001", password=seed_password, role="ADMIN",
            first_name="مدیر", last_name="کلینیک"
        )
        self.stdout.write("ادمین ساخته شد.")

        # 2. Create Normal Users
        user_names = [
            ("علی", "رضایی"), ("زهرا", "محمدی"), ("محمد", "حسینی"), ("فاطمه", "اکبری"),
            ("حسین", "کریمی"), ("مریم", "مرادی"), ("رضا", "صادقی"), ("سارا", "احمدی"),
            ("مهدی", "علیپور"), ("نگین", "فتاحی"), ("امیر", "عباسی"), ("الهام", "نوری")
        ]
        users = []
        for i, (first, last) in enumerate(user_names):
            phone = f"+9891200000{10 + i:02d}"
            u = NormalUser.objects.create_user(
                phone_number=phone, password=seed_password, role="USER",
                first_name=first, last_name=last
            )
            users.append(u)
        self.stdout.write(f"{len(users)} کاربر عادی ساخته شد.")

        # 3. Create Doctors
        doctor_names = [
            ("دکتر سینا", "موسوی", "APPROVED"),
            ("دکتر پویا", "جمشیدی", "APPROVED"),
            ("دکتر نیلوفر", "عسگری", "PENDING"),
            ("دکتر کامران", "یوسفی", "REJECTED"),
            ("دکتر بهاره", "شفیعی", "APPROVED"),
            ("دکتر آرش", "تقوی", "NOT_SUBMITTED"),
        ]
        doctors = []
        for i, (first, last, status) in enumerate(doctor_names):
            phone = f"+9891200000{50 + i:02d}"
            d = Doctor.objects.create_user(
                phone_number=phone, password=seed_password, role="DOCTOR",
                first_name=first, last_name=last
            )
            if status != "NOT_SUBMITTED":
                d.account_owner = "DOCTOR"
                d.agreed_to_terms = True
                d.id_number = f"ID-{1000+i}"
                d.medical_registration_number = f"MED-{2000+i}"
                d.verification_status = status
                if status == "REJECTED":
                    d.rejection_note = "عکس مدارک واضح نیست، لطفا دوباره آپلود کنید."
                d.save()
            doctors.append(d)
        self.stdout.write(f"{len(doctors)} دکتر ساخته شد.")

        # 4. Create Appointment Slots (Next 30 days)
        slots = []
        now = timezone.now()
        for i in range(1, 15):
            date = (now + timedelta(days=i)).date()
            for hour in [9, 10, 11, 14, 16, 18]:
                start = now + timedelta(days=i, hours=hour - now.hour, minutes=-now.minute)
                end = start + timedelta(hours=1)
                slot = AppointmentSlot.objects.create(
                    date=date, start_at=start, end_at=end,
                    status="AVAILABLE"
                )
                slots.append(slot)
        self.stdout.write(f"{len(slots)} خالی زمانی ساخته شد.")

        # 5. Create Appointments
        appt_reasons = ["درد دندان", "معاینه دوره‌ای", "روکش دندان", "عصب کشی", "بلیچینگ"]
        appt_statuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"]
        
        for i in range(15):
            user = random.choice(users)
            slot = random.choice(slots)
            status = random.choice(appt_statuses)
            
            if slot.status == "AVAILABLE":
                appt = Appointment.objects.create(
                    patient=user, slot=slot, status=status,
                    reason=random.choice(appt_reasons)
                )
                if status in ["APPROVED", "COMPLETED"]:
                    appt.approved_by = admin
                    appt.approved_at = timezone.now()
                    slot.status = "BOOKED"
                elif status in ["REJECTED", "CANCELLED"]:
                    slot.status = "AVAILABLE" # Free up slot
                elif status == "PENDING":
                    slot.status = "BOOKED"
                
                appt.save()
                slot.save()
        self.stdout.write("نوبت‌ها ساخته شد.")

        # 6. Create Chats (User-Admin)
        for user in users[:5]: # Create chats for first 5 users
            thread = MessageThread.objects.create(
                participant=user, thread_type="USER_ADMIN", status="OPEN"
            )
            Message.objects.create(thread=thread, sender=user, sender_type="USER", body="سلام، وقت ملاقات دارید؟")
            Message.objects.create(thread=thread, sender=admin, sender_type="ADMIN", body="سلام بله، روز شنبه ساعت ۱۰ صبح آزاده.")
            Message.objects.create(thread=thread, sender=user, sender_type="USER", body="ممنون، ثبت کردم.")

        # 7. Create Chats (Doctor-Admin)
        approved_doctors = [d for d in doctors if d.verification_status == "APPROVED"]
        for doc in approved_doctors:
            thread = MessageThread.objects.create(
                participant=doc, thread_type="DOCTOR_ADMIN", status="OPEN"
            )
            Message.objects.create(thread=thread, sender=doc, sender_type="DOCTOR", body="سلام، فایل اسکن ۳بعدی بیمار را آپلود کردم.")
            Message.objects.create(thread=thread, sender=admin, sender_type="ADMIN", body="سلام دکتر، بررسی شد. لطفا فردا به کلینیک بیایند.")
            
        self.stdout.write("پیام‌ها و چت‌ها ساخته شد.")
        self.stdout.write(self.style.SUCCESS("✅ دیتابیس با موفقیت پر شد!"))

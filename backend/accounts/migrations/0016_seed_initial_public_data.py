from datetime import datetime, timedelta, timezone

from django.contrib.auth.hashers import make_password
from django.db import migrations


SERVICES = (
    ("consultation", "مشاوره درمانی دندان‌پزشکی", "مشاوره درمانی", "بررسی اولیه، تشخیص مسیر درمان و انتخاب متخصص مناسب", "messages"),
    ("cosmetic-prosthesis", "پروتز زیبایی", "پروتز زیبایی", "روکش، لمینت و پروتزهای ثابت با طراحی دقیق لبخند", "sparkles"),
    ("maxillofacial", "جراحی دهان، فک و صورت", "فک و صورت", "درمان تخصصی ناهنجاری‌ها، جراحی فک و دندان نهفته", "scan-face"),
    ("endodontics", "درمان ریشه (عصب‌کشی)", "درمان ریشه", "درمان تخصصی پالپ و ریشه دندان با حفظ حداکثری بافت", "activity"),
    ("general-dentistry", "دندان‌پزشکی عمومی", "دندان‌پزشکی عمومی", "معاینه، ترمیم، جرم‌گیری و مراقبت‌های دوره‌ای", "stethoscope"),
    ("orthodontics", "ارتودنسی و ناهنجاری‌های فک", "ارتودنسی", "مرتب‌سازی دندان‌ها و اصلاح روابط فکی کودکان و بزرگسالان", "align-center"),
    ("periodontics", "بیماری‌های لثه (پریودانتیکس)", "درمان لثه", "درمان بافت نگهدارنده دندان، جراحی لثه و آماده‌سازی ایمپلنت", "shield"),
    ("pediatric-dentistry", "دندان‌پزشکی کودکان", "دندان‌پزشکی کودکان", "پیشگیری و درمان تخصصی دندان کودکان و نوجوانان", "baby"),
    ("restorative-cosmetic", "ترمیمی و زیبایی", "ترمیمی و زیبایی", "بازسازی محافظه‌کارانه دندان و اصلاح فرم و رنگ لبخند", "wand"),
    ("oral-medicine", "بیماری‌های دهان، فک و صورت", "بیماری‌های دهان", "تشخیص و درمان ضایعات و بیماری‌های بافت نرم دهان", "search"),
    ("oral-radiology", "رادیولوژی دهان، فک و صورت", "رادیولوژی دهان", "تصویربرداری تخصصی و تفسیر دقیق ساختارهای فک و دندان", "scan-line"),
    ("implant", "ایمپلنت و بازسازی دندان", "ایمپلنت", "جایگزینی دندان از دست رفته با برنامه‌ریزی دیجیتال", "circle-dot"),
)

INSURANCES = (
    "آزاد", "بیمه سلامت ایران", "تأمین اجتماعی", "نیروهای مسلح", "بیمه دانا",
    "بیمه آسیا", "بیمه ایران", "بیمه دی", "بیمه البرز", "بیمه سامان",
    "بیمه پاسارگاد", "بیمه کوثر",
)

PATIENTS = (
    ("+989121111201", "مریم", "رضایی"),
    ("+989121111202", "علی", "صادقی"),
    ("+989121111203", "آریا", "فرهمند"),
)

DOCTORS = (
    {
        "slug": "arman-hosseini", "phone": "+989131111201", "first": "آرمان", "last": "حسینی",
        "specialty": "متخصص درمان ریشه", "services": ("endodontics", "consultation", "general-dentistry"),
        "image": "/images/doctors/arman-hosseini.webp", "clinic": "کلینیک تخصصی سپیدار",
        "address": "تهران، خیابان ولیعصر، بالاتر از میدان ونک، پلاک ۱۸۳",
        "insurances": ("بیمه سلامت ایران", "بیمه دانا", "بیمه سامان"),
        "experience": "۱۴ سال سابقه درمان تخصصی",
        "bio": "تمرکز حرفه‌ای بر درمان‌های پیچیده ریشه، درمان مجدد و حفظ دندان‌های طبیعی با استفاده از میکروسکوپ دندان‌پزشکی.",
        "reviews": ((5, "برخورد بسیار محترمانه بود و درباره روند درمان کامل توضیح دادند."), (4, "درمان ریشه با دقت انجام شد و درد بعد از درمان خیلی کم بود."), (5, "برای درمان مجدد مراجعه کردم؛ نتیجه عالی و زمان انتظار مناسب بود.")),
    },
    {
        "slug": "nazanin-karimi", "phone": "+989131111202", "first": "نازنین", "last": "کریمی",
        "specialty": "متخصص پروتزهای دندانی", "services": ("cosmetic-prosthesis", "implant", "restorative-cosmetic"),
        "image": "/images/doctors/nazanin-karimi.webp", "clinic": "مرکز دندان‌پزشکی آبان",
        "address": "تهران، سعادت‌آباد، بلوار دریا، خیابان صراف‌ها، پلاک ۲۱",
        "insurances": ("بیمه ایران", "بیمه آسیا", "بیمه پاسارگاد"),
        "experience": "۱۱ سال سابقه طراحی و بازسازی لبخند",
        "bio": "متخصص پروتزهای ثابت و متحرک با رویکرد دیجیتال در طراحی لبخند، روکش‌های سرامیکی و بازسازی‌های متکی بر ایمپلنت.",
        "reviews": ((5, "طراحی روکش بسیار طبیعی بود و نتیجه از انتظارم بهتر شد."), (4, "توضیحات دقیق و برخورد حرفه‌ای؛ پذیرش هم منظم انجام شد."), (4, "کار باکیفیت بود و درباره مراقبت‌های بعد از درمان راهنمایی شدم.")),
    },
    {
        "slug": "sara-moradi", "phone": "+989131111203", "first": "سارا", "last": "مرادی",
        "specialty": "متخصص دندان‌پزشکی کودکان", "services": ("pediatric-dentistry", "consultation"),
        "image": "/images/doctors/sara-moradi.webp", "clinic": "مرکز کودکان لبخند",
        "address": "تهران، پاسداران، خیابان گلستان پنجم، پلاک ۴۴",
        "insurances": ("تأمین اجتماعی", "بیمه سلامت ایران", "بیمه کوثر"),
        "experience": "۱۲ سال تجربه درمان کودک و نوجوان",
        "bio": "درمان‌های پیشگیرانه و ترمیمی کودک با تمرکز بر کاهش اضطراب، آموزش خانواده و ایجاد تجربه‌ای امن برای اولین مراجعات دندان‌پزشکی.",
        "reviews": ((5, "با صبوری اضطراب کودک را کم کردند و تجربه خیلی خوبی داشتیم."), (5, "محیط مناسب کودک و توضیحات روشن برای والدین بسیار عالی بود."), (4, "رفتار تیم پذیرش خوب بود و فرزندم بدون ترس درمان شد.")),
    },
    {
        "slug": "reza-ahmadi", "phone": "+989131111204", "first": "رضا", "last": "احمدی",
        "specialty": "متخصص جراحی دهان، فک و صورت", "services": ("maxillofacial", "implant", "consultation"),
        "image": "/images/doctors/reza-ahmadi.webp", "clinic": "بیمارستان دندان‌پزشکی مهر",
        "address": "تهران، شهرک غرب، بلوار فرحزادی، مجتمع پزشکی مهر",
        "insurances": ("نیروهای مسلح", "بیمه دی", "بیمه دانا"),
        "experience": "۱۶ سال سابقه جراحی تخصصی",
        "bio": "جراحی دندان‌های نهفته، بازسازی استخوان، جراحی ایمپلنت و درمان ناهنجاری‌های فکی با برنامه‌ریزی سه‌بعدی.",
        "reviews": ((5, "جراحی با برنامه‌ریزی دقیق انجام شد و دوره نقاهت راحتی داشتم."), (4, "پزشک باحوصله بود و همه مراحل جراحی را قبل از شروع توضیح داد."), (4, "نتیجه درمان خوب بود؛ فقط زمان انتظار کمی طولانی شد.")),
    },
    {
        "slug": "parisa-ebrahimi", "phone": "+989131111205", "first": "پریسا", "last": "ابراهیمی",
        "specialty": "متخصص ارتودنسی", "services": ("orthodontics", "consultation"),
        "image": "/images/doctors/parisa-ebrahimi.webp", "clinic": "کلینیک ارتودنسی هما",
        "address": "تهران، قیطریه، بلوار صبا، کوچه روشن، پلاک ۷",
        "insurances": ("بیمه البرز", "بیمه سامان", "بیمه پاسارگاد"),
        "experience": "۱۳ سال درمان ارتودنسی ثابت و شفاف",
        "bio": "درمان ناهنجاری‌های دندانی و فکی کودکان و بزرگسالان با روش‌های ثابت، متحرک و الاینرهای شفاف.",
        "reviews": ((5, "روند ارتودنسی منظم و نتیجه لبخند بسیار رضایت‌بخش بود."), (4, "در هر جلسه پیشرفت درمان را واضح توضیح می‌دادند."), (5, "برخورد عالی، محیط تمیز و برنامه‌ریزی نوبت‌ها دقیق بود.")),
    },
    {
        "slug": "milad-sadeghi", "phone": "+989131111206", "first": "میلاد", "last": "صادقی",
        "specialty": "متخصص بیماری‌های لثه", "services": ("periodontics", "implant", "consultation"),
        "image": "/images/doctors/milad-sadeghi.webp", "clinic": "درمانگاه تخصصی نیایش",
        "address": "تهران، جردن، خیابان گلشهر، پلاک ۹۶",
        "insurances": ("بیمه آسیا", "بیمه ایران", "تأمین اجتماعی"),
        "experience": "۱۰ سال درمان تخصصی لثه و ایمپلنت",
        "bio": "درمان بیماری‌های پیشرفته لثه، پیوند بافت نرم و سخت و آماده‌سازی بافت برای درمان‌های ایمپلنت و زیبایی.",
        "reviews": ((4, "درمان لثه با دقت انجام شد و آموزش مراقبت خانگی مفید بود."), (5, "تشخیص دقیق و پیگیری بعد از درمان باعث اطمینان من شد."), (4, "رفتار حرفه‌ای و نتیجه درمان خوب بود.")),
    },
    {
        "slug": "leila-rahmani", "phone": "+989131111207", "first": "لیلا", "last": "رحمانی",
        "specialty": "متخصص رادیولوژی دهان، فک و صورت", "services": ("oral-radiology", "consultation"),
        "image": "/images/doctors/leila-rahmani.webp", "clinic": "مرکز تصویربرداری دهان پرتو",
        "address": "تهران، میدان آرژانتین، خیابان الوند، ساختمان پزشکان پرتو",
        "insurances": ("بیمه دی", "بیمه دانا", "بیمه سلامت ایران"),
        "experience": "۹ سال تفسیر تصویربرداری تخصصی",
        "bio": "تصویربرداری پانورامیک، سفالومتری و CBCT و تفسیر تخصصی ضایعات، ساختارهای فکی و برنامه‌ریزی پیش از جراحی.",
        "reviews": ((5, "تصویربرداری سریع انجام شد و گزارش بسیار کامل بود."), (4, "محیط منظم و توضیحات پزشک درباره نتیجه تصویر واضح بود."), (5, "بدون معطلی کار انجام شد و برخورد کارکنان عالی بود.")),
    },
    {
        "slug": "nima-farhadi", "phone": "+989131111208", "first": "نیما", "last": "فرهادی",
        "specialty": "متخصص بیماری‌های دهان، فک و صورت", "services": ("oral-medicine", "consultation", "general-dentistry"),
        "image": "/images/doctors/nima-farhadi.webp", "clinic": "کلینیک تشخیص بیماری‌های دهان آرام",
        "address": "تهران، یوسف‌آباد، خیابان شصت و چهارم، پلاک ۱۲",
        "insurances": ("بیمه ایران", "تأمین اجتماعی", "بیمه آسیا"),
        "experience": "۱۲ سال تشخیص و درمان ضایعات دهانی",
        "bio": "تشخیص و درمان غیرجراحی بیماری‌های مخاط دهان، دردهای دهانی‌صورتی و پیگیری ضایعات نیازمند ارزیابی تخصصی.",
        "reviews": ((4, "برای تشخیص ضایعه دهانی با دقت معاینه و راهنمایی شدم."), (5, "توضیحات علمی و قابل فهم بود و درمان نتیجه خوبی داشت."), (4, "پزشک صبور و دقیق بود و روند پیگیری منظم انجام شد.")),
    },
)


def seed_initial_public_data(apps, schema_editor):
    DentalService = apps.get_model("accounts", "DentalService")
    InsuranceProvider = apps.get_model("accounts", "InsuranceProvider")
    Doctor = apps.get_model("accounts", "Doctor")
    NormalUser = apps.get_model("accounts", "NormalUser")
    DoctorReview = apps.get_model("accounts", "DoctorReview")
    DoctorReviewAnswer = apps.get_model("accounts", "DoctorReviewAnswer")
    RatingParameter = apps.get_model("accounts", "RatingParameter")

    services = {}
    for position, (slug, title, short_title, description, icon) in enumerate(SERVICES, start=1):
        services[slug], _ = DentalService.objects.update_or_create(
            slug=slug,
            defaults={
                "title": title,
                "short_title": short_title,
                "description": description,
                "icon": icon,
                "position": position,
                "is_active": True,
            },
        )

    insurances = {}
    for position, name in enumerate(INSURANCES, start=1):
        insurances[name], _ = InsuranceProvider.objects.update_or_create(
            name=name,
            defaults={"position": position, "is_active": True},
        )

    patients = []
    for phone, first_name, last_name in PATIENTS:
        patient = NormalUser.objects.filter(phone_number=phone).first()
        if patient is None:
            patient = NormalUser.objects.create(
                phone_number=phone,
                password=make_password(None),
                role="USER",
                first_name=first_name,
                last_name=last_name,
                is_active=True,
            )
        patients.append(patient)

    parameters = list(RatingParameter.objects.filter(is_active=True).order_by("position", "pk"))
    anchor = datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc)
    for doctor_index, data in enumerate(DOCTORS):
        doctor = Doctor.objects.filter(username=data["slug"]).first()
        if doctor is None:
            doctor = Doctor.objects.filter(phone_number=data["phone"]).first()
        if doctor is None:
            doctor = Doctor.objects.create(
                phone_number=data["phone"],
                password=make_password(None),
                role="DOCTOR",
                username=data["slug"],
            )
        doctor.username = data["slug"]
        doctor.first_name = data["first"]
        doctor.last_name = data["last"]
        doctor.profile_picture = data["image"]
        doctor.account_owner = "DOCTOR"
        doctor.agreed_to_terms = True
        doctor.medical_registration_number = f"SEED-{doctor_index + 1:03d}"
        doctor.verification_status = "APPROVED"
        doctor.is_active = True
        doctor.clinic_name = data["clinic"]
        doctor.specialty = data["specialty"]
        doctor.bio = data["bio"]
        doctor.experience = data["experience"]
        doctor.address = data["address"]
        doctor.map_url = "https://www.openstreetmap.org"
        doctor.save()
        doctor.services.set([services[slug] for slug in data["services"]])
        doctor.insurances.set([insurances[name] for name in data["insurances"]])

        for review_index, (rating, comment) in enumerate(data["reviews"]):
            review, _ = DoctorReview.objects.update_or_create(
                doctor=doctor,
                user=patients[review_index],
                defaults={"rating": rating, "comment": comment},
            )
            for parameter in parameters:
                if parameter.input_type == "STAR":
                    value = rating
                elif parameter.input_type == "RECOMMENDATION":
                    value = 1
                else:
                    values = [option["value"] for option in parameter.options]
                    value = values[min(review_index, len(values) - 1)] if values else 0
                DoctorReviewAnswer.objects.update_or_create(
                    review=review,
                    parameter=parameter,
                    defaults={"value": value},
                )
            created_at = anchor - timedelta(days=doctor_index * 3 + review_index)
            DoctorReview.objects.filter(pk=review.pk).update(
                created_at=created_at,
                updated_at=created_at,
            )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0015_public_doctor_catalog"),
    ]

    operations = [
        migrations.RunPython(seed_initial_public_data, migrations.RunPython.noop),
    ]

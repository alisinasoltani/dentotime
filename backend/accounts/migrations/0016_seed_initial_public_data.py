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


def seed_initial_public_data(apps, schema_editor):
    DentalService = apps.get_model("accounts", "DentalService")
    InsuranceProvider = apps.get_model("accounts", "InsuranceProvider")

    for position, (slug, title, short_title, description, icon) in enumerate(SERVICES, start=1):
        DentalService.objects.update_or_create(
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

    for position, name in enumerate(INSURANCES, start=1):
        InsuranceProvider.objects.update_or_create(
            name=name,
            defaults={"position": position, "is_active": True},
        )

    # Fictional people, visits and reviews belong to the explicit demo setup.


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0015_public_doctor_catalog"),
    ]

    operations = [
        migrations.RunPython(seed_initial_public_data, migrations.RunPython.noop),
    ]

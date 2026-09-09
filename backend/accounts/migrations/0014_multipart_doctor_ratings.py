from django.db import migrations, models
import django.db.models.deletion


PARAMETERS = (
    {
        "key": "doctor_manner",
        "label": "نحوه برخورد پزشک",
        "prompt": "نحوه برخورد پزشک را چگونه ارزیابی می‌کنید؟",
        "input_type": "STAR",
        "options": [],
        "position": 1,
    },
    {
        "key": "doctor_explanation",
        "label": "توضیح پزشک در هنگام ویزیت",
        "prompt": "توضیحات پزشک در هنگام ویزیت را چگونه ارزیابی می‌کنید؟",
        "input_type": "STAR",
        "options": [],
        "position": 2,
    },
    {
        "key": "diagnosis_and_treatment",
        "label": "مهارت پزشک در تشخیص و درمان",
        "prompt": "مهارت پزشک در تشخیص و درمان را چگونه ارزیابی می‌کنید؟",
        "input_type": "STAR",
        "options": [],
        "position": 3,
    },
    {
        "key": "reception_and_secretary",
        "label": "فرآیند پذیرش و رفتار منشی",
        "prompt": "فرآیند پذیرش و رفتار منشی را چگونه ارزیابی می‌کنید؟",
        "input_type": "STAR",
        "options": [],
        "position": 4,
    },
    {
        "key": "environment",
        "label": "شرایط محیطی",
        "prompt": "شرایط محیطی را چگونه ارزیابی می‌کنید؟",
        "input_type": "STAR",
        "options": [],
        "position": 5,
    },
    {
        "key": "recommendation",
        "label": "پیشنهاد کاربران",
        "prompt": "آیا مراجعه به این پزشک را به دیگران توصیه می‌کنید؟",
        "input_type": "RECOMMENDATION",
        "options": [
            {"value": 1, "label": "بله"},
            {"value": 0, "label": "خیر"},
        ],
        "position": 6,
    },
    {
        "key": "wait_time",
        "label": "میانگین زمان انتظار",
        "prompt": "برای ویزیت چه مدت منتظر ماندید؟",
        "input_type": "WAIT_TIME",
        "options": [
            {"value": 0, "label": "راس ساعت تا 15 دقیقه"},
            {"value": 1, "label": "15 دقیقه تا 30 دقیقه"},
            {"value": 2, "label": "30 دقیقه تا 1 ساعت"},
            {"value": 3, "label": "بیشتر از 1 ساعت"},
        ],
        "position": 7,
    },
)


def seed_parameters_and_legacy_answers(apps, schema_editor):
    RatingParameter = apps.get_model("accounts", "RatingParameter")
    DoctorReview = apps.get_model("accounts", "DoctorReview")
    DoctorReviewAnswer = apps.get_model("accounts", "DoctorReviewAnswer")

    star_parameters = []
    for data in PARAMETERS:
        parameter, _ = RatingParameter.objects.update_or_create(
            key=data["key"],
            defaults=data,
        )
        if data["input_type"] == "STAR":
            star_parameters.append(parameter)

    answers = []
    for review in DoctorReview.objects.all().iterator():
        value = max(1, min(5, int(round(float(review.rating)))))
        answers.extend(
            DoctorReviewAnswer(review=review, parameter=parameter, value=value)
            for parameter in star_parameters
        )
    DoctorReviewAnswer.objects.bulk_create(answers, ignore_conflicts=True)


def remove_seeded_parameters(apps, schema_editor):
    RatingParameter = apps.get_model("accounts", "RatingParameter")
    DoctorReviewAnswer = apps.get_model("accounts", "DoctorReviewAnswer")
    parameter_ids = RatingParameter.objects.filter(
        key__in=[item["key"] for item in PARAMETERS]
    ).values_list("pk", flat=True)
    DoctorReviewAnswer.objects.filter(parameter_id__in=parameter_ids).delete()
    RatingParameter.objects.filter(pk__in=parameter_ids).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0013_remove_doctor_accounts_do_verific_a9ada0_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="RatingParameter",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("key", models.SlugField(max_length=64, unique=True)),
                ("label", models.CharField(max_length=255)),
                ("prompt", models.CharField(blank=True, default="", max_length=500)),
                ("input_type", models.CharField(choices=[("STAR", "امتیاز ستاره‌ای"), ("RECOMMENDATION", "پیشنهاد به دیگران"), ("WAIT_TIME", "زمان انتظار")], max_length=24)),
                ("options", models.JSONField(blank=True, default=list)),
                ("position", models.PositiveSmallIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ("position", "pk")},
        ),
        migrations.AlterField(
            model_name="doctorreview",
            name="rating",
            field=models.DecimalField(decimal_places=1, max_digits=2),
        ),
        migrations.CreateModel(
            name="DoctorReviewAnswer",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("value", models.PositiveSmallIntegerField()),
                ("parameter", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="answers", to="accounts.ratingparameter")),
                ("review", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="answers", to="accounts.doctorreview")),
            ],
            options={"ordering": ("parameter__position", "parameter_id")},
        ),
        migrations.AddConstraint(
            model_name="ratingparameter",
            constraint=models.CheckConstraint(condition=models.Q(("input_type__in", ["STAR", "RECOMMENDATION", "WAIT_TIME"])), name="rating_parameter_valid_input_type"),
        ),
        migrations.AddConstraint(
            model_name="doctorreviewanswer",
            constraint=models.UniqueConstraint(fields=("review", "parameter"), name="unique_review_answer_per_parameter"),
        ),
        migrations.AddConstraint(
            model_name="doctorreviewanswer",
            constraint=models.CheckConstraint(condition=models.Q(("value__gte", 0), ("value__lte", 5)), name="doctor_review_answer_between_0_and_5"),
        ),
        migrations.RunPython(seed_parameters_and_legacy_answers, remove_seeded_parameters),
    ]

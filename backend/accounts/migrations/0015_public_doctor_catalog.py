from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0014_multipart_doctor_ratings"),
    ]

    operations = [
        migrations.CreateModel(
            name="DentalService",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("slug", models.SlugField(max_length=80, unique=True)),
                ("title", models.CharField(max_length=255)),
                ("short_title", models.CharField(max_length=120)),
                ("description", models.TextField(blank=True, default="")),
                ("icon", models.SlugField(blank=True, default="stethoscope", max_length=64)),
                ("position", models.PositiveSmallIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={"ordering": ("position", "pk")},
        ),
        migrations.CreateModel(
            name="InsuranceProvider",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=150, unique=True)),
                ("position", models.PositiveSmallIntegerField(default=0)),
                ("is_active", models.BooleanField(default=True)),
            ],
            options={"ordering": ("position", "pk")},
        ),
        migrations.AddField(
            model_name="doctor",
            name="address",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="doctor",
            name="bio",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="doctor",
            name="experience",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="doctor",
            name="map_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="doctor",
            name="specialty",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="doctor",
            name="insurances",
            field=models.ManyToManyField(blank=True, related_name="doctors", to="accounts.insuranceprovider"),
        ),
        migrations.AddField(
            model_name="doctor",
            name="services",
            field=models.ManyToManyField(blank=True, related_name="doctors", to="accounts.dentalservice"),
        ),
        migrations.AddIndex(
            model_name="dentalservice",
            index=models.Index(
                condition=models.Q(is_active=True),
                fields=["position"],
                name="service_active_position_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="insuranceprovider",
            index=models.Index(
                condition=models.Q(is_active=True),
                fields=["position"],
                name="insurance_active_position_idx",
            ),
        ),
    ]

import uuid

import accounts.validators
import django.db.models.deletion
from django.db import migrations, models


def populate_contact_snapshots(apps, schema_editor):
    Appointment = apps.get_model("appointments", "Appointment")
    queryset = Appointment.objects.select_related("patient").filter(
        contact_phone_number__isnull=True
    )
    for appointment in queryset.iterator(chunk_size=1000):
        patient = appointment.patient
        appointment.contact_phone_number = patient.phone_number
        appointment.contact_first_name = patient.first_name
        appointment.contact_last_name = patient.last_name
        appointment.save(
            update_fields=[
                "contact_phone_number",
                "contact_first_name",
                "contact_last_name",
            ]
        )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0010_appointment_claim_otp"),
        ("appointments", "0003_clinic_availability"),
    ]

    operations = [
        migrations.CreateModel(
            name="BookingCaptchaChallenge",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("answer_digest", models.CharField(editable=False, max_length=64)),
                ("expires_at", models.DateTimeField()),
                ("attempt_count", models.PositiveSmallIntegerField(default=0)),
                ("max_attempts", models.PositiveSmallIntegerField(default=5)),
                ("requested_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("device_hash", models.CharField(max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
            ],
        ),
        migrations.AddField(
            model_name="appointment",
            name="contact_first_name",
            field=models.CharField(max_length=150, null=True),
        ),
        migrations.AddField(
            model_name="appointment",
            name="contact_last_name",
            field=models.CharField(blank=True, max_length=150, null=True),
        ),
        migrations.AddField(
            model_name="appointment",
            name="contact_phone_number",
            field=models.CharField(
                db_index=True,
                max_length=20,
                null=True,
                validators=[accounts.validators.validate_e164_phone],
            ),
        ),
        migrations.RunPython(populate_contact_snapshots, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="appointment",
            name="contact_first_name",
            field=models.CharField(max_length=150),
        ),
        migrations.AlterField(
            model_name="appointment",
            name="contact_last_name",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.AlterField(
            model_name="appointment",
            name="contact_phone_number",
            field=models.CharField(
                db_index=True,
                max_length=20,
                validators=[accounts.validators.validate_e164_phone],
            ),
        ),
        migrations.AlterField(
            model_name="appointment",
            name="patient",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="appointments",
                to="accounts.normaluser",
            ),
        ),
        migrations.AddIndex(
            model_name="bookingcaptchachallenge",
            index=models.Index(
                condition=models.Q(("consumed_at__isnull", True)),
                fields=["expires_at"],
                name="captcha_unconsumed_expiry_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="bookingcaptchachallenge",
            index=models.Index(
                fields=["device_hash", "-created_at"],
                name="appointment_device__591d47_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="bookingcaptchachallenge",
            constraint=models.CheckConstraint(
                condition=models.Q(("max_attempts__gt", 0)),
                name="captcha_max_attempts_positive",
            ),
        ),
        migrations.AddConstraint(
            model_name="bookingcaptchachallenge",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("attempt_count__lte", models.F("max_attempts"))
                ),
                name="captcha_attempts_within_limit",
            ),
        ),
        migrations.AddConstraint(
            model_name="appointment",
            constraint=models.CheckConstraint(
                condition=~models.Q(("contact_phone_number", "")),
                name="appointment_contact_phone_required",
            ),
        ),
    ]

import uuid

import django.db.models.deletion
from django.db import migrations, models


def populate_idempotency_keys(apps, schema_editor):
    Appointment = apps.get_model("appointments", "Appointment")
    while True:
        appointments = list(
            Appointment.objects.filter(idempotency_key__isnull=True).only("pk")[:1000]
        )
        if not appointments:
            break
        for appointment in appointments:
            appointment.idempotency_key = uuid.uuid4()
        Appointment.objects.bulk_update(appointments, ["idempotency_key"], batch_size=1000)


class Migration(migrations.Migration):
    dependencies = [("appointments", "0001_initial")]

    operations = [
        migrations.AlterField(
            model_name="appointment",
            name="slot",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="appointments",
                to="appointments.appointmentslot",
            ),
        ),
        migrations.AddField(
            model_name="appointment",
            name="idempotency_key",
            field=models.UUIDField(editable=False, null=True),
        ),
        migrations.RunPython(populate_idempotency_keys, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="appointment",
            name="idempotency_key",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AddIndex(
            model_name="appointment",
            index=models.Index(
                fields=["patient", "status", "-created_at"],
                name="appt_patient_status_created",
            ),
        ),
        migrations.AddConstraint(
            model_name="appointment",
            constraint=models.UniqueConstraint(
                condition=models.Q(status__in=["PENDING", "APPROVED"]),
                fields=("slot",),
                name="one_active_appointment_per_slot",
            ),
        ),
        migrations.AddConstraint(
            model_name="appointment",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    status__in=[
                        "PENDING",
                        "APPROVED",
                        "REJECTED",
                        "CANCELLED",
                        "COMPLETED",
                        "NO_SHOW",
                    ]
                ),
                name="appointment_valid_status",
            ),
        ),
        migrations.AddConstraint(
            model_name="appointmentslot",
            constraint=models.CheckConstraint(
                condition=models.Q(start_at__lt=models.F("end_at")),
                name="appointment_slot_start_before_end",
            ),
        ),
        migrations.AddConstraint(
            model_name="appointmentslot",
            constraint=models.CheckConstraint(
                condition=models.Q(status__in=["AVAILABLE", "BOOKED", "BLOCKED"]),
                name="appointment_slot_valid_status",
            ),
        ),
    ]

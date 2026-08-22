from datetime import timedelta

from django.db import migrations


INITIAL_REASON_PREFIX = "[INITIAL_DATA] attended visit "


def normalize_initial_visit_timestamps(apps, schema_editor):
    Appointment = apps.get_model("appointments", "Appointment")

    for appointment in Appointment.objects.filter(
        reason__startswith=INITIAL_REASON_PREFIX,
    ).select_related("slot"):
        Appointment.objects.filter(pk=appointment.pk).update(
            created_at=appointment.slot.start_at - timedelta(days=3),
            updated_at=appointment.slot.end_at,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("appointments", "0007_seed_initial_attended_visits"),
    ]

    operations = [
        migrations.RunPython(
            normalize_initial_visit_timestamps,
            migrations.RunPython.noop,
        ),
    ]

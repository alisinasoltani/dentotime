from django.db import migrations


def seed_attended_visits(apps, schema_editor):
    # Retain the migration node for deployed databases; new databases get no demo actors.
    return


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0016_seed_initial_public_data"),
        ("appointments", "0006_doctor_visit_confirmation"),
    ]

    operations = [
        migrations.RunPython(seed_attended_visits, migrations.RunPython.noop),
    ]

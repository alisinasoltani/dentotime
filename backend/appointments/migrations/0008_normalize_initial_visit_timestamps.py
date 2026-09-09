from django.db import migrations


def normalize_initial_visit_timestamps(apps, schema_editor):
    # Retain the migration node for deployed databases; new databases get no demo actors.
    return


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

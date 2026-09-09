from django.db import migrations

def create_test_doctor(apps, schema_editor):
    # Retain the migration node for deployed databases; new databases get no demo actors.
    return


class Migration(migrations.Migration):

    dependencies = [
        # Keep your original dependencies here!
        ('accounts', '0001_initial'), 
    ]

    operations = [
        migrations.RunPython(create_test_doctor),
    ]

from django.db import migrations

def create_test_admin_and_user(apps, schema_editor):
    # Retain the migration node for deployed databases; new databases get no demo actors.
    return


class Migration(migrations.Migration):

    dependencies = [
        # This depends on the doctor migration you just created
        ('accounts', '0002_auto_20260629_0655'), 
    ]

    operations = [
        migrations.RunPython(create_test_admin_and_user),
    ]

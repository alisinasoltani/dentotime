from django.contrib.auth.hashers import make_password
from django.db import migrations


# These identifiers were embedded in historical data migrations. They are kept
# here only so already-deployed databases can be remediated without rewriting
# applied migration history.
HISTORICAL_SEED_PHONES = (
    "+989010669227",
    "+989028262592",
    "+989138958712",
    "+989148721497",
)


def disable_historical_seed_accounts(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(phone_number__in=HISTORICAL_SEED_PHONES).update(
        is_active=False,
        is_staff=False,
        is_superuser=False,
        password=make_password(None),
    )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0007_doctor_likes_doctorreview")]

    operations = [
        migrations.RunPython(
            disable_historical_seed_accounts,
            reverse_code=migrations.RunPython.noop,
        )
    ]

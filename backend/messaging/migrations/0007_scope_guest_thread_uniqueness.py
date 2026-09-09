from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("messaging", "0006_pinnedchatcontact_and_more")]
    operations = [
        migrations.RemoveConstraint(
            model_name="messagethread", name="unique_open_guest_thread_per_phone_type",
        ),
        migrations.AddConstraint(
            model_name="messagethread",
            constraint=models.UniqueConstraint(
                fields=("guest_phone", "thread_type"),
                condition=models.Q(participant__isnull=True, thread_type="USER_ADMIN", status="OPEN", deleted_at__isnull=True),
                name="unique_open_guest_thread_per_phone_type",
            ),
        ),
    ]

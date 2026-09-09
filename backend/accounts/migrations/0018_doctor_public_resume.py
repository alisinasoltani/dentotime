from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0017_password_change_otp")]
    operations = [
        migrations.AddField(
            model_name="doctor", name=name,
            field=models.TextField(blank=True, default=""),
        )
        for name in ("education", "clinical_history", "certifications")
    ]

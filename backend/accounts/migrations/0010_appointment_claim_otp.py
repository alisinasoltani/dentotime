from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0009_secure_otp_sessions")]

    operations = [
        migrations.AlterField(
            model_name="otpchallenge",
            name="purpose",
            field=models.CharField(
                choices=[
                    ("SIGNUP", "Signup"),
                    ("PASSWORD_RESET", "Password reset"),
                    ("APPOINTMENT_CLAIM", "Appointment claim"),
                ],
                max_length=24,
            ),
        )
    ]

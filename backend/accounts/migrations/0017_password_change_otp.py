from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0016_seed_initial_public_data")]

    operations = [
        migrations.AlterField(
            model_name="otpchallenge",
            name="purpose",
            field=models.CharField(
                choices=[
                    ("SIGNUP", "Signup"),
                    ("PASSWORD_RESET", "Password reset"),
                    ("PASSWORD_CHANGE", "Password change"),
                    ("APPOINTMENT_CLAIM", "Appointment claim"),
                ],
                max_length=24,
            ),
        ),
    ]

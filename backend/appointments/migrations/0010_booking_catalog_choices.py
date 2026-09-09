from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0018_doctor_public_resume"),
        ("appointments", "0009_doctoravailabilityrule_and_more"),
    ]
    operations = [
        migrations.AddField(
            model_name="appointment", name=name,
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to=target),
        )
        for name, target in (("service", "accounts.dentalservice"), ("insurance", "accounts.insuranceprovider"))
    ]

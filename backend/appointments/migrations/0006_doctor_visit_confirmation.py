from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0014_multipart_doctor_ratings"),
        ("appointments", "0005_remove_appointment_appointment_status_8fe9d7_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="doctor",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="appointments", to="accounts.doctor"),
        ),
        migrations.AddField(
            model_name="appointment",
            name="attendance_status",
            field=models.CharField(choices=[("NOT_CONFIRMED", "تأیید نشده"), ("ATTENDED", "مراجعه کردم"), ("DID_NOT_ATTEND", "مراجعه نکردم")], db_index=True, default="NOT_CONFIRMED", max_length=20),
        ),
        migrations.AddField(
            model_name="appointment",
            name="attendance_confirmed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name="appointment",
            index=models.Index(fields=["patient", "doctor", "attendance_status"], name="appt_patient_doctor_attend"),
        ),
        migrations.AddConstraint(
            model_name="appointment",
            constraint=models.CheckConstraint(condition=models.Q(("attendance_status__in", ["NOT_CONFIRMED", "ATTENDED", "DID_NOT_ATTEND"])), name="appointment_valid_attendance_status"),
        ),
    ]

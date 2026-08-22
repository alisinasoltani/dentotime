from datetime import datetime, timedelta, timezone

from django.db import migrations


DOCTOR_SLUGS = (
    "arman-hosseini",
    "nazanin-karimi",
    "sara-moradi",
    "reza-ahmadi",
    "parisa-ebrahimi",
    "milad-sadeghi",
    "leila-rahmani",
    "nima-farhadi",
)

PATIENT_PHONES = (
    "+989121111201",
    "+989121111202",
    "+989121111203",
)


def seed_attended_visits(apps, schema_editor):
    Doctor = apps.get_model("accounts", "Doctor")
    NormalUser = apps.get_model("accounts", "NormalUser")
    Appointment = apps.get_model("appointments", "Appointment")
    AppointmentSlot = apps.get_model("appointments", "AppointmentSlot")

    doctors = {doctor.username: doctor for doctor in Doctor.objects.filter(username__in=DOCTOR_SLUGS)}
    patients = {patient.phone_number: patient for patient in NormalUser.objects.filter(phone_number__in=PATIENT_PHONES)}
    anchor = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)

    for doctor_index, slug in enumerate(DOCTOR_SLUGS):
        doctor = doctors.get(slug)
        if doctor is None:
            continue
        for patient_index, phone in enumerate(PATIENT_PHONES):
            patient = patients.get(phone)
            if patient is None:
                continue
            visit_start = anchor + timedelta(days=doctor_index * 3 + patient_index)
            capacity_index = 300 + doctor_index * 3 + patient_index
            slot, _ = AppointmentSlot.objects.update_or_create(
                start_at=visit_start,
                capacity_index=capacity_index,
                defaults={
                    "date": visit_start.date(),
                    "end_at": visit_start + timedelta(minutes=45),
                    "status": "BOOKED",
                },
            )
            Appointment.objects.update_or_create(
                patient=patient,
                doctor=doctor,
                reason=f"[INITIAL_DATA] attended visit {slug}",
                defaults={
                    "slot": slot,
                    "contact_phone_number": patient.phone_number,
                    "contact_first_name": patient.first_name,
                    "contact_last_name": patient.last_name,
                    "status": "COMPLETED",
                    "attendance_status": "ATTENDED",
                    "attendance_confirmed_at": slot.end_at,
                    "approved_at": slot.start_at - timedelta(days=2),
                },
            )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0016_seed_initial_public_data"),
        ("appointments", "0006_doctor_visit_confirmation"),
    ]

    operations = [
        migrations.RunPython(seed_attended_visits, migrations.RunPython.noop),
    ]

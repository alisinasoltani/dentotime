import django.db.models.deletion
from django.db import migrations, models


def migrate_legacy_documents(apps, schema_editor):
    DoctorDocument = apps.get_model("accounts", "DoctorDocument")
    FileAsset = apps.get_model("core", "FileAsset")
    for document in DoctorDocument.objects.all().iterator(chunk_size=500):
        storage_key = document.file_key or f"legacy/verification/{document.pk}"
        if FileAsset.objects.filter(storage_key=storage_key).exists():
            storage_key = f"legacy/verification/duplicate/{document.pk}"
        asset = FileAsset.objects.create(
            owner_id=document.doctor_id,
            purpose="VERIFICATION_DOCUMENT",
            scope_doctor_id=document.doctor_id,
            original_name=document.file_name or f"document-{document.pk}",
            expected_size=max(1, min(document.file_size or 0, 1024 * 1024 * 1024)),
            claimed_mime=document.file_content_type or "application/octet-stream",
            sha256="0" * 64,
            storage_key=storage_key,
            state="QUARANTINED",
            scan_status="PENDING",
        )
        document.asset_id = asset.pk
        document.save(update_fields=("asset",))


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0010_appointment_claim_otp"),
        ("core", "0002_fileasset_uploadsession_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="doctordocument",
            name="asset",
            field=models.OneToOneField(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="doctor_document",
                to="core.fileasset",
            ),
        ),
        migrations.RunPython(migrate_legacy_documents, migrations.RunPython.noop),
        migrations.RemoveField(model_name="doctordocument", name="file_content_type"),
        migrations.RemoveField(model_name="doctordocument", name="file_key"),
        migrations.RemoveField(model_name="doctordocument", name="file_name"),
        migrations.RemoveField(model_name="doctordocument", name="file_size"),
        migrations.RemoveField(model_name="doctordocument", name="file_url"),
        migrations.AlterField(
            model_name="doctordocument",
            name="asset",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="doctor_document",
                to="core.fileasset",
            ),
        ),
    ]

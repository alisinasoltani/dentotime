from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="DemoState",
            fields=[
                ("id", models.PositiveSmallIntegerField(default=1, primary_key=True, serialize=False)),
                ("version", models.PositiveSmallIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="DemoSMS",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("mobile", models.CharField(max_length=20)),
                ("template_id", models.PositiveIntegerField()),
                ("parameters", models.JSONField(default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
    ]

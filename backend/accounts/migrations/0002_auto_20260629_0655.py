from django.db import migrations
from django.contrib.auth.hashers import make_password

def create_test_doctor(apps, schema_editor):
    Doctor = apps.get_model('accounts', 'Doctor')
    
    phone = '+989010669227'
    password = '13138282!'
    
    if not Doctor.objects.filter(phone_number=phone).exists():
        # Hash the password manually and pass it directly to create()
        Doctor.objects.create(
            phone_number=phone,
            password=make_password(password),
            first_name='سین',
            last_name='جمشیدی',
            role='DOCTOR',
            is_active=True,
            verification_status='NOT_SUBMITTED'
        )

class Migration(migrations.Migration):

    dependencies = [
        # Keep your original dependencies here!
        ('accounts', '0001_initial'), 
    ]

    operations = [
        migrations.RunPython(create_test_doctor),
    ]
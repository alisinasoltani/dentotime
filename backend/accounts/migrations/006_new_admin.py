from django.db import migrations
from django.contrib.auth.hashers import make_password

def create_test_admin_and_user(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    Admin = apps.get_model('accounts', 'Admin')
    NormalUser = apps.get_model('accounts', 'NormalUser')

    # --- 1. Create Admin User ---
    admin_phone = '+989028262592'
    admin_password = 'AdminPass123!'
    
    if not User.objects.filter(phone_number=admin_phone).exists():
        Admin.objects.create(
            phone_number=admin_phone,
            password=make_password(admin_password),
            first_name='محمدرضا',
            last_name='احمدی',
            role='ADMIN',
            is_active=True,
            is_staff=True,
            is_superuser=True
        )

class Migration(migrations.Migration):

    dependencies = [
        # This depends on the doctor migration you just created
        ('accounts', '0005_otpcode'), 
    ]

    operations = [
        migrations.RunPython(create_test_admin_and_user),
    ]
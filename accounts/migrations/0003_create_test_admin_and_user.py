from django.db import migrations
from django.contrib.auth.hashers import make_password

def create_test_admin_and_user(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    Admin = apps.get_model('accounts', 'Admin')
    NormalUser = apps.get_model('accounts', 'NormalUser')

    # --- 1. Create Admin User ---
    admin_phone = '+989138958712'
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

    # --- 2. Create Normal User ---
    user_phone = '+989148721497'
    user_password = 'UserPass123!'
    
    if not User.objects.filter(phone_number=user_phone).exists():
        NormalUser.objects.create(
            phone_number=user_phone,
            password=make_password(user_password),
            first_name='زهرا',
            last_name='محمدی',
            role='USER',
            is_active=True
        )

class Migration(migrations.Migration):

    dependencies = [
        # This depends on the doctor migration you just created
        ('accounts', '0002_auto_20260629_0655'), 
    ]

    operations = [
        migrations.RunPython(create_test_admin_and_user),
    ]
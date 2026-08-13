import os
import django

# Make sure this matches your actual settings module!
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings') 
django.setup()

from accounts.models import Doctor
from accounts.views import get_tokens_for_user

# 1. Define Test Doctor Details
phone = '+989120000000'
password = 'TestPass123!'

# 2. Create or Fetch the Test Doctor safely (with password hashing)
try:
    doctor = Doctor.objects.get(phone_number=phone)
    # Update password and status if it already exists
    doctor.set_password(password)
    doctor.verification_status = 'NOT_SUBMITTED'
    doctor.first_name = 'سینا'
    doctor.last_name = 'موسوی'
    doctor.save()
    print("Existing test doctor updated.")
except Doctor.DoesNotExist:
    # Create new doctor with proper password hashing and MTI table
    doctor = Doctor.objects.create_user(
        phone_number=phone,
        password=password,
        role='DOCTOR',
        first_name='سینا',
        last_name='موسوی'
    )
    print("New test doctor created.")

# Ensure verification status is NOT_SUBMITTED
doctor.verification_status = 'NOT_SUBMITTED'
doctor.is_active = True
doctor.save()

# 3. Generate JWT Tokens WITH custom claims (role/user_type)
tokens = get_tokens_for_user(doctor)

print("="*50)
print("✅ TEST DOCTOR SEEDED SUCCESSFULLY!")
print("="*50)
print(f"User ID: {doctor.id}")
print(f"Name: {doctor.first_name} {doctor.last_name}")
print(f"Role: {doctor.role}")
print(f"Verification Status: {doctor.verification_status}")
print("\nPaste these into your browser's localStorage:")
print(f"access_token: {tokens['access']}")
print(f"refresh_token: {tokens['refresh']}")
print("="*50)
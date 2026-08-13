import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from moto import mock_aws
from accounts.models import Doctor, NormalUser
from core.models import SystemSettings

User = get_user_model()

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def system_settings():
    return SystemSettings.load()

@pytest.fixture
def normal_user(db):
    user = NormalUser.objects.create_user(
        phone_number="+1234567890", password="TestPass123!", role="USER", first_name="Test", last_name="User"
    )
    return user

@pytest.fixture
def doctor_user(db):
    user = Doctor.objects.create_user(
        phone_number="+1234567891", password="TestPass123!", role="DOCTOR", first_name="Doc", last_name="One"
    )
    return user

@pytest.fixture
def admin_user(db):
    user = User.objects.create_user(
        phone_number="+1234567892", password="TestPass123!", role="ADMIN", first_name="Admin", last_name="User"
    )
    return user

@pytest.fixture
def authed_client(api_client, normal_user):
    api_client.force_authenticate(user=normal_user)
    return api_client

@pytest.fixture
def doctor_client(api_client, doctor_user):
    api_client.force_authenticate(user=doctor_user)
    return api_client

@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client

@pytest.fixture
def mock_s3():
    with mock_aws():
        yield
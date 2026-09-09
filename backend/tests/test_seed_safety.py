import pytest
from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command


User = get_user_model()
HISTORICAL_SEED_PHONES = (
    "+989010669227",
    "+989028262592",
    "+989138958712",
    "+989148721497",
)


@pytest.mark.parametrize("environment", ["development", "production"])
@pytest.mark.parametrize(
    "command,options",
    [
        ("seed_rating_demo", {"password": "DemoRating123!"}),
        ("populate_db", {"confirm_destructive": True}),
    ],
)
def test_retired_seeds_offer_cross_platform_setup_without_database_access(
    monkeypatch, environment, command, options
):
    # No django_db marker: even an attempted database query must fail this test.
    monkeypatch.setenv("DJANGO_ENVIRONMENT", environment)
    with pytest.raises(CommandError, match="retired; no data was changed") as error:
        call_command(command, **options)

    message = str(error.value)
    assert "From the host backend/ directory" in message
    assert (
        "\ndocker compose -p dentotime-demo -f docker-compose.demo.yml "
        "up -d --build --wait --wait-timeout 180\n"
    ) in message
    assert "docs/demo.md" in message
    assert "Ubuntu/Bash" in message
    assert "Windows/PowerShell" in message
    assert "Do not use docker-compose.http.yml or .env.server" in message


@pytest.mark.django_db
def test_historical_seed_accounts_are_not_login_capable():
    seeded_accounts = User.objects.filter(phone_number__in=HISTORICAL_SEED_PHONES)

    assert seeded_accounts.filter(is_active=True).count() == 0
    assert seeded_accounts.filter(is_staff=True).count() == 0
    assert seeded_accounts.filter(is_superuser=True).count() == 0
    assert all(not account.has_usable_password() for account in seeded_accounts)


@pytest.mark.django_db
def test_populate_db_refuses_production(monkeypatch):
    monkeypatch.setenv("DJANGO_ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOW_DESTRUCTIVE_SEEDING", "true")
    monkeypatch.setenv("SEED_USER_PASSWORD", "development-only-password")

    with pytest.raises(CommandError, match="retired; no data was changed"):
        call_command("populate_db", confirm_destructive=True)


@pytest.mark.django_db
def test_populate_db_requires_all_explicit_safety_gates(monkeypatch):
    monkeypatch.setenv("DJANGO_ENVIRONMENT", "development")
    monkeypatch.delenv("ALLOW_DESTRUCTIVE_SEEDING", raising=False)
    monkeypatch.setenv("SEED_USER_PASSWORD", "development-only-password")

    with pytest.raises(CommandError, match="retired; no data was changed"):
        call_command("populate_db", confirm_destructive=True)

    monkeypatch.setenv("ALLOW_DESTRUCTIVE_SEEDING", "true")
    with pytest.raises(CommandError, match="retired; no data was changed"):
        call_command("populate_db", confirm_destructive=False)


@pytest.mark.django_db
def test_normal_migrations_create_reference_data_without_fictional_people():
    from accounts.models import DentalService, InsuranceProvider, RatingParameter
    from appointments.models import Appointment

    assert not User.objects.exists()
    assert not Appointment.objects.exists()
    assert DentalService.objects.count() == 12
    assert InsuranceProvider.objects.count() == 12
    assert RatingParameter.objects.filter(is_active=True).count() == 7


@pytest.mark.django_db
def test_release_gate_reports_sample_identity_without_deleting(normal_user):
    normal_user.username = "demo-user-marker"
    normal_user.save()
    with pytest.raises(CommandError, match="Production promotion blocked"):
        call_command("check_demo_data")
    assert User.objects.filter(pk=normal_user.pk).exists()


@pytest.mark.django_db
def test_release_gate_allows_clean_database():
    call_command("check_demo_data")

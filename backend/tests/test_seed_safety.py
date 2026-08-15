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

    with pytest.raises(CommandError, match="disabled outside"):
        call_command("populate_db", confirm_destructive=True)


@pytest.mark.django_db
def test_populate_db_requires_all_explicit_safety_gates(monkeypatch):
    monkeypatch.setenv("DJANGO_ENVIRONMENT", "development")
    monkeypatch.delenv("ALLOW_DESTRUCTIVE_SEEDING", raising=False)
    monkeypatch.setenv("SEED_USER_PASSWORD", "development-only-password")

    with pytest.raises(CommandError, match="ALLOW_DESTRUCTIVE_SEEDING"):
        call_command("populate_db", confirm_destructive=True)

    monkeypatch.setenv("ALLOW_DESTRUCTIVE_SEEDING", "true")
    with pytest.raises(CommandError, match="--confirm-destructive"):
        call_command("populate_db", confirm_destructive=False)

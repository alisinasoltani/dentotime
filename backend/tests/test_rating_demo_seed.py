from io import StringIO

import pytest
from django.core.management import CommandError, call_command


def test_old_rating_command_refuses_even_with_development_override(monkeypatch):
    monkeypatch.setenv("DJANGO_ENVIRONMENT", "development")
    with pytest.raises(CommandError, match="retired; no data was changed"):
        call_command("seed_rating_demo", password="DemoRating123!", stdout=StringIO())

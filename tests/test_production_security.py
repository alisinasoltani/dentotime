import logging

from django.conf import settings
from django.test import Client

from core.logging import RedactSensitiveDataFilter


def test_sensitive_log_values_are_redacted():
    record = logging.LogRecord(
        name="security-test",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg="password=hunter2 otp_code=12345 Authorization: Bearer signed.jwt.value",
        args=(),
        exc_info=None,
    )

    assert RedactSensitiveDataFilter().filter(record)
    rendered = record.getMessage()
    assert "hunter2" not in rendered
    assert "12345" not in rendered
    assert "signed.jwt.value" not in rendered
    assert rendered.count("[REDACTED]") == 3


def test_security_headers_are_applied_to_api_responses():
    response = Client().get("/api/v1/doctors/public/")

    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["Cross-Origin-Resource-Policy"] == "same-site"
    assert "camera=()" in response.headers["Permissions-Policy"]
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]


def test_profiling_is_disabled_by_default():
    assert settings.ENABLE_SILK is False
    assert "silk" not in settings.INSTALLED_APPS

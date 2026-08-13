"""Logging helpers that prevent secrets from reaching configured handlers."""

import logging
import re


REDACTED = "[REDACTED]"
SENSITIVE_ASSIGNMENT = re.compile(
    r"(?i)(\b(?:password|password_confirm|otp|otp_code|token|refresh|access|"
    r"authorization|api[_-]?key|secret[_-]?key|signature)\b\s*[=:]\s*)"
    r"(?:Bearer\s+)?([^\s,;&]+)"
)
BEARER_TOKEN = re.compile(r"(?i)(\bBearer\s+)[A-Za-z0-9._~+/=-]+")


def redact_sensitive_text(value: object) -> str:
    text = str(value)
    text = SENSITIVE_ASSIGNMENT.sub(rf"\1{REDACTED}", text)
    return BEARER_TOKEN.sub(rf"\1{REDACTED}", text)


class RedactSensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact_sensitive_text(record.getMessage())
        record.args = ()
        return True

import phonenumbers
from django.core.exceptions import ValidationError

def normalize_phone_number(value: str) -> str:
    """Validate and return a phone number in canonical E.164 form."""
    try:
        parsed = phonenumbers.parse(str(value).strip(), None)
        if not phonenumbers.is_valid_number(parsed):
            raise ValidationError("Invalid phone number.")
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException as exc:
        raise ValidationError("Invalid phone number format.") from exc


def validate_e164_phone(value):
    normalize_phone_number(value)

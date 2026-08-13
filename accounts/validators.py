import phonenumbers
from django.core.exceptions import ValidationError

def validate_e164_phone(value):
    try:
        parsed = phonenumbers.parse(value, None)
        if not phonenumbers.is_valid_number(parsed):
            raise ValidationError("Invalid phone number.")
    except phonenumbers.NumberParseException:
        raise ValidationError("Invalid phone number format.")
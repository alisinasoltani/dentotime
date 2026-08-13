"""SMS delivery helpers with bounded I/O and redacted logging."""

import logging
from concurrent.futures import ThreadPoolExecutor

import requests
from django.conf import settings


logger = logging.getLogger(__name__)
_sms_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="sms-delivery")


def normalize_mobile(mobile):
    mobile = str(mobile).strip()
    if mobile.startswith("+98"):
        return mobile[3:]
    if mobile.startswith("09"):
        return mobile[1:]
    if mobile.startswith("98"):
        return mobile[2:]
    return mobile


def _masked_mobile(mobile: str) -> str:
    normalized = normalize_mobile(mobile)
    return f"***{normalized[-4:]}" if len(normalized) >= 4 else "***"


def send_sms(mobile, template_id, parameters):
    """Send one SMS with strict connect/read timeouts and no sensitive logs."""
    payload = {
        "mobile": normalize_mobile(mobile),
        "templateId": template_id,
        "parameters": parameters,
    }
    headers = {
        "x-api-key": settings.SMS_IR_API_KEY,
        "accept": "application/json",
        "content-type": "application/json",
    }
    try:
        response = requests.post(
            "https://api.sms.ir/v1/send/verify",
            json=payload,
            headers=headers,
            timeout=(settings.SMS_CONNECT_TIMEOUT_SECONDS, settings.SMS_READ_TIMEOUT_SECONDS),
        )
        response.raise_for_status()
        logger.info("SMS delivered to %s using template %s", _masked_mobile(mobile), template_id)
        return True
    except requests.RequestException as exc:
        logger.warning(
            "SMS delivery failed for %s using template %s: %s",
            _masked_mobile(mobile),
            template_id,
            type(exc).__name__,
        )
        return False


def queue_otp_sms(mobile, code):
    """Dispatch an OTP outside the request and database transaction."""
    return _sms_executor.submit(
        send_sms,
        mobile,
        288919,
        [{"name": "Code", "value": code}],
    )


def queue_admin_alert(mobile, type_name):
    return _sms_executor.submit(send_admin_alert, mobile, type_name)


def queue_appt_approved(mobile, date, time):
    return _sms_executor.submit(send_appt_approved, mobile, date, time)


def queue_appt_rejected(mobile, date):
    return _sms_executor.submit(send_appt_rejected, mobile, date)


def queue_new_message(mobile, time):
    """Dispatch message notifications without holding the request worker."""
    return _sms_executor.submit(send_new_message, mobile, time)


def send_otp(mobile, code):
    return send_sms(mobile, 288919, [{"name": "Code", "value": code}])


def send_appt_approved(mobile, date, time):
    return send_sms(mobile, 738318, [{"name": "Date", "value": date}, {"name": "Time", "value": time}])


def send_appt_rejected(mobile, date):
    return send_sms(mobile, 248951, [{"name": "Date", "value": date}])


def send_doctor_approved(mobile, date):
    return send_sms(mobile, 536300, [{"name": "Date", "value": date}])


def send_doctor_rejected(mobile, reason):
    return send_sms(mobile, 759971, [{"name": "Reason", "value": reason}])


def send_new_message(mobile, time):
    return send_sms(mobile, 188486, [{"name": "Time", "value": time}])


def send_admin_alert(mobile, type_name):
    return send_sms(mobile, 848559, [{"name": "Type", "value": type_name}])

import requests
from django.conf import settings

def normalize_mobile(mobile):
    """
    SMS.ir expects the mobile number without +98 or 0 at the beginning.
    e.g., +989123456789 -> 9123456789
    """
    mobile = str(mobile).strip()
    if mobile.startswith("+98"):
        return mobile[3:]
    elif mobile.startswith("09"):
        return mobile[1:]
    elif mobile.startswith("98"):
        return mobile[2:]
    return mobile

def send_sms(mobile, template_id, parameters):
    # اصلاح فرمت شماره موبایل
    normalized_mobile = normalize_mobile(mobile)
    
    # هدرها دقیقاً مطابق مستندات SMS.ir
    headers = {
        "x-api-key": settings.SMS_IR_API_KEY,
        "accept": "application/json",
        "content-type": "application/json"
    }
    payload = {
        "mobile": normalized_mobile,
        "templateId": template_id,
        "parameters": parameters
    }
    
    try:
        response = requests.post("https://api.sms.ir/v1/send/verify", json=payload, headers=headers)
        # چاپ پاسخ سرور پیامک برای دیباگ در ترمینال جنگو
        if response.status_code != 200:
            print(f"--- SMS Error ---")
            print(f"Status: {response.status_code}")
            print(f"Response: {response.text}")
            print(f"Payload sent: {payload}")
            print("-----------------")
        else:
            print(f"SMS sent successfully to {normalized_mobile} using template {template_id}")
    except Exception as e:
        print(f"SMS Network Error: {e}")

# توابع کمکی (بدون تغییر در منطق، فقط فراخوانی تابع بالا)
def send_otp(mobile, code):
    send_sms(mobile, 288919, [{"name": "Code", "value": code}])

def send_appt_approved(mobile, date, time):
    send_sms(mobile, 738318, [{"name": "Date", "value": date}, {"name": "Time", "value": time}])

def send_appt_rejected(mobile, date):
    send_sms(mobile, 248951, [{"name": "Date", "value": date}])

def send_doctor_approved(mobile, date):
    send_sms(mobile, 536300, [{"name": "Date", "value": date}])

def send_doctor_rejected(mobile, reason):
    send_sms(mobile, 759971, [{"name": "Reason", "value": reason}])

def send_new_message(mobile, time):
    send_sms(mobile, 188486, [{"name": "Time", "value": time}])

def send_admin_alert(mobile, type_name):
    send_sms(mobile, 848559, [{"name": "Type", "value": type_name}])
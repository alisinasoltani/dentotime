from demo.guard import require_demo
from demo.models import DemoSMS


def capture_sms(mobile, template_id, parameters):
    require_demo()
    DemoSMS.objects.create(mobile=str(mobile), template_id=template_id, parameters=parameters)
    # Keep the local OTP inbox bounded. Never publish codes in application logs or APIs.
    keep = DemoSMS.objects.order_by("-pk").values_list("pk", flat=True)[:100]
    DemoSMS.objects.exclude(pk__in=list(keep)).delete()
    return True

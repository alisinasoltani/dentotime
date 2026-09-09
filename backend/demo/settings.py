"""Explicit settings for the isolated local demonstration stack."""

from django.core.exceptions import ImproperlyConfigured

from config.settings import *  # noqa: F403

if IS_PRODUCTION or DJANGO_ENVIRONMENT not in {"development", "test"}:
    raise ImproperlyConfigured("Demo settings cannot run in production.")
if DATABASES["default"]["NAME"] != "dentotime_demo":
    raise ImproperlyConfigured("Demo settings require the dedicated dentotime_demo database.")
if DATABASES["default"]["HOST"] != "demo-postgres":
    raise ImproperlyConfigured("Demo settings require the isolated demo-postgres service.")
if AWS_STORAGE_BUCKET_NAME != "dentotime-demo":
    raise ImproperlyConfigured("Demo settings require the dedicated dentotime-demo bucket.")

DEMO_MODE = True
REFRESH_COOKIE_NAME = "dentotime_demo_refresh"  # Cookies share a hostname across ports.
INSTALLED_APPS = [*INSTALLED_APPS, "demo"]
SMS_IR_API_KEY = ""  # SMS is captured by demo.sms; no provider request is made.

from django.db import models


class DemoState(models.Model):
    """A completed baseline; normal starts never reset presentation changes."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1)
    version = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)


class DemoSMS(models.Model):
    mobile = models.CharField(max_length=20)
    template_id = models.PositiveIntegerField()
    parameters = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

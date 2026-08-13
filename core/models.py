from django.core.cache import cache
from django.db import models

class SystemSettings(models.Model):
    cancellation_enabled = models.BooleanField(default=True)
    cancellation_cutoff_hours = models.PositiveIntegerField(default=24)
    doctor_attachment_max_size_mb = models.PositiveIntegerField(default=1024)

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        "accounts.User", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="system_settings_changes"
    )

    class Meta:
        verbose_name = "System Settings"
        verbose_name_plural = "System Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
        cache.delete('system_settings')

    def delete(self, *args, **kwargs):
        pass

    @classmethod
    def load(cls):
        obj = cache.get('system_settings')
        if obj is None:
            obj, _ = cls.objects.get_or_create(pk=1)
            cache.set('system_settings', obj, timeout=300)
        return obj
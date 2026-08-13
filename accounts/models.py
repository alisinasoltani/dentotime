import uuid
import hashlib
import hmac
import phonenumbers
from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from .validators import validate_e164_phone

# ──────────────────────────────────────────────────────────────────────────────
# Base User
# ──────────────────────────────────────────────────────────────────────────────
class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, phone_number, password, **extra_fields):
        if not phone_number:
            raise ValueError("Phone number is required")
        
        try:
            parsed = phonenumbers.parse(phone_number, None)
            phone_number = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        except phonenumbers.NumberParseException:
            pass

        user = self.model(phone_number=phone_number, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, phone_number, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        if "role" not in extra_fields:
            raise ValueError("Role is required to create a user")
        return self._create_user(phone_number, password, **extra_fields)

    def create_superuser(self, phone_number, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(phone_number, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        USER = "USER", "User"
        DOCTOR = "DOCTOR", "Doctor"
        ADMIN = "ADMIN", "Admin"

    phone_number = models.CharField(max_length=20, unique=True, validators=[validate_e164_phone])
    username = models.CharField(max_length=150, blank=True, null=True, unique=True)
    email = models.EmailField(blank=True, null=True, unique=True)
    first_name = models.CharField(max_length=150, blank=True, default="")
    last_name = models.CharField(max_length=150, blank=True, default="")

    role = models.CharField(max_length=10, choices=Role.choices, db_index=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    profile_picture = models.URLField(blank=True, null=True)

    date_joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)
    auth_version = models.PositiveIntegerField(default=1, editable=False)

    objects = UserManager()

    USERNAME_FIELD = "phone_number"
    REQUIRED_FIELDS = []  # role is set automatically by create_superuser

    class Meta:
        indexes = [
            models.Index(fields=["role", "date_joined"]),
            models.Index(fields=["username"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        return f"{self.phone_number} ({self.role})"
    
    def save(self, *args, **kwargs):
        # Security Rule 1: Only ADMIN role users can be staff or superusers
        if self.role != self.Role.ADMIN:
            self.is_staff = False
            self.is_superuser = False
        
        # Security Rule 2: If they ARE an admin, ensure they can access the Django admin panel
        # (Optional, but useful so admins don't get locked out of /admin/)
        if self.role == self.Role.ADMIN:
            self.is_staff = True
            
        super().save(*args, **kwargs)

    @property
    def is_normal_user(self): return self.role == self.Role.USER
    @property
    def is_doctor_role(self): return self.role == self.Role.DOCTOR
    @property
    def is_admin_role(self): return self.role == self.Role.ADMIN

    @property
    def normal_user_profile(self): return getattr(self, "normaluser", None)
    @property
    def doctor_profile(self): return getattr(self, "doctor", None)
    @property
    def admin_profile(self): return getattr(self, "admin", None)


class NormalUser(User):
    class Meta:
        verbose_name = "Normal User"
        verbose_name_plural = "Normal Users"


class Doctor(User):
    class AccountOwner(models.TextChoices):
        DOCTOR = "DOCTOR", "Doctor"
        ASSISTANT = "ASSISTANT", "Assistant"
        CLINIC = "CLINIC", "Clinic / Health Center"

    class VerificationStatus(models.TextChoices):
        NOT_SUBMITTED = "NOT_SUBMITTED", "Not Submitted"
        PENDING = "PENDING", "Pending Review"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    account_owner = models.CharField(max_length=20, choices=AccountOwner.choices, null=True, blank=True)
    agreed_to_terms = models.BooleanField(default=False)
    terms_accepted_at = models.DateTimeField(null=True, blank=True)

    supervising_doctor_name = models.CharField(max_length=255, null=True, blank=True)
    clinic_name = models.CharField(max_length=255, null=True, blank=True)

    id_number = models.CharField(max_length=50, null=True, blank=True)
    medical_registration_number = models.CharField(max_length=100, null=True, blank=True)

    verification_status = models.CharField(max_length=20, choices=VerificationStatus.choices, default=VerificationStatus.NOT_SUBMITTED, db_index=True)
    verification_submitted_at = models.DateTimeField(null=True, blank=True)
    verification_reviewed_at = models.DateTimeField(null=True, blank=True)
    verification_reviewer = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="reviewed_doctor_applications")
    
    rejection_note = models.TextField(blank=True, default="")
    internal_admin_notes = models.TextField(blank=True, default="")

    likes = models.ManyToManyField("accounts.User", blank=True, related_name='liked_doctors')

    class Meta:
        verbose_name = "Doctor"
        verbose_name_plural = "Doctors"
        indexes = [models.Index(fields=["verification_status"])]
        
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Store the initial medical registration number when the object is loaded
        self.__initial_medical_registration_number = self.medical_registration_number
        
    def save(self, *args, **kwargs):
        # Security Rule: If a doctor is edited after being rejected, 
        # and they changed their medical_registration_number, 
        # force them to go through the verification process again.
        if self.verification_status == self.VerificationStatus.REJECTED:
            if self.medical_registration_number != self.__initial_medical_registration_number:
                self.verification_status = self.VerificationStatus.NOT_SUBMITTED
        
        super().save(*args, **kwargs)

    @property
    def display_name(self):
        if self.account_owner == self.AccountOwner.CLINIC and self.clinic_name:
            return self.clinic_name
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_verified(self):
        return self.verification_status == self.VerificationStatus.APPROVED

    @property
    def chat_enabled(self):
        return self.is_verified and self.is_active


class DoctorDocument(models.Model):
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="documents")
    
    file_url = models.URLField()
    file_key = models.CharField(max_length=500)
    file_name = models.CharField(max_length=255)
    file_size = models.BigIntegerField()
    file_content_type = models.CharField(max_length=100, blank=True, default="")
    
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        # Local import to prevent circular dependency
        from core.models import SystemSettings
        settings = SystemSettings.load()
        max_size = settings.doctor_attachment_max_size_mb * 1024 * 1024
        if self.file_size > max_size:
            raise ValidationError({"file_size": f"File exceeds max size of {settings.doctor_attachment_max_size_mb}MB."})


class Admin(User):
    class Meta:
        verbose_name = "Admin"
        verbose_name_plural = "Admins"
        
class OTPChallenge(models.Model):
    class Purpose(models.TextChoices):
        SIGNUP = "SIGNUP", "Signup"
        PASSWORD_RESET = "PASSWORD_RESET", "Password reset"
        APPOINTMENT_CLAIM = "APPOINTMENT_CLAIM", "Appointment claim"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone_number = models.CharField(max_length=20, validators=[validate_e164_phone])
    purpose = models.CharField(max_length=24, choices=Purpose.choices)
    code_digest = models.CharField(max_length=64, editable=False)
    expires_at = models.DateTimeField()
    attempt_count = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=5)
    requested_ip = models.GenericIPAddressField(null=True, blank=True)
    device_hash = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["phone_number", "purpose", "-created_at"]),
            models.Index(
                fields=["expires_at"],
                condition=models.Q(consumed_at__isnull=True),
                name="otp_unconsumed_expiry_idx",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["phone_number", "purpose"],
                condition=models.Q(consumed_at__isnull=True),
                name="one_unconsumed_otp_per_phone_purpose",
            ),
            models.CheckConstraint(
                condition=models.Q(max_attempts__gt=0),
                name="otp_max_attempts_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(attempt_count__lte=models.F("max_attempts")),
                name="otp_attempts_within_limit",
            ),
        ]

    def set_code(self, code: str) -> None:
        message = f"{self.pk}:{self.phone_number}:{self.purpose}:{code}".encode()
        self.code_digest = hmac.new(
            settings.OTP_HASH_KEY.encode(), message, hashlib.sha256
        ).hexdigest()

    def code_matches(self, code: str) -> bool:
        message = f"{self.pk}:{self.phone_number}:{self.purpose}:{code}".encode()
        candidate = hmac.new(
            settings.OTP_HASH_KEY.encode(), message, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(self.code_digest, candidate)

    def is_valid(self):
        return bool(
            self.consumed_at is None
            and self.verified_at is None
            and self.attempt_count < self.max_attempts
            and timezone.now() < self.expires_at
        )

class DoctorReview(models.Model):
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name='doctor_reviews')
    rating = models.PositiveIntegerField(default=5) # امتیاز ۱ تا ۵
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        # یک کاربر فقط یک بار بتواند برای یک دکتر نظر بدهد
        unique_together = ('doctor', 'user') 

    def __str__(self):
        return f"Review by {self.user.phone_number} on {self.doctor.phone_number}"

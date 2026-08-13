"""Serializers for the accounts application."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from django.db.models import Count

from core.assets import AssetBindingError, lock_attachable_asset
from core.models import FileAsset
from .models import NormalUser, Doctor, DoctorReview, DoctorDocument, User, OTPChallenge
from .otp import consume_grant
from .validators import normalize_phone_number, validate_e164_phone

User = get_user_model()


class SignupSerializer(serializers.Serializer):
    """Register a new patient or doctor after a one-time signup grant."""

    USER_TYPE_CHOICES = (("USER", "Normal User"), ("DOCTOR", "Doctor"))

    user_type = serializers.ChoiceField(choices=USER_TYPE_CHOICES)
    phone_number = serializers.CharField(validators=[validate_e164_phone])
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150, required=True)
    last_name = serializers.CharField(max_length=150, required=True)
    otp_token = serializers.CharField(write_only=True)

    def validate(self, attrs: dict) -> dict:
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password": "Passwords do not match."})
        attrs["phone_number"] = normalize_phone_number(attrs["phone_number"])
        return attrs

    @transaction.atomic
    def create(self, validated_data: dict):
        user_type = validated_data.pop("user_type")
        phone = validated_data.pop("phone_number")
        password = validated_data.pop("password")
        otp_token = validated_data.pop("otp_token")
        model_class = NormalUser if user_type == "USER" else Doctor

        if User.objects.select_for_update().filter(phone_number=phone).exists():
            raise serializers.ValidationError({"detail": "Unable to create this account."})
        try:
            consume_grant(
                token=otp_token,
                raw_phone=phone,
                purpose=OTPChallenge.Purpose.SIGNUP,
            )
        except ValueError as exc:
            raise serializers.ValidationError({"otp_token": str(exc)}) from exc
        user = model_class.objects.create_user(
            phone_number=phone,
            password=password,
            role=user_type,
            **validated_data,
        )
        if user_type == "USER":
            from appointments.services import claim_guest_appointments

            claim_guest_appointments(patient=user)
        return user

class UserDetailSerializer(serializers.ModelSerializer):
    """Read-only serializer for returning user info."""
    class Meta:
        model = User
        fields = ("id", "phone_number", "role", "first_name", "last_name", "username", "is_active")


class LoginSerializer(serializers.Serializer):
    """Serializer for user login credentials."""
    
    USER_TYPE_CHOICES = (
        ("USER", "Normal User"),
        ("DOCTOR", "Doctor"),
        ("ADMIN", "Admin"),
    )

    phone_number = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)
    user_type = serializers.ChoiceField(choices=USER_TYPE_CHOICES, required=True)

    def validate_phone_number(self, value):
        return normalize_phone_number(value)


class TokenResponseSerializer(serializers.Serializer):
    """Serializer for the JWT token response (for documentation)."""
    access = serializers.CharField()
    user = UserDetailSerializer()


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for users/doctors to view and update their own profile."""
    class Meta:
        model = User
        fields = (
            "id", "phone_number", "role", "first_name", "last_name", 
            "username", "email", "profile_picture", "is_active", "date_joined"
        )
        read_only_fields = ("id", "phone_number", "role", "is_active", "date_joined")

    def validate_username(self, value):
        # Prevent IntegrityError if username is already taken
        if User.objects.filter(username=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("Username already taken.")
        return value


class PasswordChangeSerializer(serializers.Serializer):
    """Serializer for changing user password."""
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class DoctorDocumentSerializer(serializers.ModelSerializer):
    """Serializer for doctor verification documents."""

    asset_id = serializers.UUIDField(source="asset.id", read_only=True)
    file_name = serializers.CharField(source="asset.original_name", read_only=True)
    file_size = serializers.IntegerField(source="asset.expected_size", read_only=True)
    file_content_type = serializers.CharField(source="asset.claimed_mime", read_only=True)
    state = serializers.CharField(source="asset.state", read_only=True)
    scan_status = serializers.CharField(source="asset.scan_status", read_only=True)

    class Meta:
        model = DoctorDocument
        fields = (
            "id",
            "asset_id",
            "file_name",
            "file_size",
            "file_content_type",
            "state",
            "scan_status",
            "uploaded_at",
        )
        read_only_fields = fields

class AdminUserListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for admin user lists."""
    class Meta:
        model = NormalUser
        fields = ("id", "phone_number", "username", "first_name", "last_name", "is_active", "date_joined")


class AdminDoctorListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for admin doctor lists."""
    average_rating = serializers.FloatField(read_only=True)
    vote_count = serializers.IntegerField(read_only=True)
    class Meta:
        model = Doctor
        fields = (
            "id", "phone_number", "username", "first_name", "last_name", 
            "is_active", "verification_status", "account_owner", "date_joined",
            "verification_submitted_at", "verification_reviewed_at",
            "average_rating", "vote_count"
        )


class AdminDoctorDetailSerializer(AdminDoctorListSerializer):
    documents = DoctorDocumentSerializer(many=True, read_only=True)

    class Meta(AdminDoctorListSerializer.Meta):
        fields = (*AdminDoctorListSerializer.Meta.fields, "documents")


class DoctorVerificationStatusSerializer(serializers.ModelSerializer):
    """Serializer for doctors to view their verification status."""
    documents = DoctorDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = Doctor
        fields = (
            "verification_status", "account_owner", "id_number", "medical_registration_number",
            "supervising_doctor_name", "clinic_name", "rejection_note", "documents", "agreed_to_terms"
        )


class DoctorVerificationSubmitSerializer(serializers.ModelSerializer):
    """Serializer for doctors submitting their verification application."""
    asset_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        max_length=10,
        write_only=True,
    )
    
    # Add first_name and last_name so the frontend can update them in the same request
    first_name = serializers.CharField(max_length=150, required=True)
    last_name = serializers.CharField(max_length=150, required=True)

    class Meta:
        model = Doctor
        fields = (
            "first_name", "last_name", # <--- ADDED
            "account_owner", "agreed_to_terms", "id_number", "medical_registration_number",
            "supervising_doctor_name", "clinic_name", "asset_ids"
        )

    def to_internal_value(self, data):
        if "documents" in data or "file_url" in data or "file_key" in data:
            raise serializers.ValidationError(
                {"asset_ids": "Submit server-issued asset IDs, not file URLs or storage keys."}
            )
        return super().to_internal_value(data)

    def validate(self, attrs):
        ao = attrs.get("account_owner")
        if ao == Doctor.AccountOwner.ASSISTANT and not attrs.get("supervising_doctor_name"):
            raise serializers.ValidationError({"supervising_doctor_name": "وارد کردن نام پزشک سرپرست الزامی است."})
        if ao == Doctor.AccountOwner.CLINIC and not attrs.get("clinic_name"):
            raise serializers.ValidationError({"clinic_name": "وارد کردن نام کلینیک الزامی است."})
        if not attrs.get("agreed_to_terms"):
            raise serializers.ValidationError({"agreed_to_terms": "پذیرش قوانین الزامی است."})
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        asset_ids = validated_data.pop("asset_ids")
        
        # Update User profile fields (first_name, last_name)
        instance.first_name = validated_data.get("first_name", instance.first_name)
        instance.last_name = validated_data.get("last_name", instance.last_name)
        
        instance.account_owner = validated_data.get("account_owner", instance.account_owner)
        instance.agreed_to_terms = validated_data.get("agreed_to_terms", instance.agreed_to_terms)
        instance.id_number = validated_data.get("id_number", instance.id_number)
        instance.medical_registration_number = validated_data.get("medical_registration_number", instance.medical_registration_number)
        instance.supervising_doctor_name = validated_data.get("supervising_doctor_name", instance.supervising_doctor_name)
        instance.clinic_name = validated_data.get("clinic_name", instance.clinic_name)
        
        instance.verification_status = Doctor.VerificationStatus.PENDING
        instance.verification_submitted_at = timezone.now()
        instance.rejection_note = "" 
        instance.save()

        try:
            assets = [
                lock_attachable_asset(
                    asset_id=asset_id,
                    owner=instance,
                    purpose=FileAsset.Purpose.VERIFICATION_DOCUMENT,
                    doctor=instance,
                )
                for asset_id in asset_ids
            ]
        except AssetBindingError as exc:
            raise serializers.ValidationError({"asset_ids": str(exc)}) from exc

        for asset in assets:
            document = DoctorDocument(doctor=instance, asset=asset)
            document.full_clean()
            document.save()
            
        return instance

class StrictRatingField(serializers.IntegerField):
    def to_internal_value(self, data):
        if isinstance(data, bool) or not isinstance(data, int):
            self.fail("invalid")
        return super().to_internal_value(data)


class DoctorReviewSerializer(serializers.ModelSerializer):
    rating = StrictRatingField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=2000, trim_whitespace=True)
    reviewer_display_name = serializers.SerializerMethodField()

    def get_reviewer_display_name(self, obj):
        first_name = obj.user.first_name.strip()
        last_initial = obj.user.last_name.strip()[:1]
        if first_name and last_initial:
            return f"{first_name} {last_initial}."
        return first_name or "Patient"

    class Meta:
        model = DoctorReview
        fields = ("id", "reviewer_display_name", "rating", "comment", "created_at", "updated_at")
        read_only_fields = ("id", "reviewer_display_name", "created_at", "updated_at")


class RatingVoterSerializer(serializers.ModelSerializer):
    voter = serializers.SerializerMethodField()

    def get_voter(self, obj):
        return {
            "id": obj.user_id,
            "first_name": obj.user.first_name,
            "last_name": obj.user.last_name,
        }

    class Meta:
        model = DoctorReview
        fields = ("id", "voter", "rating", "comment", "created_at", "updated_at")

class PublicDoctorListSerializer(serializers.ModelSerializer):
    """سریالایزر عمومی برای نمایش لیست دکترها در سایت"""
    likes_count = serializers.IntegerField(read_only=True)
    vote_count = serializers.IntegerField(read_only=True)
    average_rating = serializers.FloatField(read_only=True)
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Doctor
        fields = (
            "id", "first_name", "last_name", "display_name", "clinic_name",
            "profile_picture", "likes_count", "average_rating", "vote_count",
        )

class PublicDoctorDetailSerializer(serializers.ModelSerializer):
    """سریالایزر عمومی برای نمایش اطلاعات کامل یک دکتر + نظرات"""
    likes_count = serializers.IntegerField(read_only=True)
    vote_count = serializers.IntegerField(read_only=True)
    average_rating = serializers.FloatField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = (
            "id", "first_name", "last_name", "display_name", "clinic_name",
            "profile_picture", "likes_count", "is_liked", "average_rating", "vote_count",
        )

    def get_is_liked(self, obj):
        # بررسی اینکه آیا کاربر فعلی این دکتر را لایک کرده است یا خیر
        request = self.context.get('request')
        return bool(getattr(obj, "is_liked", False))

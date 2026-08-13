"""Serializers for the accounts application."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from django.db.models import Count

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
        return model_class.objects.create_user(
            phone_number=phone,
            password=password,
            role=user_type,
            **validated_data,
        )

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
    class Meta:
        model = DoctorDocument
        fields = ("id", "file_url", "file_key", "file_name", "file_size", "file_content_type", "uploaded_at")
        read_only_fields = ("uploaded_at",)

class AdminUserListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for admin user lists."""
    class Meta:
        model = NormalUser
        fields = ("id", "phone_number", "username", "first_name", "last_name", "is_active", "date_joined")


class AdminDoctorListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for admin doctor lists."""
    documents = DoctorDocumentSerializer(many=True, read_only=True)
    class Meta:
        model = Doctor
        fields = (
            "id", "phone_number", "username", "first_name", "last_name", 
            "is_active", "verification_status", "account_owner", "date_joined",
            "documents"
        )


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
    documents = DoctorDocumentSerializer(many=True)
    
    # Add first_name and last_name so the frontend can update them in the same request
    first_name = serializers.CharField(max_length=150, required=True)
    last_name = serializers.CharField(max_length=150, required=True)

    class Meta:
        model = Doctor
        fields = (
            "first_name", "last_name", # <--- ADDED
            "account_owner", "agreed_to_terms", "id_number", "medical_registration_number",
            "supervising_doctor_name", "clinic_name", "documents"
        )

    def validate(self, attrs):
        ao = attrs.get("account_owner")
        if ao == Doctor.AccountOwner.ASSISTANT and not attrs.get("supervising_doctor_name"):
            raise serializers.ValidationError({"supervising_doctor_name": "وارد کردن نام پزشک سرپرست الزامی است."})
        if ao == Doctor.AccountOwner.CLINIC and not attrs.get("clinic_name"):
            raise serializers.ValidationError({"clinic_name": "وارد کردن نام کلینیک الزامی است."})
        if not attrs.get("agreed_to_terms"):
            raise serializers.ValidationError({"agreed_to_terms": "پذیرش قوانین الزامی است."})
        if not attrs.get("documents"):
            raise serializers.ValidationError({"documents": "بارگذاری حداقل یک مدرک الزامی است."})
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        docs_data = validated_data.pop("documents", [])
        
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

        for doc_data in docs_data:
            DoctorDocument.objects.create(doctor=instance, **doc_data)
            
        return instance

class DoctorReviewSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.first_name', read_only=True)
    user_last_name = serializers.CharField(source='user.last_name', read_only=True)

    class Meta:
        model = DoctorReview
        fields = ('id', 'user_name', 'user_last_name', 'rating', 'comment', 'created_at')
        read_only_fields = ('user', 'doctor')

class PublicDoctorListSerializer(serializers.ModelSerializer):
    """سریالایزر عمومی برای نمایش لیست دکترها در سایت"""
    likes_count = serializers.IntegerField(read_only=True)
    reviews_count = serializers.IntegerField(read_only=True)
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = Doctor
        fields = ('id', 'display_name', 'clinic_name', 'profile_picture', 'likes_count', 'reviews_count')

class PublicDoctorDetailSerializer(serializers.ModelSerializer):
    """سریالایزر عمومی برای نمایش اطلاعات کامل یک دکتر + نظرات"""
    likes_count = serializers.IntegerField(read_only=True)
    reviews = DoctorReviewSerializer(many=True, read_only=True)
    display_name = serializers.CharField(read_only=True)
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = ('id', 'display_name', 'clinic_name', 'profile_picture', 'likes_count', 'is_liked', 'reviews')

    def get_is_liked(self, obj):
        # بررسی اینکه آیا کاربر فعلی این دکتر را لایک کرده است یا خیر
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.likes.filter(id=request.user.id).exists()
        return False

"""Serializers for the accounts application."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.cache import cache
from django.db.models import Count

from .models import NormalUser, Doctor, DoctorReview, DoctorDocument, User, OTPCode
from .validators import validate_e164_phone

User = get_user_model()


class SignupSerializer(serializers.Serializer):
    """Serializer for user/doctor registration."""
    
    USER_TYPE_CHOICES = (
        ("USER", "Normal User"),
        ("DOCTOR", "Doctor"),
    )

    user_type = serializers.ChoiceField(choices=USER_TYPE_CHOICES)
    phone_number = serializers.CharField(validators=[validate_e164_phone])
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password_confirm = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150, required=True)
    last_name = serializers.CharField(max_length=150, required=True)
    otp_code = serializers.CharField(max_length=5, required=False)

    def validate(self, attrs: dict) -> dict:
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password": "Passwords do not match."})
            
        phone = attrs.get("phone_number")
        otp_code = attrs.get("otp_code")
        
        otp_obj = OTPCode.objects.filter(phone_number=phone).order_by('-created_at').first()
        
        if otp_code:
            if not otp_obj or otp_obj.code != str(otp_code):
                raise serializers.ValidationError({"otp_code": "کد تایید اشتباه است."})
        elif not otp_obj or not otp_obj.is_verified:
            raise serializers.ValidationError({"detail": "شماره موبایل تایید نشده است."})
            
        return attrs

    def create(self, validated_data: dict):
        user_type = validated_data.pop("user_type")
        phone = validated_data.pop("phone_number")
        password = validated_data.pop("password")
        
        if user_type == "USER":
            ModelClass = NormalUser
            role = "USER"
        elif user_type == "DOCTOR":
            ModelClass = Doctor
            role = "DOCTOR"
        else:
            raise serializers.ValidationError({"user_type": "Invalid user type."})

        user = ModelClass.objects.filter(phone_number=phone).first()
        
        if user:
            user.set_password(password)
            user.first_name = validated_data.get("first_name", user.first_name)
            user.last_name = validated_data.get("last_name", user.last_name)
            user.role = role
            user.is_active = True  # <--- این خط اضافه شود تا کاربران غیرفعال مجدداً فعال شوند
            user.save()
            return user
        else:
            return ModelClass.objects.create_user(
                phone_number=phone,
                password=password,
                role=role,
                **validated_data
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


class TokenResponseSerializer(serializers.Serializer):
    """Serializer for the JWT token response (for documentation)."""
    access = serializers.CharField()
    refresh = serializers.CharField()
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
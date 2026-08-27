"""Serializers for the accounts application."""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from django.db.models import Count

from core.assets import AssetBindingError, lock_attachable_asset
from core.models import FileAsset
from .models import (
    DentalService,
    Doctor,
    DoctorDocument,
    DoctorReview,
    DoctorReviewAnswer,
    InsuranceProvider,
    NormalUser,
    OTPChallenge,
    RatingParameter,
    User,
)
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
    """Serializer for changing a password after an old-password or OTP check."""
    old_password = serializers.CharField(required=False, allow_blank=False, write_only=True)
    otp_token = serializers.CharField(required=False, allow_blank=False, write_only=True)
    new_password = serializers.CharField(required=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        has_old_password = bool(attrs.get("old_password"))
        has_otp_token = bool(attrs.get("otp_token"))
        if has_old_password == has_otp_token:
            raise serializers.ValidationError(
                "Submit exactly one password verification method."
            )
        return attrs


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

class StrictIntegerField(serializers.IntegerField):
    def to_internal_value(self, data):
        if isinstance(data, bool) or not isinstance(data, int):
            self.fail("invalid")
        return super().to_internal_value(data)


class RatingParameterSerializer(serializers.ModelSerializer):
    def validate_options(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Options must be a list.")
        normalized = []
        seen = set()
        for option in value:
            if not isinstance(option, dict):
                raise serializers.ValidationError("Each option must be an object.")
            option_value = option.get("value")
            label = str(option.get("label", "")).strip()
            if isinstance(option_value, bool) or not isinstance(option_value, int):
                raise serializers.ValidationError("Option values must be integers.")
            if not 0 <= option_value <= 5 or option_value in seen or not label:
                raise serializers.ValidationError("Options need unique values from 0 to 5 and labels.")
            seen.add(option_value)
            normalized.append({"value": option_value, "label": label})
        return normalized

    def validate(self, attrs):
        input_type = attrs.get("input_type", getattr(self.instance, "input_type", None))
        options = attrs.get("options", getattr(self.instance, "options", []))
        is_active = attrs.get("is_active", getattr(self.instance, "is_active", True))
        if input_type == RatingParameter.InputType.STAR and options:
            raise serializers.ValidationError({"options": "Star parameters do not use options."})
        if input_type != RatingParameter.InputType.STAR and not options:
            raise serializers.ValidationError({"options": "This parameter requires at least one option."})
        if (
            self.instance
            and self.instance.answers.exists()
            and input_type != self.instance.input_type
        ):
            raise serializers.ValidationError(
                {"input_type": "A parameter with recorded answers cannot change input type."}
            )
        if (
            self.instance
            and self.instance.input_type == RatingParameter.InputType.STAR
            and self.instance.is_active
            and not is_active
            and not RatingParameter.objects.filter(
                input_type=RatingParameter.InputType.STAR,
                is_active=True,
            ).exclude(pk=self.instance.pk).exists()
        ):
            raise serializers.ValidationError(
                {"is_active": "At least one star parameter must remain active."}
            )
        return attrs

    class Meta:
        model = RatingParameter
        fields = (
            "id", "key", "label", "prompt", "input_type", "options", "position",
            "is_active", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class DoctorReviewAnswerSerializer(serializers.ModelSerializer):
    parameter_id = serializers.IntegerField(read_only=True)
    key = serializers.CharField(source="parameter.key", read_only=True)
    label = serializers.CharField(source="parameter.label", read_only=True)
    input_type = serializers.CharField(source="parameter.input_type", read_only=True)
    option_label = serializers.SerializerMethodField()

    def get_option_label(self, obj):
        for option in obj.parameter.options:
            if option.get("value") == obj.value:
                return option.get("label", "")
        return ""

    class Meta:
        model = DoctorReviewAnswer
        fields = (
            "parameter_id", "key", "label", "input_type", "value", "option_label"
        )


class DoctorReviewSerializer(serializers.ModelSerializer):
    rating = serializers.FloatField(read_only=True)
    answers = DoctorReviewAnswerSerializer(many=True, read_only=True)
    reviewer_display_name = serializers.SerializerMethodField()

    def get_reviewer_display_name(self, obj):
        first_name = obj.user.first_name.strip()
        last_initial = obj.user.last_name.strip()[:1]
        if first_name and last_initial:
            return f"{first_name} {last_initial}."
        return first_name or "Patient"

    class Meta:
        model = DoctorReview
        fields = (
            "id", "reviewer_display_name", "rating", "answers", "comment",
            "created_at", "updated_at",
        )
        read_only_fields = fields


class DoctorReviewAnswerInputSerializer(serializers.Serializer):
    parameter_id = serializers.IntegerField(min_value=1)
    value = StrictIntegerField(min_value=0, max_value=5)


class DoctorReviewSubmissionSerializer(serializers.Serializer):
    answers = DoctorReviewAnswerInputSerializer(many=True, allow_empty=False)
    comment = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=2000,
        trim_whitespace=True,
    )

    def validate_answers(self, answers):
        submitted = {answer["parameter_id"]: answer["value"] for answer in answers}
        if len(submitted) != len(answers):
            raise serializers.ValidationError("Each parameter may be answered only once.")

        parameters = list(RatingParameter.objects.filter(is_active=True))
        expected_ids = {parameter.pk for parameter in parameters}
        submitted_ids = set(submitted)
        if submitted_ids != expected_ids:
            raise serializers.ValidationError(
                "All currently active rating parameters must be answered."
            )

        errors = {}
        for parameter in parameters:
            value = submitted[parameter.pk]
            if parameter.input_type == RatingParameter.InputType.STAR and not 1 <= value <= 5:
                errors[str(parameter.pk)] = "Choose a star rating from 1 to 5."
            elif parameter.input_type == RatingParameter.InputType.RECOMMENDATION and value not in {0, 1}:
                errors[str(parameter.pk)] = "Choose yes or no."
            elif parameter.input_type == RatingParameter.InputType.WAIT_TIME:
                option_values = {option.get("value") for option in parameter.options}
                if value not in option_values:
                    errors[str(parameter.pk)] = "Choose one of the configured wait times."
        if errors:
            raise serializers.ValidationError(errors)
        return answers


class RatingVoterSerializer(serializers.ModelSerializer):
    voter = serializers.SerializerMethodField()
    rating = serializers.FloatField(read_only=True)
    answers = DoctorReviewAnswerSerializer(many=True, read_only=True)

    def get_voter(self, obj):
        return {
            "id": obj.user_id,
            "first_name": obj.user.first_name,
            "last_name": obj.user.last_name,
        }

    class Meta:
        model = DoctorReview
        fields = (
            "id", "voter", "rating", "answers", "comment", "created_at", "updated_at"
        )


class DentalServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DentalService
        fields = ("id", "slug", "title", "short_title", "description", "icon", "position")
        read_only_fields = fields


class InsuranceProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model = InsuranceProvider
        fields = ("id", "name", "position")
        read_only_fields = fields

class PublicDoctorListSerializer(serializers.ModelSerializer):
    """سریالایزر عمومی برای نمایش لیست دکترها در سایت"""
    likes_count = serializers.IntegerField(read_only=True)
    vote_count = serializers.IntegerField(read_only=True)
    average_rating = serializers.SerializerMethodField()
    display_name = serializers.CharField(read_only=True)
    slug = serializers.CharField(source="username", read_only=True)
    services = DentalServiceSerializer(many=True, read_only=True)
    insurances = InsuranceProviderSerializer(many=True, read_only=True)

    def get_average_rating(self, obj):
        return round(float(getattr(obj, "average_rating", 0) or 0), 1)

    class Meta:
        model = Doctor
        fields = (
            "id", "slug", "first_name", "last_name", "display_name", "clinic_name",
            "profile_picture", "specialty", "bio", "experience", "address", "map_url",
            "services", "insurances", "likes_count", "average_rating", "vote_count",
        )

class PublicDoctorDetailSerializer(serializers.ModelSerializer):
    """سریالایزر عمومی برای نمایش اطلاعات کامل یک دکتر + نظرات"""
    likes_count = serializers.IntegerField(read_only=True)
    vote_count = serializers.IntegerField(read_only=True)
    average_rating = serializers.SerializerMethodField()
    display_name = serializers.CharField(read_only=True)
    is_liked = serializers.SerializerMethodField()
    slug = serializers.CharField(source="username", read_only=True)
    services = DentalServiceSerializer(many=True, read_only=True)
    insurances = InsuranceProviderSerializer(many=True, read_only=True)

    def get_average_rating(self, obj):
        return round(float(getattr(obj, "average_rating", 0) or 0), 1)

    class Meta:
        model = Doctor
        fields = (
            "id", "slug", "first_name", "last_name", "display_name", "clinic_name",
            "profile_picture", "specialty", "bio", "experience", "address", "map_url",
            "services", "insurances", "likes_count", "is_liked", "average_rating", "vote_count",
        )

    def get_is_liked(self, obj):
        # بررسی اینکه آیا کاربر فعلی این دکتر را لایک کرده است یا خیر
        request = self.context.get('request')
        return bool(getattr(obj, "is_liked", False))

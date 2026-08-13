"""Views for the accounts application."""

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework import generics
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.generics import RetrieveUpdateAPIView, ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

from .models import User, NormalUser, Doctor, DoctorDocument, DoctorReview, OTPChallenge
from .otp import (
    GENERIC_REQUEST_MESSAGE,
    GENERIC_VERIFY_ERROR,
    consume_grant,
    create_challenge,
    verify_challenge,
)
from .permissions import IsAdminRole, IsDoctorRole, IsNormalUser
from .serializers import (
    LoginSerializer, SignupSerializer, UserDetailSerializer,
    UserProfileSerializer, PasswordChangeSerializer,
    AdminUserListSerializer, AdminDoctorListSerializer,
    DoctorVerificationStatusSerializer, DoctorVerificationSubmitSerializer,
    DoctorReviewSerializer, PublicDoctorListSerializer, PublicDoctorDetailSerializer
)

from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from .throttles import LoginThrottle, SignupThrottle
from core.sms_service import send_doctor_approved, send_doctor_rejected, send_admin_alert
from .sessions import set_password_and_revoke


User = get_user_model()


def get_tokens_for_user(user: User) -> dict[str, str]:
    """Generate JWT access and refresh tokens with custom claims."""
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    refresh["user_type"] = user.role
    refresh["auth_version"] = user.auth_version
    
    access_token = refresh.access_token
    access_token["role"] = user.role
    access_token["user_type"] = user.role
    access_token["auth_version"] = user.auth_version

    return {
        "refresh": str(refresh),
        "access": str(access_token),
    }


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )


class SignupView(APIView):
    permission_classes = (AllowAny,)
    throttle_classes = (SignupThrottle,)

    def post(self, request: Request) -> Response:
        serializer = SignupSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            
            # تولید توکن JWT برای ورود خودکار کاربر
            tokens = get_tokens_for_user(user)
            
            response = Response(
                {
                    "message": "User registered successfully.",
                    "access": tokens["access"],
                    "user": UserDetailSerializer(user).data,
                },
                status=status.HTTP_201_CREATED,
            )
            set_refresh_cookie(response, tokens["refresh"])
            return response
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class LoginView(APIView):
    permission_classes = (AllowAny,)
    throttle_classes = [LoginThrottle]

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        phone_number = serializer.validated_data["phone_number"]
        password = serializer.validated_data["password"]
        user_type = serializer.validated_data["user_type"]

        user = authenticate(request, username=phone_number, password=password)

        if user is None:
            return Response(
                {"detail": "Invalid credentials. Please try again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.is_active:
            return Response(
                {"detail": "This account has been deactivated."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if user_type == "USER" and not user.is_normal_user:
            return Response({"detail": "Please use the correct portal for users."}, status=status.HTTP_403_FORBIDDEN)
        if user_type == "DOCTOR" and not user.is_doctor_role:
            return Response({"detail": "Please use the correct portal for doctors."}, status=status.HTTP_403_FORBIDDEN)
        if user_type == "ADMIN" and not user.is_admin_role:
            return Response({"detail": "Please use the admin portal."}, status=status.HTTP_403_FORBIDDEN)

        # Update last_login manually since we aren't using django's login()
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])

        tokens = get_tokens_for_user(user)
        response = Response(
            {
                "message": "Login successful.",
                "access": tokens["access"],
                "user": UserDetailSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, tokens["refresh"])
        return response


class SessionTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh = RefreshToken(attrs["refresh"])
        user = User.objects.filter(pk=refresh.get("user_id"), is_active=True).only(
            "id", "auth_version"
        ).first()
        if user is None or refresh.get("auth_version") != user.auth_version:
            raise InvalidToken("Session has been revoked.")
        return super().validate(attrs)


class CustomTokenRefreshView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        raw_refresh = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw_refresh:
            return Response({"detail": "Refresh session is unavailable."}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = SessionTokenRefreshSerializer(data={"refresh": raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except (InvalidToken, TokenError):
            response = Response({"detail": "Refresh session is invalid."}, status=status.HTTP_401_UNAUTHORIZED)
            clear_refresh_cookie(response)
            return response
        payload = dict(serializer.validated_data)
        rotated_refresh = payload.pop("refresh", None)
        response = Response(payload, status=status.HTTP_200_OK)
        if rotated_refresh:
            set_refresh_cookie(response, rotated_refresh)
        return response


class MeView(RetrieveUpdateAPIView):
    """Get or update current user's profile."""
    serializer_class = UserProfileSerializer
    permission_classes = (IsAuthenticated,)

    def get_object(self):
        return self.request.user


class PasswordChangeView(APIView):
    """Change current user's password."""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        user = request.user
        if not user.check_password(serializer.validated_data["old_password"]):
            return Response({"detail": "Wrong old password."}, status=status.HTTP_400_BAD_REQUEST)
        
        with transaction.atomic():
            locked_user = User.objects.select_for_update().get(pk=user.pk)
            set_password_and_revoke(locked_user, serializer.validated_data["new_password"])
        response = Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)
        clear_refresh_cookie(response)
        return response


class AdminUserListView(ListAPIView):
    """List all normal users (paginated, searchable, sortable)."""
    serializer_class = AdminUserListSerializer
    permission_classes = (IsAdminRole,)
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["username", "phone_number", "first_name", "last_name"]
    ordering_fields = ["date_joined", "username"]
    
    def get_queryset(self):
        # Querying NormalUser automatically JOINs the User table via MTI.
        return NormalUser.objects.order_by("-date_joined", "pk")


class AdminDoctorListView(ListAPIView):
    """List all doctors (paginated, searchable, filterable by status)."""
    serializer_class = AdminDoctorListSerializer
    permission_classes = (IsAdminRole,)
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["username", "phone_number", "first_name", "last_name"]
    ordering_fields = ["date_joined", "verification_status"]
    
    def get_queryset(self):
        qs = Doctor.objects.all().prefetch_related(
            Prefetch("documents", queryset=DoctorDocument.objects.select_related("asset"))
        )
        status = self.request.query_params.get("verification_status")
        if status:
            qs = qs.filter(verification_status=status)
        return qs.order_by("-date_joined", "pk")


class AdminUserDeactivateView(APIView):
    """Soft-delete (deactivate) a user or doctor."""
    permission_classes = (IsAdminRole,)

    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        
        # Security: Prevent deactivating superusers or self
        if user.is_superuser:
            return Response({"detail": "Cannot deactivate a superuser."}, status=status.HTTP_403_FORBIDDEN)
        if user == request.user:
            return Response({"detail": "Cannot deactivate yourself."}, status=status.HTTP_403_FORBIDDEN)
        if user.is_admin_role:
            return Response({"detail": "Administrator accounts cannot be managed here."}, status=status.HTTP_403_FORBIDDEN)
        
        user.is_active = False
        user.save(update_fields=["is_active"])
        return Response({"detail": "User deactivated successfully."}, status=status.HTTP_200_OK)


class AdminUserReactivateView(APIView):
    """Reactivate a previously deactivated user or doctor."""
    permission_classes = (IsAdminRole,)

    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        if user.is_admin_role:
            return Response({"detail": "Administrator accounts cannot be managed here."}, status=status.HTTP_403_FORBIDDEN)
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response({"detail": "User reactivated successfully."}, status=status.HTTP_200_OK)


class DoctorVerificationStatusView(APIView):
    """Get current doctor's verification status and documents."""
    permission_classes = (IsDoctorRole,)

    def get(self, request):
        doctor = (
            Doctor.objects.prefetch_related(
                Prefetch("documents", queryset=DoctorDocument.objects.select_related("asset"))
            )
            .get(pk=request.user.pk)
        )
        serializer = DoctorVerificationStatusSerializer(doctor)
        return Response(serializer.data)


class DoctorVerificationSubmitView(APIView):
    """Submit verification form and documents."""
    permission_classes = (IsDoctorRole,)

    def post(self, request):
        doctor = request.user.doctor_profile
        serializer = DoctorVerificationSubmitSerializer(doctor, data=request.data)
        if serializer.is_valid():
            serializer.save()
            
            admin_phones = User.objects.filter(role="ADMIN", is_active=True).values_list('phone_number', flat=True)
            for phone in admin_phones:
                send_admin_alert(phone, "درخواست احراز هویت پزشک")
    
            return Response({"message": "Verification submitted successfully."}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminDoctorApproveView(APIView):
    """Approve a doctor's application."""
    permission_classes = (IsAdminRole,)

    def post(self, request, pk):
        doctor = get_object_or_404(Doctor, pk=pk)
        doctor.verification_status = Doctor.VerificationStatus.APPROVED
        doctor.verification_reviewed_at = timezone.now()
        doctor.verification_reviewer = request.user
        doctor.rejection_note = ""
        doctor.save()
        date_str = timezone.now().strftime("%Y-%m-%d")
        send_doctor_approved(doctor.phone_number, date_str)
        return Response({"detail": "Doctor approved successfully."})


class AdminDoctorRejectView(APIView):
    """Reject a doctor's application."""
    permission_classes = (IsAdminRole,)

    def post(self, request, pk):
        doctor = get_object_or_404(Doctor, pk=pk)
        note = request.data.get("rejection_note")
        if not note:
            return Response({"detail": "rejection_note is required."}, status=status.HTTP_400_BAD_REQUEST)
            
        doctor.verification_status = Doctor.VerificationStatus.REJECTED
        doctor.verification_reviewed_at = timezone.now()
        doctor.verification_reviewer = request.user
        doctor.rejection_note = note
        doctor.save()
        send_doctor_rejected(doctor.phone_number, note)
        return Response({"detail": "Doctor rejected successfully."})


class LogoutView(APIView):
    """Blacklist the refresh token to log the user out."""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        response = Response({"detail": "Logout successful."}, status=status.HTTP_205_RESET_CONTENT)
        refresh_token = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        try:
            if refresh_token:
                RefreshToken(refresh_token).blacklist()
        except TokenError:
            pass
        clear_refresh_cookie(response)
        return response
        
        
class RequestOTPView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        phone = request.data.get("phone_number")
        purpose = request.data.get("purpose")
        if not phone or purpose not in OTPChallenge.Purpose.values:
            return Response(
                {"detail": "A valid phone number and purpose are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            challenge = create_challenge(request, phone, purpose)
        except DjangoValidationError:
            return Response({"detail": "A valid phone number is required."}, status=status.HTTP_400_BAD_REQUEST)
        payload = {"detail": GENERIC_REQUEST_MESSAGE}
        if challenge is not None:
            payload["challenge_id"] = str(challenge.pk)
        return Response(payload, status=status.HTTP_202_ACCEPTED)

class VerifyOTPView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        phone = request.data.get("phone_number")
        code = request.data.get("code")
        purpose = request.data.get("purpose")
        challenge_id = request.data.get("challenge_id")
        if not all((phone, code, challenge_id)) or purpose not in OTPChallenge.Purpose.values:
            return Response({"detail": GENERIC_VERIFY_ERROR}, status=status.HTTP_400_BAD_REQUEST)
        try:
            otp_token = verify_challenge(
                challenge_id=challenge_id,
                raw_phone=phone,
                purpose=purpose,
                code=str(code),
            )
        except (ValueError, DjangoValidationError):
            return Response({"detail": GENERIC_VERIFY_ERROR}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"detail": "Phone number verified.", "otp_token": otp_token},
            status=status.HTTP_200_OK,
        )

class ResetPasswordView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        phone = request.data.get("phone_number")
        otp_token = request.data.get("otp_token")
        new_password = request.data.get("new_password")
        if not all((phone, otp_token, new_password)):
            return Response({"detail": GENERIC_VERIFY_ERROR}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.filter(phone_number=phone).first()
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            return Response({"new_password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                consume_grant(
                    token=otp_token,
                    raw_phone=phone,
                    purpose=OTPChallenge.Purpose.PASSWORD_RESET,
                )
                if user is not None:
                    locked_user = User.objects.select_for_update().get(pk=user.pk)
                    set_password_and_revoke(locked_user, new_password)
        except (ValueError, DjangoValidationError):
            return Response({"detail": GENERIC_VERIFY_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        response = Response(
            {"detail": "If the account exists, its password has been changed."},
            status=status.HTTP_200_OK,
        )
        clear_refresh_cookie(response)
        return response

class PublicDoctorListView(generics.ListAPIView):
    """لیست عمومی دکترهای تایید شده برای نمایش در سایت (با قابلیت جستجو)"""
    serializer_class = PublicDoctorListSerializer
    permission_classes = [AllowAny]
    filter_backends = [SearchFilter]
    search_fields = ['first_name', 'last_name', 'clinic_name']

    def get_queryset(self):
        return Doctor.objects.filter(
            verification_status=Doctor.VerificationStatus.APPROVED,
            is_active=True
        ).annotate(
            likes_count=Count('likes'),
            reviews_count=Count('reviews')
        ).order_by("pk")

class PublicDoctorDetailView(generics.RetrieveAPIView):
    """جزئیات عمومی یک دکتر همراه با نظرات کاربران"""
    serializer_class = PublicDoctorDetailSerializer
    permission_classes = [AllowAny]
    queryset = Doctor.objects.filter(
        verification_status=Doctor.VerificationStatus.APPROVED,
        is_active=True,
    )

    def get_queryset(self):
        return super().get_queryset().annotate(likes_count=Count('likes'))

class LikeDoctorView(APIView):
    """لایک یا آنلایک کردن یک دکتر (نیازمند لاگین)"""
    permission_classes = [IsNormalUser]

    def post(self, request, pk):
        doctor = get_object_or_404(
            Doctor,
            pk=pk,
            is_active=True,
            verification_status=Doctor.VerificationStatus.APPROVED,
        )
        user = request.user

        if user in doctor.likes.all():
            doctor.likes.remove(user)
            return Response({"detail": "لایک برداشته شد.", "liked": False}, status=status.HTTP_200_OK)
        else:
            doctor.likes.add(user)
            return Response({"detail": "دکتر لایک شد.", "liked": True}, status=status.HTTP_200_OK)

class ReviewListCreateView(generics.ListCreateAPIView):
    """دیدن نظرات و ثبت نظر جدید برای یک دکتر"""
    serializer_class = DoctorReviewSerializer

    def get_permissions(self):
        # دیدن نظرات عمومی است، اما ثبت نظر نیازمند لاگین است
        if self.request.method == 'POST':
            return [IsNormalUser()]
        return [AllowAny()]

    def get_queryset(self):
        doctor = get_object_or_404(
            Doctor,
            pk=self.kwargs['pk'],
            is_active=True,
            verification_status=Doctor.VerificationStatus.APPROVED,
        )
        return DoctorReview.objects.filter(doctor=doctor)

    def perform_create(self, serializer):
        doctor = get_object_or_404(
            Doctor,
            pk=self.kwargs['pk'],
            is_active=True,
            verification_status=Doctor.VerificationStatus.APPROVED,
        )
        serializer.save(user=self.request.user, doctor=doctor)

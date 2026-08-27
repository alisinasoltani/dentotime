"""Views for the accounts application."""

from datetime import datetime, timedelta, timezone as datetime_timezone

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import (
    Avg,
    BooleanField,
    Count,
    DateTimeField,
    Exists,
    F,
    FloatField,
    OuterRef,
    Prefetch,
    Q,
    Subquery,
    Value,
)
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework import generics
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.generics import RetrieveUpdateAPIView, ListAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

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
from .otp import (
    GENERIC_REQUEST_MESSAGE,
    GENERIC_VERIFY_ERROR,
    consume_grant,
    create_challenge,
    verify_challenge,
)
from .permissions import IsAdminRole, IsDoctorRole, IsNormalUser
from .validators import normalize_phone_number
from .serializers import (
    LoginSerializer, SignupSerializer, UserDetailSerializer,
    UserProfileSerializer, PasswordChangeSerializer,
    AdminUserListSerializer, AdminDoctorListSerializer, AdminDoctorDetailSerializer,
    DoctorVerificationStatusSerializer, DoctorVerificationSubmitSerializer,
    DoctorReviewSerializer, DoctorReviewSubmissionSerializer,
    PublicDoctorListSerializer, PublicDoctorDetailSerializer,
    DentalServiceSerializer, InsuranceProviderSerializer,
    RatingParameterSerializer, RatingVoterSerializer,
)

from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from .throttles import LoginThrottle, RefreshThrottle, SignupThrottle
from core.sms_service import send_doctor_approved, send_doctor_rejected, send_admin_alert
from appointments.models import Appointment
from messaging.models import Message, ThreadReadState
from .sessions import set_password_and_revoke


User = get_user_model()


def get_public_doctor(identifier, *, queryset=None):
    if queryset is None:
        queryset = Doctor.objects.all()
    lookup = Q(pk=int(identifier)) if str(identifier).isdigit() else Q(username=identifier)
    return get_object_or_404(
        queryset,
        lookup,
        is_active=True,
        verification_status=Doctor.VerificationStatus.APPROVED,
    )


def get_review_eligibility(*, user, doctor):
    if not user.is_authenticated or not user.is_normal_user:
        return {"state": "AUTH_REQUIRED"}

    appointments = Appointment.objects.filter(
        patient=user.normaluser,
        doctor=doctor,
    ).select_related("slot")
    if not appointments.exists():
        return {"state": "NO_APPOINTMENT"}

    valid_appointments = appointments.exclude(
        status__in=[
            Appointment.Status.CANCELLED,
            Appointment.Status.REJECTED,
            Appointment.Status.NO_SHOW,
        ]
    )
    if not valid_appointments.exists():
        return {"state": "NO_APPOINTMENT"}
    past_appointments = valid_appointments.filter(slot__end_at__lte=timezone.now())
    if not past_appointments.exists():
        return {"state": "UPCOMING_APPOINTMENT"}

    attended = past_appointments.filter(
        attendance_status=Appointment.AttendanceStatus.ATTENDED
    ).order_by("-slot__end_at").first()
    if attended is None:
        return {"state": "VISIT_CONFIRMATION_REQUIRED"}

    existing_review = (
        DoctorReview.objects.filter(doctor=doctor, user=user)
        .prefetch_related("answers__parameter")
        .first()
    )
    return {
        "state": "ELIGIBLE",
        "qualifying_appointment_id": str(attended.pk),
        "existing_review": (
            DoctorReviewSerializer(existing_review).data if existing_review else None
        ),
    }


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

        # System administrators may also enter through the public login form,
        # which only exposes patient and doctor tabs. Their actual role in the
        # response remains ADMIN, so the client can route to the admin panel.
        if not user.is_admin_role:
            if user_type == "USER" and not user.is_normal_user:
                return Response({"detail": "Please use the correct portal for users."}, status=status.HTTP_403_FORBIDDEN)
            if user_type == "DOCTOR" and not user.is_doctor_role:
                return Response({"detail": "Please use the correct portal for doctors."}, status=status.HTTP_403_FORBIDDEN)
            if user_type == "ADMIN":
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
    throttle_classes = (RefreshThrottle,)

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
    """Change current user's password after old-password or OTP verification."""
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        user = request.user
        old_password = serializer.validated_data.get("old_password")
        otp_token = serializer.validated_data.get("otp_token")
        try:
            with transaction.atomic():
                locked_user = User.objects.select_for_update().get(pk=user.pk)
                if otp_token:
                    consume_grant(
                        token=otp_token,
                        raw_phone=locked_user.phone_number,
                        purpose=OTPChallenge.Purpose.PASSWORD_CHANGE,
                    )
                elif not locked_user.check_password(old_password):
                    return Response(
                        {"detail": "Wrong old password."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                set_password_and_revoke(locked_user, serializer.validated_data["new_password"])
        except (ValueError, DjangoValidationError):
            return Response({"detail": GENERIC_VERIFY_ERROR}, status=status.HTTP_400_BAD_REQUEST)
        response = Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)
        clear_refresh_cookie(response)
        return response


class PasswordChangeOTPView(APIView):
    """Send an OTP to the authenticated user's registered phone number."""

    permission_classes = (IsAuthenticated,)

    def post(self, request):
        try:
            challenge = create_challenge(
                request,
                request.user.phone_number,
                OTPChallenge.Purpose.PASSWORD_CHANGE,
            )
        except DjangoValidationError:
            return Response(
                {"detail": "A valid phone number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if challenge is None:
            return Response(
                {"detail": "Please wait before requesting another code."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return Response(
            {
                "detail": GENERIC_REQUEST_MESSAGE,
                "challenge_id": str(challenge.pk),
                "phone_number": request.user.phone_number,
            },
            status=status.HTTP_202_ACCEPTED,
        )


class AdminUserListView(ListAPIView):
    """List all normal users (paginated, searchable, sortable)."""
    serializer_class = AdminUserListSerializer
    permission_classes = (IsAdminRole,)
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["username", "phone_number", "first_name", "last_name"]
    ordering_fields = ["date_joined", "username", "first_name"]
    
    def get_queryset(self):
        # Querying NormalUser automatically JOINs the User table via MTI.
        return NormalUser.objects.order_by("-date_joined", "pk")


class AdminDoctorListView(ListAPIView):
    """List all doctors (paginated, searchable, filterable by status)."""
    serializer_class = AdminDoctorListSerializer
    permission_classes = (IsAdminRole,)
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["username", "phone_number", "first_name", "last_name"]
    ordering_fields = [
        "date_joined",
        "verification_status",
        "verification_submitted_at",
        "verification_reviewed_at",
        "first_name",
        "username",
    ]
    
    def get_queryset(self):
        qs = Doctor.objects.annotate(
            average_rating=Coalesce(Avg("reviews__rating"), Value(0.0), output_field=FloatField()),
            vote_count=Count("reviews", distinct=True),
        )
        status = self.request.query_params.get("verification_status")
        if status:
            qs = qs.filter(verification_status=status)
        return qs.order_by("-date_joined", "pk")


class AdminDoctorDetailView(generics.RetrieveAPIView):
    serializer_class = AdminDoctorDetailSerializer
    permission_classes = (IsAdminRole,)

    def get_queryset(self):
        return Doctor.objects.annotate(
            average_rating=Coalesce(
                Avg("reviews__rating"), Value(0.0), output_field=FloatField()
            ),
            vote_count=Count("reviews", distinct=True),
        ).prefetch_related(
            Prefetch(
                "documents", queryset=DoctorDocument.objects.select_related("asset")
            )
        )


class AdminDashboardSummaryView(APIView):
    """Return dashboard counters without serializing any list resources."""

    permission_classes = (IsAdminRole,)

    def get(self, request):
        seven_days_ago = timezone.now() - timedelta(days=7)
        epoch = datetime(1970, 1, 1, tzinfo=datetime_timezone.utc)
        read_at = ThreadReadState.objects.filter(
            thread_id=OuterRef("thread_id"), user=request.user
        ).values("last_read_at")[:1]
        unread_messages = (
            Message.objects.filter(
                thread__deleted_at__isnull=True,
                is_deleted=False,
                visibility=Message.Visibility.PARTICIPANTS,
            )
            .exclude(sender=request.user)
            .annotate(
                _read_at=Coalesce(
                    Subquery(read_at, output_field=DateTimeField()),
                    Value(epoch, output_field=DateTimeField()),
                )
            )
            .filter(created_at__gt=F("_read_at"))
            .count()
        )
        doctor_counts = Doctor.objects.aggregate(
            approved=Count(
                "pk",
                filter=Q(verification_status=Doctor.VerificationStatus.APPROVED),
            ),
            pending=Count(
                "pk",
                filter=Q(verification_status=Doctor.VerificationStatus.PENDING),
            ),
            recent_verifications=Count(
                "pk", filter=Q(verification_submitted_at__gte=seven_days_ago)
            ),
        )
        return Response(
            {
                "users": NormalUser.objects.count(),
                "doctors_approved": doctor_counts["approved"],
                "doctors_pending": doctor_counts["pending"],
                "unread_messages": unread_messages,
                "recent_verifications": doctor_counts["recent_verifications"],
                "recent_appointments": Appointment.objects.filter(
                    created_at__gte=seven_days_ago
                ).count(),
                "window_days": 7,
            }
        )


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
        public_purposes = {
            OTPChallenge.Purpose.SIGNUP,
            OTPChallenge.Purpose.PASSWORD_RESET,
        }
        if not phone or purpose not in public_purposes:
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
        if purpose == OTPChallenge.Purpose.PASSWORD_CHANGE:
            try:
                normalized_phone = normalize_phone_number(phone)
            except DjangoValidationError:
                normalized_phone = None
            if not request.user.is_authenticated or normalized_phone != request.user.phone_number:
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
    search_fields = [
        'first_name', 'last_name', 'clinic_name', 'specialty', 'address',
        'services__title', 'insurances__name',
    ]

    def get_queryset(self):
        return Doctor.objects.filter(
            verification_status=Doctor.VerificationStatus.APPROVED,
            is_active=True
        ).prefetch_related(
            Prefetch(
                "services",
                queryset=DentalService.objects.filter(is_active=True).order_by("position", "pk"),
            ),
            Prefetch(
                "insurances",
                queryset=InsuranceProvider.objects.filter(is_active=True).order_by("position", "pk"),
            ),
        ).annotate(
            likes_count=Count("likes", distinct=True),
            average_rating=Coalesce(Avg("reviews__rating"), Value(0.0), output_field=FloatField()),
            vote_count=Count("reviews", distinct=True),
        ).order_by("pk")


class PublicDoctorPreviewView(APIView):
    """Return exactly the lightweight fields needed by the home-page preview."""

    permission_classes = (AllowAny,)
    authentication_classes = ()

    def get(self, request):
        doctors = list(
            Doctor.objects.filter(
                verification_status=Doctor.VerificationStatus.APPROVED,
                is_active=True,
            )
            .prefetch_related(
                Prefetch(
                    "services",
                    queryset=DentalService.objects.filter(is_active=True).order_by("position", "pk"),
                ),
                Prefetch(
                    "insurances",
                    queryset=InsuranceProvider.objects.filter(is_active=True).order_by("position", "pk"),
                ),
            )
            .annotate(
                likes_count=Count("likes", distinct=True),
                average_rating=Coalesce(
                    Avg("reviews__rating"), Value(0.0), output_field=FloatField()
                ),
                vote_count=Count("reviews", distinct=True),
            )
            .order_by("pk")[:4]
        )
        return Response(PublicDoctorListSerializer(doctors, many=True).data)

class PublicDoctorDetailView(generics.RetrieveAPIView):
    """جزئیات عمومی یک دکتر همراه با نظرات کاربران"""
    serializer_class = PublicDoctorDetailSerializer
    permission_classes = [AllowAny]
    queryset = Doctor.objects.filter(
        verification_status=Doctor.VerificationStatus.APPROVED,
        is_active=True,
    ).prefetch_related(
        Prefetch(
            "services",
            queryset=DentalService.objects.filter(is_active=True).order_by("position", "pk"),
        ),
        Prefetch(
            "insurances",
            queryset=InsuranceProvider.objects.filter(is_active=True).order_by("position", "pk"),
        ),
    )

    def get_queryset(self):
        user = self.request.user
        liked = (
            Exists(Doctor.likes.through.objects.filter(doctor_id=OuterRef("pk"), user_id=user.pk))
            if user.is_authenticated and user.is_normal_user
            else Value(False, output_field=BooleanField())
        )
        return super().get_queryset().annotate(
            likes_count=Count("likes", distinct=True),
            average_rating=Coalesce(Avg("reviews__rating"), Value(0.0), output_field=FloatField()),
            vote_count=Count("reviews", distinct=True),
            is_liked=liked,
        )

    def get_object(self):
        return get_public_doctor(
            self.kwargs["identifier"],
            queryset=self.get_queryset(),
        )

class LikeDoctorView(APIView):
    """لایک یا آنلایک کردن یک دکتر (نیازمند لاگین)"""
    permission_classes = [IsNormalUser]

    def post(self, request, identifier):
        with transaction.atomic():
            doctor = get_public_doctor(
                identifier,
                queryset=Doctor.objects.select_for_update(),
            )
            relation = Doctor.likes.through.objects.filter(
                doctor_id=doctor.pk,
                user_id=request.user.pk,
            )
            if relation.exists():
                relation.delete()
                is_liked = False
            else:
                Doctor.likes.through.objects.create(
                    doctor_id=doctor.pk,
                    user_id=request.user.pk,
                )
                is_liked = True
            likes_count = Doctor.likes.through.objects.filter(doctor_id=doctor.pk).count()
        return Response(
            {"detail": "Like updated.", "is_liked": is_liked, "likes_count": likes_count},
            status=status.HTTP_200_OK,
        )

class RatingParameterListView(generics.ListAPIView):
    serializer_class = RatingParameterSerializer
    permission_classes = (AllowAny,)
    authentication_classes = ()
    queryset = RatingParameter.objects.filter(is_active=True).order_by("position", "pk")


class PublicCatalogView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def get(self, request):
        services = DentalService.objects.filter(is_active=True).order_by("position", "pk")
        insurances = InsuranceProvider.objects.filter(is_active=True).order_by("position", "pk")
        return Response(
            {
                "services": DentalServiceSerializer(services, many=True).data,
                "insurances": InsuranceProviderSerializer(insurances, many=True).data,
            }
        )


class AdminRatingParameterListCreateView(generics.ListCreateAPIView):
    serializer_class = RatingParameterSerializer
    permission_classes = (IsAdminRole,)
    queryset = RatingParameter.objects.order_by("position", "pk")


class AdminRatingParameterDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = RatingParameterSerializer
    permission_classes = (IsAdminRole,)
    queryset = RatingParameter.objects.all()


class ReviewEligibilityView(APIView):
    permission_classes = (IsNormalUser,)

    def get(self, request, identifier):
        doctor = get_public_doctor(identifier)
        return Response(get_review_eligibility(user=request.user, doctor=doctor))


class RatingSummaryView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()

    def get(self, request, identifier):
        doctor = get_public_doctor(identifier)
        parameters = list(
            RatingParameter.objects.filter(is_active=True).order_by("position", "pk")
        )
        reviews = DoctorReview.objects.filter(doctor=doctor)
        review_summary = reviews.aggregate(
            average_rating=Coalesce(
                Avg("rating"), Value(0.0), output_field=FloatField()
            ),
            vote_count=Count("pk"),
        )
        review_summary["average_rating"] = round(
            float(review_summary["average_rating"] or 0), 1
        )
        answer_stats = {
            row["parameter_id"]: row
            for row in DoctorReviewAnswer.objects.filter(
                review__doctor=doctor,
                parameter__is_active=True,
            )
            .values("parameter_id")
            .annotate(average=Avg("value"), answer_count=Count("pk"))
        }

        recommendation = next(
            (
                parameter
                for parameter in parameters
                if parameter.input_type == RatingParameter.InputType.RECOMMENDATION
            ),
            None,
        )
        recommendation_stats = {"total": 0, "recommended": 0}
        if recommendation:
            recommendation_answers = DoctorReviewAnswer.objects.filter(
                review__doctor=doctor,
                parameter=recommendation,
            )
            recommendation_stats = recommendation_answers.aggregate(
                total=Count("pk"),
                recommended=Count("pk", filter=Q(value=1)),
            )

        wait_parameter = next(
            (
                parameter
                for parameter in parameters
                if parameter.input_type == RatingParameter.InputType.WAIT_TIME
            ),
            None,
        )
        average_wait_time = None
        if wait_parameter:
            wait_average = DoctorReviewAnswer.objects.filter(
                review__doctor=doctor,
                parameter=wait_parameter,
            ).aggregate(value=Avg("value"))["value"]
            if wait_average is not None and wait_parameter.options:
                wait_code = max(
                    0,
                    min(len(wait_parameter.options) - 1, round(float(wait_average))),
                )
                average_wait_time = wait_parameter.options[wait_code]

        total_recommendations = recommendation_stats["total"] or 0
        recommendation_percentage = (
            round((recommendation_stats["recommended"] or 0) * 100 / total_recommendations)
            if total_recommendations
            else 0
        )
        parameter_data = []
        for parameter in parameters:
            data = RatingParameterSerializer(parameter).data
            stat = answer_stats.get(parameter.pk)
            data["average"] = round(float(stat["average"]), 2) if stat else None
            data["answer_count"] = stat["answer_count"] if stat else 0
            parameter_data.append(data)

        return Response(
            {
                **review_summary,
                "recommendation_percentage": recommendation_percentage,
                "recommendation_count": total_recommendations,
                "average_wait_time": average_wait_time,
                "parameters": parameter_data,
            }
        )


class ReviewListCreateView(generics.ListCreateAPIView):
    """دیدن نظرات و ثبت نظر جدید برای یک دکتر"""
    serializer_class = DoctorReviewSerializer

    def get_permissions(self):
        # دیدن نظرات عمومی است، اما ثبت نظر نیازمند لاگین است
        if self.request.method == 'POST':
            return [IsNormalUser()]
        return [AllowAny()]

    def get_queryset(self):
        identifier = self.kwargs["identifier"]
        doctor_lookup = (
            Q(doctor_id=int(identifier))
            if identifier.isdigit()
            else Q(doctor__username=identifier)
        )
        return (
            DoctorReview.objects.filter(
                doctor_lookup,
                doctor__is_active=True,
                doctor__verification_status=Doctor.VerificationStatus.APPROVED,
            )
            .select_related("user")
            .prefetch_related("answers__parameter")
            .only(
                "id", "doctor_id", "user_id", "user__first_name", "user__last_name",
                "rating", "comment", "created_at", "updated_at",
            )
        )

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # A populated review page already proves the doctor exists. For an empty
        # page, preserve the detail endpoint's 404 behavior without adding a
        # query to the common path (reviews + nested answers stay at 3 queries).
        if response.data.get("count") == 0:
            get_public_doctor(self.kwargs["identifier"])
        return response

    def create(self, request, *args, **kwargs):
        doctor = get_public_doctor(self.kwargs["identifier"])
        eligibility = get_review_eligibility(user=request.user, doctor=doctor)
        if eligibility["state"] != "ELIGIBLE":
            return Response(eligibility, status=status.HTTP_409_CONFLICT)

        submission = DoctorReviewSubmissionSerializer(data=request.data)
        submission.is_valid(raise_exception=True)
        submitted = {
            answer["parameter_id"]: answer["value"]
            for answer in submission.validated_data["answers"]
        }

        with transaction.atomic():
            parameters = list(
                RatingParameter.objects.select_for_update()
                .filter(is_active=True)
                .order_by("position", "pk")
            )
            if set(submitted) != {parameter.pk for parameter in parameters}:
                from rest_framework.exceptions import ValidationError

                raise ValidationError(
                    {"answers": "Rating parameters changed. Please reload and try again."}
                )
            star_values = [
                submitted[parameter.pk]
                for parameter in parameters
                if parameter.input_type == RatingParameter.InputType.STAR
            ]
            if not star_values:
                from rest_framework.exceptions import ValidationError

                raise ValidationError({"answers": "At least one star parameter is required."})
            rating = round(sum(star_values) / len(star_values), 1)
            review, created = DoctorReview.objects.update_or_create(
                doctor=doctor,
                user=request.user,
                defaults={
                    "rating": rating,
                    "comment": submission.validated_data.get("comment", ""),
                },
            )
            review.answers.all().delete()
            DoctorReviewAnswer.objects.bulk_create(
                [
                    DoctorReviewAnswer(
                        review=review,
                        parameter=parameter,
                        value=submitted[parameter.pk],
                    )
                    for parameter in parameters
                ]
            )
        review = DoctorReview.objects.prefetch_related("answers__parameter").get(pk=review.pk)
        output = DoctorReviewSerializer(review, context=self.get_serializer_context())
        return Response(
            output.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class RatingVoterPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response(
            {
                "count": self.page.paginator.count,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "average_rating": self.rating_summary["average_rating"],
                "vote_count": self.rating_summary["vote_count"],
                "results": data,
            }
        )


class BaseRatingVoterListView(generics.ListAPIView):
    serializer_class = RatingVoterSerializer
    pagination_class = RatingVoterPagination
    filter_backends = (SearchFilter, OrderingFilter)
    search_fields = ("user__first_name", "user__last_name")
    ordering_fields = ("rating", "created_at", "updated_at")
    ordering = "-created_at"

    def get_doctor(self):
        raise NotImplementedError

    def get_queryset(self):
        doctor = self.get_doctor()
        queryset = (
            DoctorReview.objects.filter(doctor=doctor)
            .select_related("user")
            .prefetch_related("answers__parameter")
            .only(
                "id", "doctor_id", "user_id", "user__first_name", "user__last_name",
                "rating", "comment", "created_at", "updated_at",
            )
        )
        self.rating_summary = queryset.aggregate(
            average_rating=Coalesce(Avg("rating"), Value(0.0), output_field=FloatField()),
            vote_count=Count("pk"),
        )
        return queryset

    def paginate_queryset(self, queryset):
        self.paginator.rating_summary = self.rating_summary
        return super().paginate_queryset(queryset)

    def filter_queryset(self, queryset):
        rating = self.request.query_params.get("rating")
        if rating is not None:
            if rating not in {"1", "2", "3", "4", "5"}:
                from rest_framework.exceptions import ValidationError

                raise ValidationError({"rating": "Choose an integer from 1 to 5."})
            queryset = queryset.filter(rating=int(rating))
        return super().filter_queryset(queryset)


class DoctorOwnRatingVoterListView(BaseRatingVoterListView):
    permission_classes = (IsDoctorRole,)

    def get_doctor(self):
        return self.request.user.doctor_profile


class AdminRatingVoterListView(BaseRatingVoterListView):
    permission_classes = (IsAdminRole,)

    def get_doctor(self):
        return get_object_or_404(Doctor, pk=self.kwargs["pk"])
    InsuranceProvider,

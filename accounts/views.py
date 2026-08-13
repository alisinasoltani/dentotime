"""Views for the accounts application."""

import random
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
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
from rest_framework_simplejwt.views import TokenRefreshView

from .models import User, NormalUser, Doctor, DoctorReview
from accounts.models import User, OTPCode
from django.db.models import Count
from .permissions import IsAdminRole, IsDoctorRole
from .serializers import (
    LoginSerializer, SignupSerializer, UserDetailSerializer,
    UserProfileSerializer, PasswordChangeSerializer,
    AdminUserListSerializer, AdminDoctorListSerializer,
    DoctorVerificationStatusSerializer, DoctorVerificationSubmitSerializer,
    DoctorReviewSerializer, PublicDoctorListSerializer, PublicDoctorDetailSerializer
)

from rest_framework_simplejwt.exceptions import TokenError
from .throttles import LoginThrottle, SignupThrottle
from core.sms_service import send_otp
from django.core.cache import cache
from django.utils import timezone
from core.sms_service import send_doctor_approved, send_doctor_rejected, send_admin_alert


User = get_user_model()


def get_tokens_for_user(user: User) -> dict[str, str]:
    """Generate JWT access and refresh tokens with custom claims."""
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    refresh["user_type"] = user.role
    
    access_token = refresh.access_token
    access_token["role"] = user.role
    access_token["user_type"] = user.role

    return {
        "refresh": str(refresh),
        "access": str(access_token),
    }


class SignupView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request: Request) -> Response:
        serializer = SignupSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            
            # تولید توکن JWT برای ورود خودکار کاربر
            tokens = get_tokens_for_user(user)
            
            return Response(
                {
                    "message": "User registered successfully.",
                    "access": tokens["access"],
                    "refresh": tokens["refresh"],
                    "user": UserDetailSerializer(user).data,
                },
                status=status.HTTP_201_CREATED,
            )
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
        return Response(
            {
                "message": "Login successful.",
                "access": tokens["access"],
                "refresh": tokens["refresh"],
                "user": UserDetailSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


class CustomTokenRefreshView(TokenRefreshView):
    pass


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
        
        user.set_password(serializer.validated_data["new_password"])
        user.save()
        return Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)


class AdminUserListView(ListAPIView):
    """List all normal users (paginated, searchable, sortable)."""
    serializer_class = AdminUserListSerializer
    permission_classes = (IsAdminRole,)
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["username", "phone_number", "first_name", "last_name"]
    ordering_fields = ["date_joined", "username"]
    
    def get_queryset(self):
        # Querying NormalUser automatically JOINs the User table via MTI.
        return NormalUser.objects.all()


class AdminDoctorListView(ListAPIView):
    """List all doctors (paginated, searchable, filterable by status)."""
    serializer_class = AdminDoctorListSerializer
    permission_classes = (IsAdminRole,)
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["username", "phone_number", "first_name", "last_name"]
    ordering_fields = ["date_joined", "verification_status"]
    
    def get_queryset(self):
        qs = Doctor.objects.all().prefetch_related('documents')
        status = self.request.query_params.get("verification_status")
        if status:
            qs = qs.filter(verification_status=status)
        return qs


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
        
        user.is_active = False
        user.save(update_fields=["is_active"])
        return Response({"detail": "User deactivated successfully."}, status=status.HTTP_200_OK)


class AdminUserReactivateView(APIView):
    """Reactivate a previously deactivated user or doctor."""
    permission_classes = (IsAdminRole,)

    def patch(self, request, pk):
        user = get_object_or_404(User, pk=pk)
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response({"detail": "User reactivated successfully."}, status=status.HTTP_200_OK)


class DoctorVerificationStatusView(APIView):
    """Get current doctor's verification status and documents."""
    permission_classes = (IsDoctorRole,)

    def get(self, request):
        doctor = request.user.doctor_profile
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
        try:
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return Response({"detail": "Refresh token is required."}, status=status.HTTP_400_BAD_REQUEST)
                
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"detail": "Logout successful."}, status=status.HTTP_205_RESET_CONTENT)
        except TokenError:
            return Response({"detail": "Invalid token."}, status=status.HTTP_400_BAD_REQUEST)
        
        
class RequestOTPView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        phone = request.data.get("phone_number")
        if not phone:
            return Response({"detail": "Phone number is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        code = str(random.randint(10000, 99999))
        # حذف کدهای قدیمی این شماره
        OTPCode.objects.filter(phone_number=phone).delete()
        # ذخیره کد جدید در دیتابیس
        OTPCode.objects.create(phone_number=phone, code=code)
        
        send_otp(phone, code)
        return Response({"detail": "کد تایید ارسال شد."}, status=status.HTTP_200_OK)

class VerifyOTPView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        phone = request.data.get("phone_number")
        code = request.data.get("code")
        
        otp_obj = OTPCode.objects.filter(phone_number=phone, code=code).first()
        
        if not otp_obj:
            return Response({"detail": "کد اشتباه است."}, status=status.HTTP_400_BAD_REQUEST)
        
        if not otp_obj.is_valid():
            return Response({"detail": "کد منقضی شده است."}, status=status.HTTP_400_BAD_REQUEST)
        
        otp_obj.is_verified = True
        otp_obj.save()
        return Response({"detail": "شماره تایید شد."}, status=status.HTTP_200_OK)

class ResetPasswordView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        phone = request.data.get("phone_number")
        code = request.data.get("code")
        new_password = request.data.get("new_password")
        
        otp_obj = OTPCode.objects.filter(phone_number=phone, code=code).first()
        if not otp_obj:
            return Response({"detail": "کد اشتباه است."}, status=status.HTTP_400_BAD_REQUEST)
        if not otp_obj.is_valid():
            return Response({"detail": "کد منقضی شده است."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(phone_number=phone)
            user.set_password(new_password)
            user.save()
            otp_obj.delete() # حذف کد استفاده شده
            return Response({"detail": "رمز عبور با موفقیت تغییر کرد."}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({"detail": "کاربری یافت نشد."}, status=status.HTTP_404_NOT_FOUND)

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
        )

class PublicDoctorDetailView(generics.RetrieveAPIView):
    """جزئیات عمومی یک دکتر همراه با نظرات کاربران"""
    serializer_class = PublicDoctorDetailSerializer
    permission_classes = [AllowAny]
    queryset = Doctor.objects.filter(verification_status=Doctor.VerificationStatus.APPROVED)

    def get_queryset(self):
        return super().get_queryset().annotate(likes_count=Count('likes'))

class LikeDoctorView(APIView):
    """لایک یا آنلایک کردن یک دکتر (نیازمند لاگین)"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        doctor = get_object_or_404(Doctor, pk=pk, verification_status=Doctor.VerificationStatus.APPROVED)
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
            return [IsAuthenticated()]
        return [AllowAny()]

    def get_queryset(self):
        return DoctorReview.objects.filter(doctor_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        doctor = get_object_or_404(Doctor, pk=self.kwargs['pk'])
        serializer.save(user=self.request.user, doctor=doctor)
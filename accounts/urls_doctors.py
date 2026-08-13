from django.urls import path
from .views import (
    DoctorVerificationStatusView, DoctorVerificationSubmitView,
    PublicDoctorListView, PublicDoctorDetailView, 
    DoctorOwnRatingVoterListView, LikeDoctorView, ReviewListCreateView
)

urlpatterns = [
    # مسیرهای مخصوص خود پزشکان (احراز هویت)
    path("verification/", DoctorVerificationStatusView.as_view(), name="doctor_verification_status"),
    path("verification/submit/", DoctorVerificationSubmitView.as_view(), name="doctor_verification_submit"),
    path("ratings/", DoctorOwnRatingVoterListView.as_view(), name="doctor_own_ratings"),
    
    # مسیرهای عمومی سایت برای دیدن دکترها
    path("list/", PublicDoctorListView.as_view(), name="public_doctor_list"),
    path("<int:pk>/", PublicDoctorDetailView.as_view(), name="public_doctor_detail"),
    
    # مسیرهای تعاملی (نیازمند لاگین کاربر عادی)
    path("<int:pk>/like/", LikeDoctorView.as_view(), name="like_doctor"),
    path("<int:pk>/reviews/", ReviewListCreateView.as_view(), name="doctor_reviews"),
]

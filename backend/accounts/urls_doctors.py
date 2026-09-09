from django.urls import path, re_path
from .views import (
    DoctorVerificationStatusView, DoctorVerificationSubmitView, DoctorPublicProfileView,
    PublicDoctorListView, PublicDoctorPreviewView, PublicDoctorDetailView,
    DoctorOwnRatingVoterListView, LikeDoctorView, PublicCatalogView, RatingParameterListView,
    RatingSummaryView, ReviewEligibilityView, ReviewListCreateView,
)

urlpatterns = [
    path("me/profile/", DoctorPublicProfileView.as_view(), name="doctor_public_profile"),
    # مسیرهای مخصوص خود پزشکان (احراز هویت)
    path("verification/", DoctorVerificationStatusView.as_view(), name="doctor_verification_status"),
    path("verification/submit/", DoctorVerificationSubmitView.as_view(), name="doctor_verification_submit"),
    path("ratings/", DoctorOwnRatingVoterListView.as_view(), name="doctor_own_ratings"),
    
    # مسیرهای عمومی سایت برای دیدن دکترها
    path("list/", PublicDoctorListView.as_view(), name="public_doctor_list"),
    path("preview/", PublicDoctorPreviewView.as_view(), name="public_doctor_preview"),
    path("catalog/", PublicCatalogView.as_view(), name="public_catalog"),
    path("rating-parameters/", RatingParameterListView.as_view(), name="rating_parameters"),
    path("<str:identifier>/rating-summary/", RatingSummaryView.as_view(), name="doctor_rating_summary"),
    path("<str:identifier>/review-eligibility/", ReviewEligibilityView.as_view(), name="doctor_review_eligibility"),
    re_path(
        r"^(?P<identifier>(?!public/$)[^/]+)/$",
        PublicDoctorDetailView.as_view(),
        name="public_doctor_detail",
    ),
    
    # مسیرهای تعاملی (نیازمند لاگین کاربر عادی)
    path("<str:identifier>/like/", LikeDoctorView.as_view(), name="like_doctor"),
    path("<str:identifier>/reviews/", ReviewListCreateView.as_view(), name="doctor_reviews"),
]

from django.urls import path
from .views import (
    AdminUserListView, AdminDoctorListView, 
    AdminUserDeactivateView, AdminUserReactivateView,
    AdminDoctorApproveView, AdminDoctorRejectView
)

urlpatterns = [
    path("users/", AdminUserListView.as_view(), name="admin_user_list"),
    path("doctors/", AdminDoctorListView.as_view(), name="admin_doctor_list"),
    path("users/<int:pk>/deactivate/", AdminUserDeactivateView.as_view(), name="admin_user_deactivate"),
    path("users/<int:pk>/reactivate/", AdminUserReactivateView.as_view(), name="admin_user_reactivate"),
    path("doctors/<int:pk>/approve/", AdminDoctorApproveView.as_view(), name="admin_doctor_approve"),
    path("doctors/<int:pk>/reject/", AdminDoctorRejectView.as_view(), name="admin_doctor_reject"),
]
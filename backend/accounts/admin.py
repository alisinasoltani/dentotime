"""Admin configuration for the accounts application."""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    DentalService,
    Doctor,
    DoctorReview,
    InsuranceProvider,
    RatingParameter,
    User,
)


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """Admin panel configuration for the custom User model."""

    list_display = ("username", "email", "role", "is_staff", "is_active")
    list_filter = ("role", "is_staff", "is_active")
    fieldsets = UserAdmin.fieldsets + (
        ("Role", {"fields": ("role",)}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Role", {"fields": ("role",)}),
    )
    search_fields = ("username", "email")
    ordering = ("username",)


@admin.register(RatingParameter)
class RatingParameterAdmin(admin.ModelAdmin):
    list_display = ("label", "input_type", "position", "is_active", "updated_at")
    list_editable = ("position", "is_active")
    list_filter = ("input_type", "is_active")
    search_fields = ("key", "label", "prompt")
    ordering = ("position", "pk")
    readonly_fields = ("created_at", "updated_at")


@admin.register(DentalService)
class DentalServiceAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "position", "is_active")
    list_editable = ("position", "is_active")
    list_filter = ("is_active",)
    search_fields = ("title", "short_title", "slug")
    prepopulated_fields = {"slug": ("title",)}
    ordering = ("position", "pk")


@admin.register(InsuranceProvider)
class InsuranceProviderAdmin(admin.ModelAdmin):
    list_display = ("name", "position", "is_active")
    list_editable = ("position", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name",)
    ordering = ("position", "pk")


@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ("display_name", "specialty", "clinic_name", "verification_status", "is_active")
    list_filter = ("verification_status", "is_active", "services", "insurances")
    search_fields = ("first_name", "last_name", "username", "clinic_name", "specialty")
    filter_horizontal = ("services", "insurances")


@admin.register(DoctorReview)
class DoctorReviewAdmin(admin.ModelAdmin):
    list_display = ("doctor", "user", "rating", "created_at")
    list_filter = ("rating", "created_at")
    search_fields = ("doctor__first_name", "doctor__last_name", "user__phone_number", "comment")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("doctor", "user")

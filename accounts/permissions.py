"""Custom permission classes for role-based access control."""

from rest_framework.permissions import BasePermission, SAFE_METHODS


def is_active_authenticated(user):
    return bool(user and user.is_authenticated and user.is_active)


class IsActiveAuthenticated(BasePermission):
    """Require a currently active authenticated account."""

    def has_permission(self, request, view):
        return is_active_authenticated(request.user)


class IsAdminRole(BasePermission):
    """Allows access only to users with the ADMIN role."""
    def has_permission(self, request, view):
        return bool(
            is_active_authenticated(request.user) and
            request.user.is_admin_role
        )


class IsDoctorRole(BasePermission):
    """Allows access only to users with the DOCTOR role."""
    def has_permission(self, request, view):
        return bool(
            is_active_authenticated(request.user) and
            request.user.is_doctor_role
        )


class IsNormalUser(BasePermission):
    """Allows access only to users with the normal USER role."""
    def has_permission(self, request, view):
        return bool(
            is_active_authenticated(request.user) and
            request.user.is_normal_user
        )


class IsOwnerOrAdmin(BasePermission):
    """
    Allows access to the owner of the object or an Admin.
    Used for object-level permissions (e.g., editing own profile, viewing own appointments).
    """
    def has_permission(self, request, view):
        return is_active_authenticated(request.user)

    def has_object_permission(self, request, view, obj):
        if request.user.is_admin_role:
            return True
            
        # Handle User model instances
        if hasattr(obj, 'id') and obj.id == request.user.id:
            return True
            
        # Handle Appointment model instances
        if hasattr(obj, 'patient_id') and obj.patient_id == request.user.id:
            return True
            
        # Handle MessageThread model instances
        if hasattr(obj, 'participant_id') and obj.participant_id == request.user.id:
            return True
            
        # Handle Message model instances
        if hasattr(obj, 'sender_id') and obj.sender_id == request.user.id:
            return True
            
        # Handle Doctor model instances (MTI shares the PK with User)
        if hasattr(obj, 'user_ptr_id') and obj.user_ptr_id == request.user.id:
            return True

        return False


class IsVerifiedDoctor(BasePermission):
    """
    Allows access only to Doctors who have been approved by an Admin.
    """
    def has_permission(self, request, view):
        user = request.user
        if not (is_active_authenticated(user) and user.is_doctor_role):
            return False
            
        doctor_profile = getattr(user, "doctor_profile", None)
        return bool(doctor_profile and doctor_profile.is_verified and doctor_profile.is_active)


class IsDoctorOrAdmin(BasePermission):
    """Allow active doctors and system administrators."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            is_active_authenticated(user)
            and (user.is_doctor_role or user.is_admin_role)
        )

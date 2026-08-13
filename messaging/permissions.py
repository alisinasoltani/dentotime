from rest_framework.permissions import BasePermission
from accounts.permissions import is_active_authenticated

class IsParticipantOrAdmin(BasePermission):
    """
    Allows access only to the participant of the thread or an Admin.
    """
    def has_permission(self, request, view):
        user = request.user
        if not is_active_authenticated(user):
            return False
        if user.is_admin_role or user.is_normal_user:
            return True
        if user.is_doctor_role:
            doctor = getattr(user, "doctor_profile", None)
            allowed = bool(doctor and doctor.chat_enabled)
            if not allowed:
                self.message = "chat privileges are disabled"
            return allowed
        return False

    def has_object_permission(self, request, view, obj):
        if request.user.is_admin_role:
            return True
        return obj.participant_id == request.user.id


class CanCreateOwnThread(BasePermission):
    """Allow patients and approved doctors to create their support thread."""

    def has_permission(self, request, view):
        user = request.user
        if not is_active_authenticated(user):
            return False
        if user.is_normal_user:
            return True
        if user.is_doctor_role:
            doctor = getattr(user, "doctor_profile", None)
            allowed = bool(doctor and doctor.chat_enabled)
            if not allowed:
                self.message = "chat privileges are disabled"
            return allowed
        return False

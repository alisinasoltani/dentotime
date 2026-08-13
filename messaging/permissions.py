from rest_framework.permissions import BasePermission

class IsParticipantOrAdmin(BasePermission):
    """
    Allows access only to the participant of the thread or an Admin.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_admin_role:
            return True
        return obj.participant_id == request.user.id
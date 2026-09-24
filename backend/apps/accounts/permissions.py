from rest_framework import permissions

class IsAdmin(permissions.BasePermission):
    """
    Allows access only to Admin users.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_admin_user()
        )


class IsFieldAssistant(permissions.BasePermission):
    """
    Allows access only to Field Assistants.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_field_assistant_user()
        )


class IsActiveEmployee(permissions.BasePermission):
    """
    Allows access only if the user has an active Employee profile.
    """
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_admin_user():
            return True
        return hasattr(request.user, 'employee_profile') and request.user.employee_profile.is_active

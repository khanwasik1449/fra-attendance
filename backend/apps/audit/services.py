from .models import AuditLog
from .middleware import get_current_request

class AuditService:
    @staticmethod
    def log(user=None, action=None, object_type='', object_id='', request=None, previous_state=None, new_state=None, remarks=''):
        """
        Creates an immutable audit log record capturing actor, action, target object,
        IP, User-Agent, and state transition diff.
        """
        if request is None:
            request = get_current_request()

        ip = None
        user_agent = ''
        if request:
            ip = getattr(request, 'client_ip', None) or request.META.get('REMOTE_ADDR')
            user_agent = getattr(request, 'user_agent_str', '') or request.META.get('HTTP_USER_AGENT', '')[:500]
            if user is None and hasattr(request, 'user') and request.user.is_authenticated:
                user = request.user

        return AuditLog.objects.create(
            user=user,
            action=action,
            object_type=str(object_type),
            object_id=str(object_id),
            ip_address=ip,
            user_agent=user_agent,
            previous_state=previous_state,
            new_state=new_state,
            remarks=remarks or ''
        )

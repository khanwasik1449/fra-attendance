import threading

_thread_locals = threading.local()

def get_current_request():
    return getattr(_thread_locals, 'request', None)

class AuditMiddleware:
    """
    Middleware that attaches client IP, User-Agent, and current request to thread-local
    storage for seamless audit log attribution.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Extract real client IP taking proxies/load balancers into account
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR')

        user_agent = request.META.get('HTTP_USER_AGENT', '')[:500]

        request.client_ip = ip
        request.user_agent_str = user_agent

        _thread_locals.request = request
        try:
            response = self.get_response(request)
        finally:
            _thread_locals.request = None

        return response

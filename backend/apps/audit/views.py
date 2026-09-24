from rest_framework import generics
from .models import AuditLog
from .serializers import AuditLogSerializer
from apps.accounts.permissions import IsAdmin

class AuditLogListView(generics.ListAPIView):
    """
    List view for system audit logs. Strictly restricted to Admin users.
    Supports filtering by action, object_type, user, and date range.
    """
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = AuditLog.objects.select_related('user').all()
        action = self.request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)
        object_type = self.request.query_params.get('object_type')
        if object_type:
            qs = qs.filter(object_type=object_type)
        user_id = self.request.query_params.get('user')
        if user_id:
            qs = qs.filter(user_id=user_id)
        start_date = self.request.query_params.get('start_date')
        if start_date:
            qs = qs.filter(timestamp__date__gte=start_date)
        end_date = self.request.query_params.get('end_date')
        if end_date:
            qs = qs.filter(timestamp__date__lte=end_date)
        return qs

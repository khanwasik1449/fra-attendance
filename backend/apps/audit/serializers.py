from rest_framework import serializers
from .models import AuditLog

class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True, default='System')
    role = serializers.CharField(source='user.role', read_only=True, default='')

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'username', 'role', 'action',
            'object_type', 'object_id', 'timestamp',
            'ip_address', 'user_agent', 'previous_state',
            'new_state', 'remarks'
        ]
        read_only_fields = fields

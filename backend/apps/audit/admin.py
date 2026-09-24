from django.contrib import admin
from .models import AuditLog

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'user', 'action', 'object_type', 'object_id', 'ip_address')
    list_filter = ('action', 'object_type', 'timestamp')
    search_fields = ('user__username', 'object_type', 'object_id', 'remarks', 'ip_address')
    readonly_fields = (
        'user', 'action', 'object_type', 'object_id', 'timestamp',
        'ip_address', 'user_agent', 'previous_state', 'new_state', 'remarks'
    )
    date_hierarchy = 'timestamp'

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

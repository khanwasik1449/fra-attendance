from django.contrib import admin
from .models import Holiday, LeaveRequest

@admin.register(Holiday)
class HolidayAdmin(admin.ModelAdmin):
    list_display = ('name', 'date', 'is_recurring', 'created_at')
    list_filter = ('is_recurring', 'date')
    search_fields = ('name',)

@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'employee', 'leave_type', 'start_date', 'end_date',
        'status', 'reviewed_by', 'reviewed_at'
    )
    list_filter = ('status', 'leave_type', 'start_date')
    search_fields = ('employee__employee_id', 'employee__full_name', 'reason')

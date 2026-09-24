from django.contrib import admin
from .models import ManualAttendanceRequest

@admin.register(ManualAttendanceRequest)
class ManualAttendanceRequestAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'employee', 'attendance_date', 'status',
        'requested_check_in', 'requested_check_out', 'reviewed_by', 'reviewed_at'
    )
    list_filter = ('status', 'attendance_date')
    search_fields = ('employee__employee_id', 'employee__full_name', 'reason')

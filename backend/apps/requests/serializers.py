from rest_framework import serializers
from .models import ManualAttendanceRequest
from apps.attendance.services import format_time_display

class ManualAttendanceRequestSerializer(serializers.ModelSerializer):
    employee_id = serializers.CharField(source='employee.employee_id', read_only=True)
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    department_name = serializers.CharField(source='employee.department.name', read_only=True, default='')
    reviewed_by_username = serializers.CharField(source='reviewed_by.username', read_only=True, default='')
    requested_check_in_display = serializers.SerializerMethodField()
    requested_check_out_display = serializers.SerializerMethodField()

    class Meta:
        model = ManualAttendanceRequest
        fields = [
            'id', 'employee', 'employee_id', 'employee_name', 'department_name',
            'attendance_date', 'requested_check_in', 'requested_check_out',
            'requested_check_in_display', 'requested_check_out_display',
            'reason', 'remarks', 'status',
            'reviewed_by', 'reviewed_by_username', 'reviewed_at', 'admin_remarks',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'employee', 'status', 'reviewed_by',
            'reviewed_at', 'admin_remarks', 'created_at', 'updated_at'
        ]

    def get_requested_check_in_display(self, obj):
        return format_time_display(obj.requested_check_in)

    def get_requested_check_out_display(self, obj):
        return format_time_display(obj.requested_check_out)


class ManualAttendanceRequestCreateSerializer(serializers.Serializer):
    attendance_date = serializers.DateField()
    requested_check_in = serializers.DateTimeField()
    requested_check_out = serializers.DateTimeField()
    reason = serializers.CharField(max_length=1000)
    remarks = serializers.CharField(max_length=1000, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['requested_check_out'] <= attrs['requested_check_in']:
            raise serializers.ValidationError({"detail": "Requested check-out time must be after check-in time."})
        return attrs


class ReviewActionSerializer(serializers.Serializer):
    admin_remarks = serializers.CharField(required=False, allow_blank=True, default='')

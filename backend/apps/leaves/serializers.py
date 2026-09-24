from rest_framework import serializers
from .models import Holiday, LeaveRequest

class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ['id', 'name', 'date', 'description', 'is_recurring', 'created_at']
        read_only_fields = ['id', 'created_at']


class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_id = serializers.CharField(source='employee.employee_id', read_only=True)
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    department_name = serializers.CharField(source='employee.department.name', read_only=True, default='')
    leave_type_display = serializers.CharField(source='get_leave_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    reviewed_by_username = serializers.CharField(source='reviewed_by.username', read_only=True, default='')

    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'employee', 'employee_id', 'employee_name', 'department_name',
            'leave_type', 'leave_type_display',
            'start_date', 'end_date', 'total_days',
            'reason', 'status', 'status_display',
            'reviewed_by', 'reviewed_by_username', 'reviewed_at', 'admin_remarks',
            'created_at', 'updated_at'
        ]
        read_only_fields = fields


class LeaveRequestCreateSerializer(serializers.Serializer):
    leave_type = serializers.ChoiceField(choices=LeaveRequest.LeaveType.choices, default=LeaveRequest.LeaveType.CASUAL)
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    reason = serializers.CharField(min_length=5, max_length=1000)

    def validate(self, attrs):
        if attrs['start_date'] > attrs['end_date']:
            raise serializers.ValidationError({"end_date": "End date cannot be earlier than start date."})
        return attrs


class LeaveReviewActionSerializer(serializers.Serializer):
    admin_remarks = serializers.CharField(required=False, allow_blank=True, default='')

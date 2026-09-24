from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.accounts.models import Employee

class AttendanceSetting(models.Model):
    """
    Dynamic configuration for attendance rules to eliminate hardcoded business logic.
    """
    work_start_time = models.TimeField(default='09:00:00', help_text="Official shift start time")
    work_end_time = models.TimeField(default='17:00:00', help_text="Official shift end time")
    late_grace_minutes = models.PositiveIntegerField(
        default=15,
        help_text="Minutes after work_start_time before an attendance is marked LATE"
    )
    half_day_minimum_minutes = models.PositiveIntegerField(
        default=240,
        help_text="Minimum working duration for a half-day (in minutes)"
    )
    full_day_minimum_minutes = models.PositiveIntegerField(
        default=480,
        help_text="Minimum working duration for a full day (in minutes)"
    )
    timezone = models.CharField(
        max_length=50,
        default='Asia/Dhaka',
        help_text="Official company attendance timezone"
    )
    require_gps = models.BooleanField(
        default=False,
        help_text="Require GPS coordinates during mobile check-in/out"
    )
    enforce_geofence = models.BooleanField(
        default=False,
        help_text="Strictly block check-in outside authorized site radius"
    )
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Attendance Setting"
        verbose_name_plural = "Attendance Settings"

    @classmethod
    def get_active(cls):
        setting = cls.objects.filter(is_active=True).order_by('-updated_at').first()
        if not setting:
            setting = cls.objects.create()
        return setting


class Attendance(models.Model):
    class Type(models.TextChoices):
        AUTOMATIC = 'AUTOMATIC', 'Automatic'
        MANUAL = 'MANUAL', 'Manual'

    class Status(models.TextChoices):
        PRESENT = 'PRESENT', 'Present'
        LATE = 'LATE', 'Late'
        INCOMPLETE = 'INCOMPLETE', 'Incomplete'
        ABSENT = 'ABSENT', 'Absent'

    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='attendances'
    )
    attendance_date = models.DateField(
        db_index=True,
        help_text="Calendar date of attendance in Asia/Dhaka timezone"
    )
    check_in_time = models.DateTimeField(
        help_text="Server-side recorded check-in timestamp"
    )
    check_out_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Server-side recorded check-out timestamp"
    )
    working_duration_minutes = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Total elapsed working duration in minutes"
    )
    attendance_type = models.CharField(
        max_length=20,
        choices=Type.choices,
        default=Type.AUTOMATIC,
        db_index=True
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PRESENT,
        db_index=True
    )

    # GPS Location & Geofencing fields
    check_in_latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Latitude captured at check-in"
    )
    check_in_longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Longitude captured at check-in"
    )
    check_in_accuracy = models.FloatField(
        null=True,
        blank=True,
        help_text="GPS accuracy in meters at check-in"
    )
    check_in_distance_meters = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Distance in meters from assigned project site at check-in"
    )
    check_in_is_geofence_violation = models.BooleanField(
        default=False,
        help_text="True if check-in was outside project geofence perimeter"
    )
    check_in_address = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Human-readable physical location address at check-in"
    )

    check_out_latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Latitude captured at check-out"
    )
    check_out_longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Longitude captured at check-out"
    )
    check_out_accuracy = models.FloatField(
        null=True,
        blank=True,
        help_text="GPS accuracy in meters at check-out"
    )
    check_out_distance_meters = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Distance in meters from assigned project site at check-out"
    )
    check_out_is_geofence_violation = models.BooleanField(
        default=False,
        help_text="True if check-out was outside project geofence perimeter"
    )
    check_out_address = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Human-readable physical location address at check-out"
    )

    # Manual Approval Traceability fields
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_attendances'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    admin_remarks = models.TextField(blank=True, default='')
    manual_request = models.OneToOneField(
        'requests.ManualAttendanceRequest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resulting_attendance'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-attendance_date', '-check_in_time']
        constraints = [
            models.UniqueConstraint(
                fields=['employee', 'attendance_date'],
                name='unique_employee_attendance_date'
            )
        ]
        indexes = [
            models.Index(fields=['attendance_date', 'status']),
            models.Index(fields=['employee', 'attendance_date']),
            models.Index(fields=['attendance_type']),
        ]

    def __str__(self):
        return f"{self.employee.employee_id} - {self.attendance_date} ({self.status})"

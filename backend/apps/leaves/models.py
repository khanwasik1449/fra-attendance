from django.db import models
from django.conf import settings
from apps.accounts.models import Employee

class Holiday(models.Model):
    """
    Official public or company holidays.
    """
    name = models.CharField(max_length=150)
    date = models.DateField(unique=True, db_index=True)
    description = models.TextField(blank=True, default='')
    is_recurring = models.BooleanField(
        default=False,
        help_text="Whether this holiday repeats annually on the same month/day"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['date']
        verbose_name = "Holiday"
        verbose_name_plural = "Holidays"

    def __str__(self):
        return f"{self.name} ({self.date})"


class LeaveRequest(models.Model):
    """
    Formal leave application submitted by Field Assistants and reviewed by Admins.
    """
    class LeaveType(models.TextChoices):
        CASUAL = 'CASUAL', 'Casual Leave'
        SICK = 'SICK', 'Sick Leave'
        EMERGENCY = 'EMERGENCY', 'Emergency Leave'
        EARNED = 'EARNED', 'Earned / Annual Leave'
        MATERNITY = 'MATERNITY', 'Maternity / Paternity Leave'
        OTHER = 'OTHER', 'Other'

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name='leave_requests'
    )
    leave_type = models.CharField(
        max_length=20,
        choices=LeaveType.choices,
        default=LeaveType.CASUAL,
        db_index=True
    )
    start_date = models.DateField(
        db_index=True,
        help_text="Start date of leave period (inclusive)"
    )
    end_date = models.DateField(
        db_index=True,
        help_text="End date of leave period (inclusive)"
    )
    total_days = models.PositiveIntegerField(
        default=1,
        help_text="Total calendar days spanned by the leave request"
    )
    reason = models.TextField(
        help_text="Detailed justification or reason for leave"
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_leave_requests'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_remarks = models.TextField(
        blank=True,
        default='',
        help_text="Reviewer comments or approval/rejection justification"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'start_date']),
            models.Index(fields=['employee', 'status']),
            models.Index(fields=['start_date', 'end_date']),
        ]

    def __str__(self):
        return f"Leave #{self.id} - {self.employee.employee_id} ({self.leave_type}) {self.start_date} to {self.end_date} [{self.status}]"

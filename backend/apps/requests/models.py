from django.db import models
from django.conf import settings
from apps.accounts.models import Employee

class ManualAttendanceRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'

    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name='manual_requests'
    )
    attendance_date = models.DateField(
        db_index=True,
        help_text="The date for which manual attendance is requested"
    )
    requested_check_in = models.DateTimeField()
    requested_check_out = models.DateTimeField()
    reason = models.TextField(
        help_text="Reason for missing automatic check-in/out"
    )
    remarks = models.TextField(
        blank=True,
        default='',
        help_text="Optional employee remarks"
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
        related_name='reviewed_manual_requests'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_remarks = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'attendance_date']),
            models.Index(fields=['employee', 'status']),
        ]

    def __str__(self):
        return f"Req #{self.id} - {self.employee.employee_id} ({self.attendance_date}) - {self.status}"

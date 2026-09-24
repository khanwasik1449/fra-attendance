from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Administrator'
        FIELD_ASSISTANT = 'FIELD_ASSISTANT', 'Field Assistant'

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.FIELD_ASSISTANT,
        db_index=True
    )

    def is_admin_user(self):
        return self.role == self.Role.ADMIN or self.is_superuser or self.is_staff

    def is_field_assistant_user(self):
        return self.role == self.Role.FIELD_ASSISTANT


class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=20, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.code})"


class Project(models.Model):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=30, unique=True)
    description = models.TextField(blank=True, default='')
    division = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="Bangladesh Division (e.g. Dhaka, Chattogram)"
    )
    district = models.CharField(
        max_length=50,
        blank=True,
        default='',
        db_index=True,
        help_text="District / Zilla (e.g. Gazipur, Cumilla)"
    )
    upazila = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="Upazila / Thana (e.g. Tongi, Savar)"
    )
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Target latitude for geofenced site check-in (auto-populated from district center)"
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        help_text="Target longitude for geofenced site check-in (auto-populated from district center)"
    )
    radius_meters = models.PositiveIntegerField(
        default=500,
        help_text="Geofence boundary radius in meters"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.code})"


class Employee(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='employee_profile'
    )
    employee_id = models.CharField(
        max_length=30,
        unique=True,
        db_index=True,
        help_text="Unique organizational identifier e.g. FA-001"
    )
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True, default='')
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees'
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='employees'
    )
    division = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="Bangladesh Division (e.g. Dhaka, Chattogram)"
    )
    district = models.CharField(
        max_length=50,
        blank=True,
        default='',
        db_index=True,
        help_text="Assigned District / Zilla (e.g. Gazipur, Sylhet)"
    )
    upazila = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="Assigned Upazila / Thana (e.g. Tongi, Sreepur)"
    )
    designation = models.CharField(max_length=100, default='Field Assistant')
    joining_date = models.DateField(default=timezone.localdate)
    is_active = models.BooleanField(default=True, db_index=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['employee_id']
        indexes = [
            models.Index(fields=['is_active', 'employee_id']),
        ]

    def __str__(self):
        return f"{self.employee_id} - {self.full_name}"

    def deactivate(self):
        """Soft deactivation preserving historical attendance records."""
        self.is_active = False
        self.deactivated_at = timezone.now()
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        self.save(update_fields=['is_active', 'deactivated_at'])

    def activate(self):
        """Reactivate employee and corresponding user account."""
        self.is_active = True
        self.deactivated_at = None
        self.user.is_active = True
        self.user.save(update_fields=['is_active'])
        self.save(update_fields=['is_active', 'deactivated_at'])

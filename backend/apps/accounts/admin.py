from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Department, Project, Employee

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'role', 'is_active', 'is_staff')
    list_filter = ('role', 'is_active', 'is_staff')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('FAMS Role', {'fields': ('role',)}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('FAMS Role', {'fields': ('role',)}),
    )

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'is_active', 'created_at')
    search_fields = ('name', 'code')
    list_filter = ('is_active',)

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'district', 'upazila', 'division', 'is_active', 'created_at')
    search_fields = ('name', 'code', 'district', 'upazila')
    list_filter = ('division', 'is_active')

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('employee_id', 'full_name', 'phone', 'project', 'department', 'district', 'is_active')
    search_fields = ('employee_id', 'full_name', 'phone', 'district', 'user__username')
    list_filter = ('is_active', 'department', 'project', 'division')
    actions = ['activate_employees', 'deactivate_employees']

    @admin.action(description="Reactivate selected employees")
    def activate_employees(self, request, queryset):
        for emp in queryset:
            emp.activate()

    @admin.action(description="Soft-deactivate selected employees")
    def deactivate_employees(self, request, queryset):
        for emp in queryset:
            emp.deactivate()

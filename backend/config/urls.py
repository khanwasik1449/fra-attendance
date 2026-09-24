"""
FAMS URL Configuration
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('django-admin/', admin.site.urls),
    
    # Core API v1 routes
    path('api/v1/auth/', include('apps.accounts.urls')),
    path('api/v1/attendance/', include('apps.attendance.urls')),
    path('api/v1/manual-requests/', include('apps.requests.urls')),
    path('api/v1/leaves/', include('apps.leaves.urls')),
    path('api/v1/admin/reports/', include('apps.reports.urls')),
    path('api/v1/admin/audit-logs/', include('apps.audit.urls')),
]

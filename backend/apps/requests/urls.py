from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SubmitManualRequestView, MyManualRequestsView, AdminManualRequestViewSet

router = DefaultRouter()
router.register(r'admin', AdminManualRequestViewSet, basename='admin_manual_requests')

urlpatterns = [
    path('', SubmitManualRequestView.as_view(), name='manual_request_submit'),
    path('my-requests/', MyManualRequestsView.as_view(), name='my_manual_requests'),
    path('', include(router.urls)),
]

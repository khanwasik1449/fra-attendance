from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SubmitLeaveRequestView,
    MyLeaveRequestsView,
    AdminLeaveRequestViewSet,
    HolidayViewSet
)

router = DefaultRouter()
router.register('admin/requests', AdminLeaveRequestViewSet, basename='admin-leave-requests')
router.register('holidays', HolidayViewSet, basename='holidays')

urlpatterns = [
    path('apply/', SubmitLeaveRequestView.as_view(), name='leave-apply'),
    path('my-leaves/', MyLeaveRequestsView.as_view(), name='my-leaves'),
    path('', include(router.urls)),
]

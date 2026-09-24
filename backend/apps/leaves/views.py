from rest_framework import status, generics, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action

from .models import LeaveRequest, Holiday
from .serializers import (
    LeaveRequestSerializer,
    LeaveRequestCreateSerializer,
    LeaveReviewActionSerializer,
    HolidaySerializer
)
from .services import LeaveService, HolidayService
from apps.accounts.permissions import IsAdmin, IsFieldAssistant, IsActiveEmployee

class SubmitLeaveRequestView(APIView):
    permission_classes = [IsAuthenticated, IsFieldAssistant, IsActiveEmployee]

    def post(self, request):
        serializer = LeaveRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        employee = request.user.employee_profile
        leave_req = LeaveService.submit_leave_request(
            employee=employee,
            leave_type=data['leave_type'],
            start_date=data['start_date'],
            end_date=data['end_date'],
            reason=data['reason'],
            request=request
        )

        return Response({
            'detail': f"Leave request for {leave_req.total_days} day(s) submitted successfully.",
            'leave_request': LeaveRequestSerializer(leave_req).data
        }, status=status.HTTP_201_CREATED)


class MyLeaveRequestsView(generics.ListAPIView):
    """
    Returns list of leave requests for the authenticated Field Assistant.
    """
    serializer_class = LeaveRequestSerializer
    permission_classes = [IsAuthenticated, IsFieldAssistant, IsActiveEmployee]
    pagination_class = None

    def get_queryset(self):
        employee = self.request.user.employee_profile
        qs = LeaveRequest.objects.filter(employee=employee).order_by('-created_at')

        status_val = self.request.query_params.get('status')
        if status_val:
            qs = qs.filter(status=status_val)

        year = self.request.query_params.get('year')
        if year:
            qs = qs.filter(start_date__year=year)

        return qs


class AdminLeaveRequestViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Administrator viewset for reviewing, approving, and rejecting leave requests.
    """
    queryset = (
        LeaveRequest.objects
        .select_related('employee', 'employee__department', 'reviewed_by')
        .all()
        .order_by('-created_at')
    )
    serializer_class = LeaveRequestSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        status_val = self.request.query_params.get('status')
        if status_val:
            qs = qs.filter(status=status_val)

        employee_id = self.request.query_params.get('employee_id')
        if employee_id:
            qs = qs.filter(employee__employee_id=employee_id)

        leave_type = self.request.query_params.get('leave_type')
        if leave_type:
            qs = qs.filter(leave_type=leave_type)

        return qs

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        serializer = LeaveReviewActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        admin_remarks = serializer.validated_data.get('admin_remarks', '')

        leave_req = LeaveService.approve_leave_request(
            request_id=pk,
            admin_user=request.user,
            admin_remarks=admin_remarks,
            request=request
        )

        return Response({
            'detail': f"Leave request #{leave_req.id} approved successfully.",
            'leave_request': LeaveRequestSerializer(leave_req).data
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        serializer = LeaveReviewActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        admin_remarks = serializer.validated_data.get('admin_remarks', '')

        leave_req = LeaveService.reject_leave_request(
            request_id=pk,
            admin_user=request.user,
            admin_remarks=admin_remarks,
            request=request
        )

        return Response({
            'detail': f"Leave request #{leave_req.id} rejected.",
            'leave_request': LeaveRequestSerializer(leave_req).data
        }, status=status.HTTP_200_OK)


class HolidayViewSet(viewsets.ModelViewSet):
    """
    Holidays can be viewed by all authenticated users, but only created/deleted by Admins.
    """
    queryset = Holiday.objects.all().order_by('date')
    serializer_class = HolidaySerializer
    pagination_class = None

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        return [IsAdmin()]

    def perform_create(self, serializer):
        holiday = serializer.save()
        HolidayService.create_holiday(
            name=holiday.name,
            date_val=holiday.date,
            description=holiday.description,
            is_recurring=holiday.is_recurring,
            admin_user=self.request.user,
            request=self.request
        )

    def perform_destroy(self, instance):
        HolidayService.delete_holiday(
            holiday_id=instance.id,
            admin_user=self.request.user,
            request=self.request
        )

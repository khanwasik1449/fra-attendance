from datetime import datetime, date
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from rest_framework import exceptions

from .models import LeaveRequest, Holiday
from apps.audit.services import AuditService

class LeaveService:
    @staticmethod
    def submit_leave_request(employee, leave_type, start_date, end_date, reason, request=None):
        """
        Validates date consistency, prevents overlapping leave requests, and records audit trail.
        """
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

        if start_date > end_date:
            raise exceptions.ValidationError({
                "end_date": "Leave end date cannot be earlier than start date."
            })

        # Overlap check for existing PENDING or APPROVED leaves
        overlapping = LeaveRequest.objects.filter(
            employee=employee,
            status__in=[LeaveRequest.Status.PENDING, LeaveRequest.Status.APPROVED]
        ).filter(
            start_date__lte=end_date,
            end_date__gte=start_date
        ).first()

        if overlapping:
            raise exceptions.ValidationError({
                "detail": f"You already have a {overlapping.status.lower()} leave request ({overlapping.start_date} to {overlapping.end_date}) overlapping this date range."
            })

        total_days = (end_date - start_date).days + 1

        with transaction.atomic():
            leave_req = LeaveRequest.objects.create(
                employee=employee,
                leave_type=leave_type,
                start_date=start_date,
                end_date=end_date,
                total_days=total_days,
                reason=reason,
                status=LeaveRequest.Status.PENDING
            )

            AuditService.log(
                user=employee.user,
                action='LEAVE_REQUEST_SUBMITTED',
                object_type='LeaveRequest',
                object_id=leave_req.id,
                request=request,
                new_state={
                    'leave_type': leave_type,
                    'start_date': str(start_date),
                    'end_date': str(end_date),
                    'total_days': total_days,
                    'reason': reason,
                    'status': LeaveRequest.Status.PENDING
                },
                remarks=f"Applied for {total_days} day(s) {leave_type} leave ({start_date} to {end_date})"
            )

            return leave_req

    @staticmethod
    def approve_leave_request(request_id, admin_user, admin_remarks='', request=None):
        """
        Approves an active leave request, locking the record and recording audit trail.
        """
        with transaction.atomic():
            leave_req = (
                LeaveRequest.objects
                .select_for_update()
                .filter(id=request_id)
                .first()
            )

            if not leave_req:
                raise exceptions.NotFound("Leave request not found.")

            if leave_req.status != LeaveRequest.Status.PENDING:
                raise exceptions.ValidationError(
                    f"This leave request has already been {leave_req.status.lower()}."
                )

            prev_state = {
                'status': leave_req.status,
                'reviewed_by': None,
                'reviewed_at': None
            }

            now_dt = timezone.now()
            leave_req.status = LeaveRequest.Status.APPROVED
            leave_req.reviewed_by = admin_user
            leave_req.reviewed_at = now_dt
            leave_req.admin_remarks = admin_remarks
            leave_req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'admin_remarks', 'updated_at'])

            AuditService.log(
                user=admin_user,
                action='LEAVE_REQUEST_APPROVED',
                object_type='LeaveRequest',
                object_id=leave_req.id,
                request=request,
                previous_state=prev_state,
                new_state={
                    'status': LeaveRequest.Status.APPROVED,
                    'reviewed_by': admin_user.username,
                    'reviewed_at': now_dt.isoformat(),
                    'admin_remarks': admin_remarks
                },
                remarks=f"Approved leave request #{leave_req.id} for {leave_req.employee.employee_id}. Remarks: {admin_remarks or 'None'}"
            )

            return leave_req

    @staticmethod
    def reject_leave_request(request_id, admin_user, admin_remarks='', request=None):
        """
        Rejects an active leave request with justification.
        """
        with transaction.atomic():
            leave_req = (
                LeaveRequest.objects
                .select_for_update()
                .filter(id=request_id)
                .first()
            )

            if not leave_req:
                raise exceptions.NotFound("Leave request not found.")

            if leave_req.status != LeaveRequest.Status.PENDING:
                raise exceptions.ValidationError(
                    f"This leave request has already been {leave_req.status.lower()}."
                )

            prev_state = {
                'status': leave_req.status,
                'reviewed_by': None,
                'reviewed_at': None
            }

            now_dt = timezone.now()
            leave_req.status = LeaveRequest.Status.REJECTED
            leave_req.reviewed_by = admin_user
            leave_req.reviewed_at = now_dt
            leave_req.admin_remarks = admin_remarks
            leave_req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'admin_remarks', 'updated_at'])

            AuditService.log(
                user=admin_user,
                action='LEAVE_REQUEST_REJECTED',
                object_type='LeaveRequest',
                object_id=leave_req.id,
                request=request,
                previous_state=prev_state,
                new_state={
                    'status': LeaveRequest.Status.REJECTED,
                    'reviewed_by': admin_user.username,
                    'reviewed_at': now_dt.isoformat(),
                    'admin_remarks': admin_remarks
                },
                remarks=f"Rejected leave request #{leave_req.id} for {leave_req.employee.employee_id}. Reason: {admin_remarks or 'None'}"
            )

            return leave_req


class HolidayService:
    @staticmethod
    def create_holiday(name, date_val, description='', is_recurring=False, admin_user=None, request=None):
        if isinstance(date_val, str):
            date_val = datetime.strptime(date_val, "%Y-%m-%d").date()

        if Holiday.objects.filter(date=date_val).exists():
            raise exceptions.ValidationError({"date": f"A holiday on {date_val} already exists."})

        holiday = Holiday.objects.create(
            name=name,
            date=date_val,
            description=description,
            is_recurring=is_recurring
        )

        if admin_user:
            AuditService.log(
                user=admin_user,
                action='HOLIDAY_CREATED',
                object_type='Holiday',
                object_id=holiday.id,
                request=request,
                new_state={'name': name, 'date': str(date_val), 'description': description},
                remarks=f"Added official holiday: {name} on {date_val}"
            )

        return holiday

    @staticmethod
    def delete_holiday(holiday_id, admin_user=None, request=None):
        holiday = Holiday.objects.filter(id=holiday_id).first()
        if not holiday:
            raise exceptions.NotFound("Holiday not found.")

        hol_name = holiday.name
        hol_date = holiday.date
        holiday.delete()

        if admin_user:
            AuditService.log(
                user=admin_user,
                action='HOLIDAY_DELETED',
                object_type='Holiday',
                object_id=holiday_id,
                request=request,
                remarks=f"Deleted holiday: {hol_name} on {hol_date}"
            )

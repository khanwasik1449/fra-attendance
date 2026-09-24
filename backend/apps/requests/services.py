from datetime import datetime, time, timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework import exceptions, serializers

from .models import ManualAttendanceRequest
from apps.attendance.models import Attendance, AttendanceSetting
from apps.attendance.services import (
    ConflictException,
    get_dhaka_datetime,
    format_time_display,
    get_server_timezone
)
from apps.audit.services import AuditService

class ManualRequestService:
    @staticmethod
    def create_request(employee, attendance_date, requested_check_in, requested_check_out, reason, remarks='', request=None):
        if requested_check_out <= requested_check_in:
            raise serializers.ValidationError({"detail": "Requested check-out time must be strictly after requested check-in time."})

        # Invariant: Prevent duplicate pending requests for the same date
        existing_pending = ManualAttendanceRequest.objects.filter(
            employee=employee,
            attendance_date=attendance_date,
            status=ManualAttendanceRequest.Status.PENDING
        ).exists()

        if existing_pending:
            raise ConflictException(
                detail="A pending manual attendance request already exists for this date. Please await administrator review."
            )

        manual_req = ManualAttendanceRequest.objects.create(
            employee=employee,
            attendance_date=attendance_date,
            requested_check_in=requested_check_in,
            requested_check_out=requested_check_out,
            reason=reason,
            remarks=remarks or '',
            status=ManualAttendanceRequest.Status.PENDING
        )

        AuditService.log(
            user=employee.user,
            action='MANUAL_REQUEST_CREATED',
            object_type='ManualAttendanceRequest',
            object_id=manual_req.id,
            request=request,
            new_state={
                'attendance_date': str(attendance_date),
                'requested_check_in': requested_check_in.isoformat(),
                'requested_check_out': requested_check_out.isoformat(),
                'reason': reason
            },
            remarks=f"Submitted manual attendance request for {attendance_date}"
        )

        return manual_req

    @staticmethod
    def approve_request(req_id, admin_user, admin_remarks='', request=None):
        with transaction.atomic():
            manual_req = (
                ManualAttendanceRequest.objects
                .select_for_update()
                .select_related('employee')
                .filter(id=req_id)
                .first()
            )

            if not manual_req:
                raise exceptions.NotFound(detail="Manual attendance request not found.")

            if manual_req.status != ManualAttendanceRequest.Status.PENDING:
                raise serializers.ValidationError({"detail": f"Request has already been processed with status: {manual_req.status}."})

            now = get_dhaka_datetime()
            duration_seconds = max(0, (manual_req.requested_check_out - manual_req.requested_check_in).total_seconds())
            duration_minutes = int(round(duration_seconds / 60))

            # Determine late status
            setting = AttendanceSetting.get_active()
            work_start = setting.work_start_time
            dummy_date = datetime(2000, 1, 1, work_start.hour, work_start.minute, work_start.second)
            cutoff_dt = dummy_date + timedelta(minutes=setting.late_grace_minutes)
            
            tz = get_server_timezone()
            local_check_in = manual_req.requested_check_in.astimezone(tz)
            att_status = (
                Attendance.Status.LATE
                if local_check_in.time() > cutoff_dt.time()
                else Attendance.Status.PRESENT
            )

            # Check if an attendance record already exists for this date (e.g. Incomplete automatic record)
            attendance = (
                Attendance.objects
                .select_for_update()
                .filter(employee=manual_req.employee, attendance_date=manual_req.attendance_date)
                .first()
            )

            if attendance:
                # Update existing record
                attendance.check_in_time = manual_req.requested_check_in
                attendance.check_out_time = manual_req.requested_check_out
                attendance.working_duration_minutes = duration_minutes
                attendance.attendance_type = Attendance.Type.MANUAL
                attendance.status = att_status
                attendance.approved_by = admin_user
                attendance.approved_at = now
                attendance.admin_remarks = admin_remarks or 'Approved via manual request.'
                attendance.manual_request = manual_req
                attendance.save()
            else:
                # Create fresh attendance record
                attendance = Attendance.objects.create(
                    employee=manual_req.employee,
                    attendance_date=manual_req.attendance_date,
                    check_in_time=manual_req.requested_check_in,
                    check_out_time=manual_req.requested_check_out,
                    working_duration_minutes=duration_minutes,
                    attendance_type=Attendance.Type.MANUAL,
                    status=att_status,
                    approved_by=admin_user,
                    approved_at=now,
                    admin_remarks=admin_remarks or 'Approved via manual request.',
                    manual_request=manual_req
                )

            # Update request status
            manual_req.status = ManualAttendanceRequest.Status.APPROVED
            manual_req.reviewed_by = admin_user
            manual_req.reviewed_at = now
            manual_req.admin_remarks = admin_remarks or ''
            manual_req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'admin_remarks', 'updated_at'])

            AuditService.log(
                user=admin_user,
                action='MANUAL_REQUEST_APPROVED',
                object_type='ManualAttendanceRequest',
                object_id=manual_req.id,
                request=request,
                previous_state={'status': 'PENDING'},
                new_state={'status': 'APPROVED', 'attendance_id': attendance.id},
                remarks=f"Approved manual attendance for {manual_req.employee.employee_id} on {manual_req.attendance_date}. Remarks: {admin_remarks}"
            )

            return manual_req

    @staticmethod
    def reject_request(req_id, admin_user, admin_remarks='', request=None):
        with transaction.atomic():
            manual_req = (
                ManualAttendanceRequest.objects
                .select_for_update()
                .filter(id=req_id)
                .first()
            )

            if not manual_req:
                raise exceptions.NotFound(detail="Manual attendance request not found.")

            if manual_req.status != ManualAttendanceRequest.Status.PENDING:
                raise serializers.ValidationError({"detail": f"Request has already been processed with status: {manual_req.status}."})

            now = get_dhaka_datetime()
            manual_req.status = ManualAttendanceRequest.Status.REJECTED
            manual_req.reviewed_by = admin_user
            manual_req.reviewed_at = now
            manual_req.admin_remarks = admin_remarks or ''
            manual_req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'admin_remarks', 'updated_at'])

            AuditService.log(
                user=admin_user,
                action='MANUAL_REQUEST_REJECTED',
                object_type='ManualAttendanceRequest',
                object_id=manual_req.id,
                request=request,
                previous_state={'status': 'PENDING'},
                new_state={'status': 'REJECTED'},
                remarks=f"Rejected manual attendance request for {manual_req.employee.employee_id} on {manual_req.attendance_date}. Reason: {admin_remarks}"
            )

            return manual_req

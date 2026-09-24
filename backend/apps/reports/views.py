from datetime import datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer

from .services import ReportService
from apps.accounts.permissions import IsAdmin
from apps.attendance.services import get_dhaka_date

class BaseExportView(APIView):
    permission_classes = [IsAdmin]

    def perform_content_negotiation(self, request, force=False):
        """
        Bypass DRF's default format suffix negotiation so that raw CSV/XLSX
        file streams with ?format=csv or ?format=xlsx don't trigger 404 Not Found.
        """
        return (JSONRenderer(), 'application/json')


class DashboardSummaryView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        date_str = request.query_params.get('date')
        report_data = ReportService.get_daily_report(report_date=date_str)
        return Response(report_data['summary'], status=status.HTTP_200_OK)


class DailyReportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        date_str = request.query_params.get('date')
        dept_id = request.query_params.get('department')
        status_filter = request.query_params.get('status')
        type_filter = request.query_params.get('attendance_type')

        data = ReportService.get_daily_report(
            report_date=date_str,
            department_id=dept_id,
            status_filter=status_filter,
            type_filter=type_filter
        )
        return Response(data, status=status.HTTP_200_OK)


class DailyReportExportView(BaseExportView):
    def get(self, request):
        date_str = request.query_params.get('date') or str(get_dhaka_date())
        export_format = (request.query_params.get('format') or 'csv').lower()
        dept_id = request.query_params.get('department')
        status_filter = request.query_params.get('status')
        type_filter = request.query_params.get('attendance_type')

        data = ReportService.get_daily_report(
            report_date=date_str,
            department_id=dept_id,
            status_filter=status_filter,
            type_filter=type_filter
        )
        records = data['records']
        summary = data['summary']

        headers = [
            'Sl No.',
            'Employee ID',
            'Full Name',
            'Designation',
            'Department',
            'Project / Work Site',
            'District / Zilla',
            'Check In (Dhaka Time)',
            'Check In Location & GPS',
            'Check Out (Dhaka Time)',
            'Check Out Location & GPS',
            'Working Hours',
            'Type',
            'Status',
            'Approved By',
            'HR Remarks'
        ]
        rows = []
        for idx, r in enumerate(records, 1):
            # Check-in location string
            in_loc = r.get('check_in_address') or ""
            if r.get('check_in_latitude') and r.get('check_in_longitude'):
                coord_str = f"({r['check_in_latitude']:.4f}, {r['check_in_longitude']:.4f})"
                in_loc = f"{in_loc} {coord_str}".strip() if in_loc else coord_str
            if not in_loc:
                in_loc = "--"

            # Check-out location string
            out_loc = r.get('check_out_address') or ""
            if r.get('check_out_latitude') and r.get('check_out_longitude'):
                coord_str = f"({r['check_out_latitude']:.4f}, {r['check_out_longitude']:.4f})"
                out_loc = f"{out_loc} {coord_str}".strip() if out_loc else coord_str
            if not out_loc:
                out_loc = "--"

            district_str = r.get('district') or ""
            if r.get('upazila'):
                district_str = f"{district_str} ({r['upazila']})" if district_str else r['upazila']
            if not district_str:
                district_str = "--"

            rows.append([
                idx,
                r['employee_id'],
                r['employee_name'],
                r.get('designation') or "Field Assistant",
                r['department'],
                r['project'],
                district_str,
                r['check_in'],
                in_loc,
                r['check_out'],
                out_loc,
                r['duration'],
                r['type'],
                r['status'],
                r['approved_by'],
                r['remarks']
            ])

        filename = f"fams_daily_attendance_register_{date_str}"

        if export_format == 'xlsx':
            return ReportService.export_xlsx_response(
                f"{filename}.xlsx",
                f"Official Daily Attendance & Duty Register - {date_str}",
                headers,
                rows,
                metadata=[
                    ("Report Date", date_str),
                    ("Generated On", datetime.now().strftime("%Y-%m-%d %I:%M %p (Asia/Dhaka)")),
                    ("Timezone Authority", "Asia/Dhaka (UTC+06:00)"),
                    ("Document Classification", "Official HR Attendance Record & Payroll Register"),
                ],
                summary_stats=[
                    ("Total Staff", summary['total_assistants']),
                    ("Present", summary['present']),
                    ("Late Arrivals", summary['late']),
                    ("On Leave", summary.get('on_leave', 0)),
                    ("Holiday", summary.get('holiday', 0)),
                    ("Absent", summary['absent']),
                    ("Incomplete", summary['incomplete']),
                ]
            )
        return ReportService.export_csv_response(f"{filename}.csv", headers, rows)


class MonthlyReportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        today = get_dhaka_date()
        year = int(request.query_params.get('year', today.year))
        month = int(request.query_params.get('month', today.month))
        dept_id = request.query_params.get('department')

        data = ReportService.get_monthly_report(year=year, month=month, department_id=dept_id)
        return Response(data, status=status.HTTP_200_OK)


class MonthlyReportExportView(BaseExportView):
    def get(self, request):
        today = get_dhaka_date()
        year = int(request.query_params.get('year', today.year))
        month = int(request.query_params.get('month', today.month))
        dept_id = request.query_params.get('department')
        export_format = (request.query_params.get('format') or 'csv').lower()
        view_type = (request.query_params.get('view_type') or request.query_params.get('mode') or 'summary').lower()

        data = ReportService.get_monthly_report(year=year, month=month, department_id=dept_id)
        records = data['records']
        days_meta = data.get('days_metadata', [])

        if view_type == 'daywise':
            headers = [
                'Sl No.',
                'Employee ID',
                'Full Name',
                'Designation',
                'Department',
                'Project / Site'
            ]
            for dm in days_meta:
                headers.append(f"{dm['day']:02d} ({dm['weekday']})")

            headers.extend([
                'Present Days',
                'Late Days',
                'Leave Days',
                'Holidays',
                'Weekend Days',
                'Absent Days',
                'Manual Days',
                'Total Hours'
            ])

            rows = []
            for idx, r in enumerate(records, 1):
                row = [
                    idx,
                    r['employee_id'],
                    r['employee_name'],
                    r.get('designation') or "Field Assistant",
                    r['department'],
                    r['project']
                ]
                day_codes = {d['day']: d['code'] for d in r.get('days', [])}
                for dm in days_meta:
                    row.append(day_codes.get(dm['day'], '-'))

                row.extend([
                    r['present_days'],
                    r['late_days'],
                    r['leave_days'],
                    r['holiday_days'],
                    r.get('weekend_days', 0),
                    r['absent_days'],
                    r['manual_days'],
                    r['total_working_hours']
                ])
                rows.append(row)

            filename = f"fams_monthly_attendance_muster_roll_{year}_{month:02d}"

            if export_format == 'xlsx':
                return ReportService.export_xlsx_response(
                    f"{filename}.xlsx",
                    f"Official Day-wise Attendance Muster Roll - {year}/{month:02d}",
                    headers,
                    rows,
                    metadata=[
                        ("Period (Year-Month)", f"{year}-{month:02d}"),
                        ("Calendar Days", str(data.get('total_days', len(days_meta)))),
                        ("Generated On", datetime.now().strftime("%Y-%m-%d %I:%M %p (Asia/Dhaka)")),
                        ("Timezone Authority", "Asia/Dhaka (UTC+06:00)"),
                        ("Document Classification", "Official HR Attendance Muster Roll & Compliance Register"),
                        ("Legend", "P: Present | L: Late | M: Manual | LV: Leave | H: Holiday | W: Weekend | A: Absent")
                    ]
                )
            return ReportService.export_csv_response(f"{filename}.csv", headers, rows)

        headers = [
            'Sl No.',
            'Employee ID',
            'Full Name',
            'Designation',
            'Department',
            'Project / Site',
            'Present Days',
            'Late Days',
            'Leave Days',
            'Holidays',
            'Weekend Days',
            'Absent Days',
            'Manual Days',
            'Geofence Flags',
            'Total Working Hours'
        ]
        rows = [
            [
                idx,
                r['employee_id'],
                r['employee_name'],
                r.get('designation') or "Field Assistant",
                r['department'],
                r['project'],
                r['present_days'],
                r['late_days'],
                r['leave_days'],
                r['holiday_days'],
                r.get('weekend_days', 0),
                r['absent_days'],
                r['manual_days'],
                r['geofence_violations'],
                r['total_working_hours']
            ]
            for idx, r in enumerate(records, 1)
        ]

        filename = f"fams_monthly_attendance_summary_{year}_{month:02d}"

        if export_format == 'xlsx':
            return ReportService.export_xlsx_response(
                f"{filename}.xlsx",
                f"Official Monthly Attendance & Working Hours Summary - {year}/{month:02d}",
                headers,
                rows,
                metadata=[
                    ("Period (Year-Month)", f"{year}-{month:02d}"),
                    ("Working Days in Month", str(data.get('total_days', '--'))),
                    ("Generated On", datetime.now().strftime("%Y-%m-%d %I:%M %p (Asia/Dhaka)")),
                    ("Timezone Authority", "Asia/Dhaka (UTC+06:00)"),
                    ("Document Classification", "Official Monthly HR Compliance & Payroll Audit"),
                ]
            )
        return ReportService.export_csv_response(f"{filename}.csv", headers, rows)


class EmployeeReportView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, employee_id):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        data = ReportService.get_employee_report(employee_id, start_date=start_date, end_date=end_date)
        if not data:
            return Response({'detail': f'Employee with identifier {employee_id} not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(data, status=status.HTTP_200_OK)


class EmployeeReportExportView(BaseExportView):
    def get(self, request, employee_id):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        export_format = (request.query_params.get('format') or 'csv').lower()

        data = ReportService.get_employee_report(employee_id, start_date=start_date, end_date=end_date)
        if not data:
            return Response({'detail': f'Employee with identifier {employee_id} not found.'}, status=status.HTTP_404_NOT_FOUND)

        records = data['daily_records']
        headers = [
            'Sl No.',
            'Date',
            'Check In (Time)',
            'Check In Location & GPS',
            'Check Out (Time)',
            'Check Out Location & GPS',
            'Working Hours',
            'Attendance Type',
            'Status',
            'Approved By',
            'Remarks'
        ]
        rows = []
        for idx, r in enumerate(records, 1):
            in_loc = r.get('check_in_address') or ""
            if r.get('check_in_latitude') and r.get('check_in_longitude'):
                coord_str = f"({r['check_in_latitude']:.4f}, {r['check_in_longitude']:.4f})"
                in_loc = f"{in_loc} {coord_str}".strip() if in_loc else coord_str
            if not in_loc:
                in_loc = "--"

            out_loc = r.get('check_out_address') or ""
            if r.get('check_out_latitude') and r.get('check_out_longitude'):
                coord_str = f"({r['check_out_latitude']:.4f}, {r['check_out_longitude']:.4f})"
                out_loc = f"{out_loc} {coord_str}".strip() if out_loc else coord_str
            if not out_loc:
                out_loc = "--"

            rows.append([
                idx,
                r['date'],
                r['check_in'],
                in_loc,
                r['check_out'],
                out_loc,
                r['duration'],
                r['type'],
                r['status'],
                r['approved_by'],
                r['remarks']
            ])

        emp = data['employee']
        emp_code = emp['employee_id']
        filename = f"fams_employee_attendance_dossier_{emp_code}_{start_date}_to_{end_date}"

        if export_format == 'xlsx':
            return ReportService.export_xlsx_response(
                f"{filename}.xlsx",
                f"Official Employee Attendance Dossier - {emp['full_name']} ({emp_code})",
                headers,
                rows,
                metadata=[
                    ("Employee ID", emp['employee_id']),
                    ("Full Name", emp['full_name']),
                    ("Designation", emp.get('designation') or "Field Assistant"),
                    ("Department", emp.get('department') or "--"),
                    ("Assigned Project", emp.get('project') or "--"),
                    ("Reporting Period", f"{start_date} to {end_date}"),
                    ("Timezone Authority", "Asia/Dhaka (UTC+06:00)"),
                ],
                summary_stats=[
                    ("Days in Range", data['summary']['total_days_range']),
                    ("Present Days", data['summary']['present_days']),
                    ("Late Days", data['summary']['late_days']),
                    ("Absent Days", data['summary']['absent_days']),
                    ("Manual Punches", data['summary']['manual_days']),
                    ("Working Hours", data['summary']['total_working_hours']),
                ]
            )
        return ReportService.export_csv_response(f"{filename}.csv", headers, rows)


class DistrictWiseFASummaryView(APIView):
    """
    Returns district-wise total Field Assistants summary across Bangladesh,
    including district center coordinates, total FAs count, and attendance status.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        today = get_dhaka_date()
        date_str = request.query_params.get('date') or str(today)
        try:
            report_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            report_date = today

        from apps.accounts.bangladesh_geo import get_district_center, get_district_info
        from apps.accounts.models import Employee
        from apps.attendance.models import Attendance

        employees = (
            Employee.objects
            .select_related('department', 'project', 'user')
            .filter(is_active=True)
            .order_by('full_name')
        )

        attendances = (
            Attendance.objects
            .filter(attendance_date=report_date)
            .select_related('employee')
        )
        att_map = {att.employee_id: att for att in attendances}

        district_data = {}
        unassigned_fas = []

        for emp in employees:
            dist = (emp.district or (emp.project.district if emp.project else "") or "").strip()
            division = emp.division or (emp.project.division if emp.project else "") or ""
            att = att_map.get(emp.id)

            status_str = att.status if att else "ABSENT"
            check_in_time = str(att.check_in_time.strftime("%I:%M %p")) if att and att.check_in_time else "--"
            check_out_time = str(att.check_out_time.strftime("%I:%M %p")) if att and att.check_out_time else "--"
            punch_address = att.check_in_address if att else ""

            emp_info = {
                'id': emp.id,
                'employee_id': emp.employee_id,
                'full_name': emp.full_name,
                'designation': emp.designation,
                'department': emp.department.name if emp.department else "--",
                'project': emp.project.name if emp.project else "--",
                'upazila': emp.upazila or (emp.project.upazila if emp.project else "") or "",
                'phone': emp.phone,
                'status': status_str,
                'check_in': check_in_time,
                'check_out': check_out_time,
                'punch_address': punch_address,
                'is_violation': bool(att.check_in_is_geofence_violation if att else False),
            }

            if not dist:
                unassigned_fas.append(emp_info)
                continue

            dist_key = dist.title()
            if dist_key not in district_data:
                lat, lon = get_district_center(dist_key)
                d_info = get_district_info(dist_key)
                div_name = division or (d_info['division'] if d_info else "")
                district_data[dist_key] = {
                    'district': dist_key,
                    'division': div_name,
                    'lat': lat,
                    'lon': lon,
                    'total_fas': 0,
                    'present_count': 0,
                    'late_count': 0,
                    'absent_count': 0,
                    'violation_count': 0,
                    'employees': [],
                    'upazilas': set()
                }

            district_data[dist_key]['total_fas'] += 1
            if status_str == 'PRESENT':
                district_data[dist_key]['present_count'] += 1
            elif status_str == 'LATE':
                district_data[dist_key]['late_count'] += 1
            else:
                district_data[dist_key]['absent_count'] += 1

            if emp_info['is_violation']:
                district_data[dist_key]['violation_count'] += 1

            if emp_info['upazila']:
                district_data[dist_key]['upazilas'].add(emp_info['upazila'])

            district_data[dist_key]['employees'].append(emp_info)

        districts_list = []
        for d in sorted(district_data.values(), key=lambda x: x['total_fas'], reverse=True):
            d['upazilas'] = sorted(list(d['upazilas']))
            districts_list.append(d)

        return Response({
            'date': str(report_date),
            'total_districts': len(districts_list),
            'total_active_fas': len(employees),
            'unassigned_count': len(unassigned_fas),
            'unassigned_employees': unassigned_fas,
            'districts': districts_list
        }, status=status.HTTP_200_OK)

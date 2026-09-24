import io
import csv
import re
from datetime import datetime, date
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from django.utils import timezone
from django.db import transaction
from django.db.models import Q

from .models import User, Employee, Project, Department
from apps.audit.services import AuditService


def normalize_header_name(header_val):
    if not header_val:
        return ''
    raw = str(header_val)
    # Strip asterisks, notes inside brackets or parentheses e.g. (Zilla), (Thana), (YYYY-MM-DD)
    raw = re.sub(r'\(.*?\)', '', raw)
    raw = re.sub(r'\[.*?\]', '', raw)
    raw = raw.replace('*', '').strip()
    
    cleaned = re.sub(r'[^a-zA-Z0-9_\-\s]', '', raw)
    cleaned = cleaned.strip().lower().replace(' ', '_').replace('-', '_')
    cleaned = re.sub(r'_+', '_', cleaned).strip('_')

    aliases = {
        'employee_id': ['employee_id', 'employeeid', 'id', 'fa_id', 'faid', 'emp_id', 'empid', 'staff_id'],
        'full_name': ['full_name', 'fullname', 'name', 'employee_name', 'assistant_name', 'fa_name'],
        'username': ['username', 'user_name', 'login_username', 'login_id', 'user'],
        'project_code': ['project_code', 'code', 'site_code'],
        'project_name': ['project_name', 'site_name'],
        'project': ['project', 'assigned_project', 'project_id', 'site', 'project_code_or_name'],
        'phone': ['phone', 'phone_number', 'mobile', 'mobile_number', 'contact', 'contact_number'],
        'email': ['email', 'email_address', 'mail'],
        'division': ['division', 'bibhag'],
        'district': ['district', 'zilla', 'district_name'],
        'upazila': ['upazila', 'thana', 'upazilla'],
        'designation': ['designation', 'role', 'title', 'position'],
        'password': ['password', 'default_password', 'pass'],
        'department': ['department', 'dept', 'department_code', 'dept_code'],
        'joining_date': ['joining_date', 'join_date', 'date_of_joining', 'start_date'],
    }

    for standard_key, alias_list in aliases.items():
        if cleaned in alias_list:
            return standard_key
    return cleaned


class EmployeeBulkUploadService:
    @staticmethod
    def parse_rows(file_obj, filename=""):
        """
        Parses an uploaded .xlsx or .csv file into a list of normalized row dictionaries.
        Returns (rows, error_message).
        """
        lower_name = filename.lower()
        rows = []

        if lower_name.endswith('.csv'):
            try:
                # Read CSV with encoding fallbacks
                content = file_obj.read()
                if isinstance(content, bytes):
                    for enc in ('utf-8-sig', 'utf-8', 'latin-1'):
                        try:
                            text = content.decode(enc)
                            break
                        except UnicodeDecodeError:
                            continue
                    else:
                        return None, "Unable to decode CSV file. Please ensure it is saved in UTF-8 format."
                else:
                    text = content

                reader = csv.reader(io.StringIO(text))
                header_row = next(reader, None)
                if not header_row:
                    return None, "The uploaded CSV file is empty."

                normalized_headers = [normalize_header_name(h) for h in header_row]

                for row_idx, row_values in enumerate(reader, start=2):
                    if not any(v.strip() for v in row_values if v):
                        continue  # skip blank lines
                    row_dict = {}
                    for col_idx, col_key in enumerate(normalized_headers):
                        val = row_values[col_idx].strip() if col_idx < len(row_values) else ""
                        row_dict[col_key] = val
                    row_dict['_row_num'] = row_idx
                    rows.append(row_dict)

            except Exception as e:
                return None, f"Failed to read CSV file: {str(e)}"

        else:
            # Default to Excel (.xlsx)
            try:
                wb = openpyxl.load_workbook(file_obj, data_only=True)
                ws = wb.active
                iter_rows = ws.iter_rows(values_only=True)
                header_row = next(iter_rows, None)

                if not header_row:
                    return None, "The uploaded Excel sheet is empty."

                normalized_headers = [normalize_header_name(h) for h in header_row]

                for row_idx, row_values in enumerate(iter_rows, start=2):
                    if not any(v is not None and str(v).strip() for v in row_values):
                        continue  # skip blank rows
                    row_dict = {}
                    for col_idx, col_key in enumerate(normalized_headers):
                        val = row_values[col_idx] if col_idx < len(row_values) else ""
                        if val is None:
                            val = ""
                        elif isinstance(val, (datetime, date)):
                            val = val.strftime('%Y-%m-%d')
                        else:
                            val = str(val).strip()
                        row_dict[col_key] = val
                    row_dict['_row_num'] = row_idx
                    rows.append(row_dict)

            except Exception as e:
                return None, f"Failed to read Excel file (.xlsx): {str(e)}"

        return rows, None

    @classmethod
    def process_bulk_upload(cls, file_obj, filename="", default_project_id=None, request=None, admin_user=None):
        """
        Processes bulk upload of project-based Field Assistants.
        Validates, matches project sites, assigns districts, and creates user accounts atomically.
        """
        rows, parse_error = cls.parse_rows(file_obj, filename)
        if parse_error:
            return {
                'success': False,
                'detail': parse_error,
                'total_rows': 0,
                'created_count': 0,
                'updated_count': 0,
                'failed_count': 0,
                'created_employees': [],
                'errors': [{'row_number': 0, 'error': parse_error}]
            }

        if not rows:
            return {
                'success': False,
                'detail': "No data rows found in the uploaded file.",
                'total_rows': 0,
                'created_count': 0,
                'updated_count': 0,
                'failed_count': 0,
                'created_employees': [],
                'errors': [{'row_number': 0, 'error': "No data rows found."}]
            }

        all_projects = list(Project.objects.all())
        all_departments = list(Department.objects.all())
        default_dept = all_departments[0] if all_departments else None

        default_project = None
        if default_project_id:
            default_project = Project.objects.filter(id=default_project_id).first()

        created_employees = []
        updated_employees = []
        errors = []

        user_performing_action = admin_user or (request.user if request else None)

        for row in rows:
            row_num = row.get('_row_num', 0)
            emp_id = row.get('employee_id', '').strip()
            full_name = row.get('full_name', '').strip()

            # Required validations
            if not emp_id:
                errors.append({
                    'row_number': row_num,
                    'employee_id': '',
                    'error': "Employee ID is required."
                })
                continue

            if not full_name:
                errors.append({
                    'row_number': row_num,
                    'employee_id': emp_id,
                    'error': f"Full Name is required for Employee ID {emp_id}."
                })
                continue

            # Resolve Project
            proj_val = (
                row.get('project_code', '').strip()
                or row.get('project', '').strip()
                or row.get('project_name', '').strip()
            )
            target_project = None
            if proj_val:
                # 1. Match by exact code
                target_project = next((p for p in all_projects if p.code.lower() == proj_val.lower()), None)
                # 2. Match by exact name
                if not target_project:
                    target_project = next((p for p in all_projects if p.name.lower() == proj_val.lower()), None)
                # 3. Match by partial name
                if not target_project:
                    target_project = next((p for p in all_projects if proj_val.lower() in p.name.lower()), None)

            if not target_project and default_project:
                target_project = default_project

            if not target_project:
                errors.append({
                    'row_number': row_num,
                    'employee_id': emp_id,
                    'error': f"Project '{proj_val}' was not found in the system. Please provide a valid project code or choose a default project." if proj_val else "Project assignment is required for project-based Field Assistants."
                })
                continue

            # Resolve Department
            dept_val = row.get('department', '').strip()
            target_dept = default_dept
            if dept_val:
                matched_dept = next((d for d in all_departments if d.code.lower() == dept_val.lower() or d.name.lower() == dept_val.lower()), None)
                if matched_dept:
                    target_dept = matched_dept

            # Geographic Location inheritance
            division = row.get('division', '').strip()
            district = row.get('district', '').strip()
            upazila = row.get('upazila', '').strip()

            if target_project:
                if not district and target_project.district:
                    district = target_project.district
                if not division and target_project.division:
                    division = target_project.division
                if not upazila and target_project.upazila:
                    upazila = target_project.upazila

            phone = row.get('phone', '').strip()
            email = row.get('email', '').strip()
            designation = row.get('designation', '').strip() or 'Field Assistant'
            password = row.get('password', '').strip() or 'password123'

            joining_date_val = row.get('joining_date', '').strip()
            joining_date = timezone.localdate()
            if joining_date_val:
                try:
                    joining_date = datetime.strptime(joining_date_val, '%Y-%m-%d').date()
                except ValueError:
                    try:
                        joining_date = datetime.strptime(joining_date_val, '%d-%m-%Y').date()
                    except ValueError:
                        joining_date = timezone.localdate()

            # Resolve or auto-generate username
            username = row.get('username', '').strip()
            if not username:
                cleaned_id = re.sub(r'[^a-zA-Z0-9]', '', emp_id).lower()
                username = cleaned_id if cleaned_id else f"fa_{emp_id.lower()}"

            existing_emp = Employee.objects.filter(employee_id__iexact=emp_id).first()

            try:
                with transaction.atomic():
                    if existing_emp:
                        # Update existing Field Assistant
                        existing_emp.full_name = full_name
                        if phone:
                            existing_emp.phone = phone
                        if target_project:
                            existing_emp.project = target_project
                        if target_dept:
                            existing_emp.department = target_dept
                        if division:
                            existing_emp.division = division
                        if district:
                            existing_emp.district = district
                        if upazila:
                            existing_emp.upazila = upazila
                        if designation:
                            existing_emp.designation = designation
                        existing_emp.is_active = True
                        existing_emp.save()

                        # Update User fields
                        user = existing_emp.user
                        if email and user.email != email:
                            user.email = email
                            user.save(update_fields=['email'])

                        if password and password != 'password123':
                            user.set_password(password)
                            user.save(update_fields=['password'])

                        AuditService.log(
                            user=user_performing_action,
                            action='USER_UPDATED',
                            object_type='Employee',
                            object_id=existing_emp.id,
                            request=request,
                            remarks=f"Bulk upload updated FA {existing_emp.employee_id} (Assigned to {target_project.name if target_project else 'No Project'})"
                        )

                        updated_employees.append({
                            'employee_id': existing_emp.employee_id,
                            'full_name': existing_emp.full_name,
                            'username': user.username,
                            'project_code': target_project.code if target_project else '--',
                            'project_name': target_project.name if target_project else '--',
                            'district': district or '--',
                            'action': 'UPDATED'
                        })

                    else:
                        # Check username collision with another user
                        if User.objects.filter(username=username).exists():
                            base_uname = username
                            suffix = 1
                            while User.objects.filter(username=f"{base_uname}{suffix}").exists():
                                suffix += 1
                            username = f"{base_uname}{suffix}"

                        # Create new user and employee profile
                        user = User.objects.create_user(
                            username=username,
                            password=password,
                            email=email,
                            role=User.Role.FIELD_ASSISTANT
                        )

                        employee = Employee.objects.create(
                            user=user,
                            employee_id=emp_id,
                            full_name=full_name,
                            phone=phone,
                            project=target_project,
                            department=target_dept,
                            division=division,
                            district=district,
                            upazila=upazila,
                            designation=designation,
                            joining_date=joining_date,
                            is_active=True
                        )

                        AuditService.log(
                            user=user_performing_action,
                            action='USER_CREATED',
                            object_type='Employee',
                            object_id=employee.id,
                            request=request,
                            new_state={
                                'employee_id': employee.employee_id,
                                'full_name': employee.full_name,
                                'project': target_project.name if target_project else None,
                                'district': district
                            },
                            remarks=f"Bulk upload created new FA {employee.employee_id} ({employee.full_name}) assigned to {target_project.name if target_project else 'No Project'}"
                        )

                        created_employees.append({
                            'employee_id': employee.employee_id,
                            'full_name': employee.full_name,
                            'username': user.username,
                            'password': password,
                            'project_code': target_project.code if target_project else '--',
                            'project_name': target_project.name if target_project else '--',
                            'district': district or '--',
                            'action': 'CREATED'
                        })

            except Exception as err:
                errors.append({
                    'row_number': row_num,
                    'employee_id': emp_id,
                    'error': f"Failed to save {emp_id}: {str(err)}"
                })

        total_processed = len(created_employees) + len(updated_employees)
        success_msg = f"Bulk upload completed: {len(created_employees)} created, {len(updated_employees)} updated, {len(errors)} errors."

        return {
            'success': len(errors) == 0 or total_processed > 0,
            'detail': success_msg,
            'total_rows': len(rows),
            'created_count': len(created_employees),
            'updated_count': len(updated_employees),
            'failed_count': len(errors),
            'created_employees': created_employees,
            'updated_employees': updated_employees,
            'errors': errors
        }

    @staticmethod
    def generate_excel_template():
        """
        Generates a professionally styled Excel workbook template (.xlsx)
        with sample rows, active projects directory, and guidance notes.
        """
        wb = openpyxl.Workbook()

        # Sheet 1: Field Assistants Upload Sheet
        ws1 = wb.active
        ws1.title = "Field Assistants"
        ws1.views.sheetView[0].showGridLines = True

        headers = [
            ("Employee ID *", 18),
            ("Full Name *", 24),
            ("Username", 18),
            ("Project Code *", 18),
            ("Project Name", 28),
            ("Phone Number", 18),
            ("Email Address", 24),
            ("District (Zilla)", 20),
            ("Upazila (Thana)", 20),
            ("Division", 16),
            ("Designation", 20),
            ("Password", 16),
            ("Joining Date (YYYY-MM-DD)", 25),
        ]

        header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        border_thin = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )

        for col_idx, (header_text, width) in enumerate(headers, start=1):
            cell = ws1.cell(row=1, column=col_idx, value=header_text)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = border_thin
            col_letter = openpyxl.utils.get_column_letter(col_idx)
            ws1.column_dimensions[col_letter].width = width

        ws1.row_dimensions[1].height = 28

        projects = list(Project.objects.filter(is_active=True)[:5])
        sample_proj_1 = projects[0] if len(projects) > 0 else None
        sample_proj_2 = projects[1] if len(projects) > 1 else sample_proj_1
        sample_proj_3 = projects[2] if len(projects) > 2 else sample_proj_1

        sample_rows = [
            [
                "FA-101",
                "Mohammad Rahim Uddin",
                "rahim101",
                sample_proj_1.code if sample_proj_1 else "DHK-01",
                sample_proj_1.name if sample_proj_1 else "Dhaka Urban Survey",
                "01711223344",
                "rahim@example.com",
                sample_proj_1.district if sample_proj_1 and sample_proj_1.district else "Dhaka",
                sample_proj_1.upazila if sample_proj_1 and sample_proj_1.upazila else "Mirpur",
                sample_proj_1.division if sample_proj_1 and sample_proj_1.division else "Dhaka",
                "Field Assistant",
                "password123",
                timezone.localdate().strftime('%Y-%m-%d')
            ],
            [
                "FA-102",
                "Fatema Begum",
                "fatema102",
                sample_proj_2.code if sample_proj_2 else "CTG-01",
                sample_proj_2.name if sample_proj_2 else "Chittagong Coastal Mapping",
                "01819334455",
                "fatema@example.com",
                sample_proj_2.district if sample_proj_2 and sample_proj_2.district else "Chattogram",
                sample_proj_2.upazila if sample_proj_2 and sample_proj_2.upazila else "Pahartali",
                sample_proj_2.division if sample_proj_2 and sample_proj_2.division else "Chattogram",
                "Senior Field Assistant",
                "password123",
                timezone.localdate().strftime('%Y-%m-%d')
            ],
            [
                "FA-103",
                "Anowar Hossain",
                "anowar103",
                sample_proj_3.code if sample_proj_3 else "SYL-01",
                sample_proj_3.name if sample_proj_3 else "Sylhet Tea Estate Survey Site",
                "01912445566",
                "anowar@example.com",
                sample_proj_3.district if sample_proj_3 and sample_proj_3.district else "Sylhet",
                sample_proj_3.upazila if sample_proj_3 and sample_proj_3.upazila else "Sreemangal",
                sample_proj_3.division if sample_proj_3 and sample_proj_3.division else "Sylhet",
                "Field Assistant",
                "password123",
                timezone.localdate().strftime('%Y-%m-%d')
            ]
        ]

        sample_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
        sample_font = Font(name="Calibri", size=10, color="334155")

        for r_idx, row_data in enumerate(sample_rows, start=2):
            ws1.row_dimensions[r_idx].height = 22
            for c_idx, val in enumerate(row_data, start=1):
                cell = ws1.cell(row=r_idx, column=c_idx, value=val)
                cell.fill = sample_fill
                cell.font = sample_font
                cell.border = border_thin
                if c_idx in (1, 3, 6, 12, 13):
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center")

        # Sheet 2: Active Projects Reference Guide
        ws2 = wb.create_sheet(title="Active Projects Guide")
        ws2.views.sheetView[0].showGridLines = True

        proj_headers = [
            ("Project Code", 16),
            ("Project Name", 32),
            ("Division", 18),
            ("District (Zilla)", 20),
            ("Upazila (Thana)", 20),
            ("Active FAs", 14),
        ]

        proj_header_fill = PatternFill(start_color="047857", end_color="047857", fill_type="solid")
        for col_idx, (header_text, width) in enumerate(proj_headers, start=1):
            cell = ws2.cell(row=1, column=col_idx, value=header_text)
            cell.fill = proj_header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = border_thin
            col_letter = openpyxl.utils.get_column_letter(col_idx)
            ws2.column_dimensions[col_letter].width = width

        ws2.row_dimensions[1].height = 26

        all_projects = Project.objects.filter(is_active=True).order_by('code')
        for r_idx, p in enumerate(all_projects, start=2):
            ws2.row_dimensions[r_idx].height = 20
            p_data = [
                p.code,
                p.name,
                p.division or '--',
                p.district or '--',
                p.upazila or '--',
                p.employees.count()
            ]
            for c_idx, val in enumerate(p_data, start=1):
                cell = ws2.cell(row=r_idx, column=c_idx, value=val)
                cell.font = sample_font
                cell.border = border_thin
                if c_idx in (1, 6):
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center")

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()

    @staticmethod
    def generate_csv_template():
        """
        Generates a standard CSV template for quick import.
        """
        output = io.StringIO()
        writer = csv.writer(output)
        headers = [
            "Employee ID",
            "Full Name",
            "Username",
            "Project Code",
            "Project Name",
            "Phone Number",
            "Email Address",
            "District",
            "Upazila",
            "Division",
            "Designation",
            "Password",
            "Joining Date"
        ]
        writer.writerow(headers)

        projects = list(Project.objects.filter(is_active=True)[:3])
        p1 = projects[0] if len(projects) > 0 else None
        p2 = projects[1] if len(projects) > 1 else p1

        writer.writerow([
            "FA-101", "Mohammad Rahim", "rahim101",
            p1.code if p1 else "DHK-01",
            p1.name if p1 else "Dhaka Urban Survey",
            "01711223344", "rahim@example.com",
            p1.district if p1 and p1.district else "Dhaka",
            p1.upazila if p1 and p1.upazila else "Mirpur",
            p1.division if p1 and p1.division else "Dhaka",
            "Field Assistant", "password123", timezone.localdate().strftime('%Y-%m-%d')
        ])
        writer.writerow([
            "FA-102", "Fatema Begum", "fatema102",
            p2.code if p2 else "CTG-01",
            p2.name if p2 else "Chittagong Coastal Mapping",
            "01819334455", "fatema@example.com",
            p2.district if p2 and p2.district else "Chattogram",
            p2.upazila if p2 and p2.upazila else "Pahartali",
            p2.division if p2 and p2.division else "Chattogram",
            "Field Assistant", "password123", timezone.localdate().strftime('%Y-%m-%d')
        ])

        return output.getvalue().encode('utf-8-sig')

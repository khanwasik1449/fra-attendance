# AGENTS.md - FAMS Architecture and Development Guidelines

## Project Context
The **Field Attendance Management System (FAMS)** is an enterprise attendance tracking platform tailored for field assistants operating across regional locations, overseen by central administrators.

## Core Architectural Invariants

1. **Server-Side Timestamp Authority**:
   - The device/client clock is NEVER trusted for attendance operations.
   - All check-in and check-out timestamps are generated strictly server-side using the configured business timezone (`Asia/Dhaka`).
   - Timestamps are stored in UTC/timezone-aware format in PostgreSQL and converted to `Asia/Dhaka` for business logic (determining the local date, late status, and working duration).

2. **Database Integrity & Concurrency**:
   - Attendance sessions are strictly unique per `(employee, date)`.
   - Double check-ins and race conditions are guarded by database-level unique constraints and atomic transactions (`select_for_update`).
   - Working duration is computed automatically as `check_out_time - check_in_time` on the server.

3. **Separation of Attendance Types**:
   - `AUTOMATIC`: Created via mobile check-in / check-out with verified server timestamps.
   - `MANUAL`: Created or corrected only through an approved `ManualAttendanceRequest`.
   - Manual attendance records permanently link to `approved_by`, `approved_at`, `admin_remarks`, and `manual_request_id`.

4. **Audit Trail Immutability**:
   - All state transitions (Check-in, Check-out, Manual Request submissions, Approvals, Rejections, Profile changes) must append an `AuditLog` entry.
   - Audit logs capture `user`, `action`, `object_type`, `object_id`, `ip_address`, `user_agent`, `previous_state`, `new_state`, and `timestamp`.
   - Never overwrite or purge audit records during normal business operations.

5. **Soft Deactivation**:
   - Employees are deactivated (`is_active = False`) rather than deleted, ensuring historical attendance reports remain mathematically accurate and referentially intact.

6. **Layered Architecture & Separation of Concerns**:
   - **Backend**:
     - `models/`: Pure schema, validation constraints, custom managers.
     - `services/`: Encapsulated domain logic (`AttendanceService`, `ManualAttendanceService`, `AuditService`, `ReportService`). Views/serializers must NOT contain heavy business logic.
     - `serializers/`: DRF data validation, formatting, and representation.
     - `permissions/`: Granular role-based permissions (`IsAdmin`, `IsFieldAssistant`, `IsActiveEmployee`).
     - `views/`: DRF ViewSets/APIViews delegating to services.
   - **Frontend**:
     - Modern responsive UI with Tailwind CSS.
     - Mobile-first layout for Field Assistants (touch targets >= 48px, immediate visual feedback, offline warning indicator).
     - Admin desktop suite with searchable, filterable tables, metric cards, and report export functions.

## Coding Conventions
- **Language**: Python 3.12+ (Backend), TypeScript / React 18+ (Frontend).
- **Style**: PEP 8 for Python (enforced with flake8/black), ESLint + Prettier for Frontend.
- **Error Handling**: Friendly, clear error messages for users; structured JSON error codes for API consumers.
- **Testing**: Pytest / Django `TestCase` for backend test coverage focusing on edge cases (duplicate check-ins, clock boundaries, role permission barriers).

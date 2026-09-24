# Field Attendance Management System (FAMS)

An enterprise-grade, mobile-first attendance management and verification platform engineered for field assistants and central administrators.

---

## 🚀 Key Highlights & Invariants

1. **Server-Side Timestamp Authority (`Asia/Dhaka` / UTC+6)**:
   - Device and client clocks are **never trusted**.
   - All check-in and check-out timestamps are stamped directly by the Django server in Bangladesh local time.
   - Mobile frontend displays live elapsed working duration synchronized to server clock delta.

2. **Concurrency & Race Condition Guard**:
   - Atomic transactions (`select_for_update()`) and database unique constraints (`employee_id, attendance_date`) prevent duplicate check-ins and check-outs under erratic field network conditions.

3. **Separation of Concerns**:
   - `AUTOMATIC`: Instant field check-ins with verified server time.
   - `MANUAL`: Formal exception request workflow submitted by assistants and reviewed/approved by administrators.

4. **Immutable Audit Trail**:
   - Every state transition (check-in, check-out, manual requests, approvals, profile changes) is logged into an append-only ledger capturing user, action, IP address, user-agent, and JSON state diffs.

5. **Soft Deactivation**:
   - Field assistants are deactivated rather than deleted, preserving 100% mathematical accuracy of past historical attendance reports.

---

## 🛠️ Technology Stack

* **Backend**: Django 5.1, Django REST Framework, SimpleJWT
* **Database**: PostgreSQL 16 (with connection pooling and ACID constraints)
* **Frontend**: React 18, TypeScript, Tailwind CSS, Vite, Lucide Icons
* **Reverse Proxy & WSGI**: Nginx 1.24 + Gunicorn 26
* **Export Engine**: OpenPyXL (Excel `.xlsx`) and streaming CSV

---

## 🔑 Demo Access Credentials

| Role | Username | Password | Purpose |
|---|---|---|---|
| **Administrator** | `admin` | `admin123` | Management, reports, approvals, audit trail, settings |
| **Field Assistant** | `fa001` | `password123` | Rahim Ahmed - Senior Field Assistant |
| **Field Assistant** | `fa002` | `password123` | Fatima Begum - Field Enumerator |
| **Field Assistant** | `fa003` | `password123` | Tariqul Islam - Field Logistics Assistant |
| **Field Assistant** | `fa004` | `password123` | Nasreen Akter - Junior Field Assistant |

---

## 🏃 Quick Start & Verification

### 1. Run Health Check
```bash
/root/deploy/scripts/health_check.sh
```

### 2. Run Automated Pytest Suite
```bash
/root/backend/venv/bin/pytest /root/backend/tests
```

### 3. Automated Database Backup
```bash
/root/deploy/scripts/backup_db.sh
```

---

## 🌐 Endpoints & Web Portals

* **Web Application**: `http://localhost/` (or port 80 via Nginx)
* **API Base URL**: `http://localhost/api/v1/`
* **Django Admin**: `http://localhost/admin/`

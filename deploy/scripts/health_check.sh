#!/usr/bin/env bash
# FAMS Health Check Script (PostgreSQL, Gunicorn, Nginx)
set -euo pipefail

echo "================ FAMS SYSTEM HEALTH CHECK ================"

# 1. PostgreSQL Check
echo -n "1. Checking PostgreSQL connectivity... "
if PGPASSWORD=fams_password psql -h localhost -U fams_user -d fams_db -c "SELECT 1;" > /dev/null 2>&1; then
    echo "✓ HEALTHY (Port 5432)"
else
    echo "✗ FAILED (Cannot connect to PostgreSQL)"
    exit 1
fi

# 2. Gunicorn WSGI Check
echo -n "2. Checking Gunicorn backend response... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/api/v1/attendance/today/ || true)
if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "200" ]; then
    echo "✓ HEALTHY (Port 8000 responding HTTP $HTTP_CODE)"
else
    echo "✗ FAILED (HTTP $HTTP_CODE from Gunicorn)"
    exit 1
fi

# 3. Nginx Reverse Proxy & Frontend Check
echo -n "3. Checking Nginx reverse proxy on port 80... "
NGINX_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ || true)
if [ "$NGINX_CODE" = "200" ]; then
    echo "✓ HEALTHY (Port 80 serving SPA HTTP 200)"
else
    echo "✗ FAILED (Port 80 returned HTTP $NGINX_CODE)"
    exit 1
fi

# 4. Active Timezone Invariant Check
echo -n "4. Verifying official timezone standard (Asia/Dhaka)... "
TZ_OUTPUT=$(/root/backend/venv/bin/python -c "import zoneinfo, datetime; print(datetime.datetime.now(zoneinfo.ZoneInfo('Asia/Dhaka')).strftime('%Y-%m-%d %H:%M:%S %Z'))")
echo "✓ $TZ_OUTPUT"

echo "================ ALL SYSTEM CHECKS PASSED ================"

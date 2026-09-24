#!/usr/bin/env bash
# Automated PostgreSQL Backup Script for FAMS
set -euo pipefail

BACKUP_DIR="/var/backups/fams"
DATE_TAG=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/fams_db_${DATE_TAG}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting automated backup for fams_db..."
PGPASSWORD="${DB_PASSWORD:-fams_password}" pg_dump -h "${DB_HOST:-localhost}" -U "${DB_USER:-fams_user}" "${DB_NAME:-fams_db}" | gzip > "$BACKUP_FILE"

echo "[$(date)] Backup completed successfully: $BACKUP_FILE (Size: $(du -h "$BACKUP_FILE" | cut -f1))"

# Retention: keep last 14 daily backups
find "$BACKUP_DIR" -type f -name "fams_db_*.sql.gz" -mtime +14 -delete
echo "[$(date)] Pruned backups older than 14 days."

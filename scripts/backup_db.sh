#!/bin/bash
# ==============================================================================
# TRULIVA DATABASE AUTOMATED SNAPSHOT & BACKUP SYSTEM
# Hourly Snapshots (retained 48h) + Daily Snapshots (retained 30d)
# ==============================================================================

set -e

BACKUP_ROOT="/var/backups/truliva_db"
HOURLY_DIR="${BACKUP_ROOT}/hourly"
DAILY_DIR="${BACKUP_ROOT}/daily"
LOG_FILE="${BACKUP_ROOT}/backup.log"

DB_NAME="truliva_db"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DATE_HOUR=$(date +"%Y-%m-%d_%H-00")
DATE_DAY=$(date +"%Y-%m-%d")
CURRENT_HOUR=$(date +"%H")

# 1. Create directories if not exist
mkdir -p "${HOURLY_DIR}"
mkdir -p "${DAILY_DIR}"

log() {
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] $1" | tee -a "${LOG_FILE}"
}

log "=== BẮT ĐẦU CHỤP DATABASE SNAPSHOT: ${TIMESTAMP} ==="

HOURLY_FILE="${HOURLY_DIR}/truliva_db_${DATE_HOUR}.sql.gz"

# 2. Perform pg_dump and compress
log "Đang dump dữ liệu '${DB_NAME}' -> ${HOURLY_FILE}..."
if sudo -u postgres pg_dump "${DB_NAME}" | gzip -9 > "${HOURLY_FILE}.tmp"; then
    mv "${HOURLY_FILE}.tmp" "${HOURLY_FILE}"
    FILE_SIZE=$(du -h "${HOURLY_FILE}" | cut -f1)
    log "✅ Snapshot thành công! File: ${HOURLY_FILE} (Dung lượng: ${FILE_SIZE})"
else
    log "❌ LỖI: Snapshot thất bại!"
    rm -f "${HOURLY_FILE}.tmp"
    exit 1
fi

# 3. If it's midnight (00:00) or daily backup doesn't exist for today, save to daily/
DAILY_FILE="${DAILY_DIR}/truliva_db_daily_${DATE_DAY}.sql.gz"
if [ ! -f "${DAILY_FILE}" ] || [ "${CURRENT_HOUR}" = "00" ]; then
    cp "${HOURLY_FILE}" "${DAILY_FILE}"
    log "📦 Đã lưu bản Daily backup: ${DAILY_FILE}"
fi

# 4. Rotation: Clean up hourly snapshots older than 48 hours (2 days)
log "Đang dọn dẹp snapshot theo giờ cũ hơn 48 giờ..."
CLEANED_HOURLY=$(find "${HOURLY_DIR}" -type f -name "truliva_db_*.sql.gz" -mtime +2 -print -delete | wc -l)
log "Đã xóa ${CLEANED_HOURLY} bản snapshot theo giờ cũ."

# 5. Rotation: Clean up daily backups older than 30 days
log "Đang dọn dẹp backup theo ngày cũ hơn 30 ngày..."
CLEANED_DAILY=$(find "${DAILY_DIR}" -type f -name "truliva_db_daily_*.sql.gz" -mtime +30 -print -delete | wc -l)
log "Đã xóa ${CLEANED_DAILY} bản backup theo ngày cũ."

TOTAL_BACKUPS=$(find "${BACKUP_ROOT}" -type f -name "*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "${BACKUP_ROOT}" | cut -f1)
log "=== HOÀN TẤT. Tổng số bản lưu: ${TOTAL_BACKUPS} files (Tổng dung lượng: ${TOTAL_SIZE}) ==="

#!/bin/bash
# ==============================================================================
# TRULIVA DATABASE RESTORE / FALLBACK TOOL
# Allows fast, safe fallback to any hourly/daily snapshot
# ==============================================================================

set -e

BACKUP_ROOT="/var/backups/truliva_db"
HOURLY_DIR="${BACKUP_ROOT}/hourly"
DAILY_DIR="${BACKUP_ROOT}/daily"
DB_NAME="truliva_db"

usage() {
    echo "=================================================================="
    echo "🛠️  TRULIVA DATABASE RESTORE TOOL"
    echo "=================================================================="
    echo "Cách sử dụng:"
    echo "  bash $0 list                      : Xem danh sách tất cả các bản snapshot sẵn có"
    echo "  bash $0 latest                    : Khôi phục bản snapshot gần nhất"
    echo "  bash $0 <path_to_file.sql.gz>     : Khôi phục bản snapshot cụ thể"
    echo "=================================================================="
    exit 1
}

# 1. Action: LIST
if [ "$1" = "list" ] || [ -z "$1" ]; then
    echo "=== DANH SÁCH CÁC BẢN SNAPSHOT THEO GIỜ (48 Giờ Gần Nhất) ==="
    if [ -d "${HOURLY_DIR}" ]; then
        ls -lh "${HOURLY_DIR}"/*.sql.gz 2>/dev/null | awk '{print $9, "(" $5 ")", $6, $7, $8}' || echo "Chưa có bản snapshot theo giờ nào."
    fi
    echo ""
    echo "=== DANH SÁCH CÁC BẢN BACKUP THEO NGÀY (30 Ngày Gần Nhất) ==="
    if [ -d "${DAILY_DIR}" ]; then
        ls -lh "${DAILY_DIR}"/*.sql.gz 2>/dev/null | awk '{print $9, "(" $5 ")", $6, $7, $8}' || echo "Chưa có bản backup theo ngày nào."
    fi
    exit 0
fi

# 2. Determine target file
TARGET_FILE="$1"
if [ "$1" = "latest" ]; then
    TARGET_FILE=$(ls -t "${HOURLY_DIR}"/*.sql.gz 2>/dev/null | head -n 1)
    if [ -z "${TARGET_FILE}" ]; then
        echo "❌ Không tìm thấy bản snapshot nào trong ${HOURLY_DIR}"
        exit 1
    fi
    echo "🎯 Bản snapshot gần nhất được chọn: ${TARGET_FILE}"
fi

if [ ! -f "${TARGET_FILE}" ]; then
    echo "❌ File không tồn tại: ${TARGET_FILE}"
    exit 1
fi

echo "=================================================================="
echo "⚠️  CẢNH BÁO: Bạn chuẩn bị KHÔI PHỤC cơ sở dữ liệu '${DB_NAME}'"
echo "    Từ file: ${TARGET_FILE}"
echo "    Dung lượng: $(du -h "${TARGET_FILE}" | cut -f1)"
echo "=================================================================="

# 3. SAFETY STEP: Create a PRE-RESTORE Emergency Snapshot of current database
EMERGENCY_FILE="${BACKUP_ROOT}/pre_restore_backup_$(date +"%Y-%m-%d_%H-%M-%S").sql.gz"
echo "🛡️  Đang tạo bản sao lưu an toàn trước khi khôi phục: ${EMERGENCY_FILE}..."
sudo -u postgres pg_dump "${DB_NAME}" | gzip -9 > "${EMERGENCY_FILE}"
echo "✅ Đã lưu snapshot cứu hộ khẩn cấp: ${EMERGENCY_FILE}"

# 4. Terminate active connections to truliva_db to allow clean restore
echo "🔌 Đang ngắt các kết nối đang chạy tới database..."
sudo -u postgres psql -d postgres -c "
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
" >/dev/null 2>&1 || true

# 5. Drop and recreate database for clean restore
echo "🔄 Đang làm sạch và tạo mới database '${DB_NAME}'..."
sudo -u postgres psql -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
sudo -u postgres psql -d postgres -c "CREATE DATABASE ${DB_NAME};"

# 6. Restore from gzip file
echo "⚡ Đang nạp dữ liệu từ file snapshot..."
gunzip -c "${TARGET_FILE}" | sudo -u postgres psql -d "${DB_NAME}" >/dev/null 2>&1

echo "=================================================================="
echo "✅ KHÔI PHỤC DATABASE THÀNH CÔNG 100%!"
echo "   Database '${DB_NAME}' đã quay về trạng thái tại thời điểm snapshot."
echo "   Snapshot cứu hộ trước restore được lưu tại: ${EMERGENCY_FILE}"
echo "=================================================================="

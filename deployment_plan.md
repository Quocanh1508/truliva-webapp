# Kế Hoạch Triển Khai Hệ Thống Truliva Webapp & Database

Bản kế hoạch này cung cấp các tùy chọn triển khai hệ thống Truliva (bao gồm Backend, Giao diện Frontend, Database và Lưu trữ hình ảnh) phù hợp với quy mô thực tế và ngân sách phát triển của doanh nghiệp trong ngắn hạn và dài hạn (tầm nhìn 5 năm).

---

## 1. So Sánh Các Phương Án Triển Khai

Dưới đây là 3 phương án từ tối ưu chi phí (tự vận hành) cho đến dịch vụ đám mây tự động (Cloud Managed Services).

### Tùy chọn 1: Tối Ưu Chi Phí Tối Đa (Khuyên Dùng)
*Toàn bộ hệ thống chạy trên 1 VPS Việt Nam, sử dụng các dịch vụ lưu trữ miễn phí/giá rẻ.*

*   **Cấu trúc:**
    *   **Backend & Frontend:** Nginx + NodeJS chạy trực tiếp trên VPS (2 CPU, 2 GB RAM, 60 GB SSD).
    *   **Database:** PostgreSQL tự cài đặt trên localhost (chỉ cho phép truy cập nội bộ).
    *   **Lưu trữ ảnh:** Cloudinary (Free 25 GB) $\rightarrow$ sau 3 năm nâng cấp hoặc chuyển sang Cloudflare R2 (10 GB Free, sau đó $0.015/GB).
    *   **Bảo mật:** SSL Certbot (Miễn phí) + SSH Tunnel.
    *   **Sao lưu:** Script chạy Cron job hàng ngày tự nén DB và upload lên Google Drive hoặc Cloudflare R2 (Miễn phí).
*   **Chi phí:** 
    *   **Hàng tháng:** ~176,000 VNĐ (Tiền VPS).
    *   **Hàng năm:** 0 VNĐ (Đã có sẵn tên miền).
    *   **Tổng chi phí năm đầu:** **~2,112,000 VNĐ / năm** (Đóng theo gói 1 năm của VPS để được chiết khấu 20%).

> [!TIP]
> **Ưu điểm:** Chi phí rẻ nhất, tốc độ truy cập tại Việt Nam cực nhanh do VPS đặt trong nước, kiểm soát hoàn toàn hệ thống.
> **Nhược điểm:** Phải tự quản trị hệ thống, tự viết script sao lưu dữ liệu.

---

### Tùy chọn 2: Đám Mây Tiêu Chuẩn (Neon DB Launch + VPS)
*Phù hợp khi doanh nghiệp phát triển nhanh, muốn tách biệt Database để đảm bảo an toàn tuyệt đối và tự động backup.*

*   **Cấu trúc:**
    *   **Backend & Frontend:** VPS Việt Nam (2 CPU, 2 GB RAM) - ~176,000 VNĐ/tháng.
    *   **Database:** Neon DB Launch Plan (Quản lý tự động trên Cloud, trả phí theo lượng sử dụng).
    *   **Lưu trữ ảnh:** Cloudinary (Free) / Cloudflare R2.
*   **Chi phí:**
    *   **Hàng tháng:** ~176,000 VNĐ (VPS) + ~500,000đ - 1,000,000 VNĐ (Neon DB Launch tùy tải).
    *   **Hàng năm:** 0 VNĐ (Đã có sẵn tên miền).
    *   **Tổng chi phí năm đầu:** **~8,100,000 VNĐ - 14,100,000 VNĐ / năm** (Bao gồm tiền thuê VPS và phí dịch vụ Neon DB).

> [!NOTE]
> **Ưu điểm:** Database an toàn tuyệt đối trên Cloud của Neon, có tính năng Point-in-time recovery (khôi phục dữ liệu về bất kỳ thời điểm nào trong 7 ngày qua).
> **Nhược điểm:** Chi phí hàng tháng khá cao đối với doanh nghiệp vừa và nhỏ ở giai đoạn đầu.

---

### Tùy chọn 3: Đám Mây Tự Động Hoàn Toàn (Serverless Cloud)
*Dành cho nhà phát triển không muốn cấu hình Linux, SSH, Nginx hay Database.*

*   **Cấu trúc:**
    *   **Backend:** Deploy lên Render.com hoặc Railway.app (Gói Starter ~ $5 - $7/tháng).
    *   **Frontend:** Vercel.com (Miễn phí).
    *   **Database:** Neon DB Launch Plan (~ $20 - $40/tháng).
    *   **Lưu trữ ảnh:** Cloudinary (Free).
*   **Chi phí:**
    *   **Hàng tháng:** ~$25 - $47/tháng (~600,000 VNĐ - 1,150,000 VNĐ).
    *   **Hàng năm:** 0 VNĐ (Đã có sẵn tên miền).
    *   **Tổng chi phí năm đầu:** **~7,200,000 VNĐ - 13,800,000 VNĐ / năm** (Bao gồm chi phí Render/Railway và Neon DB).

> [!WARNING]
> **Ưu điểm:** Triển khai cực nhanh chỉ bằng 1 nút bấm từ GitHub, tự động deploy khi push code mới.
> **Nhược điểm:** Tốc độ kết nối từ Việt Nam sang các server nước ngoài (Render, Railway, Neon) có thể bị ảnh hưởng khi đứt cáp quang biển. Chi phí duy trì cao.

---

## 2. Hướng Dẫn Cấu Hình Triển Khai (Tùy chọn 1 - Tối ưu nhất)

Dưới đây là tài liệu kỹ thuật chi tiết để cấu hình hệ thống trên VPS **Ubuntu 22.04 LTS**.

### Bước 2.1: Cài đặt NodeJS & Nginx
```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Node.js LTS (v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Cài đặt Nginx
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Bước 2.2: Cài đặt và Cấu hình PostgreSQL Bảo Mật
```bash
# Cài đặt PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Khởi động dịch vụ
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Vào terminal của Postgres
sudo -i -u postgres psql
```
Trong cửa sổ PostgreSQL (`psql`), chạy các lệnh thiết lập:
```sql
-- Tạo Database
CREATE DATABASE truliva_db;

-- Tạo User và Mật khẩu bảo mật
CREATE USER truliva_user WITH PASSWORD 'MatKhauSieuBaoMat123_';

-- Gán quyền truy cập database cho user
GRANT ALL PRIVILEGES ON DATABASE truliva_db TO truliva_user;
ALTER DATABASE truliva_db OWNER TO truliva_user;

-- Thoát Postgres
\q
```

> [!IMPORTANT]
> **Đảm bảo bảo mật cổng 5432:**
> Mặc định PostgreSQL trên Ubuntu chỉ lắng nghe trên giao diện `127.0.0.1`. Hãy giữ nguyên cấu hình này (không mở file `postgresql.conf` sửa thành listen `*`) để ngăn chặn việc dò quét mật khẩu cơ sở dữ liệu từ bên ngoài internet.

---

### Bước 2.3: Chuyển Dữ Liệu Từ Neon Sang VPS (Migration)

1.  **Xuất dữ liệu từ Neon (Chạy trên máy tính cá nhân hoặc VPS):**
    ```bash
    pg_dump -h ep-dawn-f...neon.tech -U neondb_owner -d neondb -F c -b -v -f truliva_backup.dump
    ```
2.  **Khôi phục dữ liệu vào VPS:**
    *   Tải tệp `truliva_backup.dump` lên VPS.
    *   Chạy lệnh khôi phục:
        ```bash
        pg_restore -d truliva_db -U truliva_user -h 127.0.0.1 -W truliva_backup.dump
        ```

---

### Bước 2.4: Deploy Mã Nguồn & Cấu Hình `.env`

Tải mã nguồn từ GitHub về thư mục `/var/www/truliva` trên VPS:
```bash
sudo mkdir -p /var/www/truliva
sudo chown -R $USER:$USER /var/www/truliva
cd /var/www/truliva
git clone https://github.com/Quocanh1508/truliva-webapp.git .
```

Tạo file `.env` cho backend (`/var/www/truliva/.env`):
```env
PORT=5000
NODE_ENV=production

# Kết nối database PostgreSQL nội bộ
DATABASE_URL="postgresql://truliva_user:MatKhauSieuBaoMat123_@127.0.0.1:5432/truliva_db"

# Cloudinary credentials (cho giai đoạn đầu)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Session/JWT Secret
JWT_SECRET=your_super_jwt_secret_key_123!
```

Build dự án:
```bash
# Cài đặt PM2 để chạy nền NodeJS
sudo npm install -g pm2

# Cài đặt dependencies và build
npm install
npm run build

# Khởi chạy ứng dụng backend bằng PM2
pm2 start dist/index.js --name "truliva-backend"
pm2 save
pm2 startup
```

---

### Bước 2.5: Cấu hình Nginx Reverse Proxy & SSL (HTTPS)

Tạo file cấu hình Nginx cho tên miền (ví dụ: `app.truliva.vn`):
`/etc/nginx/sites-available/truliva`
```nginx
server {
    listen 80;
    server_name app.truliva.vn;

    # Giao diện Frontend (React SPA)
    location / {
        root /var/www/truliva/webapp/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API Routes đi tới Backend NodeJS (PM2 chạy ở cổng 5000)
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Kích hoạt cấu hình và cài đặt SSL HTTPS miễn phí:
```bash
sudo ln -s /etc/nginx/sites-available/truliva /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Cài đặt Certbot để cấu hình HTTPS miễn phí
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d app.truliva.vn
```
*Certbot sẽ tự động cấu hình chuyển hướng HTTP sang HTTPS và tự động gia hạn chứng chỉ bảo mật định kỳ.*

---

### Bước 2.6: Cài đặt Script Tự Động Backup Database Hàng Ngày

Tạo file script backup tại thư mục `/var/www/truliva/backup_db.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/var/www/truliva/backups"
DB_NAME="truliva_db"
DB_USER="truliva_user"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

mkdir -p $BACKUP_DIR

# Xuất cơ sở dữ liệu
pg_dump -U $DB_USER -h 127.0.0.1 -d $DB_NAME -F c -b -v -f "$BACKUP_DIR/db_backup_$DATE.dump"

# Xóa các bản backup cũ hơn 30 ngày để tiết kiệm dung lượng VPS
find $BACKUP_DIR -type f -name "*.dump" -mtime +30 -delete

echo "Backup database thành công lúc $DATE"
```
Cấp quyền thực thi và đưa vào trình lập lịch `cron`:
```bash
chmod +x /var/www/truliva/backup_db.sh

# Mở cron tab để lập lịch
crontab -e
```
Thêm dòng dưới đây vào cuối file crontab để chạy script tự động lúc **2:00 sáng mỗi ngày**:
```text
0 2 * * * /bin/bash /var/www/truliva/backup_db.sh >> /var/log/db_backup.log 2>&1
```

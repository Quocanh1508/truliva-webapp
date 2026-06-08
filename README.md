# Hệ Thống Quản Lý Dịch Vụ & Đồng Bộ Đơn Hàng Truliva

[![System](https://img.shields.io/badge/System-Truliva%20Manager-blue)](#)
[![Framework](https://img.shields.io/badge/Framework-Node.js%20%7C%20React%20%7C%20Capacitor-orange)](#)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%7C%20Prisma-green)](#)
[![Status](https://img.shields.io/badge/Status-Active-brightgreen)](#)

Repository này chứa toàn bộ mã nguồn hệ thống quản lý điều phối dịch vụ kỹ thuật, tồn kho thông minh và đồng bộ hóa đơn hàng tự động của **Truliva** với nền tảng **Pancake POS**.

---

> [!IMPORTANT]
> **Hướng dẫn triển khai trên Render:** Khi cấu hình các Biến môi trường (Environment Variables) trên Render, các giá trị chuỗi (như `DATABASE_URL` hoặc `FIREBASE_PRIVATE_KEY`) **không được bao ngoài bằng dấu nháy kép `"`** để tránh gây lỗi phân tích cú pháp (parser error) dẫn tới crash server khi khởi động.

## Mục Lục
- [Tổng Quan Dự Án](#-tổng-quan-dự-án)
- [Các Tính Năng Nổi Bật](#-các-tính-năng-nổi-bật)
- [Kiến Trúc Hệ Thống & Công Nghệ](#-kiến-trúc-hệ-thống--công-nghệ)
- [Cấu Trúc Thư Mục Dự Án](#-cấu-trúc-thư-mục-dự-án)
- [Cài Đặt & Cấu Hình Môi Trường](#-cài-đặt--cấu-hình-môi-trường)
- [Khởi Chạy Nhanh (Quick Start)](#-khởi-chạy-nhanh-quick-start)
- [Đóng Gói Ứng Dụng Di Động (Capacitor Android)](#-đóng-gói-ứng-dụng-di-động-capacitor-android)
- [Quy Trình Triển Khai (Deployment)](#-quy-trình-triển-khai-deployment)

---

## Tổng Quan Dự Án

**Truliva** là một giải pháp quản lý vận hành khép kín dành cho các doanh nghiệp cung cấp dịch vụ kỹ thuật tại nhà (lắp đặt máy lọc nước, bảo trì thiết bị, sửa chữa gia dụng, thay lõi lọc định kỳ...). Hệ thống được thiết kế tích hợp trực tiếp với **Pancake POS** thông qua cơ chế Webhook thời gian thực và API tự động đồng bộ.

Quy trình vận hành chuẩn của hệ thống:
1. **Admin (Trực quan hóa điều hành & tồn kho):** 
   - Tiếp nhận đơn hàng tự động từ Pancake POS hoặc tạo đơn thủ công.
   - Kiểm tra trực quan tình trạng tồn kho sản phẩm tại trạm xuất hàng (Cảnh báo Xanh/Vàng/Đỏ).
   - Chỉ định và điều phối Kỹ thuật viên (KTV) thuộc các Trạm khu vực.
2. **Kỹ thuật viên (Ứng dụng di động tối ưu):**
   - Nhận thông tin việc được giao tức thì qua thông báo đẩy (Push/PWA Notification).
   - Xem chi tiết công việc qua giao diện Thẻ đứng (Card List) tối ưu cho điện thoại dọc.
   - Thao tác nhanh: Gọi điện liên hệ khách hàng (tự động copy số), đổi lịch hẹn khách hàng, tạo báo cáo nghiệm thu hiện trường (chụp hình nghiệm thu theo mẫu, đo đạc chỉ số TDS đầu vào/đầu ra, ghi nhận nguồn nước).

---

## Các Tính Năng Nổi Bật

### 1. Đồng Bộ & Phân Phối Đơn Hàng Tự Động
- **Webhook Integration:** Tự động lắng nghe và cập nhật trạng thái đơn hàng từ Pancake POS.
- **Auto Sync Scheduler:** Cơ chế dự phòng tự động quét và cập nhật các đơn hàng mới nhất mỗi 5 phút để tránh sót đơn.
- **Phân loại công việc:** Hỗ trợ điều phối linh hoạt các loại dịch vụ: Giao hàng, Lắp đặt, Bảo hành, Sửa chữa, Thay lõi lọc...

### 2. Quản Lý Kho & Đối Chiếu Tồn Kho 2 Chiều
- **Cảnh báo tồn kho trực quan:** Đánh giá khả năng đáp ứng đơn hàng dựa trên số lượng tồn kho thực tế của sản phẩm tại kho chỉ định (Xanh: Đủ hàng, Vàng: Dưới mức tối thiểu, Đỏ: Hết hàng).
- **Đồng bộ đổi kho xuất hàng:** Khi đổi kho trên hệ thống Truliva, tín hiệu cập nhật tự động gửi sang đơn hàng gốc trên Pancake POS để trừ kho đồng bộ.

### 3. Trải Nghiệm Di Động Kỹ Thuật Viên Cao Cấp
- **Giao diện Thẻ Dọc (Card List):** Thiết kế tối ưu loại bỏ hoàn toàn thanh cuộn ngang khó chịu trên mobile. Mỗi công việc hiển thị đầy đủ thông tin khách hàng, địa chỉ, sản phẩm, và ghi chú đi kèm các icon trực quan (`User`, `MapPin`, `Clock`, `Wrench`, `MessageSquare`).
- **Xác thực Đăng Nhập Vĩnh Viễn:** Sử dụng cơ chế kết hợp JWT Bearer Token lưu ở LocalStorage và Authorization Header giúp KTV không bị đăng xuất ngẫu nhiên trên WebView Capacitor.
- **Nghiệm thu hiện trường:** Đo chỉ số TDS đầu vào/đầu ra, chụp ảnh bàn giao, chọn linh kiện phát sinh, tự động điền form báo cáo.

---

## Kiến Trúc Hệ Thống & Công Nghệ

Hệ thống được phát triển theo mô hình Client-Server hiện đại, chia tách rõ ràng giữa Backend (API) và Frontend (Single Page Application - SPA):

```mermaid
graph TD
    A["Pancake POS API / Webhook"] <-->|Đồng bộ Đơn hàng & Kho| B["Node.js Express Backend"]
    B <-->|Prisma Client| C[("PostgreSQL Database")]
    B -->|Firebase Admin SDK| D["Firebase Cloud Messaging"]
    B -->|Web-Push| E["PWA Push Service"]
    B <-->|REST API / Bearer Token| F["React TS Webapp Client"]
    F -->|Capacitor Native Bridge| G["Capacitor Android Webview"]
    D -->|Push Notification| G
    E -->|Push Notification| F
```

### Công Nghệ Sử Dụng
*   **Backend Engine:** Node.js (Express), TypeScript
*   **Database & ORM:** PostgreSQL (Neon Cloud), Prisma ORM
*   **Push Notifications:** Firebase Admin SDK (cho App Native), Web-Push (cho trình duyệt PWA)
*   **Frontend Webapp:** React, Vite, TypeScript, Tailwind CSS, Lucide Icons
*   **Mobile Wrapper:** Capacitor CLI (đóng gói mã nguồn web thành APK Android)
*   **Cloud Deployment:** Render (Web Service), Cloudinary (lưu trữ hình ảnh nghiệm thu)

---

## Cấu Trúc Thư Mục Dự Án

```text
.
├── src/                      # Mã nguồn Backend (Express)
│   ├── config/               # Cấu hình database, Firebase, mail...
│   ├── middleware/           # Middleware xác thực (authSession), logging...
│   ├── routes/               # Các API endpoints (auth, orders, reports, webhooks...)
│   ├── services/             # Logic nghiệp vụ (đồng bộ đơn, dọn dẹp báo cáo, push thông báo...)
│   ├── utils/                # Các helper dùng chung (logger, mailer...)
│   └── index.ts              # Entry point của Server
├── prisma/                   # Cấu hình Prisma ORM
│   └── schema.prisma         # Định nghĩa các Model Database
├── webapp/                   # Mã nguồn Frontend (React Single Page Application)
│   ├── src/
│   │   ├── api/              # Client gọi API (client.ts)
│   │   ├── components/       # Các component UI tái sử dụng
│   │   ├── context/          # Quản lý state đăng nhập (AuthContext.tsx)
│   │   ├── pages/            # Các trang giao diện (KTV, Admin, Đăng nhập...)
│   │   ├── utils/            # Helper format tiền tệ, mã đơn hàng...
│   │   ├── App.tsx           # Router & Cấu trúc chính
│   │   └── main.tsx          # Entry point của Frontend
│   ├── package.json          # File cấu hình webapp
│   ├── vite.config.ts        # Cấu hình Vite bundler
│   └── tsconfig.json         # Cấu hình TypeScript Frontend
├── package.json              # File cấu hình Root (quản lý chạy đồng thời backend/frontend)
├── render.yaml               # Cấu hình Infrastructure-as-Code để triển khai lên Render
└── tsconfig.json             # Cấu hình TypeScript Backend
```

---

## Cài Đặt & Cấu Hình Môi Trường

### 1. Yêu Cầu Hệ Thống
*   **Node.js:** Phiên bản 18.x trở lên
*   **PostgreSQL:** Database hoạt động hoặc tài khoản Neon Cloud
*   **Package Manager:** npm (đi kèm Node.js)

### 2. Cài Đặt Thư Viện
Thực hiện cài đặt các thư viện cần thiết ở thư mục gốc:
```bash
npm install
```

### 3. Cấu Hình Biến Môi Trường
Tạo file `.env` ở thư mục gốc dự án dựa trên file `.env.example`:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# API & Webhook Security Keys
PANCAKE_WEBHOOK_SECRET="your-webhook-secret"
JWT_SECRET="your-jwt-secret-key"
PANCAKE_API_KEY="your-pancake-api-key"

# Cloudinary (Image Uploads)
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Email Configuration (SMTP)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE="false"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM_NAME="Truliva System"
APP_URL="http://localhost:3000"

# VAPID Keys (PWA Web Push)
VAPID_PUBLIC_KEY="your-vapid-public-key"
VAPID_PRIVATE_KEY="your-vapid-private-key"
VAPID_SUBJECT="mailto:your-email@gmail.com"

# Firebase Cloud Messaging
FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="your-firebase-client-email"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----\n"
```

---

## Khởi Chạy Nhanh (Quick Start)

### 1. Đồng Bộ Hóa Database
Tạo và cập nhật cấu trúc bảng database thông qua Prisma:
```bash
npx prisma generate
npx prisma db push
```

### 2. Chạy Chế Độ Phát Triển (Development)
Khởi chạy đồng thời cả Backend (port 3000) và Frontend Vite Dev Server (port 5173):
```bash
npm run dev
```

### 3. Biên Dịch Dự Án (Build Production)
Biên dịch toàn bộ dự án (cả client và server) để chuẩn bị deploy:
```bash
npm run build
```

---

## Đóng Gói Ứng Dụng Di Động (Capacitor Android)

Để đóng gói và phát hành ứng dụng di động cho Kỹ thuật viên (file APK):

### 1. Đồng Bộ Mã Nguồn Với Capacitor Android Project
```bash
cd webapp
npm run build
npx cap sync android
```

### 2. Tạo File APK
*   **Cách 1:** Mở thư mục `webapp/android` bằng **Android Studio**, chọn `Build > Build Bundle(s) / APK(s) > Build APK(s)`.
*   **Cách 2 (Sử dụng dòng lệnh):**
    ```powershell
    cd webapp/android
    .\gradlew.bat assembleDebug
    ```
    *File APK sau khi build thành công sẽ nằm ở: `webapp/android/app/build/outputs/apk/debug/app-debug.apk`*

---

## Quy Trình Triển Khai (Deployment)

Dự án hỗ trợ deploy tự động lên **Render** thông qua file cấu hình `render.yaml`. 

Khi bạn liên kết repository này với tài khoản Render, Render sẽ tự động đọc cấu hình trong file `render.yaml` để thiết lập dịch vụ Web Service.

> [!WARNING]
> **Lưu ý đặc biệt quan trọng:** Khi thiết lập các giá trị biến môi trường (`DATABASE_URL`, `FIREBASE_PRIVATE_KEY`,...) trong phần **Environment** trên giao diện điều khiển của Render, **tuyệt đối không bao quanh giá trị bằng dấu nháy kép `"`**. Render sẽ nhận diện toàn bộ chuỗi ký tự nhập vào làm giá trị chính thức, việc có dấu nháy kép sẽ gây lỗi kết nối và làm ứng dụng crash ngay khi khởi động.

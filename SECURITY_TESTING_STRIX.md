# 🛡️ Hướng Dẫn Tích Hợp & Kiểm Thử Bảo Mật Tự Động Với Strix AI

Dự án Truliva đã được tích hợp bộ công cụ kiểm thử xâm nhập tự động bằng AI **[Strix](https://github.com/usestrix/strix)** nhằm phát hiện, xác thực và đưa ra các giải pháp vá lỗ hổng bảo mật chuyên sâu trước khi triển khai sản phẩm.

---

## 1. Cơ Chế Hoạt Động Của Strix
- **Autonomous Multi-Agent**: Strix sử dụng các AI Agent phối hợp mô phỏng kỹ thuật viên bảo mật thực thụ: thu thập thông tin endpoints, phân tích luồng xác thực (Authentication/RBAC), kiểm tra IDOR, SQL Injection, CSRF/XSS và leo thang đặc quyền.
- **"No PoC, No Finding"**: Strix chỉ báo cáo những lỗ hổng có thể khai thác thực tế và luôn đính kèm mã Proof-of-Concept (PoC) có thể tái hiện được, tránh tạo ra cảnh báo giả (false positives).
- **Môi trường Sandbox an toàn**: Các payload khai thác được cô lập bên trong Docker container (`strix-sandbox`).

---

## 2. Cấu Trúc Tích Hợp Trong Hệ Thống Truliva

| Tệp tin | Chức năng |
| :--- | :--- |
| `strix.config.yaml` | Cấu hình phạm vi quét (Scope), loại trừ webhooks bên thứ 3 (Pancake/Zalo), danh mục test RBAC/IDOR và xuất báo cáo. |
| `.github/workflows/strix-security-scan.yml` | Pipeline CI/CD tự động quét định kỳ hoặc kích hoạt thủ công (`workflow_dispatch`) trên GitHub Actions. |
| `scripts/security/run-strix-scan.js` | Script kiểm tra môi trường (Docker, Python, API key) và chạy quét cục bộ. |
| `package.json` (`npm run test:security`) | Lệnh tiện ích npm kích hoạt trình quét bảo mật. |

---

## 3. Hướng Dẫn Sử Dụng Cục Bộ (Local Developer Environment)

### Bước 1: Điều kiện tiên quyết
- Đã cài đặt **Python 3.12+** và **Docker**.
- Có API Key của một trong các nhà cung cấp LLM: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` hoặc `GEMINI_API_KEY`.

### Bước 2: Cài đặt Strix CLI
```bash
# Cách 1: Cài đặt qua pip
pip install strix-agent

# Cách 2: Cài đặt qua script chính thức
curl -sSL https://strix.ai/install | bash
```

### Bước 3: Cấu hình biến môi trường
Thêm API Key vào file `.env` hoặc export vào terminal:
```bash
export OPENAI_API_KEY="sk-..."
# hoặc
export GEMINI_API_KEY="..."
```

### Bước 4: Khởi động Server Truliva và Kích hoạt quét
Khởi động hệ thống Truliva ở môi trường local hoặc staging test:
```bash
npm run dev
```

Mở một tab terminal khác và chạy lệnh:
```bash
npm run test:security
```
*Hoặc chỉ định URL mục tiêu cụ thể:*
```bash
node scripts/security/run-strix-scan.js --target http://localhost:3000
```

---

## 4. Kiểm Thử Trên GitHub Actions (CI/CD)

1. Vào repository trên GitHub -> **Settings** -> **Secrets and variables** -> **Actions**.
2. Thêm Secret: `OPENAI_API_KEY` (hoặc `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`).
3. Vào tab **Actions** -> Chọn workflow **"Strix AI Penetration Testing & Vulnerability Audit"** -> Bấm **"Run workflow"**.
4. Khi quá trình quét kết thúc, tải tệp báo cáo `strix-security-audit-report` trong mục **Artifacts** để xem chi tiết các lỗ hổng (HTML/JSON/Markdown).

---

> [!WARNING]
> **Lưu ý an toàn**: Luôn chạy kiểm thử Strix trên **môi trường Test / Staging hoặc Local Database** với dữ liệu giả lập. Không quét trực tiếp trên môi trường Database Production đang phục vụ khách hàng thực tế để tránh ảnh hưởng đến tính toàn vẹn của dữ liệu đơn hàng.

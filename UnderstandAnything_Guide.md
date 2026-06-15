# Hướng dẫn sử dụng Understand-Anything cho Lập trình viên

Công cụ **Understand-Anything** của Egonex-AI giúp chuyển đổi mã nguồn dự án thành một sơ đồ tri thức (Knowledge Graph) tương tác trực tiếp trên trình duyệt, hỗ trợ quá trình đọc hiểu luồng code của dự án **Truliva**.

---

## 🛠️ Hướng dẫn cài đặt

Bạn có thể cài đặt công cụ này bằng lệnh CLI trực tiếp tùy theo hệ điều hành đang sử dụng.

### 1. Trên Windows (PowerShell)
Mở PowerShell và chạy lệnh sau:
```powershell
iwr -useb https://raw.githubusercontent.com/Egonex-AI/Understand-Anything/main/install.ps1 | iex
```

### 2. Trên macOS hoặc Linux (Bash/Shell)
Mở Terminal và chạy lệnh sau:
```bash
curl -fsSL https://raw.githubusercontent.com/Egonex-AI/Understand-Anything/main/install.sh | bash
```

### 3. Cài đặt trực tiếp nếu sử dụng Claude Code
Nếu bạn đang sử dụng CLI của Claude Code, có thể cài đặt trực tiếp dưới dạng plugin:
```bash
/plugin marketplace add Egonex-AI/Understand-Anything
/plugin install understand-anything
```

---

## 🚀 Cách sử dụng trong dự án Truliva

Sau khi cài đặt thành công, hãy di chuyển vào thư mục gốc của dự án `truliva` trong Terminal hoặc PowerShell:

1. **Khởi chạy quét toàn bộ mã nguồn**:
   Chạy lệnh sau để công cụ bắt đầu phân tích cấu trúc tệp tin, các class, hàm và quan hệ dependencies:
   ```bash
   understand
   ```
   *(Hoặc gõ `/understand` nếu đang ở trong môi trường Claude Code)*

2. **Khám phá sơ đồ**:
   - Sau khi hoàn thành phân tích, công cụ sẽ tự động xuất một tệp tin đồ thị dạng JSON lưu trong thư mục dự án của bạn (có thể commit để chia sẻ với các dev khác).
   - Đồng thời, một trang Web Dashboard tương tác sẽ được mở trên trình duyệt của bạn (mặc định tại cổng `http://localhost:3000` hoặc cổng ngẫu nhiên do CLI cung cấp).
   - Tại đây bạn có thể:
     - **Zoom / Pan**: Kéo thả, phóng to thu nhỏ sơ đồ.
     - **Domain View**: Xem cách code ánh xạ vào các quy trình nghiệp vụ (Business logic).
     - **Fuzzy Search**: Tìm kiếm nhanh hàm, class, hoặc file theo tên hoặc ý định (Ví dụ gõ: "auth", "pancake", "report").
     - **Impact Analysis**: Xem các file/hàm bị ảnh hưởng khi thực hiện các thay đổi (Diff).
     - **Guided Tours**: Xem các hướng dẫn kiến trúc từng bước theo mức độ phụ thuộc.

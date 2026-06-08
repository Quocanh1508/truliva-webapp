<div align="center">
  <img src="webapp/public/logo.png" alt="Truliva Logo" width="200" style="border-radius: 12px; margin-bottom: 20px;"/>
  <h1>Hệ Thống Quản Lý Dịch Vụ & Đồng Bộ Đơn Hàng Truliva</h1>
  <p><strong>Giải pháp toàn diện giúp tối ưu hóa quy trình điều phối kỹ thuật viên, quản lý tồn kho và đồng bộ hóa đơn hàng với Pancake POS.</strong></p>
</div>

---

## 🌟 Giới Thiệu Chung
**Truliva** là nền tảng quản lý vận hành dịch vụ kỹ thuật (giao hàng, lắp đặt, bảo trì, thay lõi lọc...) được thiết kế nhằm đồng bộ hóa chặt chẽ với hệ thống bán hàng **Pancake POS**. 

Hệ thống giúp doanh nghiệp giải quyết bài toán quản lý hai đầu:
1. **Admin (Trực quan hóa điều hành):** Tiếp nhận đơn hàng, đối chiếu tồn kho thực tế, đổi kho xuất hàng, và phân công Kỹ thuật viên (KTV) thuộc các Trạm khu vực một cách nhanh chóng.
2. **Kỹ thuật viên (Ứng dụng di động tiện lợi):** Nhận việc, liên hệ khách hàng, chụp ảnh nghiệm thu thực tế, đo đạc thông số kỹ thuật đầu vào/đầu ra và gửi báo cáo nghiệm thu ngay tại công trình.

---

## 🚀 Các Tính Năng Cốt Lõi

### 📦 1. Quản Lý & Phân Bổ Đơn Hàng Thông Minh
- **Đồng bộ thời gian thực (Real-time Sync):** Tự động kéo thông tin đơn hàng mới từ Pancake POS qua cơ chế Webhook.
- **Phân công dịch vụ chi tiết:** Phân chia các loại công việc cụ thể như **Giao hàng, Lắp đặt, Bảo hành, Thay thế lõi lọc...** cho các Trạm chính hoặc Trạm kỹ thuật khu vực.
- **Chỉ định Kỹ thuật viên (KTV):** Giao việc trực tiếp cho nhân sự kỹ thuật phù hợp dựa trên vị trí địa lý hoặc chuyên môn.

### 🏭 2. Quản Lý Kho & Đồng Bộ Tồn Kho Hai Chiều
- **Đối chiếu tồn kho trực tiếp:** Khi Admin phân bổ hoặc chỉnh sửa thông tin kho xuất hàng cho đơn, hệ thống tự động hiển thị trạng thái tồn kho của các sản phẩm trong đơn tại kho đó:
  - <span style="color:#ef4444">🔴 Đỏ</span>: Hết hàng.
  - <span style="color:#eab308">🟡 Vàng</span>: Sắp hết (dưới ngưỡng tối thiểu).
  - <span style="color:#22c55e">🟢 Xanh</span>: Đủ hàng cung ứng.
- **Đồng bộ đổi kho sang Pancake POS:** Khi Admin đổi kho phân bổ trên Truliva, hệ thống tự động bắn tín hiệu cập nhật mã kho mới (`warehouse_id`) sang đơn hàng gốc trên Pancake POS để POS thực hiện trừ kho và đồng bộ ngược dữ liệu tồn mới về Truliva.
- **Bộ lọc tồn kho nâng cao:** 
  - Xem nhanh các sản phẩm hết hàng hoặc sắp hết hàng để chủ động lên kế hoạch nhập hàng.
  - Lọc nhanh các sản phẩm còn hàng hoạt động.
  - Tự do thiết lập ngưỡng cảnh báo tồn tối thiểu cho từng sản phẩm.

### 🔧 3. Ứng Dụng Di Động Cho Kỹ Thuật Viên (KTV)
- **Giao diện Webapp/APK di động tối ưu:** KTV dễ dàng cài đặt app trên điện thoại Android (thông qua file APK được đóng gói bằng Capacitor).
- **Hỗ trợ tác vụ tại hiện trường:** 
  - Xem thông tin chi tiết đơn hàng, địa chỉ, số điện thoại và nút gọi nhanh cho khách hàng.
  - Ghi nhận thông số kỹ thuật khi nghiệm thu: Đo chỉ số **TDS đầu vào/đầu ra**, áp suất nước, ghi nhận loại nguồn nước thực tế.
  - Chọn linh kiện/phụ tùng phát sinh trực tiếp trong quá trình lắp đặt.
- **Tải ảnh nghiệm thu trực quan:** Cho phép KTV chụp ảnh sản phẩm, số serial, hóa đơn hoặc ảnh bàn giao dựa theo các hình ảnh mẫu chuẩn quy định sẵn của từng loại dịch vụ.

### 📊 4. Giám Sát & Báo Cáo
- **Nhật ký thay đổi (Audit Log):** Lưu lại lịch sử chi tiết mọi thao tác thay đổi đơn hàng (ai đã cập nhật, thay đổi những gì, thời gian nào) giúp minh bạch hóa quy trình.
- **Hệ thống Feedback:** Cho phép KTV báo lỗi hoặc đóng góp ý kiến kèm hình ảnh thực tế trực tiếp từ ứng dụng về cho đội ngũ Admin/Dev.

---

## 🛠️ Hướng Dẫn Vận Hành Nhanh

### Cài đặt môi trường & khởi chạy
1. Cài đặt các gói thư viện phụ thuộc:
   ```bash
   npm install
   ```
2. Cấu hình các biến môi trường trong file `.env` (bao gồm API Key của Pancake POS, thông tin Database và cổng Webhook).
3. Chạy ứng dụng ở chế độ phát triển (khởi động đồng thời cả Backend và Frontend):
   ```bash
   npm run dev
   ```

### Đồng bộ & Build App di động (cho Android)
Khi có sự thay đổi về tính năng hoặc giao diện mới, thực hiện đóng gói ứng dụng di động theo các bước sau:
1. Đóng gói mã nguồn Webapp:
   ```bash
   cd webapp
   npm run build
   npx cap sync android
   ```
2. Sử dụng **Android Studio** mở thư mục `webapp/android` để build file cài đặt **APK** mới (`Build > Build Bundle(s) / APK(s) > Build APK(s)`). Hoặc build nhanh bằng dòng lệnh:
   ```powershell
   cd webapp/android
   .\gradlew.bat assembleDebug
   ```

---

<div align="center">
  <p>Truliva - Nâng cao hiệu quả vận hành dịch vụ kỹ thuật</p>
  <p>© 2026 Truliva Corporation. All rights reserved.</p>
</div>

<!-- Deploy Trigger: KTV Mobile UI & Persistent Authentication updates -->


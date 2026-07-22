# 🎨 Quy Tắc Thiết Kế UI & Brand Styling System - Truliva

Tài liệu này quy định chuẩn hoá định vị thương hiệu, nhận diện thị giác (Visual Style) và quy chuẩn thiết kế giao diện người dùng (UI/UX) cho toàn bộ hệ thống Truliva (Admin Web App, KTV App, Zalo Mini App, và PWA App). Tất cả các Component mới hoặc chỉnh sửa từ nay về sau **BẮT BUỘC** tuân thủ các quy tắc dưới đây.

---

## 1. 🛡 Định Vị Thương Hiệu (Brand Positioning)

* **Tên thương hiệu**: **Truliva** (Hệ thống Quản lý Dịch vụ Kỹ thuật & Bảo hành Điện tử Khép kín).
* **Lĩnh vực cốt lõi**: Thiết bị gia dụng & Giải pháp lọc nước gia đình (*Water Purification & Household Technical Services*).
* **Mô hình vận hành**: FSM (*Field Service Management*) & Mini-ERP kết nối đa nền tảng (`Pancake POS` ↔ `WebApp Admin/KTV` ↔ `Zalo Mini App` ↔ `PWA/Capacitor App`).
* **3 Trụ cột nhận diện (Brand Identity Pillars)**:
  1. **Chuyên nghiệp & Uy tín (Professional & Trusted)**: Đảm bảo chất lượng kỹ thuật, theo dõi chỉ số nước thực tế (TDS, áp lực nước), quản lý chính xác lịch sử linh kiện/máy qua Số Serial duy nhất.
  2. **Tiên phong công nghệ (Tech-driven & Automated)**: Tự động hóa điều phối kỹ thuật viên (KTV) theo trạm địa lý (Stations), tự động đồng bộ tồn kho và trạng thái đơn hàng thời gian thực.
  3. **Tận tâm & Minh bạch (Customer-Centric & Transparent)**: Khách hàng kích hoạt bảo hành 1-touch qua Zalo/QR Code, nhận phản hồi và báo cáo chi tiết trực tiếp ngoài hiện trường.

---

## 2. 🎨 Bảng Mã Màu Chuẩn (Color Palette & Tokens)

### 2.1 Màu Thương Hiệu (Brand Colors)
| Loại màu | Mã màu Hex | Tên màu / Ý nghĩa |
| :--- | :--- | :--- |
| **Primary (Màu chủ đạo)** | `#1B3A6B` | **Truliva Navy** (Xanh hải quân đậm) – Đại diện cho sự vững chắc, tin cậy, tính doanh nghiệp. |
| **Primary Accent (Gradient / Mobile)** | `#2563EB` → `#1D4ED8` | **Tech Blue** – Dành cho Zalo Mini App & Mobile Header, tạo cảm giác công nghệ, năng động. |
| **Secondary (Màu nhấn phụ)** | `#00A3FF` | **Truliva Light Blue** (Xanh lam nước) – Biểu trưng cho nguồn nước sạch và luồng thông tin số. |
| **Background (Nền)** | `#F5F7FA` / `slate-50` | **Soft Gray-Blue** – Phông nền xám xanh nhạt dịu mắt, làm nổi bật các thẻ nội dung (Cards). |
| **Text Main (Chữ chính)** | `#333333` / `slate-800` | **Dark Slate** – Tương phản cao, hiển thị sắc nét trên cả màn hình di động ngoài trời. |

### 2.2 Màu Trạng Thái Nghiệp Vụ (Status Badges)
Mỗi trạng thái đơn hàng / ca dịch vụ phải dùng đúng cặp màu background/border/text quy định:

| Trạng thái | Mã màu đại diện | TailWind Classes (Badge) | Dot Indicator |
| :--- | :--- | :--- | :--- |
| **Chờ xử lý / Mới** | Amber (`#F59E0B`) | `bg-amber-50 text-amber-700 border-amber-200` | `bg-amber-500` |
| **Đã phân công / Đang làm** | Blue (`#2563EB`) | `bg-blue-50 text-blue-700 border-blue-200` | `bg-blue-500` |
| **Hoàn thành** | Emerald (`#10B981`) | `bg-emerald-50 text-emerald-700 border-emerald-200` | `bg-emerald-500` |
| **Hủy đơn / Lỗi** | Rose (`#EF4444`) | `bg-rose-50 text-rose-700 border-rose-200` | `bg-rose-500` |
| **Đổi / Hoàn trả** | Purple (`#8B5CF6`) | `bg-purple-50 text-purple-700 border-purple-200` | `bg-purple-500` |

---

## 3. ✍️ Typography & Font Chuẩn

* **Họ Font chính**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `sans-serif`.
* **Đặc trưng**: Font không chân (Sans-serif) hiện đại, nét chữ dày dặn ở các nút thao tác (`font-weight: 600`) giúp KTV thao tác nhanh bằng một tay ngoài hiện trường.

---

## 4. 🧩 Quy Chuẩn Thiết Kế Component Cốt Lõi (UI/UX Pattern)

### 4.1 Khung & Card (Containers & Cards)
* **Mobile-First Card Layout**: Thiết kế thẻ bo góc mượt mà (`rounded-xl` / `rounded-2xl`), khoảng cách thoáng đục, viền mảnh (`border-slate-200` / `border-gray-100`) kết hợp hiệu ứng bóng nhẹ (`shadow-sm`).
* **Glassmorphism & Soft Gradients**: Sử dụng dải màu chuyển từ Navy sang Blue kết hợp hiệu ứng mờ kính (`backdrop-blur-sm` / `backdrop-blur-xs`) ở các banner header và thẻ thông tin quan trọng.

### 4.2 Nút Bấm & Thao Tác Nhanh (Buttons & Quick Actions)
* **Chiều cao chuẩn**: Tối thiểu `h-10` (40px) trên Desktop, `h-12` (48px) trên Mobile / Zalo Mini App.
* **Cấu trúc Nút bấm**:
  * **Button Primary**: `bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl px-4 py-2.5 shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2`
  * **Button Secondary / Outline**: `border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-4 py-2.5 transition-all`
  * **Button Action Nhỏ**: `bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors`
* **Thao tác nhanh 1-chạm (1-Tap Quick Actions)**:
  * Tích hợp gọi điện 1-click (`tel:`), tự động sao chép SĐT/Địa chỉ, tự động định dạng số Serial (`XXXX XXX XXX XXXXX`), và quét QR Code xác thực nhanh.
* **Loading State**: Khi bấm nút gọi API, hiển thị `<Loader2 className="animate-spin" size={16} />` và disabled nút (`disabled:opacity-60 disabled:cursor-not-allowed`).

### 4.3 Form & Ô Nhập Liệu
* **Nhãn (Labels)**: `block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5`
* **Ô nhập**: `w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all`
* **Validation Error**: `text-xs text-rose-500 font-medium mt-1 flex items-center gap-1`

### 4.4 Pop-up & Modal
* **Overlay**: `fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4`
* **Modal Box**: `bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border-t-4 border-[#1B3A6B] flex flex-col`
* **Modal Header**: `bg-gray-50/80 p-5 border-b border-gray-100 flex justify-between items-center`. Có nút tắt `X` ở góc phải.
* **Modal Footer**: `p-4 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end items-center`

---

## 5. 💎 Hệ Thống Biểu Tượng (Iconography - Lucide Icons)

Sử dụng thư viện `lucide-react` nhất quán với các hình ảnh biểu trưng:
* `ShieldCheck`: Bảo hành chính hãng, kích hoạt bảo hành & ZNS.
* `Wrench` / `Activity`: Dịch vụ kỹ thuật chuyên sâu, đo đạc thông số thực tế (TDS, Áp lực nước).
* `QrCode` / `Barcode`: Định danh thiết bị và linh kiện thông minh qua Serial.
* `MapPin` / `Clock`: Định vị trạm kỹ thuật & quản lý thời gian hẹn chuẩn xác.

---

## 6. 📱 Responsive & Micro-Interactions

1. **Responsive Dual View**:
   * Desktop Admin: Table view chuyên nghiệp, bộ lọc thanh ngang linh hoạt, phân trang.
   * Mobile / Zalo Mini App: Tự động chuyển Table thành **Danh sách Thẻ (Card List)**, menu sát đáy màn hình (*Sticky Action Bar*), khoảng cách bấm tối thiểu `44px x 44px`.
2. **Micro-Interactions**:
   * Modal/Dropdown hiển thị hiệu ứng mượt: `animate-fade-in` / `transition-all duration-200`.
   * Hover hiệu ứng nâng nhẹ: `hover:-translate-y-0.5`.

---
*Tài liệu này là quy chuẩn bắt buộc áp dụng cho tất cả lập trình viên và AI Assistant trên toàn bộ dự án Truliva.*

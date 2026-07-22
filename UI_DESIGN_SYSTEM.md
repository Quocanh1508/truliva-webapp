# 🎨 Quy Tắc Thiết Kế UI & Design System - Truliva System

Tài liệu này quy định chuẩn hoá thiết kế giao diện người dùng (UI/UX) cho toàn bộ hệ thống Truliva (Admin Web App, KTV App, và Zalo Mini App). Tất cả các Component mới hoặc chỉnh sửa từ nay về sau **BẮT BUỘC** tuân thủ các quy tắc dưới đây.

---

## 1. 🎨 Bảng Mã Màu Chuẩn (Color Palette & Tokens)

### 1.1 Màu Thương Hiệu (Brand Colors)
* **Primary (Xanh Navy Truliva)**: `#1B3A6B` (`bg-[#1B3A6B]`, `text-[#1B3A6B]`)
* **Primary Hover**: `#2A518E` (`hover:bg-[#2A518E]`)
* **Secondary / Accent (Xanh Lam Biển)**: `#00A3FF` (`text-[#00A3FF]`, `bg-[#00A3FF]`)
* **Interactive Blue**: `#2563EB` (`bg-blue-600`, `text-blue-600`)

### 1.2 Màu Trạng Thái Nghiệp Vụ (Status Badges)
Mỗi trạng thái đơn hàng / ca dịch vụ phải dùng đúng cặp màu background/border/text quy định:

| Trạng thái | Màu đại diện | TailWind Classes (Badge) | Dot Indicator |
| :--- | :--- | :--- | :--- |
| **Chờ xử lý / Mới** | Amber / Vàng | `bg-amber-50 text-amber-700 border-amber-200` | `bg-amber-500` |
| **Đã phân công / Đang làm** | Blue / Xanh lá | `bg-blue-50 text-blue-700 border-blue-200` | `bg-blue-500` |
| **Hoàn thành** | Emerald / Xanh lục | `bg-emerald-50 text-emerald-700 border-emerald-200` | `bg-emerald-500` |
| **Hủy đơn / Lỗi** | Rose / Đỏ | `bg-rose-50 text-rose-700 border-rose-200` | `bg-rose-500` |
| **Đổi / Hoàn trả** | Purple / Tím | `bg-purple-50 text-purple-700 border-purple-200` | `bg-purple-500` |

---

## 2. 🧩 Quy Chuẩn Thiết Kế Component Cốt Lõi

### 2.1 Khung & Card (Containers & Cards)
* **Bo góc chuẩn**: `rounded-2xl` cho Card chính / Modal, `rounded-xl` cho Inner Cards / Inputs / Buttons.
* **Đổ bóng (Shadow)**: Dùng `shadow-sm` cho Card thông thường, `shadow-xl` / `shadow-2xl` cho Dropdown & Modal.
* **Viền (Border)**: `border border-gray-100` hoặc `border-gray-200/80` (tránh dùng viền quá đậm `#000`).

### 2.2 Nút Bấm (Buttons & Touch Targets)
* **Chiều cao chuẩn**: Tối thiểu `h-10` (40px) trên Desktop, `h-12` (48px) trên Mobile / Zalo Mini App.
* **Cấu trúc Nút bấm**:
  * **Button Primary**: `bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl px-4 py-2.5 shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2`
  * **Button Secondary / Outline**: `border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-4 py-2.5 transition-all`
  * **Button Subtly Tinted (Nút thao tác nhỏ)**: `bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors`
* **Trạng thái Đang tải (Loading State)**:
  * Khi bấm nút gọi API: Thêm `<Loader2 className="animate-spin" size={16} />` và disabled nút bấm (`disabled:opacity-60 disabled:cursor-not-allowed`).

### 2.3 Form & Ô Nhập Liệu (Inputs, Selects, Textareas)
* **Nhãn (Labels)**: `block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5`
* **Ô nhập**: `w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all`
* **Báo lỗi Validation**: `text-xs text-rose-500 font-medium mt-1 flex items-center gap-1`

### 2.4 Pop-up & Modal
* **Lớp phủ nền (Overlay)**: `fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4`
* **Hộp Modal**: `bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border-t-4 border-[#1B3A6B] flex flex-col`
* **Tiêu đề Modal Header**: Background `bg-gray-50/80 p-5 border-b border-gray-100 flex justify-between items-center`. Có Nút tắt `X` góc phải.
* **Chân Modal Footer**: `p-4 bg-gray-50 border-t border-gray-100 flex gap-3 justify-end items-center`

### 2.5 Bảng Dữ Liệu (Tables & Lists)
* **Header Bảng**: `bg-gray-50/80 text-gray-500 font-bold text-xs uppercase tracking-wider py-3 px-4 text-left border-b border-gray-200`
* **Dòng dữ liệu (Row)**: `hover:bg-blue-50/30 transition-colors border-b border-gray-100 py-3.5 px-4 text-sm`
* **Trạng thái Rỗng (Empty State)**:
  * Khi không có data: Hiển thị Container căn giữa với Icon rỗng + Thông báo rõ ràng: `"Không tìm thấy dữ liệu phù hợp"` + Nút *"Xóa bộ lọc"* hoặc *"Tạo mới"*.

---

## 3. 📱 Quy Chuẩn Đáp Ứng Màn Hình (Responsive & Mobile First)

1. **Desktop Admin View**: Sử dụng Table view với đầy đủ bộ lọc thanh ngang, phân trang, và hành động dạng popup/modal.
2. **Mobile / Zalo Mini App View**:
   * Tự động chuyển Table thành **Danh sách Thẻ (Card List)**.
   * Menu / Action Bar cố định sát đáy màn hình (**Bottom Navigation Bar / Sticky Action Footer**).
   * Khoảng cách chạm (Touch Spacing): Tất cả ô bấm tối thiểu `44px x 44px`.

---

## 4. ⚡ Animation & Micro-Interactions
* Các thành phần Modal, Toast, Dropdown phải có hiệu ứng xuất hiện mượt: `animate-fade-in` hoặc `transition-all duration-200 ease-in-out`.
* Khi hover trên Card hoặc Nút bấm: Thêm hiệu ứng di chuyển nhẹ `hover:-translate-y-0.5` hoặc đổi màu nền êm ái.

---
*Tài liệu này là quy chuẩn bắt buộc áp dụng cho tất cả lập trình viên và AI Assistant trên dự án Truliva.*

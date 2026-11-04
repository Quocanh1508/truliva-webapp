---
name: permission-matrix
description: Quy trình tự động cập nhật và đồng bộ ma trận phân quyền (Role, Group, User) mỗi khi phát triển hoặc sửa đổi tính năng/chức năng mới trong toàn hệ thống Truliva. Đảm bảo đồng bộ 100% giữa Backend (src/config/permissions.ts), Frontend (webapp/src/config/permissions.ts), API Guards và UI PermissionMatrix.
argument-hint: "[feature_key or action_name]"
license: MIT
metadata:
  author: truliva-engineering
  version: "1.0.0"
---

# Ma Trận Phân Quyền Truliva (Permission Matrix Auto-Sync Standard)

Quy chuẩn bất di bất dịch cho toàn bộ kỹ sư phần mềm và AI Coding Assistant: **Mỗi khi tạo mới hoặc cập nhật bất kỳ tính năng, nút bấm, endpoint hay tác vụ nghiệp vụ nào trong hệ thống Truliva, ma trận phân quyền BẮT BUỘC phải được cập nhật và đồng bộ tự động song song.**

---

## 1. Nguyên Tắc Cốt Lõi: Zero-Orphaned-Feature Policy

> [!IMPORTANT]
> **Không có bất kỳ tính năng nào được phép ra mắt mà thiếu khai báo phân quyền.**
> Một tính năng dù nhỏ (nút Xuất Excel, bộ lọc trạm, xem log token AI, quét OCR, sửa câu hỏi FAQ...) nếu không được đăng ký vào ma trận phân quyền sẽ dẫn đến:
> - Người dùng phàn nàn *"tại sao không thấy tính năng mới trong bảng phân quyền"*.
> - Rò rỉ lỗ hổng bảo mật do thiếu middleware kiểm tra quyền ở Backend.
> - Xung đột giao diện hoặc hỏng trải nghiệm người dùng khi phân quyền không đồng bộ giữa Frontend và Backend.

---

## 2. Khi Nào Phải Kích Hoạt Quy Trình Này?

Kích hoạt ngay lập tức khi công việc của bạn chạm đến một trong các trường hợp sau:
1. **Tạo mới hoặc sửa đổi Route / Controller / Endpoint API** trong thư mục `src/routes/` hoặc `src/controllers/`.
2. **Thêm Trang mới (Page), Tab mới, Modal popup, hoặc Nút hành động (Button)** trong thư mục `webapp/src/`.
3. **Thêm tác vụ nền (Worker), Cron job, lệnh MQTT hoặc Webhook** có giao diện điều khiển.
4. **Khi người dùng yêu cầu** tạo một tính năng mới hoặc thông báo *"phân quyền chưa có tính năng này"*.

---

## 3. Kiến Trúc Phân Quyền 3 Tầng (3-Tier Hierarchy)

Ma trận phân quyền Truliva hoạt động theo cơ chế ưu tiên từ cao xuống thấp:

```
[Tầng 1: User-Level Override] (Ưu tiên số 1)
       ↓ (nếu không có cấu hình riêng cho tài khoản)
[Tầng 2: Group-Level Matrix] (Ưu tiên số 2, theo Nhóm kinh doanh/chi nhánh)
       ↓ (nếu không có cấu hình riêng cho nhóm)
[Tầng 3: Role-Level Matrix] (Mặc định theo Chức vụ)
```

- **Các Chức Vụ (Roles)**: `ADMIN`, `DEV`, `COORDINATOR`, `HOTLINE`, `SALE_SUPERVISOR`, `SALER`, `STAFF`, `KTV`.
- **Các Nhóm Hệ Thống (Groups)**: `DTC`, `eCom`, `Service`, `DT South`, `DT North`, `Marketing`, `Admin` (và các nhóm tùy chỉnh khác).
- **Bộ Module Tính Năng (`SYSTEM_MODULES`)**:
  - `orders`: 📋 Quản lý Đơn hàng & Ca Dịch vụ
  - `hotline`: 📞 Quản lý Yêu Cầu Hotline
  - `serials`: 🏷️ Quản lý Serial & Bảo hành
  - `reports`: 📝 Quản lý Báo cáo Kỹ thuật
  - `salaries`: 💰 Quản lý Lương & Chi phí KTV
  - `inventory`: 📦 Quản lý Kho & Vật tư
  - `system`: ⚙️ Quản lý Hệ thống & Nhân sự
  - `ai_assistant`: 🤖 Quản lý Trợ lý AI & Tri thức
  - `iot`: 📡 Giám sát IoT (ESP32)
  - `dev_tools`: 🛠️ Công cụ Nhà phát triển (Dev Only)

---

## 4. Quy Trình 5 Bước Tự Động Cập Nhật Phân Quyền

Mỗi khi phát triển tính năng mới, bắt buộc thực hiện theo đúng 5 bước sau:

### Bước 1: Khai Báo Tại Backend Registry (`src/config/permissions.ts`)

Mở tệp `src/config/permissions.ts`:
1. Thêm key mới vào `export type PermissionKey = ...`
2. Thêm đối tượng tính năng mới vào mảng `SYSTEM_FEATURES`:

```typescript
{
  key: 'AI_CHAT_SESSION_MANAGE',                       // UPPER_SNAKE_CASE, duy nhất toàn hệ thống
  module: 'ai_assistant',                             // Thuộc một trong SYSTEM_MODULES
  moduleName: '🤖 Quản lý Trợ lý AI & Tri thức',      // Tên module tiếng Việt kèm icon
  name: 'Quản lý Phiên Chat & Giám sát Tokens',        // Tên tính năng ngắn gọn, rõ ràng
  description: 'Xem lịch sử các phiên chat, chi tiết câu hỏi/câu trả lời, lượng token tiêu thụ và độ trễ phản hồi',
  defaultRoles: ['ADMIN', 'DEV'],                     // Các vai trò được bật mặc định khi tính năng mới ra mắt
  devOnly: false,                                     // True nếu chỉ hiển thị cho DEV và ẩn khỏi ma trận Admin
  addedAt: '2026-11-03'                               // ĐỊNH DẠNG 'YYYY-MM-DD' (Ngày tạo). TUYỆT ĐỐI KHÔNG DÙNG 'v1.0'
}
```

> [!TIP]
> **Ý nghĩa của trường `addedAt`**:
> Khi `addedAt !== 'v1.0'`, hệ thống sẽ tự động gán cờ `newFeatureKeys` và hiển thị huy hiệu **`✨ MỚI`** lấp lánh trên giao diện Ma trận phân quyền. Quản trị viên khi vào trang phân quyền sẽ lập tức nhận biết tính năng mới để phân công cho nhân sự.

---

### Bước 2: Đồng Bộ Song Hành 100% Sang Frontend (`webapp/src/config/permissions.ts`)

Mở tệp `webapp/src/config/permissions.ts` và thực hiện đồng bộ giống hệt Backend:
1. Bổ sung `key` mới vào type `PermissionKey`.
2. Sao chép định nghĩa tính năng vừa tạo ở Bước 1 vào mảng `SYSTEM_FEATURES` của Frontend.

---

### Bước 3: Đặt Chốt Chặn Bảo Mật (Guards) Cả 2 Đầu

#### Tại Backend Route (`src/routes/...`):
Bảo vệ API endpoint bằng kiểm tra quyền:
```typescript
import { requireAuth } from '../middleware/authSession';
import { requirePermission } from '../middleware/permissions'; // Hoặc kiểm tra req.user.role / custom check

router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  // Chặn nghiêm ngặt nếu role không được phép
  if (!['ADMIN', 'DEV'].includes(req.user?.role || '')) {
    res.status(403).json({ success: false, message: 'Chức năng chỉ dành riêng cho Admin và Developer' });
    return;
  }
  // Logic xử lý...
});
```

#### Tại Frontend UI (`webapp/src/...`):
Sử dụng `usePermission` hoặc hàm `hasPermission` để kiểm soát hiển thị menu, tab hoặc nút bấm:
```tsx
import { usePermission } from '../context/PermissionContext';

export const MyComponent: React.FC = () => {
  const { hasPermission } = usePermission();
  const canManageSessions = hasPermission('AI_CHAT_SESSION_MANAGE');

  return (
    <div>
      {canManageSessions && (
        <button onClick={handleOpenSessions}>
          Quản lý Phiên Chat
        </button>
      )}
    </div>
  );
};
```

---

### Bước 4: Chạy Lệnh Kiểm Toán Tự Động (Mandatory Audit)

Sau khi chỉnh sửa, **bắt buộc** chạy lệnh kiểm toán phân quyền tự động:

```bash
npm run audit:permissions
# hoặc
node scripts/audit_permissions.js
```

Script sẽ tự động đối chiếu:
- Số lượng key Backend vs Frontend (phải bằng nhau 100%).
- Phát hiện bất kỳ key nào được gọi trong `hasPermission(...)` hoặc route guard nhưng chưa được đăng ký.
- Liệt kê toàn bộ các tính năng mới kèm ngày thêm (`addedAt`).

> [!CAUTION]
> Nếu script thoát với mã lỗi hoặc xuất hiện dòng chữ màu đỏ `❌ CẢNH BÁO`, bạn **KHÔNG ĐƯỢC PHÉP DEPLOY** cho đến khi sửa triệt để lỗi lệch ma trận.

---

### Bước 5: Triển Khai & Kiểm Thử Theo Quy Chuẩn Hệ Thống (Rule 4 & Rule 8)

Tuân thủ nghiêm ngặt quy trình Staging-First của dự án Truliva:
1. **Triển khai lên Sandbox VPS trước**:
   - Upload file nguồn `.ts` lên `/var/www/truliva-sandbox/`.
   - Biên dịch: `cd /var/www/truliva-sandbox && npx tsc`.
   - Build WebApp: `cd /var/www/truliva-sandbox/webapp && npm run build`.
   - Restart Sandbox: `pm2 restart truliva-sandbox --update-env`.
2. **Kiểm thử HTTP API thực tế (Mandatory HTTP Verification)**:
   - Dùng tài khoản `ADMIN`: Xác nhận API trả về `200 OK` và dữ liệu tính năng mới.
   - Dùng tài khoản không có quyền (ví dụ `KTV` hoặc `SALER`): Xác nhận hệ thống trả về chính xác `403 Forbidden`.
   - Kiểm tra giao diện Ma trận Phân quyền (`/admin/permissions`) trên Web App Sandbox: Xác nhận tính năng mới đã xuất hiện trong đúng Module kèm badge `✨ MỚI`.
3. **Triển khai lên Production VPS**:
   - Sau khi Sandbox đạt chuẩn 100%, upload lên `/var/www/truliva/`.
   - Biên dịch TypeScript trực tiếp trên VPS: `cd /var/www/truliva && npx tsc`.
   - Build WebApp Production: `cd /var/www/truliva/webapp && npm run build`.
   - Restart Production: `pm2 restart truliva-backend --update-env`.
   - Chạy script kiểm thử HTTP thực tế trên Production.

---

## 5. Hướng Dẫn Chọn Default Roles Chuẩn Cho Tính Năng Mới

| Loại Tính Năng | Đặc Điểm Nghiệp Vụ | Default Roles Khuyên Dùng |
| :--- | :--- | :--- |
| **Bảo mật & Hệ thống lõi** | Phân quyền, sao lưu, cấu hình token AI, reset mật khẩu | `['ADMIN', 'DEV']` |
| **Công cụ kỹ thuật ngầm** | Sơ đồ mạng trạm, bắn ZNS test, nhật ký debug, trace MQTT | `['DEV']` (kèm `devOnly: true`) |
| **Đơn hàng & Ca dịch vụ** | Tiếp nhận ca, xem đơn, theo dõi lịch trình thi công | `['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF']` |
| **Phân công & Điều phối** | Gán KTV, điều phối xe, chia ca thi công, hủy đơn | `['ADMIN', 'DEV', 'COORDINATOR']` |
| **Hotline & Khách hàng** | Tiếp nhận cuộc gọi, tra cứu bảo hành, lịch sử mua hàng | `['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'STAFF']` |
| **Báo cáo Kỹ thuật (KTV)** | Duyệt báo cáo thi công, kiểm tra ảnh lắp đặt, xuất kho | `['ADMIN', 'DEV', 'COORDINATOR']` |
| **Bảng lương & Hoa hồng** | Xem lương tổng, tính hoa hồng, duyệt thưởng, chốt kỳ lương | `['ADMIN', 'DEV']` hoặc thêm `COORDINATOR` nếu phụ trách duyệt phụ cấp |
| **Kho & Vật tư thiết bị** | Nhập linh kiện, chuyển kho, quét serial, kiểm kê lõi lọc | `['ADMIN', 'DEV', 'STAFF', 'COORDINATOR']` |

---

## 6. Checklist Tự Kiểm Tra Dành Cho Kỹ Sư & Agent

Trước khi báo cáo hoàn tất bất kỳ yêu cầu tính năng nào cho User, hãy kiểm tra danh sách sau:

- [ ] Tính năng mới đã có mã `key` chuẩn `UPPER_SNAKE_CASE` chưa?
- [ ] Đã thêm vào `SYSTEM_FEATURES` trong `src/config/permissions.ts` chưa?
- [ ] Đã thêm vào `SYSTEM_FEATURES` trong `webapp/src/config/permissions.ts` chưa?
- [ ] Trường `addedAt` có đúng định dạng ngày `'YYYY-MM-DD'` của hôm nay không?
- [ ] Đã bổ sung `PermissionKey` trong union type của cả 2 file chưa?
- [ ] Đã chạy `npm run audit:permissions` và nhận thông báo xanh `🎉 MA TRẬN PHÂN QUYỀN ĐỒNG BỘ 100% HOÀN HẢO` chưa?
- [ ] Giao diện có sử dụng `hasPermission('KEY')` để ẩn các phần nhạy cảm khi chưa được cấp quyền chưa?
- [ ] Backend route có bắt buộc `requireAuth` và kiểm tra quyền chưa?
- [ ] Đã nghiệm thu cả quyền hợp lệ (200) và không hợp lệ (403) trên Sandbox trước khi lên Prod chưa?


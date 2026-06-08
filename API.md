# Tài Liệu API - Truliva Backend

Tài liệu này mô tả toàn bộ các API endpoint của hệ thống Truliva Backend.

**Base URL (Production):** `https://truliva-ktv-webapp.onrender.com`  
**Base URL (Local):** `http://localhost:3000`

---

## Xác Thực (Authentication)

Hầu hết API yêu cầu xác thực. Hỗ trợ hai cơ chế:

| Cơ chế | Cách dùng |
|---|---|
| **Cookie (Web)** | Cookie `session_token` tự động gắn vào mỗi request từ trình duyệt |
| **Bearer Token (Mobile/App)** | Header `Authorization: Bearer <token>` — dùng cho WebView Capacitor Android |

Token có thời hạn **7 ngày**. Sau khi hết hạn, cần đăng nhập lại.

### Phân quyền
- **Public** — Không cần đăng nhập
- **Auth** — Cần đăng nhập (cả KTV và Admin)
- **Admin** — Chỉ tài khoản có `role = "ADMIN"` hoặc `"DEV"`

---

## Mục Lục

- [Health Check](#health-check)
- [Auth — Xác Thực](#auth--xác-thực)
- [Orders — Đơn Hàng](#orders--đơn-hàng)
- [Reports — Báo Cáo Nghiệm Thu](#reports--báo-cáo-nghiệm-thu)
- [Users — Quản Lý Tài Khoản](#users--quản-lý-tài-khoản)
- [Stations — Trạm Khu Vực](#stations--trạm-khu-vực)
- [Inventory — Kho Hàng](#inventory--kho-hàng)
- [Notifications — Thông Báo](#notifications--thông-báo)
- [Dashboard — Thống Kê](#dashboard--thống-kê)
- [Sample Images — Hình Ảnh Mẫu](#sample-images--hình-ảnh-mẫu)
- [Upload — Tải Lên Hình Ảnh](#upload--tải-lên-hình-ảnh)
- [Feedbacks — Phản Hồi](#feedbacks--phản-hồi)
- [Webhooks — Tích Hợp Pancake POS](#webhooks--tích-hợp-pancake-pos)

---

## Health Check

### `GET /health`
Kiểm tra xem server có đang hoạt động không.

**Auth:** Public

**Response `200`:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-08T07:00:00.000Z",
  "uptime": 3600.5,
  "environment": "production"
}
```

---

## Auth — Xác Thực

**Base path:** `/api/auth`

### `POST /api/auth/login`
Đăng nhập bằng username và mật khẩu.

**Auth:** Public

**Request Body:**
```json
{
  "username": "ktv01",
  "password": "matkhau123"
}
```

**Response `200`:** Trả về token JWT và thông tin người dùng. Cookie `session_token` được set tự động (7 ngày).
```json
{
  "token": "eyJhbGci...",
  "user": {
    "id": "uuid",
    "username": "ktv01",
    "fullName": "Nguyễn Văn A",
    "role": "KTV"
  }
}
```

---

### `POST /api/auth/logout`
Đăng xuất, xóa cookie session.

**Auth:** Public  
**Response `200`:** `{ "message": "Đã đăng xuất" }`

---

### `GET /api/auth/me`
Lấy thông tin đầy đủ của người dùng hiện đang đăng nhập (bao gồm thông tin cá nhân, ngân hàng, trạm kỹ thuật).

**Auth:** Auth

**Response `200`:**
```json
{
  "user": {
    "id": "uuid",
    "username": "ktv01",
    "fullName": "Nguyễn Văn A",
    "role": "KTV",
    "email": "a@example.com",
    "phoneNumber": "0901234567",
    "bankAccount": "123456789",
    "bankName": "Vietcombank",
    "techStationId": "uuid",
    "techStation": { "name": "Trạm Q.1", "mainStation": { "name": "Trạm HCM" } }
  }
}
```

---

### `PUT /api/auth/profile`
Cập nhật thông tin cá nhân (họ tên, email, địa chỉ, CCCD, tài khoản ngân hàng...).

**Auth:** Auth

**Request Body:** `fullName` (bắt buộc), tất cả trường khác là tùy chọn: `email`, `phoneNumber`, `address`, `cccdNumber`, `cccdDate`, `cccdPlace`, `bankAccount`, `bankName`.

---

### `POST /api/auth/change-password`
Thay đổi mật khẩu (KTV/Admin tự đổi mật khẩu của mình).

**Auth:** Auth

**Request Body:**
```json
{
  "currentPassword": "matkhau_cu",
  "newPassword": "matkhau_moi"
}
```

---

### `POST /api/auth/forgot-password`
Gửi email chứa link đặt lại mật khẩu (thời hạn 15 phút).

**Auth:** Public

**Request Body:** `{ "usernameOrEmail": "ktv01" }`

> **Lưu ý nghiệp vụ:** Link reset sẽ bị vô hiệu sau khi dùng một lần (dựa trên hash của mật khẩu cũ). Nếu người dùng đổi mật khẩu rồi, link cũ tự động hết hiệu lực.

---

### `POST /api/auth/reset-password`
Đặt lại mật khẩu mới bằng token từ email.

**Auth:** Public

**Request Body:** `{ "token": "eyJhbGci...", "newPassword": "matkhau_moi" }`

---

## Orders — Đơn Hàng

**Base path:** `/api/orders`

> **Phân quyền quan trọng:**  
> - **KTV** chỉ thấy các đơn được giao cho mình (`assignedKtvId = user.id`) và chưa "hoàn thành" / "hủy đơn".  
> - **Admin/DEV** thấy toàn bộ đơn hàng.

### `GET /api/orders`
Lấy danh sách đơn hàng có phân trang, bộ lọc và sắp xếp.

**Auth:** Auth

**Query Parameters:**
| Tham số | Kiểu | Mô tả |
|---|---|---|
| `page` | number | Trang hiện tại (mặc định: 1) |
| `limit` | number | Số đơn mỗi trang (mặc định: 50) |
| `sortBy` | string | Trường sắp xếp: `createdAt`, `appointmentTime`, `updatedAt` |
| `sortOrder` | string | Hướng sắp xếp: `asc` hoặc `desc` |
| `search` | string | Tìm theo tên, SĐT, mã đơn |
| `adminStatuses` | string | Lọc theo trạng thái (phân cách phẩy): `chờ xử lý,đang thực hiện` |
| `assignedKtvIds` | string | Lọc theo ID KTV (phân cách phẩy). Dùng `null` để lọc đơn chưa gán |
| `workTypes` | string | Lọc theo loại công việc (phân cách phẩy) |
| `mainStationIds` | string | Lọc theo Trạm Chính (phân cách phẩy). Dùng `null` để lọc chưa gán |
| `techStationIds` | string | Lọc theo Trạm Kỹ Thuật |
| `startDate` / `endDate` | string | Khoảng ngày lọc (ISO format) |
| `dateType` | string | Loại ngày lọc: `createdAt`, `appointmentTime`, `completedAt`, `updatedAt` |
| `customerName` / `customerPhone` | string | Lọc theo thông tin khách hàng |
| `pancakeOrderId` | number | Lọc theo mã đơn Pancake |
| `provinces` | string | Lọc theo tỉnh/thành phố |
| `serviceTypes` / `productCategories` / `productNames` | string | Lọc nâng cao theo sản phẩm |

**Response `200`:**
```json
{
  "orders": [...],
  "pagination": { "total": 200, "page": 1, "limit": 50, "totalPages": 4 },
  "stats": { "total": 200, "pending": 50, "assigned": 80, "completed": 60, "cancelled": 10 }
}
```

> **Lưu ý nghiệp vụ mã đơn:** Trên UI, ID âm (đơn thủ công) được hiển thị là `M1`, `M2`... qua helper `formatOrderId()`. ID dương (đơn từ Pancake) hiển thị là `#2871`, `#2872`...

---

### `POST /api/orders`
Tạo đơn hàng/dịch vụ thủ công. Đơn sẽ được gán `pancakeOrderId` âm tự động.

**Auth:** Admin

**Request Body:**
```json
{
  "customerName": "Nguyễn Văn A",
  "customerPhone": "0901234567",
  "address": "123 Lê Lợi, Q.1",
  "province": "Hồ Chí Minh",
  "workType": "Lắp đặt",
  "serviceType": "Ultima",
  "appointmentTime": "2026-06-10T08:00:00.000Z",
  "moneyToCollect": 500000,
  "note": "Khách yêu cầu giờ sáng",
  "items": [
    { "productName": "Máy lọc Ultima U5", "sku": "U5", "quantity": 1, "price": 5000000 }
  ]
}
```

---

### `GET /api/orders/export`
Xuất file Excel danh sách đơn hàng theo bộ lọc hiện tại.

**Auth:** Admin  
**Response:** File `.xlsx`

---

### `GET /api/orders/filters-data`
Lấy các giá trị lọc có sẵn (danh sách tỉnh thành, loại công việc, trạng thái...) để điền vào bộ lọc trên UI.

**Auth:** Auth

---

### `GET /api/orders/:id/audit`
Xem lịch sử thay đổi (audit log) của một đơn hàng cụ thể.

**Auth:** Auth  
**Response:** Mảng các sự kiện thay đổi (ai đã thay đổi gì, lúc nào).

---

### `POST /api/orders/:id/call-customer`
Ghi nhận sự kiện KTV đã gọi điện cho khách hàng (cập nhật trường `ktvCalledAt`).

**Auth:** Auth

---

### `POST /api/orders/:id/reschedule`
KTV yêu cầu đổi lịch hẹn khách hàng kèm lý do. Gửi thông báo cho Admin và ghi audit log.

**Auth:** Auth

**Request Body:**
```json
{
  "newAppointmentTime": "2026-06-12T09:00:00.000Z",
  "reason": "Khách bận, yêu cầu dời lịch"
}
```

---

### `PATCH /api/orders/:id`
Cập nhật thông tin đơn hàng (phân công KTV, đổi trạm, cập nhật trạng thái, lịch hẹn...).

**Auth:** Admin

**Request Body:** (Chỉ cần gửi các trường muốn cập nhật)
```json
{
  "adminStatus": "đang thực hiện",
  "assignedKtvId": "uuid-ktv",
  "techStationId": "uuid-tram",
  "mainStationId": "uuid-tram-chinh",
  "appointmentTime": "2026-06-10T08:00:00.000Z",
  "note": "Ghi chú từ Admin",
  "warehouseId": "123",
  "workType": "Lắp đặt",
  "serviceType": "Ultima"
}
```

---

### `POST /api/orders/sync`
Kích hoạt thủ công việc đồng bộ 50 đơn hàng gần nhất từ Pancake POS API.

**Auth:** Admin

---

## Reports — Báo Cáo Nghiệm Thu

**Base path:** `/api/reports`

### `POST /api/reports`
KTV tạo báo cáo nghiệm thu cho một đơn hàng sau khi hoàn thành công việc tại hiện trường.

**Auth:** Auth

**Request Body:**
```json
{
  "orderId": "uuid",
  "workType": "Lắp đặt",
  "serialNumber": "SN-12345",
  "products": ["Ultima U5 x1"],
  "province": "Hồ Chí Minh",
  "tdsIn": 350,
  "tdsOut": 12,
  "waterPressure": 4.5,
  "waterSource": "Nước máy",
  "issueType": null,
  "handlingMethod": null,
  "spareParts": [],
  "notes": "Khách hài lòng",
  "imageUrls": ["https://res.cloudinary.com/..."]
}
```

---

### `GET /api/reports`
Lấy danh sách báo cáo nghiệm thu. KTV chỉ thấy báo cáo của mình. Admin thấy tất cả.

**Auth:** Auth

**Query Parameters:** `page`, `limit`, `month`, `ktvId`, `province`, `workType`, `serviceType`, `isPaid`, `search`, `startDate`/`endDate`, `mainStationId`, `techStationIds`, `ktvIds`, `completedStart`/`completedEnd`...

---

### `GET /api/reports/my-stats`
Thống kê hiệu suất cá nhân của KTV đang đăng nhập theo tháng.

**Auth:** Auth

---

### `GET /api/reports/filter-options`
Lấy danh sách các giá trị lọc có sẵn cho màn hình báo cáo (tỉnh thành, loại công việc, KTV...).

**Auth:** Admin

---

### `GET /api/reports/stats`
Thống kê tổng hợp báo cáo nghiệm thu theo bộ lọc.

**Auth:** Admin

---

### `GET /api/reports/export`
Xuất file Excel danh sách báo cáo nghiệm thu theo bộ lọc.

**Auth:** Admin  
**Response:** File `.xlsx`

---

### `GET /api/reports/check-serial`
Kiểm tra một số serial đã từng được lắp đặt hoặc bảo hành chưa.

**Auth:** Auth  
**Query:** `?serial=SN-12345`

---

### `GET /api/reports/:id`
Lấy chi tiết một báo cáo nghiệm thu.

**Auth:** Auth

---

### `PUT /api/reports/:id`
Cập nhật thông tin báo cáo nghiệm thu (Admin).

**Auth:** Admin

---

### `DELETE /api/reports/:id`
Xóa một báo cáo nghiệm thu.

**Auth:** Admin

---

## Users — Quản Lý Tài Khoản

**Base path:** `/api/users`

### `GET /api/users/ktvs`
Lấy danh sách tất cả KTV đang hoạt động (để hiển thị dropdown phân công).

**Auth:** Auth

---

### `GET /api/users/export`
Xuất file Excel danh sách nhân sự.

**Auth:** Admin  
**Response:** File `.xlsx`

---

### `GET /api/users`
Lấy danh sách tất cả người dùng (KTV, Admin).

**Auth:** Admin

---

### `POST /api/users`
Tạo tài khoản người dùng mới.

**Auth:** Admin

**Request Body:**
```json
{
  "username": "ktv_moi",
  "password": "123456",
  "fullName": "Nguyễn Văn B",
  "role": "KTV",
  "techStationId": "uuid",
  "email": "b@example.com",
  "phoneNumber": "0901234567"
}
```

---

### `PUT /api/users/:id`
Cập nhật thông tin tài khoản người dùng (bao gồm reset mật khẩu, đổi trạm, bật/tắt tài khoản).

**Auth:** Admin

---

### `DELETE /api/users/:id`
Vô hiệu hóa tài khoản người dùng (không xóa hẳn để giữ lịch sử).

**Auth:** Admin

---

## Stations — Trạm Khu Vực

**Base path:** `/api/stations`

Hệ thống có 2 cấp trạm:
- **MainStation (Trạm Chính):** Cấp vùng lớn (VD: Trạm HCM, Trạm Hà Nội)
- **TechStation (Trạm Kỹ Thuật):** Trạm nhỏ hơn trực thuộc một Trạm Chính (VD: Trạm Q.1, Trạm Q.Bình Thạnh)

### `GET /api/stations`
Lấy danh sách toàn bộ Trạm Chính và các Trạm Kỹ Thuật trực thuộc.

**Auth:** Auth

---

### `POST /api/stations/main` / `POST /api/stations/tech`
Tạo Trạm Chính / Trạm Kỹ Thuật mới.

**Auth:** Admin

---

### `PATCH /api/stations/main/:id` / `PATCH /api/stations/tech/:id`
Cập nhật tên hoặc trạng thái (bật/tắt) Trạm Chính / Trạm Kỹ Thuật.

**Auth:** Admin

---

### `DELETE /api/stations/main/:id` / `DELETE /api/stations/tech/:id`
Xóa Trạm Chính / Trạm Kỹ Thuật (chỉ xóa được nếu không còn đơn hàng/KTV liên kết).

**Auth:** Admin

---

## Inventory — Kho Hàng

**Base path:** `/api/inventory`

### `GET /api/inventory/warehouses`
Lấy danh sách tất cả kho hàng từ Pancake POS API.

**Auth:** Auth

---

### `GET /api/inventory/products`
Lấy danh sách tồn kho sản phẩm, hỗ trợ bộ lọc và phân trang.

**Auth:** Auth

**Query Parameters:** `page`, `limit`, `search`, `warehouseId`, `lowStock`, `outOfStock`, `category`

---

### `POST /api/inventory/sync`
Đồng bộ dữ liệu sản phẩm và tồn kho từ Pancake POS về Database.

**Auth:** Admin

---

### `GET /api/inventory/export`
Xuất file Excel báo cáo tồn kho hiện tại.

**Auth:** Admin

---

### `GET /api/inventory/check`
Kiểm tra tồn kho của danh sách sản phẩm trong một đơn hàng cụ thể tại một kho nhất định.

**Auth:** Auth  
**Query:** `?orderId=uuid&warehouseId=123`

---

## Notifications — Thông Báo

**Base path:** `/api/notifications`

### `GET /api/notifications`
Lấy danh sách thông báo của người dùng hiện tại, kèm số thông báo chưa đọc.

**Auth:** Auth

---

### `PATCH /api/notifications/read-all`
Đánh dấu tất cả thông báo là đã đọc.

**Auth:** Auth

---

### `PATCH /api/notifications/:id/read`
Đánh dấu một thông báo cụ thể là đã đọc.

**Auth:** Auth

---

### `POST /api/notifications/register-token`
KTV đăng ký Push Token của thiết bị Android (Firebase FCM) để nhận thông báo đẩy Native.

**Auth:** Auth  
**Request Body:** `{ "token": "firebase-fcm-token" }`

---

### `GET /api/notifications/vapid-public-key`
Lấy VAPID Public Key để Frontend đăng ký nhận Web Push Notification (PWA).

**Auth:** Auth

---

### `POST /api/notifications/subscribe`
Lưu đối tượng `PushSubscription` của trình duyệt để nhận Web Push Notification.

**Auth:** Auth  
**Request Body:** Đối tượng `PushSubscription` từ Web Push API của trình duyệt.

---

## Dashboard — Thống Kê

**Base path:** `/api/dashboard`

> Tất cả endpoint Dashboard đều yêu cầu quyền **Admin**.

### `GET /api/dashboard/stats`
Thống kê tổng quan: số đơn theo trạng thái, mật độ đơn theo tỉnh/thành, phân tích theo trạm.

**Auth:** Admin  
**Query Parameters:** `startDate`, `endDate`, `province`, `mainStationId`, `techStationId`, `workType`, `assignedKtvId`

---

### `GET /api/dashboard/dispatch-analysis`
Phân tích đúng hẹn/trễ hẹn: tỉ lệ đúng giờ, danh sách đơn trễ, thống kê theo KTV/trạm/tỉnh/loại công việc/tháng.

**Auth:** Admin  
**Query Parameters:** `startDate`, `endDate`, `province`, `mainStationId`, `techStationId`, `workType`, `adminStatus`, `assignedKtvId`

---

### `GET /api/dashboard/product-quality`
Phân tích chất lượng sản phẩm: sản phẩm hay gặp sự cố, khu vực hay xảy ra lỗi, vòng đời máy từ lắp đặt đến bảo hành, xu hướng lỗi theo tháng.

**Auth:** Admin  
**Query Parameters:** `startDate`, `endDate`, `province`, `mainStationId`, `techStationId`, `product`

---

## Sample Images — Hình Ảnh Mẫu

**Base path:** `/api/sample-images`

Hình ảnh mẫu là các ảnh tham khảo do Admin tải lên, giúp KTV biết cần chụp ảnh gì khi làm báo cáo nghiệm thu (VD: ảnh mẫu cách đặt máy, ảnh mẫu số serial...).

### `GET /api/sample-images`
Lấy danh sách hình ảnh mẫu (có thể lọc theo loại công việc).

**Auth:** Auth  
**Query:** `?workType=Lắp+đặt`

---

### `POST /api/sample-images`
Tải lên hình ảnh mẫu mới.

**Auth:** Admin  
**Request:** `multipart/form-data` với trường `image` (file ảnh) và `workType`, `label`, `description`.

---

### `DELETE /api/sample-images/:id`
Xóa một hình ảnh mẫu.

**Auth:** Admin

---

## Upload — Tải Lên Hình Ảnh

**Base path:** `/api/upload`

### `POST /api/upload/report-image`
Upload ảnh nghiệm thu từ KTV lên Cloudinary.

**Auth:** Auth  
**Request:** `multipart/form-data` với trường `image` (file ảnh, tối đa 5MB).  
**Response:** `{ "url": "https://res.cloudinary.com/..." }`

---

### `POST /api/upload/feedback-image`
Upload ảnh đính kèm phản hồi/góp ý từ KTV lên Cloudinary.

**Auth:** Auth  
**Request:** `multipart/form-data` với trường `image`.

---

## Feedbacks — Phản Hồi

**Base path:** `/api/feedbacks`

### `POST /api/feedbacks`
KTV gửi phản hồi, góp ý hoặc báo lỗi kèm hình ảnh cho đội Admin/Dev.

**Auth:** Auth

**Request Body:**
```json
{
  "content": "App bị lỗi khi chụp ảnh",
  "imageUrls": ["https://res.cloudinary.com/..."]
}
```

---

### `GET /api/feedbacks`
Admin xem toàn bộ phản hồi từ KTV.

**Auth:** Admin

---

## Webhooks — Tích Hợp Pancake POS

**Base path:** `/webhooks`

> Các endpoint webhook không cần JWT, nhưng cần truyền `?secret=<PANCAKE_WEBHOOK_SECRET>` trong URL.

### `POST /webhooks/pancake`
Nhận sự kiện webhook từ Pancake POS khi đơn hàng được tạo mới hoặc cập nhật trạng thái.

**Auth:** Query parameter `secret`  
**Cấu hình trên Pancake:** `https://your-domain.com/webhooks/pancake?secret=your-secret`

> **Lưu ý nghiệp vụ:** Hệ thống ghi nhận toàn bộ webhook thô vào bảng `RawWebhookEvent` trước, sau đó xử lý và lưu vào bảng `Order`. Điều này đảm bảo không mất dữ liệu nếu quá trình xử lý bị lỗi.

---

*Tài liệu này được cập nhật lần cuối: 08/06/2026*

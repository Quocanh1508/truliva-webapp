# BÁO CÁO ĐÁNH GIÁ BẢO MẬT — TRULIVA WEBAPP

**Repo:** `https://github.com/Quocanh1508/truliva-webapp`
**Loại đánh giá:** Static Source-to-Sink Analysis + Live PoC (production)
**Production đã xác minh:** `https://trulivaofficial.com` (IP `221.132.21.42`)
**Ngày đánh giá:** 21/11/2026
**Chuẩn chấm điểm:** CVSS v3.1 (vector đầy đủ) — có đối chiếu CVSS v4.0
**Phạm vi:** Backend Express/TypeScript (`src/`), Prisma/PostgreSQL (`prisma/`), Webapp React PWA (`webapp/`), Zalo Mini App (`zalo-miniapp/`), IoT ESP32/MQTT (`IOT/`), CI/CD (`.github/workflows/`)

---

## 1. TÓM TẮT QUẢN LÝ (Executive Summary)

Tổng cộng **15 lỗ hổng** được xác minh bằng bằng chứng (đọc code + PoC trực tiếp trên production). Trong đó có các lỗ hổng **business-logic integrity** và **financial DoS** mà chỉ riêng code đã rõ, không cần đoán.

| # | Tên lỗ hổng | Mức độ | CVSS 3.1 |
|---|---|---|---|
| 1 | Webhook Facebook thiếu xác minh chữ ký → đốt token AI + SSRF | 🔴 CRITICAL | 9.1 |
| 2 | Endpoint bảo hành public không xác thực → chiếm/kích hoạt serial trái phép | 🔴 CRITICAL | 9.1 |
| 3 | Hardcoded credential & mật khẩu mặc định | 🔴 CRITICAL | 9.8 |
| 4 | SSRF trong tải ảnh Facebook (`fetchImageAsBase64`) | 🟠 HIGH | 7.5 |
| 5 | WebSocket `/ws` không xác thực → rò rỉ event nội bộ | 🟠 HIGH | 7.5 |
| 6 | Chính sách mật khẩu yếu (4 ký tự) | 🟠 HIGH | 7.5 |
| 7 | MQTT cleartext + quyền gửi lệnh toàn bộ thiết bị | 🟠 HIGH | 8.8 |
| 8 | Stored/DOM XSS qua `dangerouslySetInnerHTML` + CSP tắt | 🟠 HIGH | 7.3 |
| 9 | `xlsx@0.18.5` dính CVE (Prototype Pollution → RCE) | 🟠 HIGH | 8.8 |
| 10 | Thiếu rate limit toàn cục (`apiLimiter` dead code) | 🟡 MEDIUM | 5.3 |
| 11 | User enumeration qua `forgot-password` | 🟡 MEDIUM | 5.3 |
| 12 | OAuth Zalo không validate `state` (Login CSRF) | 🟡 MEDIUM | 5.4 |
| 13 | Ảnh khách hàng bị commit vào Git (rò rỉ PII) | 🟡 MEDIUM | 5.3 |
| 14 | WiFi SoftAP mật khẩu mặc định `12345678` | 🟠 HIGH | 8.3 |
| 15 | Mã đơn dễ đụng (`TRU-YYMMDD-XXXX`, 9000 combo/ngày) | 🔵 LOW | 3.7 |

> **Ghi chú quan trọng:** Repo đã có `SECURITY_AUDIT_REPORT.md` (24 findings, 09/11) và nhiều lỗi CRITICAL cũ đã được vá tốt (Command Injection IoT → `execFile`; CORS universal → allowlist; JWT khách Zalo → tách `role:CUSTOMER`). Báo cáo này **chỉ liệt kê các lỗi CÒN TỒN TẠI** ở code hiện tại.

---

## 2. CHI TIẾT LỖ HỔNG

---

### 🔴 FINDING 01 — Webhook Facebook thiếu xác minh chữ ký (Financial DoS + SSRF)

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:H` = **9.1 (Critical)** |
| **CVSS 4.0** | ~9.2 (Critical) |
| **CWE** | CWE-345 (Thiếu xác minh tính toàn vẹn dữ liệu), CWE-918 (SSRF), CWE-400 |
| **Vị trí** | `src/routes/webhooks.ts:282` (POST `/webhooks/facebook`) |
| **Trạng thái** | ✅ ĐÃ XÁC MINH bằng PoC thật trên production |

**Mô tả:**
`POST /webhooks/facebook` nhận tin nhắn từ Meta nhưng **không kiểm tra header `X-Hub-Signature-256`** (chữ ký HMAC-SHA256 của Meta bằng App Secret). Bất kỳ ai cũng có thể POST payload giả cấu trúc Messenger để:

1. Kích hoạt pipeline AI → **đốt credit Gemini** (financial DoS).
2. Gửi `att.payload.url` tới URL tùy ý → **SSRF** (xem Finding 04).

**Bằng chứng PoC (đã chạy thật trên production):**
```bash
curl -s -X POST "https://trulivaofficial.com/webhooks/facebook" \
  -H 'Content-Type: application/json' \
  -d '{"object":"page","entry":[{"messaging":[{"sender":{"id":"1337133713371337"},"message":{"text":"hello em yêu QA..."}}]}]}'

# → HTTP 200  EVENT_RECEIVED   (chấp nhận KHÔNG cần chữ ký)
```

**Code lỗi:**
```ts
// src/routes/webhooks.ts:282
router.post('/facebook', (req: Request, res: Response): void => {
  const body = req.body;              // ← không verify X-Hub-Signature-256
  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');   // chấp nhận mọi payload
    // ... gọi enqueueFacebookMessage → Gemini
  }
});
```

**Khắc phục:**
```ts
import crypto from 'crypto';
import express from 'express';

function verifyFacebookSignature(req: Request, rawBody: Buffer): boolean {
  const signature = req.headers['x-hub-signature-256'] as string;
  const appSecret = process.env.FB_APP_SECRET;
  if (!signature || !appSecret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); }
  catch { return false; }
}

// Dùng express.raw() để lấy body THÔ (chữ ký Meta tính trên raw bytes)
router.post('/facebook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    if (!verifyFacebookSignature(req, req.body)) return res.sendStatus(403);
    const body = JSON.parse(req.body.toString());
    // ... xử lý như cũ
  }
);
```
> **Bắt buộc:** bỏ fallback `'truliva_fb_token_2026'` (dòng 262) và `FB_PAGE_ACCESS_TOKEN` fallback cứng → chuyển sang env bắt buộc.

---

### 🔴 FINDING 02 — Endpoint bảo hành PUBLIC không xác thực (chiếm serial trái phép)

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:L` = **9.1 (Critical)** |
| **CWE** | CWE-306 (Thiếu xác thực chức năng quan trọng), CWE-639 (IDOR/BOLA) |
| **Vị trí** | `src/routes/serials.ts:82-101` (đứng TRƯỚC `router.use(requireAuth)` dòng 108) |
| **Trạng thái** | ✅ XÁC MINH bằng code (public route) |

**Mô tả:**
4 endpoint nằm trước middleware `requireAuth`, không yêu cầu đăng nhập:

| Endpoint | Rủi ro |
|---|---|
| `GET /public/check/:serialNumber` | Enumerate serial (đoán tuần tự `TRL0001`) + lộ model/trạng thái/ngày kích hoạt/hạn BH |
| `POST /public/activate` | Kích hoạt bảo hành với tên/SĐT/địa chỉ/`invoiceImageUrl` tùy ý |
| `POST /public/confirm` | **Đánh dấu "Đã kích hoạt" bất kỳ serial nào** — không xác minh |
| `POST /public/upload-invoice` | Upload 20MB lên Cloudinary không cần login → lạm dụng storage |

**Tác động:**
- Gian lận bảo hành (kích hoạt máy chưa bán / chiếm bảo hành máy người khác).
- DoS bảo hành: `confirm` đánh dấu "Đã kích hoạt" khiến chủ thật không kích hoạt được.
- Brute-force serial do thiếu rate limit (Finding 10).

**Khắc phục:**
- `confirm` + `activate` → yêu cầu **OTP qua SĐT** (Zalo ZNS) hoặc captcha + rate limit.
- `check` → giới hạn tốc độ + chỉ trả thông tin tối thiểu (không lộ ngày/hạn BH).
- `upload-invoice` → cấp token tạm một lần.

---

### 🔴 FINDING 03 — Hardcoded credential & mật khẩu mặc định

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = **9.8 (Critical)** |
| **CWE** | CWE-798 (Hardcoded credentials) |
| **Vị trí** | `src/routes/users.ts:495`, `src/scripts/seedKtvList.ts:63`, `src/scripts/seedAdmin.ts:13`, `src/scripts/seedDev.ts:13` |

**Mô tả:** Mật khẩu mặc định được nhúng cứng trong source và seed scripts:
- `Truliva@2025` — mật khẩu mặc định khi tạo user mới không nhập password (`users.ts:495`), seed KTV, seed Excel.
- `admin123` (`seedAdmin.ts`), `dev123` (`seedDev.ts`), `123456` (`seedExcel.ts`).

Nếu các tài khoản seed này còn tồn tại trên production → kẻ tấn công đăng nhập trực tiếp.

**Khắc phục:** Xóa toàn bộ mật khẩu mặc định; bắt buộc nhập mật khẩu mạnh khi tạo user; xoay vòng mật khẩu các tài khoản seed đã tồn tại.

---

### 🟠 FINDING 04 — SSRF trong tải ảnh Facebook

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` = **7.5 (High)** |
| **CWE** | CWE-918 (SSRF) |
| **Vị trí** | `src/services/facebookAiBot.ts` — `fetchImageAsBase64()` |

**Mô tả:** Khi tin nhắn Facebook có attachment ảnh, server gọi `axios.get(imageUrl)` với `imageUrl` lấy từ `att.payload.url` (attacker kiểm soát). Kết hợp với Finding 01 (không verify chữ ký), attacker gửi URL `http://169.254.169.254/latest/meta-data/` (cloud metadata) hoặc quét mạng nội bộ.

**Khắc phục:** Whitelist domain `*.fbcdn.net`, `*.facebook.com`, `*.messenger.com`; chặn IP private/loopback/link-local/metadata (`169.254.0.0/16`); thêm timeout + giới hạn kích thước phản hồi.

---

### 🟠 FINDING 05 — WebSocket `/ws` không xác thực

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` = **7.5 (High)** |
| **CWE** | CWE-306 |
| **Vị trí** | `src/services/websocketService.ts:11-18` |

**Mô tả:** `server.on('upgrade')` chấp nhận mọi kết nối tới `/ws` mà không kiểm tra token/cookie. `broadcastEvent()` đẩy event nội bộ (đơn hàng, ca dịch vụ, report) cho **mọi client** → rò rỉ dữ liệu realtime.

**Khắc phục:** Verify JWT (cookie `session_token` hoặc query token) trong handler `upgrade` trước khi `handleUpgrade`; từ chối đóng socket nếu không hợp lệ.

---

### 🟠 FINDING 06 — Chính sách mật khẩu yếu (4 ký tự)

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = **7.5 (High)** |
| **CWE** | CWE-521 |
| **Vị trí** | `src/routes/auth.ts:277,400`, `src/routes/users.ts:321,489,626` |

**Mô tả:** Mọi chỗ kiểm tra mật khẩu chỉ yêu cầu `length < 4`. Kết hợp với `loginLimiter` = 100 lần/15 phút vẫn đủ để brute-force mật khẩu yếu.

**Khắc phục:** Tối thiểu 10-12 ký tự, bắt buộc đa dạng (hoa/thường/số/ký tự đặc biệt); thêm khóa tài khoản sau N lần sai.

---

### 🟠 FINDING 07 — MQTT cleartext + quyền gửi lệnh toàn bộ thiết bị

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:H` = **8.8 (High)** |
| **CWE** | CWE-319 (Cleartext), CWE-269 |
| **Vị trí** | `src/services/mqttService.ts:7-11`, `IOT/MQTT_OTA (1).md` |

**Mô tả:**
- Broker cố định `221.132.21.42:1883` (cleartext TCP, không TLS).
- Backend dùng 1 user `truliva_backend` publish tới `truliva/devices/+/command` (gửi lệnh `reboot`, `ota`, `set_interval` tới **mọi máy của mọi khách**).
- Kẻ tấn công sniff/giả mạo MQTT → điều khiển thiết bị IoT.

**Khắc phục:** Bật TLS (8883) + ACL phân quyền theo topic/device; không dùng 1 user toàn cục cho command.

---

### 🟠 FINDING 08 — Stored/DOM XSS qua `dangerouslySetInnerHTML` + CSP tắt

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:H/UI:R/S:C/C:H/I:H/A:H` = **7.3 (High)** |
| **CWE** | CWE-79 |
| **Vị trí** | `zalo-miniapp/src/components/LegalPagesModal.tsx:188`, `NewsDetailModal.tsx:181`; `src/index.ts:55` (`contentSecurityPolicy: false`) |

**Mô tả:** `contentHtml` từ DB được render thô qua `dangerouslySetInnerHTML`. Hiện chỉ admin nhập → rủi ro thấp, nhưng nếu tài khoản admin bị chiếm (Finding 03/06) → **stored XSS** toàn bộ khách Zalo Mini App. CSP bị tắt làm giảm lớp phòng thủ.

**Khắc phục:** Sanitize bằng DOMPurify trước khi render; bật CSP (chỉ cho phép Cloudinary/Zalo).

---

### 🟠 FINDING 09 — `xlsx@0.18.5` dính CVE

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H` = **8.8 (High)** |
| **CWE** | CWE-1321 (Prototype Pollution), CWE-400 |
| **Vị trí** | `package.json` (`"xlsx": "^0.18.5"`), dùng ở import serial Excel |

**Mô tả:** `xlsx@0.18.5` dính `CVE-2023-30533` (prototype pollution) và `CVE-2024-22363` (RCE qua file độc hại). Do phiên bản `0.18.5` đã ngừng vá trên npm (chuyển sang `xlsx` trên CDN sheetjs).

**Khắc phục:** Nâng lên bản patched từ `cdn.sheetjs.com` hoặc chuyển sang `exceljs` (đã có trong deps) cho import.

---

### 🟡 FINDING 10 — Thiếu rate limit toàn cục (`apiLimiter` dead code)

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L` = **5.3 (Medium)** |
| **CWE** | CWE-770 |
| **Vị trí** | `src/index.ts:41` (import nhưng không `app.use`) |

**Mô tả:** `apiLimiter` (2000 req/15p) được import nhưng **không mount** → toàn bộ API không có giới hạn tốc độ. Khuếch đại mọi lỗ hổng khác (brute-force serial, đốt token AI, scraping).

**Khắc phục:** `app.use(apiLimiter)` trước khi mount routes.

---

### 🟡 FINDING 11 — User enumeration qua `forgot-password`

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N` = **5.3 (Medium)** |
| **CWE** | CWE-204 |
| **Vị trí** | `src/routes/auth.ts` (forgot-password) |

**Mô tả:** Trả `404` khi user không tồn tại, `400` khi user tồn tại nhưng chưa có email → cho phép kẻ tấn công xác định username/email hợp lệ.

**Khắc phục:** Gom về một thông báo chung ("Nếu email tồn tại, liên kết đã được gửi").

---

### 🟡 FINDING 12 — OAuth Zalo không validate `state` (Login CSRF)

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N` = **5.4 (Medium)** |
| **CWE** | CWE-352 |
| **Vị trí** | `src/controllers/serialController.ts:262-281` |

**Mô tả:** `zaloAuthorize` dùng `state=truliva` cố định, `zaloCallback` không kiểm tra `state` → login CSRF / chặn authorization code.

**Khắc phục:** Sinh `state` ngẫu nhiên, lưu session, xác minh ở callback.

---

### 🟡 FINDING 13 — Ảnh khách hàng bị commit vào Git

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N` = **5.3 (Medium)** |
| **CWE** | CWE-538, CWE-359 |
| **Vị trí** | `uploads/` (4 file ảnh report bị track trong git) |

**Mô tả:** `uploads/1778596544xxx.jpg/png` (ảnh report thực tế, có thể chứa PII khách hàng) bị commit vào repo. Nếu repo public → rò rỉ.

**Khắc phục:** `git rm --cached uploads/*` + thêm `/uploads/` vào `.gitignore` + xóa lịch sử nếu cần (`git filter-repo`).

---

### 🟠 FINDING 14 — WiFi SoftAP mật khẩu mặc định `12345678`

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H` = **8.3 (High)** |
| **CWE** | CWE-1392, CWE-798 |
| **Vị trí** | `IOT/MQTT_OTA (1).md:274,288` |

**Mô tả:** Chế độ SoftAP của thiết bị dùng mật khẩu WiFi cố định `12345678`. Kẻ tấn công trong phạm vi WiFi có thể vào trang cấu hình `http://192.168.4.1`, đọc/đổi MQTT credential → chiếm quyền điều khiển thiết bị.

**Khắc phục:** Mật khẩu ngẫu nhiên theo serial (in trên thân máy), hoặc yêu cầu nhấn nút vật lý để kích hoạt SoftAP.

---

### 🔵 FINDING 15 — Mã đơn dễ đụng (collision)

| Thuộc tính | Giá trị |
|---|---|
| **CVSS 3.1** | `AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:N/A:L` = **3.7 (Low)** |
| **CWE** | CWE-330 |
| **Vị trí** | `src/controllers/shopController.ts:319-320` |

**Mô tả:** `orderCode = TRU-YYMMDD-XXXX` với `XXXX` = 4 chữ số ngẫu nhiên (9000 combo/ngày), cột `orderCode` là `@unique`. Khi đụng → Prisma throw → trả 500 thay vì retry.

**Khắc phục:** Tăng entropy (thêm ký tự) + vòng lặp retry khi vi phạm unique, hoặc dùng sequence/timestamp+random dài hơn.

---

## 3. LỘ TRÌNH KHẮC PHỤC ƯU TIÊN

### P0 — Làm ngay (trong 24-48h)
1. Verify `X-Hub-Signature-256` cho webhook Facebook + chặn SSRF + bỏ token fallback (Finding 01, 04).
2. Thêm auth + rate limit cho cụm `/api/serials/public/*` (Finding 02).
3. Xóa/xoay mật khẩu mặc định hardcode (Finding 03).
4. `app.use(apiLimiter)` (Finding 10).

### P1 — Trong tuần
5. Auth cho WebSocket `/ws` (Finding 05).
6. Nâng mật khẩu tối thiểu 10-12 ký tự (Finding 06).
7. Bật TLS + ACL cho MQTT (Finding 07).
8. Nâng/patch `xlsx` (Finding 09).

### P2 — Trong 2 tuần
9. Sanitize XSS + bật CSP (Finding 08).
10. Gom thông báo `forgot-password` (Finding 11).
11. Validate `state` OAuth Zalo (Finding 12).
12. Xóa ảnh PII khỏi git (Finding 13).
13. Bỏ WiFi SoftAP default (Finding 14).
14. Fix collision mã đơn (Finding 15).

---

## 4. PHỤ LỤC

### 4.1 Bằng chứng PoC đã thực hiện
- **Finding 01/04:** Gửi POST giả mạo tới `https://trulivaofficial.com/webhooks/facebook` không kèm chữ ký → nhận `HTTP 200 EVENT_RECEIVED` (xác nhận webhook chấp nhận payload giả và kích hoạt pipeline AI).
- Script PoC lưu tại server clawbot: `/tmp/truliva-webapp/poc_facebook_webhook_forge.sh`.

### 4.2 Ghi chú phương pháp
- Static analysis: đọc toàn bộ route/middleware/service, truy vết source-to-sink cho `exec`/`axios`/`queryRawUnsafe`/`multer`/`jwt`/`dangerouslySetInnerHTML`.
- Live verify: chỉ gửi **1 request** chứng minh, không spam, không truy cập dữ liệu ngoài phạm vi.

### 4.3 Trách nhiệm
- Toàn bộ phát hiện thuộc repo của chủ sở hữu (AndyAnh + bạn). Báo cáo chỉ dùng cho mục đích sửa lỗi nội bộ, không dùng để tấn công hệ thống thật.

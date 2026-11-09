# Truliva Ecosystem — Comprehensive Static Security Audit & Architectural Vulnerability Assessment

**Audit Date:** 2026-11-09  
**Target Repository:** `c:\StudyZone\Project\Truliva`  
**Audit Scope:** Full-Stack Monorepo — Express/TypeScript Backend (`src/`), Prisma/PostgreSQL + `pgvector` Database (`prisma/`), Admin & KTV React PWA/Capacitor Android App (`webapp/`), Customer Zalo Mini App (`zalo-miniapp/`), ESP32 IoT Water Purifier Firmware & MQTT/OTA Stack (`IOT/`), Operational Scripts (`scripts/`, `src/scripts/`), and CI/CD Workflows (`.github/workflows/`).  
**Methodology:** Phase 1–6 Static Source-to-Sink Taint Analysis, Authentication/Authorization Matrix Verification, Infrastructure & Secret Hygiene Audit, Concurrency/Cryptography Inspection, and Supply Chain CVE Assessment.

---

## 1. Executive Summary & Attack Surface Overview

### 1.1 Executive Summary

An exhaustive static security audit of the Truliva repository identified **24 distinct, evidence-verified security findings** across the backend API, authentication/authorization layer, webhook integrations, Zalo Mini App e-commerce flows, IoT MQTT/ESP32 stack, operational scripts, and CI/CD pipelines:

| Severity | Count | Summary of Key Risks |
| :--- | :---: | :--- |
| **CRITICAL** | **5** | OS Command Injection in IoT registration (`CWE-78`); Production VPS `root` SSH password committed in Git (`CWE-798`); Zalo Mini App customers issued global internal `STAFF` JWTs (`CWE-269`); Universal CORS origin reflection with credentials (`CWE-942`); Unauthenticated debug/data-dump endpoints in production (`CWE-306`). |
| **HIGH** | **8** | Unauthenticated Facebook Webhook SSRF & AI credit exhaustion (`CWE-918`/`CWE-345`); BOLA/IDOR & unauthenticated order manipulation in Zalo Shop (`CWE-639`); Infinite loyalty points redemption (`CWE-840`); Hardcoded webhook/Zalo/MQTT/JWT secrets (`CWE-798`); Unauthenticated Zalo OAuth & reflected XSS (`CWE-306`/`CWE-79`); Unauthenticated warranty confirmation & file upload (`CWE-306`/`CWE-434`); Plaintext LLM API key leaked in GitHub Actions artifacts (`CWE-532`); Vulnerable `xlsx@0.18.5` dependency (`CVE-2023-30533`, `CVE-2024-22363`). |
| **MEDIUM** | **7** | Unauthenticated `/ws` WebSocket event broadcast (`CWE-306`); Cleartext MQTT (`1883/tcp`) & unsigned OTA (`CWE-319`/`CWE-347`); TOCTOU race conditions in voucher spins, stock updates, and sequential IDs (`CWE-362`); Unrestricted `multer.memoryStorage()` uploads up to 600 MB (`CWE-434`/`CWE-400`); Unused `apiLimiter` middleware (`CWE-770`); Weak 4-char password policy & user enumeration (`CWE-521`); DOM XSS via `dangerouslySetInnerHTML` & `localStorage` JWT storage (`CWE-79`/`CWE-922`). |
| **LOW** | **4** | Incomplete `.gitignore` for Firebase Admin SDK JSON & tracked uploads (`CWE-538`); Android `usesCleartextTraffic="true"` & `allowBackup="true"` (`CWE-319`); Bypassable regex-based `securityMiddleware` (`CWE-184`); Raw exception message leakage (`CWE-209`). |
| **INFO** | **1** | Unauthenticated local ESP32 HTTP dashboard & static SoftAP password (`12345678`) (`CWE-306`/`CWE-1392`). |

---

### 1.2 Architecture & Attack Surface Map

```
+---------------------------------------------------------------------------------------------------+
|                                   EXTERNAL / UNTRUSTED CLIENTS                                    |
+--------------------+----------------------+----------------------+----------------+---------------+
| Admin/KTV Web &    | Zalo Mini App        | Third-Party Webhooks | Public Web     | ESP32 IoT     |
| Android Capacitor  | Customer Storefront  | - Pancake POS        | Visitors       | Devices       |
| (webapp/)          | (zalo-miniapp/)      | - SePay/Casso/VietQR | - Warranty     | (UART/Wi-Fi/  |
|                    |                      | - Meta FB Messenger  |   Activation   |  MQTT/OTA)    |
+---------+----------+-----------+----------+-----------+----------+--------+-------+-------+-------+
          |                      |                      |                   |               |
          | HTTPS + Cookie/JWT   | HTTPS + Bearer JWT   | HTTPS POST/GET    | HTTPS         | TCP :1883
          v                      v                      v                   v               v
+---------------------------------------------------------------------------------------------------+
|                        NGINX REVERSE PROXY -> NODE.JS / EXPRESS 5 BACKEND                         |
|                                   (src/index.ts — Port 3000 / 3001)                               |
|                                                                                                   |
|  [CORS Filter] ---> callback(null, true) on ALL origins + credentials: true (CRIT-04)             |
|  [Rate Limiter] --> apiLimiter imported in src/index.ts:40 but NEVER mounted (MED-05)             |
|  [Auth Session] --> requireAuth accepts ANY valid JWT, including Zalo Customer STAFF JWT (CRIT-03)|
|  [WebSocket] -----> /ws upgrade handler has ZERO authentication (MED-01)                          |
+---------+----------------------+----------------------+-------------------+---------------+-------+
          |                      |                      |                   |               |
          v                      v                      v                   v               v
+------------------+  +--------------------+  +------------------+  +--------------+  +-------------+
| PostgreSQL +     |  | OS Shell Sink      |  | Outbound HTTP    |  | Cloudinary & |  | Mosquitto   |
| pgvector DB      |  | child_process.exec |  | - Gemini AI/OCR  |  | Local Disk   |  | Broker      |
| (Prisma ORM +    |  | mosquitto_passwd   |  | - Pancake POS    |  | (/uploads)   |  | (:1883 TCP) |
|  $queryRawUnsafe)|  | (CRIT-01)          |  | - FB Graph / FNS |  | (HIGH-06,    |  | (MED-02)    |
|                  |  |                    |  | - SSRF (HIGH-01) |  |  MED-04)     |  |             |
+------------------+  +--------------------+  +------------------+  +--------------+  +-------------+
```

#### Entry Points Inventory
1. **Authenticated Internal REST API (`/api/*`):**
   - `/api/auth`, `/api/users`, `/api/orders`, `/api/reports`, `/api/serials`, `/api/stations`, `/api/dashboard`, `/api/upload`, `/api/notifications`, `/api/promos`, `/api/feedbacks`, `/api/dev`, `/api/salaries`, `/api/sample-images`, `/api/combos`, `/api/inventory`, `/api/hotlines`, `/api/permissions`, `/api/iot`, `/api/ai-assistant`.
2. **Public / Customer-Facing REST API:**
   - `/api/zalo-miniapp/*` (Customer auth, warranty lookup/activation, voucher wheel, e-commerce catalog, checkout, payment webhook, IoT binding).
   - `/api/serials/public/*` (Public serial check, invoice upload, warranty activation, customer confirmation) and `/api/serials/zalo/*` (Zalo OA OAuth authorize & callback).
3. **Third-Party Webhooks (`/webhooks/*` & `/api/zalo-miniapp/shop/payment-webhook`):**
   - `POST /webhooks/pancake` (Pancake POS order/customer events, guarded by `verifyPancakeToken`).
   - `GET|POST /webhooks/facebook` (Meta Messenger webhook — missing `X-Hub-Signature-256` verification).
   - `POST /api/zalo-miniapp/shop/payment-webhook` (SePay/Casso bank transfer webhook).
4. **Real-Time & IoT Channels:**
   - `ws://<host>/ws` (`src/services/websocketService.ts` — unauthenticated WebSocket server).
   - `mqtt://221.132.21.42:1883` (`src/services/mqttService.ts` — subscribes to `truliva/devices/+/telemetry`, `truliva/devices/+/status`, `truliva/devices/+/command/response`; publishes to `truliva/devices/<serial>/command`).

---

## 2. Vulnerability Findings

### 2.1 CRITICAL Severity Findings

---

#### [CRIT-01] OS Command Injection in IoT Device Registration via Shell Interpolation
- **CWE Classification:** `CWE-78: Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection')`
- **Location:** `src/routes/iot.ts:275-320` (Sink at `src/routes/iot.ts:306-308`)

##### Vulnerability Mechanics & Impact
- **Source:** `POST /api/iot/devices` reads `serialNumber`, `mqttUsername`, and `mqttPassword` directly from `req.body` (`src/routes/iot.ts:280`).
- **Propagation:** `serialNumber` and `mqttPassword` are only checked for truthiness (`if (!serialNumber || !mqttPassword)` at `line 282`) with no character allowlist or format validation.
- **Sink:** At `src/routes/iot.ts:306-308`, `serialNumber` and `mqttPassword` are interpolated directly inside double quotes into a bash command passed to `child_process.exec()`:
  ```ts
  exec(`mosquitto_passwd -b /etc/mosquitto/passwd "${serialNumber}" "${mqttPassword}" && (killall -HUP mosquitto 2>/dev/null || sudo systemctl reload mosquitto 2>/dev/null || true)`, ...)
  ```
- **Impact:** Any caller with `ADMIN` or `DEV` role—or an attacker exploiting the universal CORS vulnerability (`CRIT-04`) against an authenticated admin browser session—can inject shell metacharacters (such as `$(...)`, backticks `` `...` ``, or `"; <cmd> #`) inside `serialNumber` or `mqttPassword` to execute arbitrary OS commands on the production VPS (`221.132.21.42`) under the privileges of the PM2/Node.js service account (which also has passwordless `sudo` for service reloads).

##### Vulnerable Code Snippet (`src/routes/iot.ts:280-315`)
```typescript
    const { serialNumber, mqttUsername, mqttPassword, firmwareVersion } = req.body;

    if (!serialNumber || !mqttPassword) {
      res.status(400).json({ error: 'Vui lòng cung cấp serialNumber và mqttPassword' });
      return;
    }
    // ...
    // Auto-update Mosquitto password file on VPS
    exec(`mosquitto_passwd -b /etc/mosquitto/passwd "${serialNumber}" "${mqttPassword}" && (killall -HUP mosquitto 2>/dev/null || sudo systemctl reload mosquitto 2>/dev/null || true)`, (err) => {
      if (err) {
        logger.warn('IoT: Could not update mosquitto passwd file (may not be on VPS)', { error: err.message });
      } else {
        logger.info('IoT: Updated mosquitto passwd for device', { serialNumber });
      }
    });
```

##### Remediation (Drop-in Fix)
Enforce a strict alphanumeric allowlist on `serialNumber`/`mqttUsername`, reject control characters in `mqttPassword`, and replace `exec()` shell interpolation with `execFile()` (which bypasses `/bin/sh` altogether):

```typescript
import { execFile } from 'child_process';

const SAFE_SERIAL_REGEX = /^[A-Za-z0-9_-]{3,64}$/;
const SAFE_MQTT_PASS_REGEX = /^[A-Za-z0-9!@#%^&*()_+\-=[\]{}|;:,.<>?~]{6,128}$/;

// Inside POST /api/iot/devices:
const cleanSerial = String(serialNumber || '').trim();
const cleanMqttUser = String(mqttUsername || cleanSerial).trim();
const cleanMqttPass = String(mqttPassword || '');

if (!SAFE_SERIAL_REGEX.test(cleanSerial) || !SAFE_SERIAL_REGEX.test(cleanMqttUser)) {
  res.status(400).json({ error: 'serialNumber / mqttUsername chỉ được chứa chữ cái, số, gạch ngang hoặc gạch dưới (3-64 ký tự).' });
  return;
}

if (!SAFE_MQTT_PASS_REGEX.test(cleanMqttPass)) {
  res.status(400).json({ error: 'mqttPassword không hợp lệ (6-128 ký tự, không chứa khoảng trắng hoặc ký tự điều khiển).' });
  return;
}

execFile('mosquitto_passwd', ['-b', '/etc/mosquitto/passwd', cleanMqttUser, cleanMqttPass], (err) => {
  if (err) {
    logger.warn('IoT: Could not update mosquitto passwd file', { error: err.message });
    return;
  }
  logger.info('IoT: Updated mosquitto passwd for device', { serialNumber: cleanSerial });
  execFile('systemctl', ['reload', 'mosquitto'], () => {});
});
```

---

#### [CRIT-02] Hardcoded Production VPS Root SSH Password & Public IP Committed in Git
- **CWE Classification:** `CWE-798: Use of Hard-coded Credentials` / `CWE-522: Insufficiently Protected Credentials`
- **Location:** `scripts/start_vps_studio.js:10-15` and `scripts/start_vps_studio.js:30-35`

##### Vulnerability Mechanics & Impact
- **Mechanics:** The Git-tracked script `scripts/start_vps_studio.js` (verified via `git ls-files`) contains the cleartext `root` SSH password (`c3qwbwf2BU0PkTxW8wKM`) and IP address (`221.132.21.42`) of the production VPS. Additionally, at `line 33`, it executes `npx prisma studio --port 5555 --browser none` on the VPS without `--hostname 127.0.0.1`, which binds Prisma Studio to `0.0.0.0:5555` on the remote host while active.
- **Impact:** Anyone with read access to the Git repository, CI runners, developer workstations, or leaked repo archives gains immediate `root` SSH access to the production server, full access to `truliva_db` and `truliva_sandbox`, and all production `.env` secrets.

##### Vulnerable Code Snippet (`scripts/start_vps_studio.js:10-35`)
```javascript
const sshConfig = {
  host: '221.132.21.42',
  port: 22,
  username: 'root',
  password: 'c3qwbwf2BU0PkTxW8wKM'
};
// ...
  conn.exec('fuser -k 5555/tcp 2>/dev/null || true', () => {
    // Khởi chạy Prisma Studio trên Linux VPS
    conn.exec(`cd ${remoteDir} && npx prisma studio --port 5555 --browser none`, (err, stream) => {
```

##### Remediation (Drop-in Fix)
1. **Immediate Operational Action:** Rotate the `root` password on `221.132.21.42` immediately, disable SSH password authentication (`PasswordAuthentication no` in `/etc/ssh/sshd_config`), and purge `scripts/start_vps_studio.js` history from Git (`git filter-repo`).
2. **Code Fix (`scripts/start_vps_studio.js`):** Load SSH credentials exclusively from environment variables or SSH key files, and bind Prisma Studio strictly to `127.0.0.1` if supported or firewall port `5555`:

```javascript
require('dotenv').config();
const fs = require('fs');

if (!process.env.VPS_SSH_HOST || (!process.env.VPS_SSH_KEY_PATH && !process.env.VPS_SSH_PASSWORD)) {
  console.error('❌ Missing VPS_SSH_HOST and VPS_SSH_KEY_PATH (or VPS_SSH_PASSWORD) in environment.');
  process.exit(1);
}

const sshConfig = {
  host: process.env.VPS_SSH_HOST,
  port: Number(process.env.VPS_SSH_PORT || 22),
  username: process.env.VPS_SSH_USER || 'root',
  ...(process.env.VPS_SSH_KEY_PATH
    ? { privateKey: fs.readFileSync(process.env.VPS_SSH_KEY_PATH) }
    : { password: process.env.VPS_SSH_PASSWORD }),
};
```

---

#### [CRIT-03] Broken Authentication & Privilege Boundary: Zalo Mini App Customers Issued Global `STAFF` Role JWT Accepted by Internal APIs
- **CWE Classification:** `CWE-269: Improper Privilege Management` / `CWE-285: Improper Authorization`
- **Location:**
  - Token Issuance: `src/services/zaloMiniAppService.ts:191-220`
  - Session Verification: `src/middleware/authSession.ts:29-89`
  - Exposed Internal Endpoints:
    - `src/routes/serials.ts:130, 139` (`GET /api/serials/export`, `POST /api/serials/zns-activate`)
    - `src/routes/inventory.ts:147, 499, 732` (`GET /api/inventory/export`, `GET /api/inventory/analytics`, `GET /api/inventory/analytics/export`)
    - `src/controllers/hotlineController.ts:64, 1189` (`GET /api/hotlines/search-customer`, `GET /api/hotlines/handlers`)
    - `src/routes/dashboard.ts:52, 742, 1058` (`GET /api/dashboard/stats`, `GET /api/dashboard/product-quality`, `GET /api/dashboard/revenue`)
    - `src/routes/aiAssistant.ts:98, 237, 626` (`GET /api/ai-assistant/config`, `POST /api/ai-assistant/test-chat`, `GET /api/ai-assistant/documents`)
    - `src/routes/users.ts:30` (`GET /api/users/ktvs`)

##### Vulnerability Mechanics & Impact
- **Source:** Any external user can call `POST /api/zalo-miniapp/auth` (`src/routes/zaloMiniApp.ts:24-64`). Even without a real Zalo access token (`accessToken` omitted), providing `{ zaloId, fullName, phone }` enters `authenticateZaloMiniAppUser()` (`src/services/zaloMiniAppService.ts:154-224`).
- **Privilege Assignment:** At `src/services/zaloMiniAppService.ts:194-216`, the backend creates or updates a record in the internal `users` table with `role: 'STAFF'` and `group: 'CUSTOMER'`, then signs a 30-day JWT using the global `process.env.JWT_SECRET` (with payload `{ userId: user.id, username: user.username, role: user.role }`).
- **Guard Bypass:** `requireAuth` (`src/middleware/authSession.ts:29-89`) verifies the JWT against `JWT_SECRET`, loads the `User` from `prisma.user`, and attaches `req.user` (`role: 'STAFF', group: 'CUSTOMER'`). It **never restricts `group === 'CUSTOMER'` from accessing internal `/api/*` routes**.
- **Sinks Reached by Customer JWT:**
  1. `GET /api/serials/export` (`src/routes/serials.ts:130`) is registered **without** `requireSerialAccess` (unlike `GET /api/serials/` at `line 125`), allowing any `STAFF` token to export all device serial numbers and customer warranty records as an Excel file.
  2. `POST /api/serials/zns-activate` (`src/routes/serials.ts:139`) is also missing `requireSerialAccess`, allowing a customer token to activate warranties and trigger outbound FPT FNS messages.
  3. `GET /api/inventory/export`, `/analytics`, `/analytics/export` (`src/routes/inventory.ts:147, 499, 732`) only check `if (req.user?.role === 'KTV')`, permitting `role === 'STAFF'` (`group === 'CUSTOMER'`) to export all warehouse inventory and confidential `costPrice` margins.
  4. `GET /api/hotlines/search-customer?phone=09...` (`src/controllers/hotlineController.ts:64`) bypasses `checkDynamicPermission` whenever `req.query.phone` is present (`if (!isPhoneSearch)`), allowing any customer token to query any other customer's full order, ticket, and serial history.
  5. `GET /api/dashboard/revenue`, `/stats`, `/product-quality` (`src/routes/dashboard.ts`) only require `requireAuth`, exposing company-wide financial revenue, station revenue, and KTV performance metrics.
  6. `GET /api/ai-assistant/config`, `GET /api/ai-assistant/documents`, and `POST /api/ai-assistant/test-chat` (`src/routes/aiAssistant.ts:98, 237, 626`) only require `requireAuth`, exposing internal AI prompts/RAG documents and allowing unlimited Gemini API consumption.

##### Vulnerable Code Snippet (`src/services/zaloMiniAppService.ts:191-218` & `src/middleware/authSession.ts:44-84`)
```typescript
// src/services/zaloMiniAppService.ts:191-218
    if (!user) {
      const dummyPasswordHash = await bcrypt.hash(`zalo_${zaloProfile.id}_${Date.now()}`, 10);
      user = await prisma.user.create({
        data: {
          username: cleanPhone || `zalo_${zaloProfile.id}`,
          passwordHash: dummyPasswordHash,
          fullName: zaloProfile.name || 'Khách hàng Zalo',
          phoneNumber: cleanPhone || null,
          role: 'STAFF', // Sử dụng role STAFF kết hợp group CUSTOMER để tương thích Schema hiện tại
          group: 'CUSTOMER',
          isActive: true
        }
      });
    }
    const jwtSecret = process.env.JWT_SECRET || 'truliva-super-secret-jwt-key-2025';
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      jwtSecret,
      { expiresIn: '30d' }
    );
```

##### Remediation (Drop-in Fix)
1. **Separate Customer Tokens from Internal Employee Sessions:** Sign Zalo Mini App tokens with `scope: 'ZALO_CUSTOMER'` (or a dedicated `ZALO_JWT_SECRET`) and explicitly block `group === 'CUSTOMER'` or `scope === 'ZALO_CUSTOMER'` in `requireAuth` (`src/middleware/authSession.ts`), while creating a dedicated `requireCustomerOrAuth` middleware for `/api/zalo-miniapp/*`.
2. **Add Missing Route Guards (`src/routes/serials.ts:130, 139`):**

```typescript
// src/middleware/authSession.ts — inside requireAuth after loading `user`:
if (!user || !user.isActive) {
  res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị khóa' });
  return;
}

// Block external Zalo Mini App customers from internal employee APIs
if (user.group === 'CUSTOMER' || (decoded as any).scope === 'ZALO_CUSTOMER') {
  res.status(403).json({ error: 'Tài khoản khách hàng không có quyền truy cập hệ thống nội bộ' });
  return;
}
```

```typescript
// src/routes/serials.ts:130 & 139 — enforce requireSerialAccess:
router.get('/export', requireSerialAccess, exportSerials);
router.post('/zns-activate', requireSerialAccess, manualActivateAndSendZns);
```

---

#### [CRIT-04] Universal CORS Origin Reflection with `Access-Control-Allow-Credentials: true` and Session Token Exposure
- **CWE Classification:** `CWE-942: Permissive Cross-domain Policy with Untrusted Domains` / `CWE-346: Origin Validation Error`
- **Location:** `src/index.ts:67-85` and `src/routes/auth.ts:87, 148`

##### Vulnerability Mechanics & Impact
- **Mechanics:** In `src/index.ts:67-85`, the `cors` origin callback checks `allowedOrigins`, Capacitor schemes, and `origin.endsWith('trulivaofficial.com')` (which also lacks a leading dot, matching `eviltrulivaofficial.com`). However, when an origin does **not** match (`else` branch at `line 78-80`), the code still calls `callback(null, true)` with `credentials: true` (`line 82`)!
- **Token Exfiltration Vector:** When `callback(null, true)` is invoked with `credentials: true`, `cors` reflects the attacker's arbitrary `Origin` header in `Access-Control-Allow-Origin` and sets `Access-Control-Allow-Credentials: true`. Furthermore, `GET /api/auth/me` (`src/routes/auth.ts:148`) returns `{ user, token }` in the JSON body whenever a valid `session_token` cookie or header is sent.
- **Impact:** Any third-party website visited by an authenticated Truliva Admin, Coordinator, or KTV can issue cross-origin `fetch('https://trulivaofficial.com/api/auth/me', { credentials: 'include' })` requests, steal the user's raw JWT `token` from the JSON response, and perform arbitrary authenticated API actions.

##### Vulnerable Code Snippet (`src/index.ts:67-85`)
```typescript
app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin || 
      allowedOrigins.includes(origin) || 
      origin.endsWith('trulivaofficial.com') ||
      origin.startsWith('https://h5.zdn.vn') ||
      origin.startsWith('zbrowser://') ||
      origin.startsWith('capacitor://') ||
      origin.startsWith('http://localhost')
    ) {
      callback(null, true);
    } else {
      // Cho phép fallback linh hoạt cho Zalo Mini App Webview trên các thiết bị iOS/Android khác nhau
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));
```

##### Remediation (Drop-in Fix)
Reject untrusted origins in the `else` branch, enforce exact host/subdomain matching (`.trulivaofficial.com`), and stop returning the raw `session_token` cookie value inside `GET /api/auth/me`:

```typescript
// src/index.ts:67-85
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)?trulivaofficial\.com(?::\d+)?$/i,
  /^https:\/\/([a-z0-9-]+\.)?trulivavietnam\.com$/i,
  /^https:\/\/h5\.zdn\.vn$/i,
  /^zbrowser:\/\//i,
  /^capacitor:\/\/localhost$/i,
  /^http:\/\/localhost(?::\d+)?$/i,
];

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      ALLOWED_ORIGIN_PATTERNS.some((regex) => regex.test(origin))
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}));
```

---

#### [CRIT-05] Unauthenticated Debug & Diagnostic Endpoints Exposing Customer PII, Order Payloads, and Sync Triggers in Production
- **CWE Classification:** `CWE-306: Missing Authentication for Critical Function` / `CWE-200: Exposure of Sensitive Information to an Unauthorized Actor` / `CWE-489: Active Debug Code`
- **Location:**
  - `src/routes/auth.ts:412-462` (`GET /api/auth/check-nga`)
  - `src/routes/webhooks.ts:148-155` (`GET /webhooks/sync-products`)
  - `src/routes/webhooks.ts:157-178` (`GET /webhooks/test-notes`)
  - `src/routes/webhooks.ts:180-197` (`GET /webhooks/test-status`)
  - `src/routes/webhooks.ts:199-249` (`GET /webhooks/check-nga`)
  - `src/routes/dev.ts:135-185` (`GET /api/dev/check-nga` — registered **before** `router.use(requireAuth, requireDev)` at `line 188`!)
  - `src/middleware/security.ts:38-39` (explicitly skips `securityMiddleware` for `/webhooks` and `/api/auth`)

##### Vulnerability Mechanics & Impact
- **Mechanics:** Six diagnostic/debug endpoints are mounted on the production Express app without `requireAuth`:
  1. `GET /api/auth/check-nga`, `GET /webhooks/check-nga`, and `GET /api/dev/check-nga` query `prisma.user` (for employee profiles) and `prisma.order` (for orders `#3112, #2526, #3028, #2700, #2557`) and return full `rawData` JSON containing customer names, phone numbers, shipping addresses, and internal creator metadata.
  2. `GET /webhooks/test-notes` dumps the 50 most recent `WebhookEvent` payloads (`payload` JSON) and 20 `Order` records (`rawData` JSON), leaking live customer PII and order details in real time.
  3. `GET /webhooks/test-status` dumps status statistics across all orders in the database.
  4. `GET /webhooks/sync-products` triggers `syncAllProductsFromPancake()` asynchronously with no authentication or rate limiting.
- **Impact:** Unauthenticated attackers on the internet can continuously harvest live customer PII (names, phone numbers, home addresses) from recent Pancake webhook payloads and orders, enumerate internal staff accounts, and trigger repeated background Pancake API syncs.

##### Vulnerable Code Snippet (`src/routes/webhooks.ts:148-178` & `src/routes/dev.ts:135-189`)
```typescript
// src/routes/webhooks.ts:148-178
router.get('/sync-products', async (req: Request, res: Response) => {
  res.json({ message: 'Product sync started in background' });
  syncAllProductsFromPancake().catch(err => logger.error('Manual product sync error', err));
});

router.get('/test-notes', async (req: Request, res: Response) => {
  try {
    const events = await prisma.webhookEvent.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' }
    });
    // ... returns rawData of orders and webhook events without authentication
```
```typescript
// src/routes/dev.ts:135-189
router.get('/check-nga', async (req: Request, res: Response): Promise<void> => {
  // ... unauthenticated query returning users and orders rawData ...
});

// Áp dụng middleware xác thực và kiểm tra quyền DEV cho tất cả các route bên dưới
router.use(requireAuth, requireDev);
```

##### Remediation (Drop-in Fix)
Remove the temporary `check-nga`, `test-notes`, and `test-status` endpoints from `src/routes/auth.ts` and `src/routes/webhooks.ts`, move `router.use(requireAuth, requireDev)` to the very top of `src/routes/dev.ts`, and protect `/sync-products` with `requireAuth` and `requireAdmin`:

```typescript
// src/routes/dev.ts — Place authentication guard at the very top of the router (before ALL routes):
const router = Router();
router.use(requireAuth, requireDev);
```

```typescript
// src/routes/webhooks.ts — Remove /test-notes, /test-status, /check-nga, and protect /sync-products:
import { requireAuth, requireAdmin } from '../middleware/authSession';

router.post('/sync-products', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  res.json({ message: 'Product sync started in background' });
  syncAllProductsFromPancake().catch(err => logger.error('Manual product sync error', err));
});
```

---

### 2.2 HIGH Severity Findings

---

#### [HIGH-01] Server-Side Request Forgery (SSRF) & Unauthenticated Webhook Spoofing in Facebook Messenger AI Bot
- **CWE Classification:** `CWE-918: Server-Side Request Forgery (SSRF)` / `CWE-345: Insufficient Verification of Data Authenticity`
- **Location:**
  - Entry Point: `src/routes/webhooks.ts:278-329` (`POST /webhooks/facebook`)
  - Taint Propagation: `src/services/facebookAiBot.ts:265-348` (`enqueueFacebookMessage`) -> `src/services/facebookAiBot.ts:375-475` (`processFacebookMessageWithAI`)
  - Sink: `src/services/facebookAiBot.ts:211-228` (`fetchImageAsBase64`)

##### Vulnerability Mechanics & Impact
- **Source:** `POST /webhooks/facebook` (`src/routes/webhooks.ts:278-329`) accepts incoming JSON payloads without verifying Meta's `X-Hub-Signature-256` HMAC-SHA256 signature header. Furthermore, `/webhooks` is explicitly exempted from `securityMiddleware` (`src/middleware/security.ts:38`).
- **Taint Trace:**
  1. In `src/routes/webhooks.ts:294-300`, the handler extracts `att.payload.url` from `event.message.attachments` where `att.type === 'image'` and pushes it into `imageUrls`.
  2. `enqueueFacebookMessage(senderId, messageText, imageUrls)` (`src/routes/webhooks.ts:316`) queues the URLs and invokes `processFacebookMessageWithAI(senderId, combinedText, combinedImages)` (`src/services/facebookAiBot.ts:375`).
  3. At `src/services/facebookAiBot.ts:417-427`, `processFacebookMessageWithAI` iterates over `imageUrls` and calls `fetchImageAsBase64(imgUrl)`.
  4. **Sink (`src/services/facebookAiBot.ts:213`):** `fetchImageAsBase64` executes `await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 })` with no URL scheme, hostname, or IP range validation.
  5. The fetched response bytes are base64-encoded and sent to the Gemini Vision LLM (`currentParts.push({ inline_data: { mime_type, data } })`), and the LLM response is stored in `ai_chat_messages` (`src/services/facebookAiBot.ts:528-539`).
- **Impact:**
  1. **Unauthenticated SSRF:** Any external attacker can force the production VPS backend to issue arbitrary HTTP GET requests to internal loopback services (`http://127.0.0.1:3000`, `http://127.0.0.1:3001`, `http://127.0.0.1:5555`), cloud metadata endpoints (`http://169.254.169.254`), or private LAN hosts.
  2. **Financial / Quota Exhaustion:** Attackers can flood `POST /webhooks/facebook` with forged messages and large external files, exhausting Google Gemini API quota and spamming arbitrary Facebook PSIDs via `sendFacebookReply`.

##### Vulnerable Code Snippet (`src/routes/webhooks.ts:278-303` & `src/services/facebookAiBot.ts:211-228`)
```typescript
// src/routes/webhooks.ts:278-303
router.post('/facebook', (req: Request, res: Response): void => {
  const body = req.body;
  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');
    if (Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        const messagingEvents = entry.messaging || [];
        for (const event of messagingEvents) {
          const senderId = event.sender?.id;
          if (senderId && event.message && !event.message.is_echo) {
            const messageText = event.message.text || '';
            const imageUrls: string[] = [];
            if (Array.isArray(event.message.attachments)) {
              for (const att of event.message.attachments) {
                if (att.type === 'image' && att.payload?.url) {
                  imageUrls.push(att.payload.url);
                }
              }
            }
```
```typescript
// src/services/facebookAiBot.ts:211-228
async function fetchImageAsBase64(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
```

##### Remediation (Drop-in Fix)
1. Verify Meta's `X-Hub-Signature-256` header using raw request body bytes and `FB_APP_SECRET`.
2. Restrict `fetchImageAsBase64` strictly to `https:` URLs hosted on official Facebook/Meta CDN domains (`*.fbcdn.net`, `*.fbsbx.com`) and cap `maxContentLength`:

```typescript
// src/services/facebookAiBot.ts:211-228
const ALLOWED_FB_IMAGE_HOSTS = /^([a-z0-9-]+\.)*(fbcdn\.net|fbsbx\.com)$/i;

async function fetchImageAsBase64(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== 'https:' || !ALLOWED_FB_IMAGE_HOSTS.test(parsed.hostname)) {
      logger.warn('Blocked untrusted attachment URL in Facebook bot (SSRF protection)', { imageUrl });
      return null;
    }

    const response = await axios.get(parsed.toString(), {
      responseType: 'arraybuffer',
      timeout: 10000,
      maxContentLength: 10 * 1024 * 1024, // 10MB max
      maxRedirects: 0, // Prevent open-redirect SSRF bypass
    });
    const rawContentType = response.headers['content-type'];
    const contentType = typeof rawContentType === 'string' ? rawContentType : 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return null;
    }
    const base64Data = Buffer.from(response.data).toString('base64');
    return {
      mimeType: contentType.split(';')[0].trim(),
      data: base64Data,
    };
  } catch (error: any) {
    logger.error('Failed to fetch image attachment from Facebook', { error: error.message });
    return null;
  }
}
```

---

#### [HIGH-02] Broken Object Level Authorization (BOLA/IDOR) & Unauthenticated Order Enumeration/Modification in Zalo Mini App Shop
- **CWE Classification:** `CWE-639: Authorization Bypass Through User-Controlled Key` / `CWE-306: Missing Authentication for Critical Function`
- **Location:**
  - Route Definitions: `src/routes/zaloMiniApp.ts:816-819`
  - Controllers:
    - `src/controllers/shopController.ts:465-521` (`getMyShopOrders`)
    - `src/controllers/shopController.ts:527-564` (`getShopOrderDetail`)
    - `src/controllers/shopController.ts:778-837` (`switchShopOrderToCod`)
    - `src/controllers/shopController.ts:843-946` (`confirmShopOrderPayment`)

##### Vulnerability Mechanics & Impact
- **Mechanics:**
  1. **Mass Customer Order Dump (`GET /api/zalo-miniapp/shop/my-orders`):** Mounted with `optionalAuth` (`src/routes/zaloMiniApp.ts:816`). In `getMyShopOrders` (`src/controllers/shopController.ts:471-499`), the controller accepts an unverified `req.query.phone` parameter and builds a substring query: `{ customerPhone: { contains: p } }` (`line 488`). Because all Vietnamese phone numbers contain `0`, an unauthenticated request to `GET /api/zalo-miniapp/shop/my-orders?phone=0` matches and returns the 30 most recent `ShopOrder` records across all customers (including `customerName`, `customerPhone`, `shippingAddress`, `province`, `items`, `totalAmount`, and `orderCode`).
  2. **Unauthenticated Order Lookup (`GET /api/zalo-miniapp/shop/orders/:orderCodeOrId`):** Mounted without authentication (`src/routes/zaloMiniApp.ts:817`). Returns full customer PII for any `ShopOrder` by UUID or sequential daily `orderCode` (`TRU-YYMMDD-XXXX`).
  3. **Unauthenticated Order State Tampering (`POST /api/zalo-miniapp/shop/orders/:orderCodeOrId/switch-to-cod`):** Mounted without authentication (`src/routes/zaloMiniApp.ts:818`). Any caller knowing or guessing `TRU-YYMMDD-XXXX` can convert any unpaid bank-transfer order to COD (`paymentMethod: 'COD'`, `status: 'CONFIRMED'`), triggering POS order mutations and staff push notifications.
  4. **Unauthenticated Payment Confirmation on Port 3001 / Sandbox (`POST /api/zalo-miniapp/shop/orders/:orderCodeOrId/confirm-payment`):** Mounted without authentication (`src/routes/zaloMiniApp.ts:819`). When `isSandboxEnvironment()` is true or `PORT === '3001'`, any unauthenticated caller can mark any order as `PAID` (`paymentStatus: 'PAID'`, `moneyToCollect: 0`).

##### Vulnerable Code Snippet (`src/routes/zaloMiniApp.ts:816-819` & `src/controllers/shopController.ts:470-499`)
```typescript
// src/routes/zaloMiniApp.ts:816-819
router.get('/shop/my-orders', optionalAuth, getMyShopOrders);
router.get('/shop/orders/:orderCodeOrId', getShopOrderDetail);
router.post('/shop/orders/:orderCodeOrId/switch-to-cod', switchShopOrderToCod);
router.post('/shop/orders/:orderCodeOrId/confirm-payment', confirmShopOrderPayment);
```
```typescript
// src/controllers/shopController.ts:470-499
    const userId = req.user?.id;
    const queryPhone = (req.query.phone as string || '').replace(/[^0-9]/g, '');
    const userPhone = (req.user?.phoneNumber || '').replace(/[^0-9]/g, '');

    const orConditions: any[] = [];
    if (userId) orConditions.push({ userId });

    const phonesToMatch = new Set<string>();
    if (queryPhone.length >= 9) phonesToMatch.add(queryPhone.slice(-9));
    else if (queryPhone) phonesToMatch.add(queryPhone);
    // ...
    for (const p of phonesToMatch) {
      if (p) {
        orConditions.push({ customerPhone: { contains: p } });
      }
    }
```

##### Remediation (Drop-in Fix)
Require authentication on `/shop/my-orders`, `/shop/orders/:orderCodeOrId`, and `/shop/orders/:orderCodeOrId/switch-to-cod`, bind queries strictly to the authenticated user's `userId` and verified `phoneNumber`, and reject short substring phone queries:

```typescript
// src/controllers/shopController.ts — Secure getMyShopOrders:
export async function getMyShopOrders(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Vui lòng đăng nhập để xem lịch sử đơn hàng' });
      return;
    }

    const userId = req.user.id;
    const userPhone = (req.user.phoneNumber || '').replace(/[^0-9]/g, '');

    const orConditions: any[] = [{ userId }];
    if (userPhone.length >= 9) {
      const normalizedTail = userPhone.slice(-9);
      orConditions.push({ customerPhone: { endsWith: normalizedTail } });
    }

    const orders = await prisma.shopOrder.findMany({
      where: { OR: orConditions },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    res.json({ success: true, orders });
  } catch (error: any) {
    logger.error('Error fetching my shop orders', { error: error.message });
    res.status(500).json({ error: 'Không thể tải danh sách đơn hàng' });
  }
}
```

---

#### [HIGH-03] Business Logic Flaw: Infinite Loyalty Points Redemption & Phone Number Spoofing in Shop Checkout
- **CWE Classification:** `CWE-840: Business Logic Errors` / `CWE-287: Improper Authentication`
- **Location:** `src/controllers/shopController.ts:284-296` and `src/routes/zaloMiniApp.ts:70-177, 815`

##### Vulnerability Mechanics & Impact
- **Mechanics:**
  1. `POST /api/zalo-miniapp/shop/orders` (`src/routes/zaloMiniApp.ts:815`) uses `optionalAuth`. In `createShopOrder` (`src/controllers/shopController.ts:220-296`), the customer's loyalty balance is calculated via `await calculateCustomerLoyalty(cleanPhone)` using the untrusted `req.body.customerPhone`.
  2. In `calculateCustomerLoyalty(rawPhone)` (`src/routes/zaloMiniApp.ts:70-177`), `availablePoints` is computed exclusively by summing `Math.floor(orderTotal / 100000)` across completed `Order` records (`line 116-123`).
  3. **Missing Point Deduction:** Neither `createShopOrder` (`src/controllers/shopController.ts:284-345`) nor `calculateCustomerLoyalty` ever records or subtracts redeemed `pointsToUse` from the customer's available loyalty balance (`ShopOrder` does not even persist `pointsUsed`, only `discountAmount = voucherDiscount + pointsDiscount` at `line 300`).
- **Impact:**
  1. Any customer with loyalty points can redeem their **entire point balance on every single order infinitely** without their balance ever decreasing.
  2. Any unauthenticated buyer can supply another customer's phone number in `req.body.customerPhone` (or enumerate loyalty balances via `GET /api/zalo-miniapp/loyalty?phone=...` at `src/routes/zaloMiniApp.ts:183`) to apply that customer's loyalty discount and vouchers (`prisma.customerVoucher.findFirst({ where: { code, customerPhone } })` at `line 258`) to their own order.

##### Vulnerable Code Snippet (`src/controllers/shopController.ts:284-301`)
```typescript
    // 3. Kiểm tra và tính giảm giá Điểm Tích Lũy (1 điểm = 1.000đ)
    let pointsDiscount = 0;
    const requestedPoints = Math.max(0, Math.floor(Number(pointsToUse) || 0));
    if (requestedPoints > 0) {
      const loyaltyData = await calculateCustomerLoyalty(cleanPhone);
      const availablePoints = loyaltyData.availablePoints || 0;
      const validPoints = Math.min(requestedPoints, availablePoints);
      pointsDiscount = validPoints * 1000;
      // Không vượt quá số tiền còn lại sau khi trừ voucher
      const remainingAfterVoucher = Math.max(0, subtotal - voucherDiscount);
      if (pointsDiscount > remainingAfterVoucher) {
        pointsDiscount = remainingAfterVoucher;
      }
    }

    const totalDiscount = voucherDiscount + pointsDiscount;
```

##### Remediation (Drop-in Fix)
1. Require authentication (`requireCustomerAuth`) when redeeming loyalty points or vouchers, and verify that `cleanPhone` matches `req.user.phoneNumber`.
2. Deduct previously redeemed points in `calculateCustomerLoyalty` by tracking `pointsDiscount` in `ShopOrder.rawPayload` (or a dedicated `pointsUsed` column) across non-cancelled `ShopOrder` records:

```typescript
// Inside calculateCustomerLoyalty (src/routes/zaloMiniApp.ts):
const usedShopOrders = await prisma.shopOrder.findMany({
  where: {
    customerPhone: { in: phoneVariants },
    status: { not: 'CANCELLED' },
  },
  select: { rawPayload: true },
});

const totalPointsRedeemed = usedShopOrders.reduce((sum, so) => {
  const payload = (so.rawPayload as any) || {};
  return sum + (Number(payload.pointsRedeemed) || 0);
}, 0);

const availablePoints = Math.max(0, totalPoints - totalPointsRedeemed);
```
And in `createShopOrder` (`src/controllers/shopController.ts`):
```typescript
if (requestedPoints > 0) {
  if (!req.user || !req.user.phoneNumber || formatVNPhone(req.user.phoneNumber) !== cleanPhone) {
    res.status(403).json({ error: 'Vui lòng đăng nhập đúng số điện thoại chính chủ để sử dụng điểm tích lũy' });
    return;
  }
  // ... store `pointsRedeemed: Math.floor(pointsDiscount / 1000)` inside ShopOrder.rawPayload ...
}
```

---

#### [HIGH-04] Hardcoded Webhook Secrets, Zalo Mini App Secret Keys, MQTT Credentials, and Fallback JWT Secrets
- **CWE Classification:** `CWE-798: Use of Hard-coded Credentials` / `CWE-321: Use of Hard-coded Cryptographic Key`
- **Location:**
  - `src/middleware/auth.ts:15-33` (`verifyPancakeToken`)
  - `src/controllers/shopController.ts:574` (`handlePaymentWebhook`)
  - `src/services/zaloMiniAppService.ts:36-41, 209` (`ZALO_MINIAPP_SECRET_CANDIDATES`, `jwtSecret`)
  - `src/services/mqttService.ts:6-8` (`MQTT_USERNAME`, `MQTT_PASSWORD`)
  - `src/routes/webhooks.ts:258` (`FB_VERIFY_TOKEN`)
  - `src/routes/users.ts:495` & `src/scripts/seedExcelUsers.ts:75` (`'Truliva@2025'`)

##### Vulnerability Mechanics & Impact
1. **Pancake Webhook Authentication Bypass (`src/middleware/auth.ts:15-26`):** `verifyPancakeToken` builds `validSecrets = [expectedSecret, 'pancake_webhook_prod_secret_9872', 'dev-secret-change-me-in-production']`. Even when `process.env.PANCAKE_WEBHOOK_SECRET` is set to a strong secret in production, the middleware **always accepts** `'dev-secret-change-me-in-production'` and `'pancake_webhook_prod_secret_9872'`! Additionally, `line 31` logs `querySecret` in cleartext.
2. **Payment Webhook Forgery (`src/controllers/shopController.ts:574`):** `handlePaymentWebhook` (`POST /api/zalo-miniapp/shop/payment-webhook`) falls back to `'truliva_secure_pay_2026'` if `PAYMENT_WEBHOOK_SECRET` and `SEPAY_WEBHOOK_KEY` are unset. An attacker sending `Authorization: Apikey truliva_secure_pay_2026` with `{"content": "TRU2611090001", "transferAmount": 99999999}` can mark any `ShopOrder` as `PAID` and set `moneyToCollect = 0` on the linked `Order`.
3. **Zalo Mini App Secret Keys & JWT Secret (`src/services/zaloMiniAppService.ts:36-41, 209`):** Hardcodes three Zalo Mini App secret keys (`'43687accf260a48eb6b4ef247813b0dd'`, `'5S82319D2tB5Z2X3ZqRZ'`, `'DYAiHF0BqLb9M2FtGLW4'`) and falls back to `'truliva-super-secret-jwt-key-2025'` at `line 209`.
4. **MQTT Broker Credentials (`src/services/mqttService.ts:7-8`):** Hardcodes fallback broker credentials `truliva_backend` / `TrulivaM0tt@2026`.

##### Vulnerable Code Snippet (`src/middleware/auth.ts:15-26` & `src/controllers/shopController.ts:574`)
```typescript
// src/middleware/auth.ts:15-26
  const expectedSecret = process.env.PANCAKE_WEBHOOK_SECRET;
  const validSecrets = [
    expectedSecret,
    'pancake_webhook_prod_secret_9872',
    'dev-secret-change-me-in-production'
  ].filter(Boolean) as string[];
```
```typescript
// src/controllers/shopController.ts:574
  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.SEPAY_WEBHOOK_KEY || 'truliva_secure_pay_2026';
```

##### Remediation (Drop-in Fix)
Remove all hardcoded fallback secrets and use constant-time comparison (`crypto.timingSafeEqual`):

```typescript
// src/middleware/auth.ts
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPancakeToken(req: Request, res: Response, next: NextFunction): void {
  const expectedSecret = process.env.PANCAKE_WEBHOOK_SECRET;
  if (!expectedSecret) {
    logger.error('PANCAKE_WEBHOOK_SECRET is not configured');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const candidate = [
    req.headers['x-pancake-token'],
    req.headers['authorization']?.replace(/^Bearer\s+/i, ''),
    req.query.secret,
    req.query.token,
  ].find((v): v is string => typeof v === 'string' && v.length > 0);

  if (!candidate || !safeCompare(candidate.trim(), expectedSecret.trim())) {
    logger.warn('Rejected unauthorized Pancake webhook request', { ip: req.ip });
    res.status(401).json({ error: 'Unauthorized: Invalid webhook token' });
    return;
  }
  next();
}
```

---

#### [HIGH-05] Unauthenticated Zalo OA OAuth Initiation/Callback, Missing CSRF `state` Validation, and Reflected XSS
- **CWE Classification:** `CWE-306: Missing Authentication for Critical Function` / `CWE-352: Cross-Site Request Forgery (CSRF)` / `CWE-79: Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')`
- **Location:** `src/routes/serials.ts:103-105` and `src/controllers/serialController.ts:253-332`

##### Vulnerability Mechanics & Impact
- **Missing Authentication:** In `src/routes/serials.ts:103-104`, `router.get('/zalo/authorize', authorizeZalo)` and `router.get('/zalo/callback', zaloCallback)` are registered **before** `router.use(requireAuth)` (`line 108`).
- **Missing OAuth `state` Validation:** `authorizeZalo` (`src/controllers/serialController.ts:263`) redirects to `https://oauth.zaloapp.com/v4/oa/permission?app_id=...&state=truliva` with a static `state=truliva`, and `zaloCallback` (`lines 274-332`) never validates `req.query.state`. An attacker can initiate a Zalo OAuth flow or trick a victim into visiting `/api/serials/zalo/callback?code=<attacker_code>`, overwriting the single global `ZaloConfig` row (`accessToken`, `refreshToken`) in both Production and Sandbox databases (`src/services/zaloService.ts:86-95`).
- **Reflected XSS (`src/controllers/serialController.ts:325`):** When `exchangeAuthorizationCode(code)` throws an error (including error descriptions reflected from Zalo OAuth or network errors), `zaloCallback` interpolates `error.message` directly into an `text/html` response without HTML entity escaping:
  ```ts
  <p>Không thể lấy Access Token từ Zalo OA: ${error.message}</p>
  ```

##### Vulnerable Code Snippet (`src/routes/serials.ts:103-109` & `src/controllers/serialController.ts:274-330`)
```typescript
// src/routes/serials.ts:103-109
router.get('/zalo/authorize', authorizeZalo);
router.get('/zalo/callback', zaloCallback);

// ─── TẤT CẢ CÁC ROUTE BÊN DƯỚI ĐỀU YÊU CẦU ĐĂNG NHẬP ───
router.use(requireAuth);
```
```typescript
// src/controllers/serialController.ts:320-330
  } catch (error: any) {
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc2626;">Lỗi kết nối Zalo OA</h2>
          <p>Không thể lấy Access Token từ Zalo OA: ${error.message}</p>
        </body>
      </html>
    `);
  }
```

##### Remediation (Drop-in Fix)
Protect `/zalo/authorize` and `/zalo/callback` with `requireAuth` and `requireAdmin`, bind a cryptographically random `state` nonce in an `HttpOnly` cookie, and HTML-escape all dynamic values rendered in `zaloCallback`:

```typescript
// src/routes/serials.ts — Move /zalo/authorize and /zalo/callback below router.use(requireAuth) and requireAdmin:
router.use(requireAuth);
router.get('/zalo/authorize', requireAdmin, authorizeZalo);
router.get('/zalo/callback', requireAdmin, zaloCallback);
```
```typescript
// Helper to escape HTML in src/controllers/serialController.ts:
function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Use escapeHtml(error.message) in zaloCallback HTML output.
```

---

#### [HIGH-06] Unauthenticated Public Warranty Confirmation & Unrestricted Public Invoice Upload
- **CWE Classification:** `CWE-306: Missing Authentication for Critical Function` / `CWE-434: Unrestricted Upload of File with Dangerous Type`
- **Location:** `src/routes/serials.ts:82-100` and `src/controllers/serialController.ts:29-61, 189-251`

##### Vulnerability Mechanics & Impact
1. **Unauthenticated Warranty Activation Bypass (`POST /api/serials/public/confirm`, `src/controllers/serialController.ts:189-251`):**
   - While `POST /api/serials/public/activate` sets a serial's status to `'Chờ duyệt'` (pending admin review), `POST /api/serials/public/confirm` takes only `{ serialNumber }` from an unauthenticated caller and **immediately activates** the warranty (`forceStatus = 'Đã kích hoạt'`) and sets `customerConfirmationDate: new Date()` without verifying customer identity, phone number, or a signed confirmation token!
2. **Unauthenticated, Unfiltered 20MB File Upload (`POST /api/serials/public/upload-invoice`, `src/routes/serials.ts:82-96`):**
   - Uses `multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })` without any `fileFilter`, rate limiter, or authentication, and uploads arbitrary buffers directly to the company's Cloudinary account (`truliva-invoices` folder).

##### Vulnerable Code Snippet (`src/controllers/serialController.ts:192-238`)
```typescript
export async function publicConfirmOrder(req: Request, res: Response): Promise<void> {
  try {
    const { serialNumber } = req.body;
    // ...
    if (serial.status !== 'Đã kích hoạt') {
      await activateSerialWarranty(
        cleanSerial,
        serial.orderId,
        {
          customerName: serial.customerName,
          customerPhone: serial.customerPhone,
          address: serial.address,
          province: serial.province
        },
        'CUSTOMER',
        'Đã kích hoạt'
      );
    }
```

##### Remediation (Drop-in Fix)
1. Require the customer's matching phone number (or a signed HMAC token sent via ZNS) in `publicConfirmOrder`, and only allow confirming serials that have already been linked to an order by KTV/Admin.
2. Add a strict image `fileFilter` (checking both MIME type and magic bytes) and rate limiter to `/public/upload-invoice`:

```typescript
// src/routes/serials.ts — Restrict public invoice upload to valid images (max 5MB) + rate limit:
const publicInvoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
      return cb(new Error('Chỉ chấp nhận file ảnh định dạng JPG, PNG hoặc WEBP'));
    }
    cb(null, true);
  },
});
```

---

#### [HIGH-07] Plaintext LLM API Key Leakage in GitHub Actions Artifacts & Workflow Script Injection
- **CWE Classification:** `CWE-532: Insertion of Sensitive Information into Log File` / `CWE-78: OS Command Injection`
- **Location:** `.github/workflows/strix-security-scan.yml:169-214`

##### Vulnerability Mechanics & Impact
- **Secret Leakage in Artifact (`lines 169-214`):**
  1. At `lines 169-180`, the workflow writes the active production LLM secret (`$ACTIVE_KEY` from `secrets.GEMINI_API_KEY`, `secrets.OPENAI_API_KEY`, or `secrets.ANTHROPIC_API_KEY`) in cleartext to `~/.strix/cli-config.json`.
  2. At `lines 195-200`, the workflow runs `cp -r "$HOME/.strix"/* reports/security/`.
  3. At `lines 208-214`, `actions/upload-artifact@v4` uploads `reports/security/` (which now contains `cli-config.json` with the plaintext API keys) as a downloadable build artifact (`strix-security-audit-report`).
- **Workflow Script Injection (`line 182`):**
  - `TARGET_URL="${{ github.event.inputs.target_url || 'http://localhost:3000' }}"` interpolates `github.event.inputs.target_url` directly into the `run:` bash script before execution instead of referencing an environment variable.

##### Vulnerable Code Snippet (`.github/workflows/strix-security-scan.yml:169-200`)
```yaml
          # Ghi cấu hình cố định vào ~/.strix/cli-config.json cho Strix
          cat << EOF > ~/.strix/cli-config.json
          {
            "env": {
              "STRIX_LLM": "$STRIX_LLM",
              "LLM_API_KEY": "$ACTIVE_KEY",
              "GEMINI_API_KEY": "$ACTIVE_KEY",
              "GOOGLE_API_KEY": "$ACTIVE_KEY",
              "OPENAI_API_KEY": "$ACTIVE_KEY",
              "ANTHROPIC_API_KEY": "$ACTIVE_KEY"
            }
          }
          EOF
          TARGET_URL="${{ github.event.inputs.target_url || 'http://localhost:3000' }}"
          # ...
          for dir in "$HOME/.strix" "strix_report" "strix_reports" ".strix"; do
            if [ -d "$dir" ]; then
              cp -r "$dir"/* reports/security/ 2>/dev/null || true
            fi
          done
```

##### Remediation (Drop-in Fix)
Pass `TARGET_URL` via the step's `env:` block and explicitly delete `cli-config.json` before copying report files into `reports/security/`:

```yaml
      - name: Run Strix Autonomous AI Pentest Scan
        env:
          TARGET_INPUT_URL: ${{ github.event.inputs.target_url || 'http://localhost:3000' }}
          # ...
        run: |
          # ... after running strix scan:
          rm -f "$HOME/.strix/cli-config.json" .strix/cli-config.json
          for dir in "$HOME/.strix" "strix_report" "strix_reports" ".strix"; do
            if [ -d "$dir" ]; then
              find "$dir" -maxdepth 2 -type f \( -name "*.md" -o -name "*.html" -o -name "*.json" \) ! -name "cli-config.json" -exec cp {} reports/security/ \;
            fi
          done
```

---

#### [HIGH-08] Vulnerable Third-Party Dependency `xlsx@0.18.5` (Prototype Pollution & ReDoS) Used on Uploaded Spreadsheets
- **CWE Classification:** `CWE-1321: Improperly Controlled Modification of Object Prototype Attributes ('Prototype Pollution')` / `CWE-1333: Inefficient Regular Expression Complexity`
- **Location:** `package.json:63`, `package-lock.json`, and `src/controllers/serialController.ts:3, 991-1005`

##### Vulnerability Mechanics & Impact
- **Mechanics:** The project depends on `"xlsx": "^0.18.5"` (`package.json:63`, resolved to `0.18.5` in `package-lock.json`), which is affected by:
  - **CVE-2023-30533 (`GHSA-4r6h-8v6p-xvw6`):** Prototype Pollution when parsing crafted spreadsheet files (`xlsx.read()`).
  - **CVE-2024-22363 (`GHSA-5pgg-2g8v-p4x9`):** Regular Expression Denial of Service (ReDoS).
- **Sink:** In `src/controllers/serialController.ts:996` (`importSerials`, `POST /api/serials/import`), user-uploaded files are passed directly into `xlsx.read(req.file.buffer, { type: 'buffer' })` and `xlsx.utils.sheet_to_json(worksheet)`.
- **Impact:** Uploading a crafted `.xlsx` file can pollute `Object.prototype` in the single-process Node.js server or block the event loop via ReDoS, causing denial of service or property injection across all requests.

##### Vulnerable Code Snippet (`src/controllers/serialController.ts:995-999`)
```typescript
    // Parse file Excel từ buffer
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData: any[] = xlsx.utils.sheet_to_json(worksheet);
```

##### Remediation (Drop-in Fix)
Remove `xlsx` from `package.json` and use `exceljs` (`^4.4.0`, which is already installed in `package.json:49` and used in `reportController.ts` and `salaryController.ts`) to parse uploaded `.xlsx` buffers in `src/controllers/serialController.ts`:

```typescript
import ExcelJS from 'exceljs';

// Inside importSerials (src/controllers/serialController.ts):
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(req.file.buffer);
const worksheet = workbook.worksheets[0];
if (!worksheet) {
  res.status(400).json({ error: 'File Excel không có sheet dữ liệu' });
  return;
}

const headers: string[] = [];
worksheet.getRow(1).eachCell((cell, colNumber) => {
  headers[colNumber] = String(cell.value || '').trim();
});

const rawData: Record<string, any>[] = [];
worksheet.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  const rowObj: Record<string, any> = {};
  row.eachCell((cell, colNumber) => {
    const key = headers[colNumber];
    if (key) {
      rowObj[key] = cell.value && typeof cell.value === 'object' && 'result' in cell.value
        ? cell.value.result
        : cell.value;
    }
  });
  if (Object.keys(rowObj).length > 0) rawData.push(rowObj);
});
```

---

### 2.3 MEDIUM Severity Findings

---

#### [MED-01] Unauthenticated WebSocket Server (`/ws`) Broadcasting Real-Time Internal Order Events
- **CWE Classification:** `CWE-306: Missing Authentication for Critical Function` / `CWE-1385: Missing Origin Validation in WebSockets`
- **Location:** `src/services/websocketService.ts:8-53`

##### Vulnerability Mechanics & Impact
- **Mechanics:** `initWebSocketServer` (`src/services/websocketService.ts:8-39`) attaches an HTTP `upgrade` listener on `/ws`. It accepts every upgrade request unconditionally (`wss?.handleUpgrade(request, socket, head, ...)`) without verifying `session_token` cookies, `Authorization` headers, or the `Origin` header.
- **Impact:** Any unauthenticated external client can open a WebSocket connection to `wss://trulivaofficial.com/ws` and receive all real-time `broadcastEvent()` messages (`ORDER_CREATED`, `ORDER_UPDATED`, `HOTLINE_CREATED`, `HOTLINE_UPDATED`, etc.) emitted across the system.

##### Vulnerable Code Snippet (`src/services/websocketService.ts:11-28`)
```typescript
  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host || 'localhost';
    const url = new URL(request.url || '', `http://${host}`);
    const pathname = url.pathname;

    if (pathname === '/ws') {
      wss?.handleUpgrade(request, socket, head, (ws) => {
        wss?.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });
```

##### Remediation (Drop-in Fix)
Verify the JWT from the `session_token` cookie (or `?token=` query parameter) during the HTTP `upgrade` handshake before calling `wss.handleUpgrade()`:

```typescript
import jwt from 'jsonwebtoken';
import prisma from '../config/database';

function parseCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)session_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

server.on('upgrade', async (request, socket, head) => {
  try {
    const host = request.headers.host || 'localhost';
    const url = new URL(request.url || '', `http://${host}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const token = parseCookieToken(request.headers.cookie) || url.searchParams.get('token');
    const secret = process.env.JWT_SECRET;
    if (!token || !secret) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const decoded = jwt.verify(token, secret) as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, isActive: true, group: true },
    });

    if (!user || !user.isActive || user.group === 'CUSTOMER') {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss?.handleUpgrade(request, socket, head, (ws) => {
      wss?.emit('connection', ws, request);
    });
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  }
});
```

---

#### [MED-02] Cleartext MQTT Protocol (`1883/tcp`), Auto-Registration of Unknown Device Serials, and Asymmetric-Keyless OTA Updates
- **CWE Classification:** `CWE-319: Cleartext Transmission of Sensitive Information` / `CWE-306: Missing Authentication for Critical Function` / `CWE-347: Improper Verification of Cryptographic Signature`
- **Location:** `src/services/mqttService.ts:6-8, 83-95, 472-508` and `IOT/MQTT_OTA (1).md:9-10, 158-174`

##### Vulnerability Mechanics & Impact
1. **Cleartext MQTT Over Public Internet (`IOT/MQTT_OTA (1).md:9-10`):** ESP32 devices connect to `221.132.21.42:1883` over unencrypted TCP (`MQTT TCP, không TLS`). Device credentials (`mqtt_client`/`mqtt_pass`), customer telemetry, and OTA command URLs are transmitted in plaintext across the internet.
2. **Unverified Device Auto-Registration (`src/services/mqttService.ts:83-95`):** When `handleTelemetryMessage` receives a message on `truliva/devices/<SERIAL>/telemetry`, if `<SERIAL>` does not exist in `iot_devices`, it automatically inserts a new `IotDevice` record (`prisma.iotDevice.create`) without checking whether `<SERIAL>` exists in the `serials` table or whether the Mosquitto ACL restricts a client to its own `<SERIAL>` topic.
3. **Lack of Asymmetric Firmware Signature Verification (`IOT/MQTT_OTA (1).md:158-174, 206` & `src/routes/iot.ts:413-478`):** The ESP32 OTA routine validates the downloaded `.bin` file against the `sha256` hex string passed **inside the MQTT `ota` command itself** rather than verifying an asymmetric digital signature (RSA-3072 / ECDSA-P256 via ESP-IDF Secure Boot / signed app images). Any attacker who compromises the MQTT broker or intercepts port `1883/tcp` can push a malicious firmware image URL along with its matching SHA-256 hash.
4. **Command Parameter Overwrite (`src/services/mqttService.ts:491-495`):** In `publishCommand`, `const payloadObj = { cmd: command, id: requestId, ...normalizedParams }` spreads `normalizedParams` **after** `cmd` and `id`, allowing user-supplied `params.cmd` to overwrite `command`.

##### Vulnerable Code Snippet (`src/services/mqttService.ts:83-95` & `491-495`)
```typescript
// src/services/mqttService.ts:83-95
    if (!device) {
      // Auto-register new device
      device = await prisma.iotDevice.create({
        data: {
          serialNumber: topicSerial,
          mqttUsername: topicSerial,
          firmwareVersion: firmwareVer,
          lastSeenAt: new Date(),
          isOnline: true,
        }
      });
      logger.info('MQTT: Auto-registered new IoT device', { serial: topicSerial, fw: firmwareVer });
    }
```
```typescript
// src/services/mqttService.ts:491-495
  const payloadObj: any = {
    cmd: command,
    id: requestId,
    ...normalizedParams
  };
```

##### Remediation (Drop-in Fix)
1. Enable MQTTS (TLS on port `8883`) on Mosquitto with a per-topic ACL (`pattern readwrite truliva/devices/%u/#`) so devices can only publish/subscribe to their own username's topic.
2. Disable automatic creation of `IotDevice` rows from unverified MQTT topics (`src/services/mqttService.ts:83-95`), and ensure `cmd` and `id` cannot be overwritten by `normalizedParams`:

```typescript
// src/services/mqttService.ts:83-95 — Reject unregistered devices instead of auto-creating DB records:
if (!device) {
  logger.warn('MQTT: Ignored telemetry from unregistered IoT device serial', { serial: topicSerial });
  return;
}

// src/services/mqttService.ts:491-495 — Prevent normalizedParams from overwriting cmd/id:
const payloadObj: any = {
  ...normalizedParams,
  cmd: command,
  id: requestId,
};
```

---

#### [MED-03] Race Conditions (TOCTOU) in Voucher Wheel Spins, Local Inventory Stock Adjustments, and Sequential ID Generation
- **CWE Classification:** `CWE-362: Concurrent Execution using Shared Resource with Improper Synchronization ('Race Condition')`
- **Location:**
  - `src/controllers/shopController.ts:154-207` (`spinVoucherWheel`)
  - `src/controllers/shopController.ts:616-637` (`handlePaymentWebhook`)
  - `src/services/inventoryService.ts:22-96` (`adjustLocalStock`)
  - `src/controllers/orderController.ts:951-959` (`createManualOrder`)
  - `src/controllers/hotlineController.ts:523-533, 1374-1379` (`createTicket`, `createHotlineOrder`)

##### Vulnerability Mechanics & Impact
1. **Voucher Spin Limit Bypass (`src/controllers/shopController.ts:154-207`):** `spinVoucherWheel` runs `const existingSpins = await prisma.customerVoucher.findMany({ where: { customerPhone: cleanPhone } })`, checks `if (existingSpins.length >= 2)`, and then calls `prisma.customerVoucher.create(...)` outside a serializable transaction. Concurrent requests with the same `phone` pass `existingSpins.length < 2` simultaneously and mint more than 2 vouchers.
2. **Inventory Lost Updates (`src/services/inventoryService.ts:22-96`):** `adjustLocalStock` reads `product.rawData.variations_warehouses` via `prisma.product.findFirst`, mutates the array in Node.js memory, and writes back `availableStock`, `totalStock`, and `rawData` via `prisma.product.update` without row-level locking (`FOR UPDATE`). Concurrent order creations or report approvals overwrite each other's stock counts.
3. **Sequential Manual Order ID & Ticket Code Collisions (`src/controllers/orderController.ts:951-959`, `src/controllers/hotlineController.ts:523-533`):** Computes `minOrder.pancakeOrderId - 1` or `maxNum + 1` in memory before calling `create()`, causing unique constraint failures under concurrent load.

##### Vulnerable Code Snippet (`src/controllers/shopController.ts:154-161` & `src/services/inventoryService.ts:32-89`)
```typescript
// src/controllers/shopController.ts:154-161
    const existingSpins = await prisma.customerVoucher.findMany({
      where: { customerPhone: cleanPhone },
      orderBy: { createdAt: 'asc' }
    });

    if (existingSpins.length >= 2) {
      res.status(400).json({ error: 'Số điện thoại này đã sử dụng hết 2 lượt quay may mắn!' });
      return;
    }
```

##### Remediation (Drop-in Fix)
Wrap check-then-act mutations inside interactive Prisma transactions (`prisma.$transaction`) with PostgreSQL advisory or row-level locks (`SELECT ... FOR UPDATE`), and use conditional atomic updates for payment webhooks:

```typescript
// src/controllers/shopController.ts — Atomic spin check with advisory lock inside $transaction:
const result = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cleanPhone}))`;
  const existingSpins = await tx.customerVoucher.findMany({
    where: { customerPhone: cleanPhone },
    orderBy: { createdAt: 'asc' },
  });
  if (existingSpins.length >= 2) {
    throw new Error('MAX_SPINS_REACHED');
  }
  // ... compute reward and tx.customerVoucher.create(...) ...
});
```

---

#### [MED-04] Unrestricted File Upload MIME/Magic-Byte Validation & Memory Exhaustion via `multer.memoryStorage()`
- **CWE Classification:** `CWE-434: Unrestricted Upload of File with Dangerous Type` / `CWE-400: Uncontrolled Resource Consumption`
- **Location:** `src/routes/upload.ts:21-24, 65-74, 124` and `src/routes/aiAssistant.ts:10-13`

##### Vulnerability Mechanics & Impact
- **Mechanics:**
  1. `src/routes/upload.ts:21-24` configures `multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } })` without any `fileFilter`.
  2. `POST /api/upload/multiple` (`src/routes/upload.ts:124`) accepts `upload.array('images', 20)` — allowing a single request to buffer up to **600 MB** (`20 × 30 MB`) directly in Node.js heap memory.
  3. On Cloudinary failure (`src/routes/upload.ts:65-74, 151-159`), the fallback writes the raw unvalidated buffer to `/uploads/reports/<timestamp>.jpg` (`fs.writeFileSync`), which is served statically via `app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))` (`src/index.ts:116`).
  4. Similarly, `src/routes/aiAssistant.ts:10-13` buffers up to **100 MB** per file in `multer.memoryStorage()`.

##### Vulnerable Code Snippet (`src/routes/upload.ts:21-24, 65-74, 124`)
```typescript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
});
// ...
      const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
      const uploadDir = path.join(process.cwd(), 'uploads', 'reports');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, fileName), req.file.buffer);
// ...
router.post('/multiple', requireAuth, upload.array('images', 20), async (req: Request, res: Response): Promise<void> => {
```

##### Remediation (Drop-in Fix)
Enforce a strict `fileFilter`, validate image magic bytes (`JPEG`, `PNG`, `WEBP`) before uploading or writing to disk, reduce per-file and total file count limits, and set `Content-Disposition: attachment` / `X-Content-Type-Options: nosniff` on `/uploads`:

```typescript
// src/routes/upload.ts
function isValidImageBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isWebp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  return isJpeg || isPng || isWebp;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // Max 10MB/file, 10 files max
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('Định dạng file không hợp lệ. Chỉ chấp nhận JPG, PNG, WEBP.'));
    }
    cb(null, true);
  },
});
```

---

#### [MED-05] Global API Rate Limiter Defined Never Mounted & Missing Rate Limits on Password Reset / Public Endpoints
- **CWE Classification:** `CWE-770: Allocation of Resources Without Limits or Throttling` / `CWE-307: Improper Restriction of Excessive Authentication Attempts`
- **Location:** `src/index.ts:40`, `src/middleware/rateLimiter.ts:6-27`, and `src/routes/auth.ts:288-383`

##### Vulnerability Mechanics & Impact
- **Mechanics:** `apiLimiter` is defined in `src/middleware/rateLimiter.ts:6-13` and imported at `src/index.ts:40` (`import { apiLimiter } from './middleware/rateLimiter';`), but `app.use('/api', apiLimiter)` is **never called anywhere in `src/index.ts`**.
- Furthermore, `POST /api/auth/forgot-password` (`src/routes/auth.ts:288`), `POST /api/auth/reset-password` (`src/routes/auth.ts:348`), `/api/serials/public/*`, and `/api/zalo-miniapp/shop/*` have no rate limiting applied.
- **Impact:** Attackers can trigger unlimited password reset emails (exhausting SMTP quota and spamming users), brute-force serial numbers/orders, or flood expensive database/AI endpoints.

##### Vulnerable Code Snippet (`src/index.ts:39-41`)
```typescript
import { validatePayload } from './middleware/validatePayload';
import { apiLimiter } from './middleware/rateLimiter';
import { securityMiddleware } from './middleware/security';
// Note: apiLimiter is never passed to app.use() in src/index.ts!
```

##### Remediation (Drop-in Fix)
Mount `apiLimiter` on `/api` in `src/index.ts` and apply `loginLimiter` to `/forgot-password` and `/reset-password` in `src/routes/auth.ts`:

```typescript
// src/index.ts — Mount apiLimiter for all /api routes:
app.use('/api', apiLimiter);

// src/routes/auth.ts — Apply loginLimiter to password recovery endpoints:
router.post('/forgot-password', loginLimiter, async (req: Request, res: Response): Promise<void> => { ... });
router.post('/reset-password', loginLimiter, async (req: Request, res: Response): Promise<void> => { ... });
```

---

#### [MED-06] Weak Password Policy (4-Character Minimum), Low-Entropy Reset Token Secret Suffix, and User Enumeration
- **CWE Classification:** `CWE-521: Weak Password Requirements` / `CWE-204: Observable Response Discrepancy` / `CWE-640: Weak Password Recovery Mechanism for Forgotten Password`
- **Location:** `src/routes/auth.ts:239, 297-319, 353` and `src/routes/users.ts:321`

##### Vulnerability Mechanics & Impact
1. **Weak Password Length (`src/routes/auth.ts:239, 353` & `src/routes/users.ts:321`):** Password creation, change, and reset endpoints only check `newPassword.length < 4`, allowing 4-character passwords (e.g., `1234`) for Admin, Coordinator, and KTV accounts.
2. **Account Enumeration (`src/routes/auth.ts:297-306`):** `POST /api/auth/forgot-password` returns distinct HTTP 404/400 error messages when a username/email does not exist (`'Không tìm thấy tài khoản...'`) vs. when the account has no email vs. when the reset email is sent.
3. **Partial Bcrypt Salt Used in Reset Secret (`src/routes/auth.ts:316, 369`):** `const resetSecret = JWT_SECRET + user.passwordHash.substring(0, 15)` only uses the first 15 characters of the bcrypt hash (`$2a$10$` + 8 chars of salt) rather than the full `user.passwordHash`.

##### Vulnerable Code Snippet (`src/routes/auth.ts:239, 298-317`)
```typescript
    if (newPassword.length < 4) {
      res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 4 ký tự' });
      return;
    }
// ...
    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản với thông tin đã nhập' });
      return;
    }
    const resetSecret = JWT_SECRET + user.passwordHash.substring(0, 15);
```

##### Remediation (Drop-in Fix)
Enforce a minimum password length of 8 characters, use the full `user.passwordHash` in `resetSecret` (via HMAC-SHA256), and return a generic 200 response on `/forgot-password` to prevent user enumeration:

```typescript
import crypto from 'crypto';

// 1. Enforce minimum 8 characters:
if (typeof newPassword !== 'string' || newPassword.length < 8) {
  res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
  return;
}

// 2. Derive reset secret from full passwordHash + updatedAt:
const resetSecret = crypto
  .createHmac('sha256', JWT_SECRET)
  .update(user.passwordHash)
  .digest('hex');
```

---

#### [MED-07] DOM-Based XSS via Unsanitized `dangerouslySetInnerHTML` and Session Token Duplication in `localStorage`
- **CWE Classification:** `CWE-79: Cross-site Scripting (XSS)` / `CWE-922: Insecure Storage of Sensitive Information`
- **Location:**
  - `zalo-miniapp/src/components/NewsDetailModal.tsx:181`
  - `zalo-miniapp/src/components/LegalPagesModal.tsx:170`
  - `webapp/src/context/AuthContext.tsx:58-61` & `webapp/src/api/client.ts:19`

##### Vulnerability Mechanics & Impact
1. **Unsanitized `dangerouslySetInnerHTML` (`NewsDetailModal.tsx:181` & `LegalPagesModal.tsx:170`):** Both components render HTML strings (`block.content` from Zalo OA articles and `docDetail.contentHtml` from `shop_legal_documents`) directly into the DOM without sanitization (e.g., `DOMPurify`).
2. **JWT Stored in `localStorage` (`webapp/src/context/AuthContext.tsx:60`, `webapp/src/api/client.ts:19`):** Even though the backend sets an `HttpOnly` cookie (`session_token`), `/api/auth/login` and `/api/auth/me` also return `token` in the JSON body and the frontend saves it to `localStorage.setItem('session_token', data.token)`. Any XSS payload can read `localStorage.getItem('session_token')` and exfiltrate the 7-day JWT.

##### Vulnerable Code Snippet (`zalo-miniapp/src/components/NewsDetailModal.tsx:176-184` & `webapp/src/context/AuthContext.tsx:55-62`)
```tsx
// zalo-miniapp/src/components/NewsDetailModal.tsx:176-184
if (block.type === 'text' && block.content) {
  return (
    <div 
      key={idx}
      className="text-slate-700 leading-relaxed text-xs ..."
      dangerouslySetInnerHTML={{ __html: block.content }}
    />
  );
}
```
```tsx
// webapp/src/context/AuthContext.tsx:55-62
    fetchApi('/auth/me')
      .then((data) => {
        setUser(data.user);
        localStorage.setItem('session_user', JSON.stringify(data.user));
        if (data.token) {
          localStorage.setItem('session_token', data.token);
        }
      })
```

##### Remediation (Drop-in Fix)
Sanitize all HTML strings with `dompurify` before passing to `dangerouslySetInnerHTML`, and rely on the `HttpOnly` cookie (`credentials: 'include'`) for browser sessions rather than persisting raw JWTs in `localStorage`:

```tsx
import DOMPurify from 'dompurify';

<div
  key={idx}
  className="text-slate-700 leading-relaxed text-xs"
  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.content) }}
/>
```

---

### 2.4 LOW & INFO Severity Findings

---

#### [LOW-01] Incomplete `.gitignore` Exposing Firebase Admin SDK Service Account Pattern (`*-firebase-adminsdk-*.json`) & Tracked Upload Artifacts
- **CWE Classification:** `CWE-538: Insertion of Sensitive Information into Externally-Accessible File or Directory`
- **Location:** `.gitignore:1-38` and root file `trulivatechniciansystem-firebase-adminsdk-fbsvc-f8fb54c1ed.json`

##### Vulnerability Mechanics & Impact
- `.gitignore` only ignores the exact filename `firebase-service-account.json` (`.gitignore:25`), while the workspace root contains `trulivatechniciansystem-firebase-adminsdk-fbsvc-f8fb54c1ed.json` (the default Google Cloud naming convention). A `git add .` will commit the Firebase private key into Git. Additionally, 4 image files under `uploads/` and `tsconfig.tsbuildinfo` are currently tracked in Git (`git ls-files`).

##### Vulnerable Code Snippet (`.gitignore:23-29`)
```gitignore
# Firebase Service Account (chứa private key)
firebase-service-account.json

# Logs
logs/
```

##### Remediation (Drop-in Fix)
Add wildcard rules to `.gitignore` and untrack `uploads/` and `tsconfig.tsbuildinfo`:
```gitignore
# Firebase & Google Cloud Service Accounts
firebase-service-account.json
*firebase-adminsdk*.json
google-services-private*.json

# Runtime uploads & build cache
uploads/
tsconfig.tsbuildinfo
```

---

#### [LOW-02] Android Cleartext Traffic (`usesCleartextTraffic="true"`) & Application Backup Enabled (`allowBackup="true"`)
- **CWE Classification:** `CWE-319: Cleartext Transmission of Sensitive Information` / `CWE-921: Storage of Sensitive Data in a Mechanism without Access Control`
- **Location:** `webapp/android/app/src/main/AndroidManifest.xml:5, 11` and `webapp/capacitor.config.ts:9`

##### Vulnerability Mechanics & Impact
- `AndroidManifest.xml` sets `android:allowBackup="true"` (`line 5`) and `android:usesCleartextTraffic="true"` (`line 11`), and `webapp/capacitor.config.ts:9` sets `cleartext: true`. Enabling cleartext traffic weakens transport security on untrusted Wi-Fi networks, and `allowBackup="true"` allows ADB backup extraction of WebView `localStorage` containing `session_token`.

##### Vulnerable Code Snippet (`webapp/android/app/src/main/AndroidManifest.xml:4-12`)
```xml
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">
```

##### Remediation (Drop-in Fix)
Disable cleartext traffic and ADB backups in `AndroidManifest.xml` and `capacitor.config.ts`:
```xml
    <application
        android:allowBackup="false"
        android:fullBackupContent="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="false">
```

---

#### [LOW-03] Naive Regex-Based `securityMiddleware` Bypassable & Skipping `/webhooks` and `/api/auth`
- **CWE Classification:** `CWE-184: Incomplete List of Disallowed Inputs`
- **Location:** `src/middleware/security.ts:6-64`

##### Vulnerability Mechanics & Impact
- `securityMiddleware` (`src/middleware/security.ts:6-64`) attempts to detect SQLi and XSS via simple regular expressions (`/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b.*\b(FROM|INTO|TABLE|DATABASE|WHERE)\b)/i`) while completely skipping `/webhooks` and `/api/auth` (`lines 38-39`). Regex blacklists are trivially bypassed (e.g., via comments or non-matching SQL/command syntax) while causing false positives on legitimate Vietnamese customer notes containing English words like "Update ... from ...". Security should rely on parameterized queries, strict schema validation (`zod`), and output encoding rather than regex blacklists.

##### Vulnerable Code Snippet (`src/middleware/security.ts:36-41`)
```typescript
export const securityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Bỏ qua kiểm tra cho route webhook của Pancake vì payload lớn và đã có xác thực chữ ký/token riêng
  if (req.path.startsWith('/webhooks') || req.path.startsWith('/api/auth')) {
    return next();
  }
```

##### Remediation (Drop-in Fix)
Remove the `/webhooks` and `/api/auth` blanket exemption or replace regex blacklisting with structured `zod` request schema validation per endpoint and `helmet` CSP headers.

---

#### [LOW-04] Detailed Error Message Leakage to Clients in Multiple Route Catch Blocks
- **CWE Classification:** `CWE-209: Generation of Error Message Containing Sensitive Information`
- **Location:** `src/routes/iot.ts:313, 357`, `src/routes/aiAssistant.ts:154, 650, 740, 761`, `src/controllers/orderController.ts:2696`

##### Vulnerability Mechanics & Impact
- Several route handlers return raw `error.message` strings directly to HTTP clients (e.g., `res.status(500).json({ error: error.message || 'Lỗi khi nạp tài liệu RAG' })` in `src/routes/aiAssistant.ts:650`), which can leak Prisma query details, table/column names, or internal filesystem paths when database or upstream API errors occur.

##### Vulnerable Code Snippet (`src/routes/aiAssistant.ts:648-651`)
```typescript
  } catch (error: any) {
    logger.error('Failed to upload and ingest document', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi khi nạp tài liệu RAG' });
  }
```

##### Remediation (Drop-in Fix)
Log full error details server-side via `logger.error()` and return a generic user-safe error message to the client:
```typescript
  } catch (error: any) {
    logger.error('Failed to upload and ingest document', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Lỗi hệ thống khi nạp tài liệu RAG. Vui lòng thử lại sau.' });
  }
```

---

#### [INFO-01] Unauthenticated Local HTTP Server & Default SoftAP Password (`12345678`) in ESP32 Firmware
- **CWE Classification:** `CWE-306: Missing Authentication for Critical Function` / `CWE-1392: Use of Default Credentials`
- **Location:** `IOT/TDS-May-loc-nuoc/firmware/main/web_dashboard.c:133-160` and `IOT/MQTT_OTA (1).md:274, 288`

##### Vulnerability Mechanics & Impact
- In `web_dashboard.c:133-160`, the ESP32 starts an unauthenticated HTTP server exposing `/api/latest`, `/api/history`, and `/*` on the local Wi-Fi network. Additionally, `IOT/MQTT_OTA (1).md:274, 288` specifies a fixed provisioning SoftAP password (`12345678`) for all `Truliva_xxxxxx` access points.

##### Vulnerable Code Snippet (`IOT/TDS-May-loc-nuoc/firmware/main/web_dashboard.c:145-156`)
```c
    const httpd_uri_t latest_uri = {
        .uri = "/api/latest", .method = HTTP_GET, .handler = latest_handler,
    };
    const httpd_uri_t history_uri = {
        .uri = "/api/history", .method = HTTP_GET, .handler = history_handler,
    };
    const httpd_uri_t dashboard_uri = {
        .uri = "/*", .method = HTTP_GET, .handler = dashboard_handler,
    };
```

##### Remediation (Drop-in Fix)
Derive a unique per-device SoftAP password from the device's MAC/serial (printed on the device QR label) and require HTTP Basic Auth (using the configured device password) on the local ESP32 web server.

---

## 3. Prioritized Remediation Roadmap

### Phase 1: Immediate Hotfixes (0 – 48 Hours) — Stop Active Exposure
1. **Rotate Compromised Credentials & Remove Hardcoded Secrets (`CRIT-02`, `HIGH-04`, `HIGH-07`, `LOW-01`):**
   - Immediately rotate the `root` SSH password on VPS `221.132.21.42` and disable SSH password login in favor of SSH keys.
   - Remove the hardcoded SSH password from `scripts/start_vps_studio.js:10-15`.
   - Remove hardcoded fallback secrets (`'pancake_webhook_prod_secret_9872'`, `'dev-secret-change-me-in-production'`, `'truliva_secure_pay_2026'`, `'truliva-super-secret-jwt-key-2025'`, `'TrulivaM0tt@2026'`) from `src/middleware/auth.ts`, `src/controllers/shopController.ts`, `src/services/zaloMiniAppService.ts`, and `src/services/mqttService.ts`.
   - Update `.github/workflows/strix-security-scan.yml` so `~/.strix/cli-config.json` is deleted before uploading artifacts, and rotate `GEMINI_API_KEY`.
   - Add `*firebase-adminsdk*.json` and `uploads/` to `.gitignore`.
2. **Eliminate OS Command Injection (`CRIT-01`):**
   - Replace `child_process.exec()` with `child_process.execFile()` and strict regex validation in `src/routes/iot.ts:275-320`.
3. **Remove Unauthenticated Debug Endpoints (`CRIT-05`):**
   - Delete `/check-nga`, `/test-notes`, and `/test-status` from `src/routes/auth.ts`, `src/routes/webhooks.ts`, and `src/routes/dev.ts`. Move `router.use(requireAuth, requireDev)` to the top of `src/routes/dev.ts` and protect `/webhooks/sync-products` with `requireAuth, requireAdmin`.
4. **Fix Universal CORS Reflection (`CRIT-04`):**
   - Change `callback(null, true)` in the `else` branch of `src/index.ts:79` to `callback(new Error('Not allowed by CORS'), false)` and fix `.trulivaofficial.com` subdomain matching.
5. **Isolate Zalo Mini App Customer JWTs from Internal Staff Routes (`CRIT-03`):**
   - Block `req.user.group === 'CUSTOMER'` in `requireAuth` (`src/middleware/authSession.ts`) and add `requireSerialAccess` to `GET /api/serials/export` and `POST /api/serials/zns-activate` (`src/routes/serials.ts:130, 139`).

### Phase 2: Short-Term Application Hardening (Week 1 – 2)
1. **Lock Down Zalo Mini App Shop BOLA/IDOR & Loyalty Logic (`HIGH-02`, `HIGH-03`):**
   - Require customer authentication on `/shop/my-orders`, `/shop/orders/:orderCodeOrId`, and `/switch-to-cod`; remove substring phone matching; and deduct redeemed loyalty points in `calculateCustomerLoyalty`.
2. **Verify Webhook Signatures & Prevent SSRF (`HIGH-01`, `HIGH-05`, `HIGH-06`):**
   - Verify Meta's `X-Hub-Signature-256` on `POST /webhooks/facebook` and restrict `fetchImageAsBase64` (`src/services/facebookAiBot.ts:211`) to `https://*.fbcdn.net` and `https://*.fbsbx.com`.
   - Require `requireAuth, requireAdmin` on `/api/serials/zalo/authorize` and `/api/serials/zalo/callback`, validate OAuth `state`, and HTML-escape error outputs.
   - Require phone verification/token on `POST /api/serials/public/confirm`.
3. **Replace Vulnerable `xlsx` Package & Harden File Uploads (`HIGH-08`, `MED-04`):**
   - Uninstall `xlsx` (`0.18.5`) and migrate `src/controllers/serialController.ts:996` to `exceljs`.
   - Add MIME + magic-byte validation and tighter size/count limits to `src/routes/upload.ts`, `src/routes/serials.ts`, and `src/routes/aiAssistant.ts`.
4. **Enable Rate Limiting & Strengthen Password Recovery (`MED-05`, `MED-06`):**
   - Mount `app.use('/api', apiLimiter)` in `src/index.ts` and apply `loginLimiter` to `/forgot-password` and `/reset-password`.
   - Increase minimum password length from 4 to 8+ characters and eliminate user enumeration in `/forgot-password`.

### Phase 3: Long-Term Architectural Hardening (Month 1+)
1. **Database Concurrency & Atomic Transactions (`MED-03`):**
   - Wrap voucher wheel spins, inventory stock mutations (`adjustLocalStock`), and manual order/ticket numbering in `prisma.$transaction` with PostgreSQL advisory/row locks or native database sequences.
2. **Secure Real-Time & IoT Infrastructure (`MED-01`, `MED-02`, `INFO-01`):**
   - Enforce JWT authentication on `/ws` WebSocket upgrades (`src/services/websocketService.ts`).
   - Migrate Mosquitto from `1883/tcp` to MQTTS (`8883/tls`), enforce per-device topic ACLs, disable unknown-serial auto-registration in `mqttService.ts`, and adopt ESP-IDF Secure Boot / asymmetric signature verification for OTA firmware images.
3. **Frontend XSS Defense-in-Depth & Mobile Hardening (`MED-07`, `LOW-02`):**
   - Sanitize all HTML rendered via `dangerouslySetInnerHTML` with `DOMPurify`, migrate web session handling exclusively to `HttpOnly` cookies (removing `localStorage` token storage), and set `android:usesCleartextTraffic="false"` and `android:allowBackup="false"` in `AndroidManifest.xml`.

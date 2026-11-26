# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Truliva — ghi chú cho Claude

Backend Express + Prisma (PostgreSQL), webapp React (`webapp/`), Zalo Mini App (`zalo-miniapp/`).
Quy tắc deploy/kiểm thử bắt buộc: xem `DEPLOY_AND_TESTING_RULES.md` (không báo "xong" khi chưa verify trên VPS).

## Lệnh thường dùng
- `npm run dev`: chạy backend (nodemon + ts-node `src/index.ts`, port 3000) và webapp (Vite, proxy `/api`, `/webhooks`, ws sang `localhost:3000`).
- Typecheck backend: `npx tsc --noEmit`. Webapp: `cd webapp && npx tsc --noEmit -p tsconfig.app.json`; lint: `cd webapp && npm run lint`.
- **Không có test tự động** (`npm test` chỉ báo lỗi). Kiểm chứng bằng các script `scripts/verify_*.js` chạy với API thật (xem bên dưới).
- Cập nhật thư viện: webapp phải dùng `npm install|audit fix --legacy-peer-deps` (`react-simple-maps` khai báo peer React ≤18 nhưng dự án chạy React 19). `npm audit fix` ở backend sẽ nâng Prisma CLI lên trước `@prisma/client`: phải giữ `prisma`, `@prisma/client`, `@prisma/adapter-pg` cùng phiên bản (21/11/2026 cố ý giữ 7.8.0; các CVE còn lại của Prisma chỉ nằm trong công cụ CLI). Deploy lockfile lên VPS: `npm install` (không dùng `npm ci`), sau đó `npx prisma generate`.
- `npm run prisma:migrate` (`prisma migrate dev`) **không dùng được**: dự án đồng bộ schema bằng `db push`, không có thư mục migrations.
- `npm run studio` / `studio:sandbox`: Prisma Studio trỏ tới DB trên VPS.
- Phân quyền: `npm run perm:gen` (sinh lại file quyền cho frontend), `perm:check` (exit 1 nếu lệch), `audit:permissions`.

## Kiến trúc backend
- `src/index.ts` gắn các router `src/routes/*` vào `/api/<tên>` (và `/webhooks`), rồi khởi động các tiến trình nền: `orderSyncScheduler` (quét đơn Pancake định kỳ), `pancakeRetryScheduler` (đẩy lại đơn lỗi sang Pancake, có cầu chì `pancakeCircuitBreaker` + email cảnh báo), `productSyncScheduler`, `reportCleanupScheduler`, WebSocket (`websocketService`), MQTT, `syncPermissionCatalog`.
- Luồng đơn từ Pancake POS: `POST /webhooks/pancake?secret=…` (`verifyPancakeToken` trong `middleware/auth.ts`) → chống trùng theo `externalEventId` (= `event_id` nếu có, không thì SHA-1 của cả body; **không** dùng `body.id` vì đó là mã đơn/khách, trước 20/11/2026 nó làm mọi lần cập nhật sau lần đầu bị bỏ qua), lưu `webhookRawEvent` → `eventRouter.routeEvent` (chạy ngầm, phân loại theo nội dung payload chứ không theo `event_type`) → `orderProcessor` / `customerProcessor`. `processOrderEvent` khoá theo từng đơn và bỏ qua payload có `updated_at` cũ hơn `pancakeUpdatedAt` đã lưu. Verify (ghi dữ liệu, chỉ sandbox): `node scripts/verify_webhook_dedupe.js`. Đổi trạng thái/kho trên Truliva được đồng bộ ngược sang Pancake (`syncOrderStatusToPancake`, `pancakeWarehouseSync`).
- Secret webhook Pancake chỉ lấy từ `PANCAKE_WEBHOOK_SECRET` (không có mặc định trong code). Đổi secret: đặt tạm `PANCAKE_WEBHOOK_SECRET="<mới>,<cũ>"`, cập nhật URL webhook trong Pancake, thấy Pancake gọi bằng secret mới (grep `/webhooks/pancake` trong `/var/log/nginx/access.log`, nginx vẫn ghi cả URL) thì xoá secret cũ. Ngày 20/11/2026 đã đổi sang secret mới; Pancake gọi bằng secret mới từ 14:59 cùng ngày. Secret cũ (từng nằm trong git) đã xoá khỏi `.env` lúc 15:14 (backup: `backups/env_before_remove_old_secret_20261120`).
- Production chạy `NODE_ENV=production` từ 20/11/2026 (trước đó là `development`, nên các chốt dưới đây đều tắt): cookie `Secure`, `blockInProduction`, chặn origin localhost, kiểm tra Host (`security.ts` `ALLOWED_DOMAINS`) và chặn User-Agent bot. Sandbox vẫn giữ `NODE_ENV=staging`. Verify: `node scripts/verify_prod_hardening.js` (chỉ đọc).
- Backend chỉ nghe `127.0.0.1` (biến `HOST`, mặc định loopback; trên VPS `ufw` đang tắt). Trước 21/11/2026 cổng 3000/3001 mở thẳng ra internet, nên có thể vượt qua `limit_req` của nginx và giả `X-Forwarded-For` (`trust proxy 1`) để né rate limit Express. Đừng mở lại. Login trả chung thông báo "Sai tên đăng nhập hoặc mật khẩu" và luôn chạy bcrypt (`DUMMY_PASSWORD_HASH`) để không dò được username. Mỗi username bị khoá tạm 15 phút sau 10 lần sai (`loginAccountLimiter`). Từ 22/11/2026, mọi lần đăng nhập/đổi/reset mật khẩu đều ghi `ip` + `userAgent` (`clientInfo` trong `auth.ts`), lần sai ghi `Login failed` kèm `reason`. Tra: `grep -a '"Login failed"\|User logged in' /root/.pm2/logs/truliva-backend-out.log` (log cũ dùng `zgrep`). Log trước ngày này không có IP, chỉ đối chiếu được qua nginx (giữ 14 ngày). Mật khẩu mới tối thiểu 8 ký tự (5 chỗ ở `auth.ts`/`users.ts` và 3 trang webapp). Verify: `node scripts/verify_login_hardening.js`. Rate limit theo IP (`middleware/rateLimiter.ts`, gắn trong `index.ts`): login/Mini App auth 100/15 phút, `forgot-password` 5/giờ, nhóm public ghi (upload hoá đơn Cloudinary, kích hoạt serial gửi ZNS, ticket hỗ trợ) 30/giờ, nhóm public đọc (tra serial, `promos/validate`…) 30/phút. Mỗi nhóm dùng chung 1 bộ đếm, lưu trong RAM (PM2 đang chạy fork 1 instance). Verify: `node scripts/verify_rate_limits.js` (không tạo dữ liệu, nhưng dùng hết quota của 127.0.0.1).
- Từ 23/11/2026: WebSocket `/ws` chạy `requireAuth` ngay trong `upgrade` (đọc cookie `session_token` hoặc Bearer), event hotline chỉ gửi `{id}`. `POST /api/serials/public/confirm` cùng trang `/warranty-confirm` đã bị **xoá** (không ai dùng, ai cũng đánh dấu được serial bất kỳ là "Đã kích hoạt"). `forgot-password` luôn trả 200 kèm một câu chung, gửi mail chạy nền. Zalo OAuth `/api/serials/zalo/authorize|callback` yêu cầu ADMIN/DEV; `state` là JWT 10 phút gắn với user. Verify: `node scripts/verify_ws_and_public_auth.js` (chỉ đọc, dùng 1 quota forgot-password).
- Khách tự kích hoạt bảo hành (`POST /api/serials/public/activate`, trang `/warranty-activate`) vẫn kích hoạt và gửi ZNS ngay (user chọn giữ, không chờ CSKH duyệt). Từ 23/11/2026 có thêm 3 chốt: `invoiceImageUrl` phải là ảnh `truliva_invoices` trên Cloudinary của mình, upload trong 24h (đọc từ public_id `Date.now()-…`), tồn tại thật (HEAD) và chưa serial nào dùng; SĐT 10 số; mỗi SĐT tối đa 3 lần/24h (đếm `activatedBy='CUSTOMER'` theo `activationDate`). Verify (ghi dữ liệu, chỉ sandbox): `node scripts/verify_public_activation.js`. Serial test không được có `-`, vì `activateSerialWarranty` bỏ dấu `-` khi tra.
- Sandbox nhận diện bằng `isSandboxEnvironment()` (`src/utils/sandboxGuard.ts`: `DATABASE_URL` chứa "sandbox", `NODE_ENV=staging|sandbox` hoặc `IS_SANDBOX=true`). Các thao tác ra ngoài (đẩy Pancake…) bị chặn ở sandbox qua guard này.
- Xác thực nằm ở `src/middleware/authSession.ts` (`requireAuth`/`authenticate`, `authorize(role…)`, `requirePermission(featureKey)`, `requireCustomerAuth` cho Mini App, `blockInProduction` cho route debug). `middleware/auth.ts` chỉ dùng cho webhook Pancake.
- Phân quyền: nguồn duy nhất là `src/config/permissions.ts` (`SYSTEM_FEATURES`, file này không được import thư viện nào). `webapp/src/config/permissions.ts` là file **sinh tự động**, không sửa tay. Thêm tính năng mới thì thêm object vào `SYSTEM_FEATURES`. Khi backend khởi động, `permissionSync` tự INSERT quyền mặc định cho key mới. Role phải khớp enum `UserRole` trong `schema.prisma`.
- **Lịch sử dịch vụ cũ (import ẩn):** bảng `legacy_service_histories` (model `LegacyServiceHistory`), ~162k ca hoàn thành 12/2016–10/2026 từ hệ thống cũ. **Không phải đơn hàng**, không nằm trong `orders` nên không hiện ở Quản lý dịch vụ, Dashboard hay lương KTV. Chỉ đọc qua `GET /api/hotlines/search-customer` → key `legacyServiceHistory` (mục 3 ở Quản lý Hotline). Luôn yêu cầu quyền `HOTLINE_SEARCH_CUSTOMER`, kể cả với nhánh tra theo SĐT vốn được miễn quyền; bỏ qua với `?phone=`. Nạp bằng `scripts/import_legacy_service_history.js` (dry-run, sau đó `--apply`); file dữ liệu `backup_data/legacy_service_history.jsonl.gz` không đưa lên git. Verify: `node scripts/verify_legacy_history_api.js` (chỉ đọc).
- **Lương / hoa hồng theo tháng** (`computeFullSalariesForMonth`, `computeCommissionsForMonth`; màn hình lẫn Excel đều đi qua 2 hàm này): từ 11/2026 (`isStrictMonth` trong `salaryService.ts`) mỗi ca chỉ thuộc tháng ở cột `month`, mỗi đơn hoa hồng chỉ thuộc tháng của báo cáo APPROVED mới nhất (không có thì tháng hẹn/tạo đơn, giờ VN). Tháng trước 11/2026 cố ý giữ logic cũ (có ca/đơn bị tính 2 tháng) để khớp số đã chi; không sửa dữ liệu cũ. Verify: `node scripts/verify_salary_month_isolation.js --save|--compare <file>` (chỉ đọc).
- Webapp gọi API qua `fetchApi` trong `webapp/src/api/client.ts` (Bearer token lấy từ `localStorage.session_token`). Webapp cũng được đóng gói Android bằng Capacitor (`webapp/android`).

## Deploy lên VPS

### Những điều phải nhớ
- **VPS KHÔNG đồng bộ git.** Code trên VPS được deploy từng file qua SFTP và lệch nhiều so với git, có thể cũ hơn hoặc mới hơn tùy file. CI `deploy.yml` (git pull) đã bị tắt vì lý do này.
  → **Trước khi upload, luôn tải bản trên VPS về và diff với `git show HEAD:<file>`.** Nếu bản VPS khác HEAD ở những phần mình không sửa, thì **vá thay đổi của mình lên bản VPS** rồi upload bản vá, đừng đè cả file từ local (tránh vô tình deploy tính năng khác chưa sẵn sàng).
- Có 2 môi trường trên cùng VPS. **Luôn deploy sandbox trước**, verify xong mới làm production:

  | | Thư mục | PM2 process | Port | DB |
  |---|---|---|---|---|
  | production | `/var/www/truliva` | `truliva-backend` | 3000 | `truliva_db` |
  | sandbox | `/var/www/truliva-sandbox` | `truliva-sandbox` | 3001 | `truliva_sandbox` |
- **Bẫy DB:** `src/config/database.ts` khi chưa có `DATABASE_URL` sẽ tự nạp `/var/www/truliva/.env`, tức là **DB production**, kể cả khi đang chạy trong thư mục sandbox. Mọi script chạy trên VPS phải gọi `require('dotenv').config({ path: path.resolve(__dirname, '../.env') })` **trước** khi import `database.ts`, và nên in ra tên DB đang dùng.
- Không dùng các script trong `scratch/`: chúng hardcode mật khẩu SSH cũ (đã đổi ngày 12/11/2026). Ngày 20/11/2026 đã xoá các file trong đó chứa mật khẩu DB/SSH đang dùng; **không viết mật khẩu vào script**, lấy từ `.env`. Thông tin SSH lấy từ `.env` local (`VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY_PATH`|`VPS_PASSWORD`).

### Công cụ
- `node scripts/vps_deploy.js pull <production|sandbox> <outDir> <file...>`: tải bản đang chạy trên VPS về để diff (đặt `outDir` trong scratchpad).
- `node scripts/vps_deploy.js push <production|sandbox> <file...>`: tự backup bản cũ vào `<dir>/backups/deploy_<timestamp>/` rồi upload. Dạng `<localPath>=<remoteRel>` dùng để upload file đã vá.
- `node scripts/vps_deploy.js exec <production|sandbox> -- "<lệnh>"`: chạy lệnh trong thư mục dự án trên VPS, trả về đúng exit code.
- `node scripts/vps_db_tunnel.js <production|sandbox> -- <lệnh local>`: chạy lệnh local với `DATABASE_URL` đi qua SSH tunnel.

### Quy trình backend (mỗi môi trường, sandbox trước)
1. `pull` các file sẽ sửa → diff với HEAD → quyết định upload nguyên file hay upload bản vá.
2. `push` các file.
3. Nếu có đổi `prisma/schema.prisma` (dự án dùng `db push`, **không có migrations**):
   - Kiểm tra DB có lệch schema không, chạy **trước khi upload schema**. Kết quả phải là "empty migration":
     `exec … -- "npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script"`
   - Upload xong, chạy lại lệnh trên để xem SQL sẽ áp dụng. Chỉ được có ADD/CREATE. Có DROP thì dừng lại hỏi user.
   - Production: backup các bảng bị ảnh hưởng trước, ví dụ `pg_dump "$URL" -t <bảng> --data-only --column-inserts -f backups/<tên>.sql` (lấy URL từ `.env` trên VPS, bỏ phần `?…`).
   - `npx prisma db push && npx prisma generate`
4. `npx tsc` trên VPS (cấm upload `.js` đã build từ local).
5. Script chuyển dữ liệu (nếu có): chạy dry-run → đọc báo cáo → `--apply`, **trước** khi restart.
6. `pm2 restart <process> --update-env`, chờ khoảng 30–40 giây rồi kiểm tra `status=online`, PID không đổi và uptime tăng (không crash-loop), xem log mới.
7. Verify bằng HTTP thật tới `http://127.0.0.1:<port>/api/...` trên VPS và kiểm tra **key trong JSON** khớp với những gì frontend dùng. Để có token admin: ký JWT ngắn hạn `{id, role, group}` bằng `JWT_SECRET` trong `.env` VPS (mẫu: `scripts/verify_iot_api.js`). Test có ghi dữ liệu chỉ làm trên sandbox hoặc máy test.

### Frontend (webapp)
Upload `webapp/src/...` → `exec … -- "cd webapp && npm run build"` → kiểm tra exit code 0 và `webapp/dist/` mới (theo `DEPLOY_AND_TESTING_RULES.md`).

### Lặt vặt
- Cột `TIMESTAMP(3)` lưu giờ UTC không kèm múi giờ, còn session Postgres trên VPS chạy giờ +7. Query thô kiểu `recorded_at > NOW() - interval …` sẽ lệch 7 tiếng, nên truyền mốc thời gian từ JS vào.
- Error log PM2 có lỗi cũ (`logger_1.default.error is not a function`, `@napi-rs/canvas`). Khi đánh giá một lần deploy, chỉ xét log sau thời điểm restart.

## Chatbot AI / RAG
- `POST /webhooks/facebook` bắt buộc có chữ ký `X-Hub-Signature-256` (HMAC raw body bằng `FB_APP_SECRET`; `index.ts` giữ `rawBody` cho route này). Thiếu secret thì từ chối tất cả. `FB_VERIFY_TOKEN` không còn giá trị mặc định. Ảnh đính kèm chỉ tải từ `*.fbcdn.net`/`*.fbsbx.com`. Lý do: 21/11/2026 có người POST `senderId` bịa và kích hoạt được Gemini. Verify: `node scripts/verify_facebook_webhook_signature.js` (không ghi dữ liệu).
- Luồng: Messenger → `POST /webhooks/facebook` → `src/services/facebookAiBot.ts` (gom tin 5s, Gemini) ; playground/admin: `src/routes/aiAssistant.ts` ; RAG: `src/services/ragService.ts`.
- Bảng RAG nằm ở **schema Postgres `rag`** (`rag.document_sources`, `rag.document_chunks`: vector(768) + tsvector + HNSW/GIN + trigger `rag.update_chunk_tsv`), **ngoài Prisma** để `db push` không xoá. Ngày 12/11/2026 bảng cũ ở `public` đã bị `db push` xoá, sandbox khôi phục ngay, còn production thì đến 20/11 mới khôi phục (trong khoảng đó RAG production chạy rỗng mà không báo lỗi). Nguồn: backup daily `truliva_db_daily_2026-11-12.sql.gz`, embedding chép từ sandbox; file làm việc ở `/var/www/truliva/backups/rag_restore_20261120/`. Backup: `/var/backups/truliva_db/hourly/` (giữ ~3 ngày) và `daily/` (~30 ngày). Không đưa lại các bảng này vào `public`/`schema.prisma`.
- `searchHybridRAG` nuốt lỗi và trả `[]` → RAG hỏng thì bot vẫn trả lời, không báo lỗi. Kiểm tra bằng `node scripts/verify_rag_api.js` (chỉ đọc) hoặc cột `retrieved_chunks` trong `ai_chat_messages`.
- `GEMINI_API_KEY` đang là **Free Tier**: embed giới hạn 100 request/phút (mỗi đoạn trong batch tính 1). Nạp tài liệu lớn sẽ mất embedding; bù bằng `node scripts/rag_reembed.js [--apply]`.

## IoT (ESP32/MQTT)
- Luồng: ESP32 → Mosquitto → `src/services/mqttService.ts` → bảng `iot_devices` / `iot_telemetry` / `iot_alerts` → `src/routes/iot.ts` → `webapp/src/pages/admin/IotMonitor.tsx`; Mini App đọc qua `/my-serials` trong `src/routes/zaloMiniApp.ts`.
- Cờ quản lý nằm ở **cột riêng** (`isMuted`, `isArchived`, `latestPayload`). Không đưa chúng vào lại `configJson`. `configJson` chỉ chứa trạng thái lệnh/OTA và chỉ được gộp nguyên tử (`mergeDeviceConfig`).
- Chỉ báo lõi phải **theo đúng màn hình máy**. Máy 3 lõi (vạch; bảng giải mã bo QY-KRL5018-P trong `IOT/TDS-May-loc-nuoc/`): 0–2 nháy đỏ (Cần thay) | 3–24 1 vạch | 25–49 2 | 50–74 3 | 75–100 4; cờ `*_replace` và số vạch `*_bars` máy gửi được ưu tiên. Máy 2 lõi UR61096H (đèn) chưa khảo sát (lần gắn thử báo lỗi UART) nên giữ ngưỡng cũ <10 đỏ / ≤25 sắp thay. Ngưỡng có 3 bản phải sửa cùng nhau: `mqttService.ts` (cảnh báo), `webapp/.../IotMonitor.tsx` (`getFilterState`), `zalo-miniapp/.../IotDeviceCard.tsx` (`getFilterHealth`).
- Cảnh báo: mỗi (máy, loại) có tối đa 1 bản ghi đang mở, mở lại sau cooldown 15 phút (`raiseAlert`). Message MQTT được xử lý tuần tự theo serial (`enqueueForDevice`).
- Dòng máy 2/3 lõi: chỉ dùng `resolveIotModel()` trong `src/config/waterPurifiers.ts`. Thứ tự ưu tiên: bảng Serial → số serial → payload → mặc định. Hàm này dùng chung cho cảnh báo (mqttService) và API (`modelConfig`, frontend đọc từ đây). Không tự đoán dòng máy theo chuỗi serial ở chỗ khác, vì có máy UR61096H mà serial không chứa "61096".
- Phân quyền: route GET dùng `requirePermission('IOT_MONITOR_VIEW')`, route ghi/lệnh dùng `requirePermission('IOT_DEVICE_CONTROL')`. Frontend ẩn nút thao tác theo `hasPermission('IOT_DEVICE_CONTROL')`. Sửa mô tả quyền trong `src/config/permissions.ts` thì phải chạy `node scripts/gen_frontend_permissions.js`.
- Lệnh xuống máy: chỉ nhận `set_interval` (số nguyên 1–3600), `ping`, `reboot`, `ota` (`url`/`version`/`sha256`). Kiểm tra ở `validateCommand` (routes/iot.ts), field lạ bị bỏ. `publishCommand` chờ PUBACK và ghi `configJson.lastCommand`; phản hồi của máy cập nhật `status` theo `id`.
- Verify: `node scripts/verify_iot_api.js` (chỉ đọc, chạy được trên production). Trên sandbox thêm `--write <serial test> --ping <serial online>`. Mini App: `node scripts/verify_miniapp_iot.js` (chỉ đọc).
- Backend vào broker bằng user `truliva_backend` (ACL: đọc mọi telemetry, ghi lệnh tới mọi máy). Mật khẩu chỉ lấy từ `MQTT_PASSWORD` trong `.env` (không có mặc định; thiếu thì backend không kết nối MQTT). Prod và sandbox dùng chung user nên `.env` hai bên phải cùng giá trị. Ngày 20/11/2026 đã đổi mật khẩu (mật khẩu cũ từng nằm trong git); backup `/etc/mosquitto/passwd.bak_20261120_mqtt`. Đổi lại: `mosquitto_passwd -b /etc/mosquitto/passwd truliva_backend <mới>` → sửa 2 `.env` → `systemctl reload mosquitto` → restart 2 backend. Cổng 1883 mở ra internet và chưa có TLS.
- ⚠️ **Sandbox và production dùng CHUNG broker MQTT và CHUNG thiết bị thật.** Một lệnh gửi từ sandbox vẫn tới máy của khách. Mọi lệnh có tác động (reboot, set_interval, OTA) lên máy thật phải được user đồng ý trước.
- ⚠️ ESP32 được lắp **nối tiếp trên đường DATA giữa bo chính và màn hình** máy lọc (xem `IOT/TDS-May-loc-nuoc/README.md`). Khi chip reboot, màn hình máy lọc mất dữ liệu trong lúc chip khởi động. Đã có trường hợp chip chạy lại ngay nhưng ~19 phút sau mới gửi dữ liệu trở lại.
- Xác minh lệnh có tác động thật: `verifyLastCommand` đối chiếu với telemetry sau lệnh. Với reboot: `now - uptime` phải nằm sau lúc gửi lệnh, và `reset_reason` (firmware 1.2.0 có gửi) là `software`. Phản hồi `ok` chỉ cho biết firmware đã *nhận* lệnh.
- `TRU-UR5840-088`, `TRU-TEST-001`, `TRU-TEST-ESP32` là máy test/giả lập (seed bằng script scratch, đã xoá 20/11/2026 vì chứa mật khẩu DB). `TRU-TEST-001` là máy UR5676, payload của chúng có SSID/MAC giả là bình thường.
- Mini App (`zalo-miniapp/`) phát hành bằng `npm run deploy` (`zmp-cli deploy`, cần đăng nhập Zalo), không chạy trên VPS. Thư mục này không có `tsconfig.json`; build thử bằng `npx vite build --outDir <tmp>`.
- Log PM2 được xoay vòng bằng `pm2-logrotate` (từ 21/11/2026): file vượt 50MB hoặc tới 0h là xoay, nén `.gz`, giữ 30 file mỗi log (`/root/.pm2/logs/<tên>__<ngày>.log.gz`, đọc bằng `zgrep`). Log trước 21/11/2026 16:41 nằm ở `/var/log/pm2-archive/*_until_20261121_1641.log.gz`. Đổi cấu hình: `pm2 set pm2-logrotate:<key> <giá trị>`.
- Typecheck webapp: `npx tsc --noEmit -p tsconfig.app.json` (trong `webapp/`). `tsconfig.json` gốc chỉ có `references` nên `-p .` không kiểm tra file nào.
- Spec giao thức cho đối tác: `docs/IOT_PARTNER_INTEGRATION_GUIDE.md`.

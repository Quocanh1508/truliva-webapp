# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Truliva — ghi chú cho Claude

Backend Express + Prisma (PostgreSQL), webapp React (`webapp/`), Zalo Mini App (`zalo-miniapp/`).
Quy tắc deploy/kiểm thử bắt buộc: xem `DEPLOY_AND_TESTING_RULES.md` (không báo "xong" khi chưa verify trên VPS).

## Lệnh thường dùng
- `npm run dev`: chạy backend (nodemon + ts-node `src/index.ts`, port 3000) và webapp (Vite, proxy `/api`, `/webhooks`, ws sang `localhost:3000`).
- Typecheck backend: `npx tsc --noEmit`. Webapp: `cd webapp && npx tsc --noEmit -p tsconfig.app.json`; lint: `cd webapp && npm run lint`.
- **Không có test tự động** (`npm test` chỉ báo lỗi). Kiểm chứng bằng các script `scripts/verify_*.js` chạy với API thật (xem bên dưới).
- `npm run prisma:migrate` (`prisma migrate dev`) **không dùng được**: dự án đồng bộ schema bằng `db push`, không có thư mục migrations.
- `npm run studio` / `studio:sandbox`: Prisma Studio trỏ tới DB trên VPS.
- Phân quyền: `npm run perm:gen` (sinh lại file quyền cho frontend), `perm:check` (exit 1 nếu lệch), `audit:permissions`.

## Kiến trúc backend
- `src/index.ts` gắn các router `src/routes/*` vào `/api/<tên>` (và `/webhooks`), rồi khởi động các tiến trình nền: `orderSyncScheduler` (quét đơn Pancake định kỳ), `pancakeRetryScheduler` (đẩy lại đơn lỗi sang Pancake, có cầu chì `pancakeCircuitBreaker` + email cảnh báo), `productSyncScheduler`, `reportCleanupScheduler`, WebSocket (`websocketService`), MQTT, `syncPermissionCatalog`.
- Luồng đơn từ Pancake POS: `POST /webhooks/pancake?secret=…` (`verifyPancakeToken` trong `middleware/auth.ts`) → chống trùng theo `externalEventId`, lưu `webhookRawEvent` → `eventRouter.routeEvent` (chạy ngầm, phân loại theo nội dung payload chứ không theo `event_type`) → `orderProcessor` / `customerProcessor`. Đổi trạng thái/kho trên Truliva được đồng bộ ngược sang Pancake (`syncOrderStatusToPancake`, `pancakeWarehouseSync`).
- Sandbox nhận diện bằng `isSandboxEnvironment()` (`src/utils/sandboxGuard.ts`: `DATABASE_URL` chứa "sandbox", `NODE_ENV=staging|sandbox` hoặc `IS_SANDBOX=true`). Các thao tác ra ngoài (đẩy Pancake…) bị chặn ở sandbox qua guard này.
- Xác thực nằm ở `src/middleware/authSession.ts` (`requireAuth`/`authenticate`, `authorize(role…)`, `requirePermission(featureKey)`, `requireCustomerAuth` cho Mini App, `blockInProduction` cho route debug). `middleware/auth.ts` chỉ dùng cho webhook Pancake.
- Phân quyền: nguồn duy nhất là `src/config/permissions.ts` (`SYSTEM_FEATURES`, file này không được import thư viện nào). `webapp/src/config/permissions.ts` là file **sinh tự động**, không sửa tay. Thêm tính năng mới thì thêm object vào `SYSTEM_FEATURES`. Khi backend khởi động, `permissionSync` tự INSERT quyền mặc định cho key mới. Role phải khớp enum `UserRole` trong `schema.prisma`.
- **Lịch sử dịch vụ cũ (import ẩn):** bảng `legacy_service_histories` (model `LegacyServiceHistory`), ~162k ca hoàn thành 12/2016–10/2026 từ hệ thống cũ. **Không phải đơn hàng**, không nằm trong `orders` nên không hiện ở Quản lý dịch vụ, Dashboard hay lương KTV. Chỉ đọc qua `GET /api/hotlines/search-customer` → key `legacyServiceHistory` (mục 3 ở Quản lý Hotline). Luôn yêu cầu quyền `HOTLINE_SEARCH_CUSTOMER`, kể cả với nhánh tra theo SĐT vốn được miễn quyền; bỏ qua với `?phone=`. Nạp bằng `scripts/import_legacy_service_history.js` (dry-run, sau đó `--apply`); file dữ liệu `backup_data/legacy_service_history.jsonl.gz` không đưa lên git. Verify: `node scripts/verify_legacy_history_api.js` (chỉ đọc).
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
- Không dùng các script trong `scratch/`: chúng hardcode mật khẩu SSH cũ (đã đổi ngày 12/11/2026). Thông tin SSH lấy từ `.env` local (`VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY_PATH`|`VPS_PASSWORD`).

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
- Luồng: Messenger → `POST /webhooks/facebook` → `src/services/facebookAiBot.ts` (gom tin 5s, Gemini) ; playground/admin: `src/routes/aiAssistant.ts` ; RAG: `src/services/ragService.ts`.
- Bảng RAG nằm ở **schema Postgres `rag`** (`rag.document_sources`, `rag.document_chunks`: vector(768) + tsvector + HNSW/GIN + trigger `rag.update_chunk_tsv`), **ngoài Prisma** để `db push` không xoá. Ngày 12/11/2026 bảng cũ ở `public` đã bị `db push` xoá, sandbox khôi phục ngay, còn production thì đến 20/11 mới khôi phục (trong khoảng đó RAG production chạy rỗng mà không báo lỗi). Nguồn: backup daily `truliva_db_daily_2026-11-12.sql.gz`, embedding chép từ sandbox; file làm việc ở `/var/www/truliva/backups/rag_restore_20261120/`. Backup: `/var/backups/truliva_db/hourly/` (giữ ~3 ngày) và `daily/` (~30 ngày). Không đưa lại các bảng này vào `public`/`schema.prisma`.
- `searchHybridRAG` nuốt lỗi và trả `[]` → RAG hỏng thì bot vẫn trả lời, không báo lỗi. Kiểm tra bằng `node scripts/verify_rag_api.js` (chỉ đọc) hoặc cột `retrieved_chunks` trong `ai_chat_messages`.
- `GEMINI_API_KEY` đang là **Free Tier**: embed giới hạn 100 request/phút (mỗi đoạn trong batch tính 1). Nạp tài liệu lớn sẽ mất embedding; bù bằng `node scripts/rag_reembed.js [--apply]`.

## IoT (ESP32/MQTT)
- Luồng: ESP32 → Mosquitto → `src/services/mqttService.ts` → bảng `iot_devices` / `iot_telemetry` / `iot_alerts` → `src/routes/iot.ts` → `webapp/src/pages/admin/IotMonitor.tsx`; Mini App đọc qua `/my-serials` trong `src/routes/zaloMiniApp.ts`.
- Cờ quản lý nằm ở **cột riêng** (`isMuted`, `isArchived`, `latestPayload`). Không đưa chúng vào lại `configJson`. `configJson` chỉ chứa trạng thái lệnh/OTA và chỉ được gộp nguyên tử (`mergeDeviceConfig`).
- Cảnh báo: mỗi (máy, loại) có tối đa 1 bản ghi đang mở, mở lại sau cooldown 15 phút (`raiseAlert`). Message MQTT được xử lý tuần tự theo serial (`enqueueForDevice`).
- Dòng máy 2/3 lõi: chỉ dùng `resolveIotModel()` trong `src/config/waterPurifiers.ts`. Thứ tự ưu tiên: bảng Serial → số serial → payload → mặc định. Hàm này dùng chung cho cảnh báo (mqttService) và API (`modelConfig`, frontend đọc từ đây). Không tự đoán dòng máy theo chuỗi serial ở chỗ khác, vì có máy UR61096H mà serial không chứa "61096".
- Phân quyền: route GET dùng `requirePermission('IOT_MONITOR_VIEW')`, route ghi/lệnh dùng `requirePermission('IOT_DEVICE_CONTROL')`. Frontend ẩn nút thao tác theo `hasPermission('IOT_DEVICE_CONTROL')`. Sửa mô tả quyền trong `src/config/permissions.ts` thì phải chạy `node scripts/gen_frontend_permissions.js`.
- Lệnh xuống máy: chỉ nhận `set_interval` (số nguyên 1–3600), `ping`, `reboot`, `ota` (`url`/`version`/`sha256`). Kiểm tra ở `validateCommand` (routes/iot.ts), field lạ bị bỏ. `publishCommand` chờ PUBACK và ghi `configJson.lastCommand`; phản hồi của máy cập nhật `status` theo `id`.
- Verify: `node scripts/verify_iot_api.js` (chỉ đọc, chạy được trên production). Trên sandbox thêm `--write <serial test> --ping <serial online>`. Mini App: `node scripts/verify_miniapp_iot.js` (chỉ đọc).
- ⚠️ **Sandbox và production dùng CHUNG broker MQTT và CHUNG thiết bị thật.** Một lệnh gửi từ sandbox vẫn tới máy của khách. Mọi lệnh có tác động (reboot, set_interval, OTA) lên máy thật phải được user đồng ý trước.
- ⚠️ ESP32 được lắp **nối tiếp trên đường DATA giữa bo chính và màn hình** máy lọc (xem `IOT/TDS-May-loc-nuoc/README.md`). Khi chip reboot, màn hình máy lọc mất dữ liệu trong lúc chip khởi động. Đã có trường hợp chip chạy lại ngay nhưng ~19 phút sau mới gửi dữ liệu trở lại.
- Xác minh lệnh có tác động thật: `verifyLastCommand` đối chiếu với telemetry sau lệnh. Với reboot: `now - uptime` phải nằm sau lúc gửi lệnh, và `reset_reason` (firmware 1.2.0 có gửi) là `software`. Phản hồi `ok` chỉ cho biết firmware đã *nhận* lệnh.
- `TRU-UR5840-088`, `TRU-TEST-001`, `TRU-TEST-ESP32` là máy test/giả lập (`scratch/seed_mock_5840.js`), payload của chúng có SSID/MAC giả là bình thường.
- Mini App (`zalo-miniapp/`) phát hành bằng `npm run deploy` (`zmp-cli deploy`, cần đăng nhập Zalo), không chạy trên VPS. Thư mục này không có `tsconfig.json`; build thử bằng `npx vite build --outDir <tmp>`.
- File log PM2 `/root/.pm2/logs/truliva-backend-out.log` rất lớn (4,5 GB tại 13/11/2026), nên grep có chọn lọc.
- Typecheck webapp: `npx tsc --noEmit -p tsconfig.app.json` (trong `webapp/`). `tsconfig.json` gốc chỉ có `references` nên `-p .` không kiểm tra file nào.
- Spec giao thức cho đối tác: `docs/IOT_PARTNER_INTEGRATION_GUIDE.md`.

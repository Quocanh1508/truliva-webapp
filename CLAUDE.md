# Truliva — ghi chú cho Claude

Backend Express + Prisma (PostgreSQL), webapp React (`webapp/`), Zalo Mini App (`zalo-miniapp/`).
Quy tắc deploy/kiểm thử bắt buộc: xem `DEPLOY_AND_TESTING_RULES.md` (không báo "xong" khi chưa verify trên VPS).

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

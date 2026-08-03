# 📜 Quy Tắc Bắt Buộc Khi Deploy & Testing Hệ Thống Truliva (DEPLOY_AND_TESTING_RULES)

Document này định nghĩa quy chuẩn **nghiêm ngặt và bắt buộc** dành cho tất cả các Agent/Developer khi thực hiện Deploy code và Kiểm thử (Testing) trên hệ thống Truliva (Backend Express, Frontend React Admin/KTV, Database Prisma PostgreSQL trên VPS).

---

## 🚨 NGUYÊN TẮC VÀNG
> **KHÔNG BAO GIỜ TỰ TUYÊN BỐ HOÀN THÀNH / ĐÃ FIX HOẶC BÁO KẾT QUẢ CHO USER KHI CHƯA CHẠY SCRIPT VERIFY TRỰC TIẾP TRÊN VPS API CHỨNG MINH KẾT QUẢ HOẠT ĐỘNG CHUẨN XÁC.**

---

## ⚙️ 1. Quy Trình Deploy Backend Bắt Buộc (4 Bước Không Được Bỏ)

Khi có thay đổi bất kỳ file code Backend nào (`src/routes/*`, `src/services/*`, `src/config/*`, ...):

1. **Upload File Mã Nguồn `.ts`**:
   - Upload file nguồn `.ts` từ local lên đúng vị trí trong `/var/www/truliva/src/` trên VPS qua SFTP.
2. **Biên Dịch Trực Tiếp Trên VPS (`npx tsc`)**:
   - **CẤM CHỈ UPLOAD FILE `.js` BIÊN DỊCH TỪ LOCAL**: Việc upload mỗi file `.js` rất dễ bị lệch phiên bản, thiếu file phụ thuộc hoặc không ăn khớp với môi trường VPS.
   - **BẮT BUỘC** chạy lệnh biên dịch TypeScript trực tiếp trên VPS:
     ```bash
     cd /var/www/truliva && npx tsc
     ```
3. **Restart Dịch Vụ PM2 & Cập Nhật Môi Trường**:
   - Chạy lệnh restart PM2 kèm cập nhật môi trường:
     ```bash
     cd /var/www/truliva && pm2 restart truliva-backend --update-env
     ```
   - Kiểm tra `pm2 status` để đảm bảo process status là `online` và PID mới đã được cấp.
4. **Xác Nhận API Thực Tế (Mandatory HTTP Verification)**:
   - Chạy script test (node JS) thực hiện request HTTP (GET/POST) trực tiếp đến API local trên VPS (`http://127.0.0.1:3000/api/...`).
   - Phân tích JSON hoặc Buffer trả về (Header, Data Rows, Column Count) để đảm bảo Backend thật sự đang chạy bản code mới và trả về dữ liệu chuẩn.

---

## 🎨 2. Quy Trình Deploy Frontend Bắt Buộc

Khi có thay đổi bất kỳ file code Frontend nào (`webapp/src/*`):

1. Upload file nguồn React (`.tsx` / `.ts` / `.css`) lên `/var/www/truliva/webapp/src/` trên VPS.
2. BẮT BUỘC chạy lệnh build Webapp trên VPS:
   ```bash
   cd /var/www/truliva/webapp && npm run build
   ```
3. Kiểm tra log build trả về exit code `0` và các bundle file trong `/var/www/truliva/webapp/dist/` đã được tạo mới.

---

## 🗄️ 3. Quy Trình Kiểm Tra & Dọn Dẹp Cơ Sở Dữ Liệu (Database Sanitization)

Khi sửa đổi logic tính toán, Ma trận đơn giá, hoặc các quy tắc Fallback:

1. **Quét Dữ Liệu Cũ Trong DB**:
   - Viết script truy vấn trực tiếp DB để xem hiện trạng dữ liệu trong bảng liên quan (`ktvServiceRate`, `serviceReport`, `salaryRecord`, ...).
2. **Làm Sạch Dữ Liệu Rác / Dữ Liệu Cũ Lưu Sai**:
   - Nếu trong DB có sẵn các bản ghi cũ được lưu sai từ đợt chạy trước (ví dụ: các ô đơn giá bị gán sai con số mặc định cũ), BẮT BUỘC phải chạy script cập nhật/làm sạch (clean up) DB ngay lập tức.
3. **Bảo Vệ Đa Lớp (Multi-Layer Protection)**:
   - **Lớp Frontend**: Form UI tự động làm sạch và ràng buộc dữ liệu đầu vào.
   - **Lớp API / Backend**: Tự động lọc (sanitize) dữ liệu trước khi `upsert` hoặc `calculate`.
   - **Lớp Fallback**: Logic tính toán có cơ chế tự khắc phục nếu phát hiện dữ liệu bất thường.

---

## 📋 4. Bảng Checklist Nghiệm Thu Bắt Buộc Trước Khi Trả Lời User

Trước khi nhắn tin trả lời User rằng đã sửa xong hoặc giải thích nguyên nhân:

- [ ] 1. File `.ts` nguồn đã upload lên `/var/www/truliva/src/`?
- [ ] 2. Đã chạy `cd /var/www/truliva && npx tsc` trên VPS chưa?
- [ ] 3. Đã chạy `pm2 restart truliva-backend --update-env` và kiểm tra status `online` chưa?
- [ ] 4. Đã chạy script gọi HTTP API thực tế trên VPS kiểm tra Header/JSON/Excel trả về chưa?
- [ ] 5. Đã quét DB xem có bản ghi cũ nào bị dính số sai không và đã fix sạch DB chưa?

> **Lưu ý**: Nếu bất kỳ mục nào trong 5 mục trên chưa đạt, **CẤM** báo cho User là "Đã hoàn thành".

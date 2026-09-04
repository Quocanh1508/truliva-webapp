# Quy Tắc Tối Ưu Quy Trình Deploy & Quản Trị Hệ Thống Truliva

Dưới đây là các đúc kết thực tế để tối ưu hóa việc deploy code, cấu trúc DB và chạy scripts trên dự án Truliva, tránh các lỗi command-line dài, thiếu môi trường hoặc SSH thất bại:

## 1. Đồng Bộ Hóa Database Schema (Prisma)
- **Database thật nằm trên VPS**: Các lệnh local như `npx prisma db push` hoặc `npx prisma migrate dev` sẽ mặc định **thất bại** (lỗi P1001) trừ khi có SSH tunnel đang chạy.
- **Quy trình tối ưu**:
  1. Upload file `schema.prisma` lên VPS bằng SFTP.
  2. Chạy lệnh trực tiếp trên VPS qua SSH: `cd /var/www/truliva && npx prisma generate && npx prisma db push --accept-data-loss`.
  3. Chỉ chạy `npx prisma generate` ở local để cập nhật kiểu dữ liệu cho TypeScript code-completion.

## 2. Deploy File Lên VPS
- **File dung lượng lớn hoặc code React (trên 100 dòng)**: KHÔNG DÙNG lệnh bash `cat << 'EOF'` thông thường (gây lỗi `Argument list too long`).
- **Quy trình tối ưu**:
  - Dùng script SFTP chuyên dụng: `node scratch/deploy_file_vps_sftp.js <localPath> <remotePath>`.
  - Luôn sử dụng đường dẫn tuyệt đối cho các file scripts này để Node.js định vị chính xác `node_modules`.

## 3. Quản Lý Môi Trường Local Scripts (SSH Tunnel)
- Khi chạy script test ở local kết nối tới DB VPS:
  - Phải khởi động DB Tunnel trước: `node scratch/start_db_tunnel.js`.
  - Script test phải load biến môi trường bằng đường dẫn tuyệt đối: `require('c:/StudyZone/Project/Truliva/node_modules/dotenv').config()`.
  - Sử dụng module database đã biên dịch của dự án để đảm bảo tích hợp đúng pg-pool adapter: `require('c:/StudyZone/Project/Truliva/dist/config/database.js')`.

## 4. Rebuild & Restart Dịch Vụ Trên VPS & Quy Trình Testing Bắt Buộc
- **Quy chuẩn deploy Backend**:
  1. Upload file nguồn `.ts` trong `src/` lên VPS `/var/www/truliva/src/`.
  2. BẮT BUỘC biên dịch TypeScript trực tiếp trên VPS: `cd /var/www/truliva && npx tsc`. (Cấm chỉ upload file `.js` từ local).
  3. Restart dịch vụ PM2: `cd /var/www/truliva && pm2 restart truliva-backend --update-env`.
  4. **Nghiệm thu API thực tế (Mandatory HTTP Verification)**: BẮT BUỘC chạy script test gọi trực tiếp HTTP API endpoint (`http://127.0.0.1:3000/api/...`) trên VPS để kiểm tra Header/JSON/Excel thực tế trả về từ PM2 process trước khi báo thành công với User.
- **Quy chuẩn deploy Frontend**:
  1. Upload file nguồn React (`.tsx`/`.ts`) lên `/var/www/truliva/webapp/src/`.
  2. Build trực tiếp trên VPS: `cd /var/www/truliva/webapp && npm run build`.
- Luôn kiểm tra PM2 status (`pm2 status`) và log HTTP response để xác nhận server online và chạy đúng bản code mới nhất.
- Chi tiết quy tắc deploy & testing xem tại document [DEPLOY_AND_TESTING_RULES.md](file:///c:/StudyZone/Project/Truliva/DEPLOY_AND_TESTING_RULES.md).

## 5. Quy Chuẩn Giao Diện (UI Design System)
- Tất cả các chỉnh sửa hoặc tạo mới Component trên Frontend (Web App Admin, KTV, Zalo Mini App) **BẮT BUỘC** tuân thủ quy chuẩn thiết kế tại file [UI_DESIGN_SYSTEM.md](file:///c:/StudyZone/Project/Truliva/UI_DESIGN_SYSTEM.md).
- Giữ vững tính nhất quán về:
  - Màu thương hiệu: `#1B3A6B` (Navy), `#00A3FF` (Cyan), `#2563EB` (Royal Blue).
  - Cặp màu Badges cho 5 loại trạng thái (Chờ xử lý, Đang thực hiện, Hoàn thành, Hủy đơn, Đổi hoàn).
  - Bo góc `rounded-2xl` / `rounded-xl`, chiều cao nút tối thiểu 44px trên mobile, loading state với spinner icon `<Loader2 className="animate-spin" />`.

## 6. Bảo Tồn API Contract & Kiểm Thử Payload Sâu (Mandatory JSON Schema Verification)
- **Kiểm tra Frontend trước khi sửa Backend Route/Controller**: Trước khi tái cấu trúc tệp Controller/Route, BẮT BUỘC dùng `grep_search` quét file React trong `webapp/src` để đọc chính xác tên thuộc tính JSON mà UI đang chờ (`res.data.salaries`, `res.data.reports`, ...). CẤM đổi tên thuộc tính JSON trả về.
- **Nghiệm thu HTTP Payload thực tế**: Lệnh test verification HTTP không chỉ kiểm tra server trả về mã HTTP status 200/401, mà BẮT BUỘC phải parse JSON và verify tên thuộc tính của đối tượng mảng trả về khớp 100% với Frontend.

## 7. NGUYÊN TẮC BẤT DI BẤT DỊCH: TUYỆT ĐỐI KHÔNG XÓA DỮ LIỆU (ZERO HARD-DELETE POLICY)
- **CẤM TUYỆT ĐỐI mọi hình thức Hard Delete**:
  - KHÔNG BAO GIỜ được sử dụng các lệnh xóa vật lý trong toàn bộ hệ thống (bao gồm Backend API, Controller, Service, Cronjob và tất cả các Script xử lý dữ liệu trong `scratch/`):
    - CẤM `prisma.<model>.delete()`
    - CẤM `prisma.<model>.deleteMany()`
    - CẤM SQL `DELETE FROM <table>`
    - CẤM SQL `TRUNCATE TABLE <table>`
    - CẤM SQL `DROP TABLE / DROP DATABASE` (ngoại trừ quy trình phục hồi khẩn cấp có pre-restore backup).
- **Quy chuẩn Soft-Delete & Đổi trạng thái**:
  - Khi người dùng hoặc hệ thống muốn hủy/bỏ một thực thể:
    - Với Đơn hàng (`Order`): BẮT BUỘC chuyển `adminStatus = 'hủy đơn'`, cập nhật `cancelReason` và ghi nhận `AuditLog`.
    - Với các thực thể khác (`Customer`, `User`, `Station`...): BẮT BUỘC sử dụng cơ chế Soft Delete (`isActive = false` hoặc `deletedAt = new Date()`, `status = 'INACTIVE'`).
- **Bảo tồn Vĩnh viễn Báo cáo KTV (`ServiceReport`)**:
  - Báo cáo KTV là tài sản chứng từ nghiệm thu (hình ảnh thi công, biên lai cước xe, serial máy, chi phí phát sinh). KHÔNG BAO GIỜ được xóa báo cáo. Nếu cần tách đơn, chỉ cập nhật `orderId = null` hoặc chuyển về đúng `orderId` thực tế.
- **Ràng buộc đối với Script bảo trì / Cứu dữ liệu**:
  - Mọi script can thiệp dữ liệu chỉ được dùng `findMany()`, `update()`, `updateMany()`.
  - Mọi thao tác thay đổi trạng thái phải đi kèm bản ghi giải trình trong `AuditLog` với `action: 'data_fix'` hoặc `action: 'updated'` và `reason` rõ ràng.

## 8. QUY TRÌNH KIỂM THỬ SANDBOX & ZERO-RISK DEPLOYMENT POLICY
- **Hạ tầng Sandbox độc lập**:
  - **Database Sandbox**: `truliva_sandbox` (PostgreSQL VPS).
  - **Backend Sandbox**: Thư mục `/var/www/truliva-sandbox`, PM2 `truliva-sandbox`, cổng `3001`.
  - **Web App Sandbox**: `https://trulivaofficial.com:8443` (có sticky banner màu cam).
  - **Local Tunnel Sandbox**: `node scratch/start_sandbox_db_tunnel.js` (cổng `5433`).
  - **Script 1-Touch làm mới dữ liệu**: `bash /var/www/truliva/scripts/sync_prod_to_sandbox.sh`.
- **Chính sách Bắt Buộc (Mandatory Staging-First Rule)**:
  - Mọi tính năng mới, thay đổi bảng lương, chỉnh sửa logic Controller hoặc script xử lý dữ liệu phức tạp **BẮT BUỘC** phải được chạy thử nghiệm và nghiệm thu trên môi trường **Sandbox** trước.
  - Tuyệt đối không chạy thử nghiệm tính năng chưa kiểm chứng trực tiếp trên môi trường Production.
  - Chỉ sau khi đã nghiệm thu 100% trên Sandbox (qua HTTP và UI), mới tiến hành cập nhật lên Production theo đúng quy chuẩn Rule 4.



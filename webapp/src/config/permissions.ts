// ⚠️ AUTO-GENERATED — KHÔNG SỬA TAY FILE NÀY.
// Nguồn: src/config/permissions.ts → chạy `npm run perm:gen` (tự chạy khi build/dev).

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  DANH MỤC PHÂN QUYỀN — NGUỒN ĐỊNH NGHĨA DUY NHẤT (SINGLE SOURCE OF TRUTH)
 * ═══════════════════════════════════════════════════════════════════════
 *  - Chỉ sửa file này: src/config/permissions.ts
 *  - webapp/src/config/permissions.ts được SINH TỰ ĐỘNG từ file này
 *    (`npm run perm:gen`, tự chạy trong `npm run build` / `npm run dev`).
 *  - File này KHÔNG được import thư viện nào (để frontend dùng chung y hệt).
 *
 *  Thêm tính năng mới:
 *    1. Thêm 1 object vào SYSTEM_FEATURES (key UPPER_SNAKE, module, defaultRoles, addedAt = ngày hôm nay).
 *    2. Khởi động lại backend → permissionSync tự INSERT quyền mặc định cho key mới
 *       (không bao giờ đụng tới cấu hình cũ) và gắn cờ "MỚI" để Admin duyệt.
 */

/** Phải khớp với enum UserRole trong prisma/schema.prisma */
export type RoleKey = 'ADMIN' | 'DEV' | 'COORDINATOR' | 'HOTLINE' | 'SALE_SUPERVISOR' | 'SALER' | 'STAFF' | 'KTV';

/** Nhãn phát hành gốc — tính năng mang nhãn này không bị coi là "mới" khi bootstrap lần đầu */
export const ORIGINAL_RELEASE_TAG = 'v1.0';

export interface SystemFeature {
  key: string;
  module: string;
  name: string;
  description: string;
  defaultRoles: RoleKey[];
  /** Nếu true, chỉ hiển thị cho DEV và tự động bật cho role DEV. Admin không tự động có quyền. */
  devOnly?: boolean;
  /** Ngày tính năng được thêm vào hệ thống. Format: 'YYYY-MM-DD' hoặc 'v1.0' cho tính năng gốc. */
  addedAt: string;
}

export interface SystemModule {
  id: string;
  name: string;
}

export const SYSTEM_MODULES: SystemModule[] = [
  { id: 'orders', name: '📋 Quản lý Đơn hàng & Ca Dịch vụ' },
  { id: 'hotline', name: '📞 Quản lý Yêu Cầu Hotline' },
  { id: 'serials', name: '🏷️ Quản lý Serial & Bảo hành' },
  { id: 'reports', name: '📝 Quản lý Báo cáo Kỹ thuật' },
  { id: 'salaries', name: '💰 Quản lý Lương & Chi phí KTV' },
  { id: 'inventory', name: '📦 Quản lý Kho & Vật tư' },
  { id: 'system', name: '⚙️ Quản lý Hệ thống & Nhân sự' },
  { id: 'ai_assistant', name: '🤖 Quản lý Trợ lý AI & Tri thức' },
  { id: 'iot', name: '📡 Giám sát IoT (ESP32)' },
  { id: 'dev_tools', name: '🛠️ Công cụ Nhà phát triển (Dev Only)' }
];

export const SYSTEM_ROLES: { key: RoleKey; label: string; badgeColor: string }[] = [
  { key: 'ADMIN', label: 'Admin', badgeColor: 'bg-red-100 text-red-700 border-red-200' },
  { key: 'DEV', label: 'Dev', badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { key: 'COORDINATOR', label: 'Điều phối viên', badgeColor: 'bg-purple-100 text-purple-700 border-purple-200' },
  { key: 'HOTLINE', label: 'Hotline', badgeColor: 'bg-pink-100 text-pink-700 border-pink-200' },
  { key: 'SALE_SUPERVISOR', label: 'Giám sát Sales', badgeColor: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'SALER', label: 'Saler', badgeColor: 'bg-green-100 text-green-700 border-green-200' },
  { key: 'STAFF', label: 'Staff (Văn phòng)', badgeColor: 'bg-teal-100 text-teal-700 border-teal-200' },
  { key: 'KTV', label: 'Kỹ thuật viên', badgeColor: 'bg-blue-100 text-blue-700 border-blue-200' }
];

/**
 * Registry Trung tâm chứa toàn bộ các Tính năng / Hành động hệ thống
 */
export const SYSTEM_FEATURES: SystemFeature[] = [
  // 1. Quản lý Đơn hàng
  {
    key: 'ORDER_VIEW',
    module: 'orders',
    name: 'Xem danh sách ca dịch vụ',
    description: 'Quyền xem danh sách đơn hàng và thông tin ca dịch vụ',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_CREATE',
    module: 'orders',
    name: 'Tạo ca dịch vụ thủ công',
    description: 'Tạo mới ca dịch vụ tự tạo/độc lập',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_ASSIGN_KTV',
    module: 'orders',
    name: 'Phân công KTV & Phân bổ hàng loạt',
    description: 'Gán KTV, hẹn lịch và phân bổ ca dịch vụ',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_EDIT_MANUAL',
    module: 'orders',
    name: 'Chỉnh sửa ca dịch vụ tự tạo',
    description: 'Chỉnh sửa thông tin các ca tự tạo',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_CANCEL',
    module: 'orders',
    name: 'Hủy đơn & Hủy đơn hàng loạt',
    description: 'Thao tác hủy đơn và hoàn kho linh kiện',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_SYNC_PANCAKE',
    module: 'orders',
    name: 'Đồng bộ đơn hàng loạt từ Pancake POS (50 đơn)',
    description: 'Nút đồng bộ 50 đơn hàng mới nhất trực tiếp từ Pancake POS',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_SYNC_SINGLE',
    module: 'orders',
    name: 'Đồng bộ ca đơn lẻ từ Pancake POS',
    description: 'Nút đồng bộ dữ liệu riêng từng ca dịch vụ từ Pancake POS',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_REOPEN',
    module: 'orders',
    name: 'Mở lại đơn hàng (Khôi phục ca)',
    description: 'Khôi phục đơn đã hủy hoặc hoàn thành về Chờ xử lý và xóa phân bổ trạm/KTV',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_AUDIT_LOG',
    module: 'orders',
    name: 'Xem nhật ký lịch sử thay đổi ca',
    description: 'Xem chi tiết lịch sử cập nhật, phân công, đổi trạng thái của ca dịch vụ',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_COMPLETE_MANUAL',
    module: 'orders',
    name: 'Báo hoàn thành ca thủ công',
    description: 'Đánh dấu ca dịch vụ đã hoàn thành',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'SALER', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_EXPORT_EXCEL',
    module: 'orders',
    name: 'Xuất Excel danh sách đơn hàng',
    description: 'Tải file Excel danh sách ca dịch vụ',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'ORDER_AUTO_REFRESH',
    module: 'orders',
    name: 'Tự động tải lại trang (Auto Refresh)',
    description: 'Bật chế độ tự động làm mới danh sách đơn',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: 'v1.0'
  },

  // 1.5 Quản lý Yêu Cầu Hotline
  {
    key: 'HOTLINE_TICKET_VIEW',
    module: 'hotline',
    name: 'Xem danh sách Yêu cầu Hotline',
    description: 'Quyền xem danh sách phiếu yêu cầu hotline từ khách hàng',
    defaultRoles: ['ADMIN', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'HOTLINE_SEARCH_CUSTOMER',
    module: 'hotline',
    name: 'Tra cứu Lịch sử Khách hàng',
    description: 'Tra cứu toàn bộ thông tin tương tác, đơn hàng, serial và cuộc gọi của khách hàng',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF'],
    addedAt: 'v1.1'
  },
  {
    key: 'HOTLINE_TICKET_CREATE',
    module: 'hotline',
    name: 'Tạo phiếu Yêu cầu Hotline (Phase 2)',
    description: 'Tạo mới phiếu yêu cầu hỗ trợ/tư vấn từ khách hàng',
    defaultRoles: ['ADMIN', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'HOTLINE_TICKET_VERIFY',
    module: 'hotline',
    name: 'Phê duyệt & Xử lý yêu cầu (Phase 3)',
    description: 'Phân bổ, xác thực, chuyển ca dịch vụ hoặc trả về Phase 2',
    defaultRoles: ['ADMIN', 'COORDINATOR', 'HOTLINE'],
    addedAt: 'v1.0'
  },
  {
    key: 'HOTLINE_EXPORT_EXCEL',
    module: 'hotline',
    name: 'Xuất Excel danh sách Yêu cầu Hotline',
    description: 'Tải file Excel danh sách phiếu yêu cầu hotline theo bộ lọc',
    defaultRoles: ['ADMIN', 'COORDINATOR', 'HOTLINE', 'STAFF'],
    addedAt: 'v1.0'
  },

  // 2. Quản lý Serial & Bảo hành
  {
    key: 'SERIAL_VIEW',
    module: 'serials',
    name: 'Xem danh sách & Tra cứu Serial',
    description: 'Xem thông tin serial, hạn bảo hành, thông tin khách hàng',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'SERIAL_EDIT',
    module: 'serials',
    name: 'Chỉnh sửa thông tin Serial',
    description: 'Cập nhật trạng thái, ngày kích hoạt, thông tin bảo hành',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'SERIAL_EXPORT_EXCEL',
    module: 'serials',
    name: 'Xuất Excel Quản lý Serial',
    description: 'Tải file Excel danh sách Serial sản phẩm',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: 'v1.0'
  },
  {
    key: 'SERIAL_IMPORT_EXCEL',
    module: 'serials',
    name: 'Import lô Serial từ file Excel',
    description: 'Tải lên lô Serial mới từ file Excel',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: 'v1.0'
  },

  // 3. Quản lý Báo cáo Kỹ thuật
  {
    key: 'REPORT_VIEW',
    module: 'reports',
    name: 'Xem danh sách báo cáo nghiệm thu',
    description: 'Xem thông tin nghiệm thu, hình ảnh và linh kiện KTV thay',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'REPORT_CREATE',
    module: 'reports',
    name: 'Tạo & Nộp Báo cáo nghiệm thu ca',
    description: 'Gửi báo cáo hoàn thành ca, upload ảnh nghiệm thu & linh kiện đã thay',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'SALER', 'KTV'],
    addedAt: 'v1.0'
  },
  {
    key: 'REPORT_APPROVE_REJECT',
    module: 'reports',
    name: 'Duyệt / Từ chối Báo cáo KTV',
    description: 'Phê duyệt hoặc từ chối báo cáo nghiệm thu ca',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'REPORT_EDIT_DELETE',
    module: 'reports',
    name: 'Chỉnh sửa / Xóa Báo cáo',
    description: 'Sửa thông tin linh kiện/giá tiền hoặc xóa báo cáo',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: 'v1.0'
  },
  {
    key: 'REPORT_EXPORT_EXCEL',
    module: 'reports',
    name: 'Xuất Excel Báo cáo kỹ thuật',
    description: 'Tải dữ liệu báo cáo nghiệm thu dạng Excel',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'STAFF'],
    addedAt: 'v1.0'
  },
  {
    key: 'SAMPLE_IMAGE_MANAGE',
    module: 'reports',
    name: 'Quản lý Ảnh mẫu Báo cáo KTV',
    description: 'Cấu hình và tải ảnh mẫu nghiệm thu chuẩn (chụp tem máy, vị trí lắp, đồng hồ TDS...)',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: '2026-11-03'
  },

  // 4. Quản lý Lương & Chi phí KTV
  {
    key: 'SALARY_VIEW',
    module: 'salaries',
    name: 'Xem bảng tính lương KTV',
    description: 'Xem chi tiết bảng lương, công ca và thưởng phạt KTV',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: 'v1.0'
  },
  {
    key: 'SALARY_UPDATE_COST',
    module: 'salaries',
    name: 'Chỉnh sửa đơn giá cơ bản / chi phí ca',
    description: 'Điều chỉnh đơn giá công ca và phí linh kiện',
    defaultRoles: ['ADMIN'],
    addedAt: 'v1.0'
  },
  {
    key: 'SALARY_ADD_CUSTOM_CASE',
    module: 'salaries',
    name: 'Thêm ca thủ công / phí bổ sung',
    description: 'Thêm ca điều chỉnh hoặc phụ phí vào bảng lương',
    defaultRoles: ['ADMIN'],
    addedAt: 'v1.0'
  },
  {
    key: 'SALARY_LOCK_MONTH',
    module: 'salaries',
    name: 'Khóa / Mở khóa sổ lương tháng',
    description: 'Chốt bảng lương tháng ngăn chỉnh sửa',
    defaultRoles: ['ADMIN'],
    addedAt: 'v1.0'
  },
  {
    key: 'SALARY_EXPORT_EXCEL',
    module: 'salaries',
    name: 'Xuất Excel Bảng tính lương KTV',
    description: 'Tải file Excel chi tiết bảng tính lương, phụ cấp & công ca KTV',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: 'v1.0'
  },

  // 5. Quản lý Kho & Vật tư
  {
    key: 'INVENTORY_VIEW',
    module: 'inventory',
    name: 'Xem danh sách kho & tồn kho',
    description: 'Xem tồn kho thực tế tại kho chính và trạm',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: 'v1.0'
  },
  {
    key: 'INVENTORY_MANAGE_WAREHOUSE',
    module: 'inventory',
    name: 'Tạo mới & chỉnh sửa kho hàng',
    description: 'Quản lý thông tin và cấu hình các kho',
    defaultRoles: ['ADMIN'],
    addedAt: 'v1.0'
  },
  {
    key: 'INVENTORY_TRANSFER',
    module: 'inventory',
    name: 'Nhập / Xuất / Điều chuyển vật tư',
    description: 'Thao tác điều chuyển vật tư linh kiện giữa các kho',
    defaultRoles: ['ADMIN', 'COORDINATOR'],
    addedAt: 'v1.0'
  },
  {
    key: 'INVENTORY_SYNC_POS',
    module: 'inventory',
    name: 'Đồng bộ sản phẩm active từ POS',
    description: 'Đồng bộ danh mục sản phẩm active và thông tin tồn kho từ Pancake POS',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR'],
    addedAt: 'v1.0'
  },

  // 6. Quản lý Hệ thống & Nhân sự
  {
    key: 'USER_MANAGE',
    module: 'system',
    name: 'Quản lý tài khoản người dùng',
    description: 'Tạo mới, sửa, đổi mật khẩu và vai trò người dùng',
    defaultRoles: ['ADMIN'],
    addedAt: 'v1.0'
  },
  {
    key: 'USER_PERMISSIONS_MATRIX',
    module: 'system',
    name: 'Quản lý Ma trận Phân quyền',
    description: 'Xem và bật/tắt ma trận phân quyền động cho các Role',
    defaultRoles: ['ADMIN'],
    addedAt: 'v1.0'
  },
  {
    key: 'USER_EXPORT_EXCEL',
    module: 'system',
    name: 'Xuất Excel Danh sách Nhân sự / KTV',
    description: 'Tải file Excel thông tin chi tiết danh sách tài khoản nhân viên & KTV',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: 'v1.0'
  },
  {
    key: 'STATION_MANAGE',
    module: 'system',
    name: 'Quản lý Trạm Kỹ thuật',
    description: 'Tạo và quản lý các Trạm chính & Trạm kỹ thuật',
    defaultRoles: ['ADMIN', 'COORDINATOR'],
    addedAt: 'v1.0'
  },
  {
    key: 'PROMO_MANAGE',
    module: 'system',
    name: 'Quản lý Mã giảm giá / Voucher',
    description: 'Tạo và quản lý các mã khuyến mãi dịch vụ',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: 'v1.0'
  },
  {
    key: 'FEEDBACK_VIEW',
    module: 'system',
    name: 'Xem phản hồi & góp ý hệ thống',
    description: 'Xem danh sách góp ý lỗi và đóng góp ý kiến',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: 'v1.0'
  },
  {
    key: 'BROADCAST_MANAGE',
    module: 'system',
    name: 'Gửi Thông báo Hệ thống (Broadcast)',
    description: 'Gửi thông báo đẩy Web Push / In-App cho toàn bộ nhân sự hoặc từng nhóm/KTV',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: '2026-11-03'
  },
  {
    key: 'DASHBOARD_VIEW',
    module: 'system',
    name: 'Xem Bảng điều khiển (Dashboard)',
    description: 'Xem số liệu thống kê tổng quan ca dịch vụ, doanh thu và biểu đồ phân tích điều hành',
    defaultRoles: ['ADMIN', 'DEV', 'STAFF'],
    addedAt: '2026-11-03'
  },

  // 6.5 Quản lý Trợ lý AI & Tri thức
  {
    key: 'AI_ASSISTANT_VIEW',
    module: 'ai_assistant',
    name: 'Xem & Thử nghiệm Trợ lý AI',
    description: 'Quyền xem cấu hình bot AI, giọng điệu, danh mục cẩm nang và chat thử nghiệm',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: '2026-11-03'
  },
  {
    key: 'AI_ASSISTANT_CONFIG',
    module: 'ai_assistant',
    name: 'Chỉnh sửa Cấu hình AI & FAQ',
    description: 'Tùy chỉnh Prompt hệ thống, FAQ chuẩn, thông tin hotline và tích hợp Facebook Page',
    defaultRoles: ['ADMIN'],
    addedAt: '2026-11-03'
  },
  {
    key: 'AI_DOCUMENT_MANAGE',
    module: 'ai_assistant',
    name: 'Quản lý Thư viện RAG & Tự động OCR',
    description: 'Tải lên tài liệu kỹ thuật, tự động nhận dạng OCR văn bản và lập chỉ mục HNSW',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: '2026-11-03'
  },
  {
    key: 'AI_CHAT_SESSION_MANAGE',
    module: 'ai_assistant',
    name: 'Quản lý Phiên Chat & Giám sát Tokens',
    description: 'Xem lịch sử các phiên hội thoại với AI, chi tiết lượng tokens tiêu thụ và thời gian phản hồi cho từng câu hỏi (Admin & Dev)',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: '2026-11-03'
  },

  // 6.6 Giám sát Thiết bị IoT (ESP32)
  {
    key: 'IOT_MONITOR_VIEW',
    module: 'iot',
    name: 'Xem giám sát thiết bị IoT trực tiếp',
    description: 'Theo dõi tình trạng online/offline, chỉ số TDS, lưu lượng nước và tuổi thọ lõi lọc qua MQTT',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: '2026-11-03'
  },
  {
    key: 'IOT_DEVICE_CONTROL',
    module: 'iot',
    name: 'Điều khiển thiết bị IoT từ xa qua MQTT',
    description: 'Gửi lệnh đóng/ngắt van nước điện từ, tắt còi cảnh báo và reset chu kỳ lõi lọc từ xa',
    defaultRoles: ['ADMIN', 'DEV'],
    addedAt: '2026-11-03'
  },

  // 7. Công cụ Nhà phát triển (Dev Only) — Tự động bật cho DEV, ẩn khỏi ma trận Admin
  {
    key: 'DEV_ZNS_MANAGE',
    module: 'dev_tools',
    name: 'Quản lý & Bắn ZNS thủ công',
    description: 'Gửi tin nhắn Zalo ZNS thủ công, tra cứu template và kiểm tra trạng thái gửi',
    defaultRoles: ['DEV'],
    devOnly: true,
    addedAt: 'v1.0'
  },
  {
    key: 'DEV_SYSTEM_MAP',
    module: 'dev_tools',
    name: 'Sơ đồ hệ thống & Cấu trúc mã nguồn',
    description: 'Xem sơ đồ mạng lưới trạm, giám sát sức khỏe live, quy trình SOP và cấu trúc codebase',
    defaultRoles: ['DEV'],
    devOnly: true,
    addedAt: 'v1.0'
  },
  {
    key: 'DEV_FEEDBACK_MANAGE',
    module: 'dev_tools',
    name: 'Quản lý phản hồi người dùng (Dev)',
    description: 'Xem, phân loại và xử lý phản hồi lỗi & góp ý từ người dùng hệ thống',
    defaultRoles: ['DEV'],
    devOnly: true,
    addedAt: 'v1.0'
  }
];

/**
 * Tra cứu mặc định nếu DB chưa lưu thiết lập tùy chỉnh
 */
export function getDefaultPermission(role: string, featureKey: string): boolean {
  const feat = FEATURE_BY_KEY[featureKey];
  if (!feat) return false;
  // Với tính năng devOnly: Mặc định bật cho DEV, không set mặc định cho ADMIN
  if (feat.devOnly) {
    return role === 'DEV';
  }
  // Với tính năng thông thường: Admin luôn có tất cả quyền
  if (role === 'ADMIN') return true;
  return (feat.defaultRoles as string[]).includes(role);
}

/** Tra cứu nhanh feature theo key */
export const FEATURE_BY_KEY: Record<string, SystemFeature> = Object.fromEntries(
  SYSTEM_FEATURES.map(f => [f.key, f])
);

/** Tên module hiển thị của 1 feature */
export function getModuleName(moduleId: string): string {
  return SYSTEM_MODULES.find(m => m.id === moduleId)?.name || moduleId;
}

/**
 * Admin luôn có quyền với mọi tính năng thông thường (không phải devOnly) — ô Admin bị khóa trên ma trận.
 */
export function isAdminLocked(role: string, featureKey: string): boolean {
  return role === 'ADMIN' && !FEATURE_BY_KEY[featureKey]?.devOnly;
}

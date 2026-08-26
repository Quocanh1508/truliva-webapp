import { UserRole } from '@prisma/client';

export interface SystemFeature {
  key: string;
  module: string;
  moduleName: string;
  name: string;
  description: string;
  defaultRoles: UserRole[];
  /** Nếu true, chỉ hiển thị cho DEV và tự động bật cho role DEV. Không hiện trong ma trận phân quyền Admin. */
  devOnly?: boolean;
}

export const SYSTEM_MODULES = [
  { id: 'orders', name: '📋 Quản lý Đơn hàng & Ca Dịch vụ' },
  { id: 'hotline', name: '📞 Quản lý Yêu Cầu Hotline' },
  { id: 'serials', name: '🏷️ Quản lý Serial & Bảo hành' },
  { id: 'reports', name: '📝 Quản lý Báo cáo Kỹ thuật' },
  { id: 'salaries', name: '💰 Quản lý Lương & Chi phí KTV' },
  { id: 'inventory', name: '📦 Quản lý Kho & Vật tư' },
  { id: 'system', name: '⚙️ Quản lý Hệ thống & Nhân sự' },
  { id: 'dev_tools', name: '🛠️ Công cụ Nhà phát triển (Dev Only)' }
];

export const SYSTEM_ROLES: { key: UserRole; label: string; badgeColor: string }[] = [
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
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Xem danh sách ca dịch vụ',
    description: 'Quyền xem danh sách đơn hàng và thông tin ca dịch vụ',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF']
  },
  {
    key: 'ORDER_CREATE',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Tạo ca dịch vụ thủ công',
    description: 'Tạo mới ca dịch vụ tự tạo/độc lập',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF']
  },
  {
    key: 'ORDER_ASSIGN_KTV',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Phân công KTV & Phân bổ hàng loạt',
    description: 'Gán KTV, hẹn lịch và phân bổ ca dịch vụ',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR']
  },
  {
    key: 'ORDER_EDIT_MANUAL',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Chỉnh sửa ca dịch vụ tự tạo',
    description: 'Chỉnh sửa thông tin các ca tự tạo',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR']
  },
  {
    key: 'ORDER_CANCEL',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Hủy đơn & Hủy đơn hàng loạt',
    description: 'Thao tác hủy đơn và hoàn kho linh kiện',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR']
  },
  {
    key: 'ORDER_SYNC_PANCAKE',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Đồng bộ đơn hàng loạt từ Pancake POS (50 đơn)',
    description: 'Nút đồng bộ 50 đơn hàng mới nhất trực tiếp từ Pancake POS',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF']
  },
  {
    key: 'ORDER_SYNC_SINGLE',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Đồng bộ ca đơn lẻ từ Pancake POS',
    description: 'Nút đồng bộ dữ liệu riêng từng ca dịch vụ từ Pancake POS',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER']
  },
  {
    key: 'ORDER_REOPEN',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Mở lại đơn hàng (Khôi phục ca)',
    description: 'Khôi phục đơn đã hủy hoặc hoàn thành về Chờ xử lý và xóa phân bổ trạm/KTV',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR']
  },
  {
    key: 'ORDER_AUDIT_LOG',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Xem nhật ký lịch sử thay đổi ca',
    description: 'Xem chi tiết lịch sử cập nhật, phân công, đổi trạng thái của ca dịch vụ',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF']
  },
  {
    key: 'ORDER_COMPLETE_MANUAL',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Báo hoàn thành ca thủ công',
    description: 'Đánh dấu ca dịch vụ đã hoàn thành',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'SALER', 'STAFF']
  },
  {
    key: 'ORDER_EXPORT_EXCEL',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Xuất Excel danh sách đơn hàng',
    description: 'Tải file Excel danh sách ca dịch vụ',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'STAFF']
  },
  {
    key: 'ORDER_AUTO_REFRESH',
    module: 'orders',
    moduleName: '📋 Quản lý Đơn hàng',
    name: 'Tự động tải lại trang (Auto Refresh)',
    description: 'Bật chế độ tự động làm mới danh sách đơn',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR']
  },

  // 1.5 Quản lý Yêu Cầu Hotline
  {
    key: 'HOTLINE_TICKET_VIEW',
    module: 'hotline',
    moduleName: '📞 Quản lý Yêu Cầu Hotline',
    name: 'Xem danh sách Yêu cầu Hotline',
    description: 'Quyền xem danh sách phiếu yêu cầu hotline từ khách hàng',
    defaultRoles: ['ADMIN', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF']
  },
  {
    key: 'HOTLINE_TICKET_CREATE',
    module: 'hotline',
    moduleName: '📞 Quản lý Yêu Cầu Hotline',
    name: 'Tạo phiếu Yêu cầu Hotline (Phase 2)',
    description: 'Tạo mới phiếu yêu cầu hỗ trợ/tư vấn từ khách hàng',
    defaultRoles: ['ADMIN', 'COORDINATOR', 'HOTLINE', 'SALE_SUPERVISOR', 'SALER', 'STAFF']
  },
  {
    key: 'HOTLINE_TICKET_VERIFY',
    module: 'hotline',
    moduleName: '📞 Quản lý Yêu Cầu Hotline',
    name: 'Phê duyệt & Xử lý yêu cầu (Phase 3)',
    description: 'Phân bổ, xác thực, chuyển ca dịch vụ hoặc trả về Phase 2',
    defaultRoles: ['ADMIN', 'COORDINATOR', 'HOTLINE']
  },
  {
    key: 'HOTLINE_EXPORT_EXCEL',
    module: 'hotline',
    moduleName: '📞 Quản lý Yêu Cầu Hotline',
    name: 'Xuất Excel danh sách Yêu cầu Hotline',
    description: 'Tải file Excel danh sách phiếu yêu cầu hotline theo bộ lọc',
    defaultRoles: ['ADMIN', 'COORDINATOR', 'HOTLINE', 'STAFF']
  },

  // 2. Quản lý Serial & Bảo hành
  {
    key: 'SERIAL_VIEW',
    module: 'serials',
    moduleName: '🏷️ Quản lý Serial & Bảo hành',
    name: 'Xem danh sách & Tra cứu Serial',
    description: 'Xem thông tin serial, hạn bảo hành, thông tin khách hàng',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'STAFF']
  },
  {
    key: 'SERIAL_EDIT',
    module: 'serials',
    moduleName: '🏷️ Quản lý Serial & Bảo hành',
    name: 'Chỉnh sửa thông tin Serial',
    description: 'Cập nhật trạng thái, ngày kích hoạt, thông tin bảo hành',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'STAFF']
  },
  {
    key: 'SERIAL_EXPORT_EXCEL',
    module: 'serials',
    moduleName: '🏷️ Quản lý Serial & Bảo hành',
    name: 'Xuất Excel Quản lý Serial',
    description: 'Tải file Excel danh sách Serial sản phẩm',
    defaultRoles: ['ADMIN', 'DEV']
  },
  {
    key: 'SERIAL_IMPORT_EXCEL',
    module: 'serials',
    moduleName: '🏷️ Quản lý Serial & Bảo hành',
    name: 'Import lô Serial từ file Excel',
    description: 'Tải lên lô Serial mới từ file Excel',
    defaultRoles: ['ADMIN', 'DEV']
  },

  // 3. Quản lý Báo cáo Kỹ thuật
  {
    key: 'REPORT_VIEW',
    module: 'reports',
    moduleName: '📝 Quản lý Báo cáo',
    name: 'Xem danh sách báo cáo nghiệm thu',
    description: 'Xem thông tin nghiệm thu, hình ảnh và linh kiện KTV thay',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'HOTLINE', 'STAFF']
  },
  {
    key: 'REPORT_CREATE',
    module: 'reports',
    moduleName: '📝 Quản lý Báo cáo',
    name: 'Tạo & Nộp Báo cáo nghiệm thu ca',
    description: 'Gửi báo cáo hoàn thành ca, upload ảnh nghiệm thu & linh kiện đã thay',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'SALER', 'KTV']
  },
  {
    key: 'REPORT_APPROVE_REJECT',
    module: 'reports',
    moduleName: '📝 Quản lý Báo cáo',
    name: 'Duyệt / Từ chối Báo cáo KTV',
    description: 'Phê duyệt hoặc từ chối báo cáo nghiệm thu ca',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'STAFF']
  },
  {
    key: 'REPORT_EDIT_DELETE',
    module: 'reports',
    moduleName: '📝 Quản lý Báo cáo',
    name: 'Chỉnh sửa / Xóa Báo cáo',
    description: 'Sửa thông tin linh kiện/giá tiền hoặc xóa báo cáo',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR']
  },
  {
    key: 'REPORT_EXPORT_EXCEL',
    module: 'reports',
    moduleName: '📝 Quản lý Báo cáo',
    name: 'Xuất Excel Báo cáo kỹ thuật',
    description: 'Tải dữ liệu báo cáo nghiệm thu dạng Excel',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR', 'STAFF']
  },

  // 4. Quản lý Lương & Chi phí KTV
  {
    key: 'SALARY_VIEW',
    module: 'salaries',
    moduleName: '💰 Quản lý Lương & Chi phí',
    name: 'Xem bảng tính lương KTV',
    description: 'Xem chi tiết bảng lương, công ca và thưởng phạt KTV',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR']
  },
  {
    key: 'SALARY_UPDATE_COST',
    module: 'salaries',
    moduleName: '💰 Quản lý Lương & Chi phí',
    name: 'Chỉnh sửa đơn giá cơ bản / chi phí ca',
    description: 'Điều chỉnh đơn giá công ca và phí linh kiện',
    defaultRoles: ['ADMIN']
  },
  {
    key: 'SALARY_ADD_CUSTOM_CASE',
    module: 'salaries',
    moduleName: '💰 Quản lý Lương & Chi phí',
    name: 'Thêm ca thủ công / phí bổ sung',
    description: 'Thêm ca điều chỉnh hoặc phụ phí vào bảng lương',
    defaultRoles: ['ADMIN']
  },
  {
    key: 'SALARY_LOCK_MONTH',
    module: 'salaries',
    moduleName: '💰 Quản lý Lương & Chi phí',
    name: 'Khóa / Mở khóa sổ lương tháng',
    description: 'Chốt bảng lương tháng ngăn chỉnh sửa',
    defaultRoles: ['ADMIN']
  },
  {
    key: 'SALARY_EXPORT_EXCEL',
    module: 'salaries',
    moduleName: '💰 Quản lý Lương & Chi phí',
    name: 'Xuất Excel Bảng tính lương KTV',
    description: 'Tải file Excel chi tiết bảng tính lương, phụ cấp & công ca KTV',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR']
  },

  // 5. Quản lý Kho & Vật tư
  {
    key: 'INVENTORY_VIEW',
    module: 'inventory',
    moduleName: '📦 Quản lý Kho & Vật tư',
    name: 'Xem danh sách kho & tồn kho',
    description: 'Xem tồn kho thực tế tại kho chính và trạm',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR']
  },
  {
    key: 'INVENTORY_MANAGE_WAREHOUSE',
    module: 'inventory',
    moduleName: '📦 Quản lý Kho & Vật tư',
    name: 'Tạo mới & chỉnh sửa kho hàng',
    description: 'Quản lý thông tin và cấu hình các kho',
    defaultRoles: ['ADMIN']
  },
  {
    key: 'INVENTORY_TRANSFER',
    module: 'inventory',
    moduleName: '📦 Quản lý Kho & Vật tư',
    name: 'Nhập / Xuất / Điều chuyển vật tư',
    description: 'Thao tác điều chuyển vật tư linh kiện giữa các kho',
    defaultRoles: ['ADMIN', 'COORDINATOR']
  },
  {
    key: 'INVENTORY_SYNC_POS',
    module: 'inventory',
    moduleName: '📦 Quản lý Kho & Vật tư',
    name: 'Đồng bộ sản phẩm active từ POS',
    description: 'Đồng bộ danh mục sản phẩm active và thông tin tồn kho từ Pancake POS',
    defaultRoles: ['ADMIN', 'DEV', 'COORDINATOR']
  },

  // 6. Quản lý Hệ thống & Nhân sự
  {
    key: 'USER_MANAGE',
    module: 'system',
    moduleName: '⚙️ Quản lý Hệ thống',
    name: 'Quản lý tài khoản người dùng',
    description: 'Tạo mới, sửa, đổi mật khẩu và vai trò người dùng',
    defaultRoles: ['ADMIN']
  },
  {
    key: 'USER_PERMISSIONS_MATRIX',
    module: 'system',
    moduleName: '⚙️ Quản lý Hệ thống',
    name: 'Quản lý Ma trận Phân quyền',
    description: 'Xem và bật/tắt ma trận phân quyền động cho các Role',
    defaultRoles: ['ADMIN']
  },
  {
    key: 'USER_EXPORT_EXCEL',
    module: 'system',
    moduleName: '⚙️ Quản lý Hệ thống',
    name: 'Xuất Excel Danh sách Nhân sự / KTV',
    description: 'Tải file Excel thông tin chi tiết danh sách tài khoản nhân viên & KTV',
    defaultRoles: ['ADMIN', 'DEV']
  },
  {
    key: 'STATION_MANAGE',
    module: 'system',
    moduleName: '⚙️ Quản lý Hệ thống',
    name: 'Quản lý Trạm Kỹ thuật',
    description: 'Tạo và quản lý các Trạm chính & Trạm kỹ thuật',
    defaultRoles: ['ADMIN', 'COORDINATOR']
  },
  {
    key: 'PROMO_MANAGE',
    module: 'system',
    moduleName: '⚙️ Quản lý Hệ thống',
    name: 'Quản lý Mã giảm giá / Voucher',
    description: 'Tạo và quản lý các mã khuyến mãi dịch vụ',
    defaultRoles: ['ADMIN', 'DEV']
  },
  {
    key: 'FEEDBACK_VIEW',
    module: 'system',
    moduleName: '⚙️ Quản lý Hệ thống',
    name: 'Xem phản hồi & góp ý hệ thống',
    description: 'Xem danh sách góp ý lỗi và đóng góp ý kiến',
    defaultRoles: ['ADMIN', 'DEV']
  },

  // 7. Công cụ Nhà phát triển (Dev Only) — Tự động bật cho DEV, ẩn khỏi ma trận Admin
  {
    key: 'DEV_ZNS_MANAGE',
    module: 'dev_tools',
    moduleName: '🛠️ Công cụ Dev',
    name: 'Quản lý & Bắn ZNS thủ công',
    description: 'Gửi tin nhắn Zalo ZNS thủ công, tra cứu template và kiểm tra trạng thái gửi',
    defaultRoles: ['DEV'],
    devOnly: true
  },
  {
    key: 'DEV_SYSTEM_MAP',
    module: 'dev_tools',
    moduleName: '🛠️ Công cụ Dev',
    name: 'Sơ đồ hệ thống & Cấu trúc mã nguồn',
    description: 'Xem sơ đồ mạng lưới trạm, giám sát sức khỏe live, quy trình SOP và cấu trúc codebase',
    defaultRoles: ['DEV'],
    devOnly: true
  },
  {
    key: 'DEV_FEEDBACK_MANAGE',
    module: 'dev_tools',
    moduleName: '🛠️ Công cụ Dev',
    name: 'Quản lý phản hồi người dùng (Dev)',
    description: 'Xem, phân loại và xử lý phản hồi lỗi & góp ý từ người dùng hệ thống',
    defaultRoles: ['DEV'],
    devOnly: true
  }
];

/**
 * Tra cứu mặc định nếu DB chưa lưu thiết lập tùy chỉnh
 */
export function getDefaultPermission(role: UserRole, featureKey: string): boolean {
  const feat = SYSTEM_FEATURES.find(f => f.key === featureKey);
  if (!feat) return false;
  // Với tính năng devOnly: Mặc định bật cho DEV, không set mặc định cho ADMIN
  if (feat.devOnly) {
    return role === 'DEV';
  }
  // Với tính năng thông thường: Admin luôn có tất cả quyền
  if (role === 'ADMIN') return true;
  return feat.defaultRoles.includes(role);
}

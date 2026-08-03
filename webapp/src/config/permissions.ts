export interface SystemFeature {
  key: string;
  module: string;
  moduleName: string;
  name: string;
  description: string;
  defaultRoles: string[];
}

export const SYSTEM_MODULES = [
  { id: 'orders', name: '📋 Quản lý Đơn hàng & Ca Dịch vụ' },
  { id: 'serials', name: '🏷️ Quản lý Serial & Bảo hành' },
  { id: 'reports', name: '📝 Quản lý Báo cáo Kỹ thuật' },
  { id: 'salaries', name: '💰 Quản lý Lương & Chi phí KTV' },
  { id: 'inventory', name: '📦 Quản lý Kho & Vật tư' },
  { id: 'system', name: '⚙️ Quản lý Hệ thống & Nhân sự' }
];

export const SYSTEM_ROLES: { key: string; label: string; badgeColor: string }[] = [
  { key: 'ADMIN', label: 'Admin', badgeColor: 'bg-red-100 text-red-700 border-red-200' },
  { key: 'DEV', label: 'Dev', badgeColor: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { key: 'COORDINATOR', label: 'Điều phối viên', badgeColor: 'bg-purple-100 text-purple-700 border-purple-200' },
  { key: 'HOTLINE', label: 'Hotline', badgeColor: 'bg-pink-100 text-pink-700 border-pink-200' },
  { key: 'SALE_SUPERVISOR', label: 'Giám sát Sales', badgeColor: 'bg-amber-100 text-amber-700 border-amber-200' },
  { key: 'SALER', label: 'Saler', badgeColor: 'bg-green-100 text-green-700 border-green-200' },
  { key: 'STAFF', label: 'Staff (Văn phòng)', badgeColor: 'bg-teal-100 text-teal-700 border-teal-200' },
  { key: 'KTV', label: 'Kỹ thuật viên', badgeColor: 'bg-blue-100 text-blue-700 border-blue-200' }
];

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
    name: 'Đồng bộ đơn từ Pancake POS',
    description: 'Nút đồng bộ dữ liệu đơn hàng trực tiếp từ Pancake',
    defaultRoles: ['ADMIN']
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
  }
];

export function getDefaultPermission(role: string, featureKey: string): boolean {
  if (role === 'ADMIN') return true;
  const feat = SYSTEM_FEATURES.find(f => f.key === featureKey);
  if (!feat) return false;
  return feat.defaultRoles.includes(role);
}

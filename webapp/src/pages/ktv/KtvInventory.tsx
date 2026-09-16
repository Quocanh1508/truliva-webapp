import InventoryManage from '../admin/InventoryManage';

/**
 * Trang Quản lý & Báo cáo Xuất - Nhập - Tồn kho dành cho Kỹ Thuật Viên (KTV)
 * Tích hợp trực tiếp từ dữ liệu kế toán Pancake POS với các ràng buộc bảo mật:
 * - Ẩn giá vốn, giá bán và giá trị tiền.
 * - Ẩn chi tiết phân rã nguồn nhập/xuất khi nhấn vào dòng sản phẩm.
 * - Chỉ hiển thị 4 chỉ số cơ bản: Tồn đầu kỳ, Tổng nhập, Tổng xuất, Tồn cuối kỳ.
 * - Cố định kho xe cá nhân của KTV.
 * - Mặc định lọc các sản phẩm "Còn hàng".
 */
export default function KtvInventory() {
  return <InventoryManage />;
}

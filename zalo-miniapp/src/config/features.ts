/**
 * Feature Flags Cấu Hình Hệ Thống Zalo Mini App Truliva
 * 
 * Lưu ý: Các cờ dưới đây dùng để TẠM ẨN tính năng theo yêu cầu vận hành.
 * Khi cần bật lại, chỉ cần chuyển giá trị thành true.
 */
export const FEATURES = {
  /**
   * Tạm ẩn tính năng mua bán hàng trực tiếp trên Mini App
   * (Giỏ hàng, Đặt hàng, Thanh toán COD/VietQR, Nút Mua ngay)
   * Khi false: Chuyển tab Cửa hàng sang Catalog giới thiệu máy lọc nước & Hướng dẫn sử dụng.
   */
  ENABLE_ECOMMERCE: false,

  /**
   * Tạm ẩn tính năng xếp cấp hạng thành viên (Member Ranking) & Điểm thưởng
   * (Huy hiệu Đồng/Bạc/Vàng/Kim Cương, Vòng quay, Đổi quà thành viên)
   */
  ENABLE_MEMBER_RANKING: false,
};

/** Kiểu hiển thị của một ô quyền & chú giải dùng chung (ma trận + hướng dẫn) */
export type CellVisual = 'on' | 'off' | 'inherit-on' | 'inherit-off' | 'override-on' | 'override-off' | 'locked';

export const LEGEND_ITEMS: { visual: CellVisual; label: string; hint: string }[] = [
  { visual: 'on', label: 'Bật', hint: 'Được phép sử dụng' },
  { visual: 'off', label: 'Tắt', hint: 'Không được phép' },
  { visual: 'inherit-on', label: 'Kế thừa (bật)', hint: 'Nhận quyền từ tầng trên — viền nét đứt' },
  { visual: 'inherit-off', label: 'Kế thừa (tắt)', hint: 'Nhận quyền từ tầng trên — viền nét đứt' },
  { visual: 'override-on', label: 'Ghi đè (bật)', hint: 'Cấu hình riêng, viền vàng' },
  { visual: 'override-off', label: 'Ghi đè (tắt)', hint: 'Cấu hình riêng, viền vàng' },
  { visual: 'locked', label: 'Admin', hint: 'Admin luôn có quyền, không chỉnh được' }
];

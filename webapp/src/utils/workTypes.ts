export interface ImageSlot {
  label: string;
}

// ── Danh sách loại công việc ──
export const WORK_TYPES = [
  'Giao hàng và Lắp đặt',
  'Lắp đặt',
  'Giao hàng',
  'Thay lọc',
  'Bảo hành',
  'Sửa chữa',
];

// ── Loại dịch vụ tương ứng với Loại công việc ──
export const WORK_TYPE_SERVICES: Record<string, string[]> = {
  'Giao hàng và Lắp đặt': ['Công việc đã bao gồm dịch vụ'],
  'Lắp đặt': ['Công việc đã bao gồm dịch vụ'],
  'Giao hàng': ['Công việc đã bao gồm dịch vụ'],
  'Thay lọc': ['Công việc đã bao gồm dịch vụ'],
  'Bảo hành': [
    'Áp lực nước yếu', 'Bơm không hoạt động', 'Chất lượng nước sau lọc',
    'Hỏng vòi nước', 'Lỗi biến áp', 'Lỗi cảm biến rò rỉ', 'Lỗi mạch điện',
    'Lỗi màn hình hiển thị', 'Lỗi vòi nước', 'Lỏng vòi nước',
    'Máy báo đỏ các đèn', 'Máy báo lỗi TDS', 'Nước thải không ngừng',
    'Rò rỉ bên trong máy', 'Rò rỉ đường ống', 'Rò rỉ lọc thô', 'Rò rỉ từ vòi',
    'Rò rỉ van cấp nước', 'Thiết bị hoạt động không ổn định',
    'Thiết bị hoạt động liên tục', 'Thiết bị không hoạt động',
    'Thiết bị lọc chậm', 'Tiếng ồn khi vận hành',
    'Khác (phát sinh theo thực tế)',
  ],
  'Sửa chữa': [
    'Áp lực nước yếu', 'Bơm không hoạt động', 'Chất lượng nước sau lọc',
    'Đo chỉ số TDS', 'Hỏng vòi nước', 'Khảo sát vị trí', 'Lắp đặt lại máy',
    'Lấy mẫu test nước', 'Lỗi biến áp', 'Lỗi cảm biến rò rỉ', 'Lỗi mạch điện',
    'Lỗi màn hình hiển thị', 'Lỗi vòi nước', 'Lỏng vòi nước',
    'Máy báo đỏ các đèn', 'Máy báo lỗi TDS', 'Nước thải không ngừng',
    'Rò rỉ bên trong máy', 'Rò rỉ đường ống', 'Rò rỉ lọc thô', 'Rò rỉ từ vòi',
    'Rò rỉ van cấp nước', 'Tháo máy', 'Thay đổi vị trí lắp đặt', 'Thay linh kiện',
    'Thiết bị hoạt động không ổn định', 'Thiết bị hoạt động liên tục',
    'Thiết bị không hoạt động', 'Thiết bị lọc chậm',
    'Thu hồi/Đổi/Trả', 'Tiếng ồn khi vận hành',
    'Khác (phát sinh theo thực tế)',
  ],
};

// ── Image slots theo loại công việc ──
export function getImageSlots(workType: string): ImageSlot[] {
  switch (workType) {
    case 'Giao hàng':
      return [
        { label: 'Ảnh giao hàng cho khách' },
        { label: 'Ảnh seri sản phẩm' },
        { label: 'Ảnh biên bản nghiệm thu' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    case 'Thay lọc':
      return [
        { label: 'Ảnh trước khi thay lọc' },
        { label: 'Ảnh sau khi thay lọc' },
        { label: 'Ảnh đo TDS đầu vào' },
        { label: 'Ảnh đo TDS đầu ra' },
        { label: 'Ảnh đo áp suất nước' },
        { label: 'Ảnh seri sản phẩm' },
        { label: 'Ảnh biên bản nghiệm thu' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    case 'Giao hàng và Lắp đặt':
    case 'Lắp đặt':
      return [
        { label: 'Ảnh lắp đặt hoàn thiện' },
        { label: 'Ảnh treo biến áp/kết nối điện nước' },
        { label: 'Ảnh đo TDS đầu vào' },
        { label: 'Ảnh đo TDS đầu ra' },
        { label: 'Ảnh đo áp suất nước' },
        { label: 'Ảnh seri sản phẩm' },
        { label: 'Ảnh biên bản nghiệm thu' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    case 'Bảo hành':
    case 'Sửa chữa':
      return [
        { label: 'Ảnh trước khi xử lý' },
        { label: 'Ảnh sau khi xử lý' },
        { label: 'Ảnh linh kiện thay thế' },
        { label: 'Ảnh đo TDS' },
        { label: 'Ảnh đo áp suất nước' },
        { label: 'Ảnh seri sản phẩm' },
        { label: 'Ảnh biên bản nghiệm thu' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    default:
      return [
        { label: 'Ảnh xác nhận 1' },
        { label: 'Ảnh xác nhận 2' },
        { label: 'Ảnh xác nhận 3' },
        { label: 'Ảnh xác nhận 4' },
      ];
  }
}

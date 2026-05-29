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

// ── Chi tiết dịch vụ Bảo hành theo nhóm lỗi ──
export const WARRANTY_SERVICE_GROUPS: Record<string, string[]> = {
  'Lỗi Rò rỉ & Đường nước': [
    'Rò rỉ bên trong máy',
    'Rò rỉ đường ống',
    'Rò rỉ lọc thô',
    'Rò rỉ van cấp nước',
    'Nước thải không ngừng',
  ],
  'Lỗi Vòi nước': [
    'Hỏng vòi nước',
    'Lỗi vòi nước',
    'Lỏng vòi nước',
    'Rò rỉ từ vòi',
  ],
  'Lỗi Điện & Động cơ': [
    'Bơm không hoạt động',
    'Lỗi biến áp',
    'Lỗi mạch điện',
  ],
  'Hiển thị & Cảnh báo': [
    'Lỗi cảm biến rò rỉ',
    'Lỗi màn hình hiển thị',
    'Máy báo đỏ các đèn',
    'Máy báo lỗi TDS',
  ],
  'Vấn đề Hoạt động & Chất lượng': [
    'Áp lực nước yếu',
    'Chất lượng nước sau lọc',
    'Thiết bị hoạt động không ổn định',
    'Thiết bị hoạt động liên tục',
    'Thiết bị không hoạt động',
    'Thiết bị lọc chậm',
    'Tiếng ồn khi vận hành',
  ],
  'Khác': [
    'Khác (phát sinh theo thực tế)',
  ],
};

// ── Chi tiết dịch vụ Sửa chữa theo nhóm lỗi ──
export const REPAIR_SERVICE_GROUPS: Record<string, string[]> = {
  'Lắp đặt & Di dời': [
    'Lắp đặt lại máy',
    'Tháo máy',
    'Thay đổi vị trí lắp đặt',
  ],
  'Khảo sát & Đo đạc': [
    'Khảo sát vị trí',
    'Lấy mẫu test nước',
    'Đo chỉ số TDS',
  ],
  'Linh kiện': [
    'Thay linh kiện',
  ],
  'Lỗi Rò rỉ & Đường nước': [
    'Rò rỉ bên trong máy',
    'Rò rỉ đường ống',
    'Rò rỉ lọc thô',
    'Rò rỉ van cấp nước',
    'Nước thải không ngừng',
  ],
  'Lỗi Vòi nước': [
    'Hỏng vòi nước',
    'Lỗi vòi nước',
    'Lỏng vòi nước',
    'Rò rỉ từ vòi',
  ],
  'Lỗi Điện & Động cơ': [
    'Bơm không hoạt động',
    'Lỗi biến áp',
    'Lỗi mạch điện',
  ],
  'Hiển thị & Cảnh báo': [
    'Lỗi cảm biến rò rỉ',
    'Lỗi màn hình hiển thị',
    'Máy báo đỏ các đèn',
    'Máy báo lỗi TDS',
  ],
  'Vấn đề Hoạt động & Chất lượng': [
    'Áp lực nước yếu',
    'Chất lượng nước sau lọc',
    'Thiết bị hoạt động không ổn định',
    'Thiết bị hoạt động liên tục',
    'Thiết bị không hoạt động',
    'Thiết bị lọc chậm',
    'Tiếng ồn khi vận hành',
  ],
  'Khác': [
    'Thu hồi/Đổi/Trả',
    'Khác (phát sinh theo thực tế)',
  ],
};

// ── Loại dịch vụ tương ứng với Loại công việc ──
export const WORK_TYPE_SERVICES: Record<string, string[]> = {
  'Giao hàng và Lắp đặt': ['Công việc đã bao gồm dịch vụ'],
  'Lắp đặt': ['Công việc đã bao gồm dịch vụ'],
  'Giao hàng': ['Công việc đã bao gồm dịch vụ'],
  'Thay lọc': ['Công việc đã bao gồm dịch vụ'],
  'Bảo hành': Object.values(WARRANTY_SERVICE_GROUPS).flat(),
  'Sửa chữa': Object.values(REPAIR_SERVICE_GROUPS).flat(),
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

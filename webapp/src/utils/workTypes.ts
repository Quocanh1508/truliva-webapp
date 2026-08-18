export interface ImageSlot {
  label: string;
  isRequired?: boolean;
}

// ── Danh sách loại công việc ──
export const WORK_TYPES = [
  'Bảo hành',
  'Giao hàng',
  'Giao hàng và lắp đặt',
  'Hướng dẫn và Tư vấn',
  'Lắp đặt',
  'Thay lõi lọc',
  'Sửa chữa',
];

// ── Danh sách Yêu cầu dịch vụ cho Quản lý Hotline (Droplist chuẩn thiết kế) ──
export const HOTLINE_SERVICE_REQUEST_TYPES = [
  'Bảo Hành - Bảo Trì',
  'Hướng dẫn sử dụng',
  'Khác',
  'Lắp đặt',
  'Thay lõi lọc',
  'Tra cứu thông tin',
  'Tư vấn kỹ thuật',
  'Tư vấn sản phẩm',
];

// ── Danh sách Loại dịch vụ cho "Hướng dẫn và Tư vấn" ──
export const ADVICE_CONSULTATION_SERVICES = [
  'Hướng dẫn kích hoạt bảo hành',
  'Hướng dẫn lắp đặt',
  'Hướng dẫn sử dụng',
  'Hướng dẫn thay lọc',
  'Hướng dẫn xử lý áp lực nước yếu',
  'Hướng dẫn xử lý chất lượng nước',
  'Hướng dẫn xử lý máy báo đỏ 3 đèn',
  'Hướng dẫn xử lý rò rỉ',
  'Hướng dẫn xử lý thiết bị không hoạt động',
  'Hướng dẫn xử lý thiết bị không ổn định',
  'Hướng dẫn xử lý tiếng ồn',
  'Kích hoạt bảo hành',
  'Khác',
  'Tra cứu thông tin',
  'Tư vấn lõi lọc',
  'Tư vấn sản phẩm'
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
  ],
};

// ── Loại dịch vụ tương ứng với Loại công việc / Loại yêu cầu ──
export const WORK_TYPE_SERVICES: Record<string, string[]> = {
  'Bảo hành': [...Object.values(WARRANTY_SERVICE_GROUPS).flat(), 'Khác'],
  'Giao hàng': ['Công việc đã bao gồm dịch vụ', 'Khác'],
  'Giao hàng và lắp đặt': ['Công việc đã bao gồm dịch vụ', 'Khác'],
  'Giao hàng và Lắp đặt': ['Công việc đã bao gồm dịch vụ', 'Khác'],
  'Hướng dẫn và Tư vấn': ADVICE_CONSULTATION_SERVICES,
  'Lắp đặt': ['Công việc đã bao gồm dịch vụ', 'Khác'],
  'Thay lọc': ['Công việc đã bao gồm dịch vụ', 'Khác'],
  'Thay lõi lọc': ['Công việc đã bao gồm dịch vụ', 'Khác'],
  'Sửa chữa': [...Object.values(REPAIR_SERVICE_GROUPS).flat(), 'Khác'],
};

// ── Image slots theo loại công việc ──
export function getImageSlots(workType: string): ImageSlot[] {
  switch (workType) {
    case 'Giao hàng':
      return [
        { label: 'Ảnh giao hàng cho khách', isRequired: true },
        { label: 'Ảnh biên bản nghiệm thu', isRequired: true },
        { label: 'Ảnh seri sản phẩm', isRequired: true },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    case 'Thay lọc':
      return [
        { label: 'Ảnh trước khi thay lọc', isRequired: true },
        { label: 'Ảnh sau khi thay lọc', isRequired: true },
        { label: 'Ảnh biên bản nghiệm thu', isRequired: true },
        { label: 'Ảnh seri sản phẩm', isRequired: true },
        { label: 'Ảnh đo TDS đầu vào' },
        { label: 'Ảnh đo TDS đầu ra' },
        { label: 'Ảnh đo áp suất nước' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    case 'Giao hàng và Lắp đặt':
    case 'Lắp đặt':
      return [
        { label: 'Ảnh lắp đặt hoàn thiện', isRequired: true },
        { label: 'Ảnh biên bản nghiệm thu', isRequired: true },
        { label: 'Ảnh seri sản phẩm', isRequired: true },
        { label: 'Ảnh treo biến áp/kết nối điện nước' },
        { label: 'Ảnh đo TDS đầu vào' },
        { label: 'Ảnh đo TDS đầu ra' },
        { label: 'Ảnh đo áp suất nước' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    case 'Bảo hành':
    case 'Sửa chữa':
      return [
        { label: 'Ảnh trước khi xử lý', isRequired: true },
        { label: 'Ảnh sau khi xử lý', isRequired: true },
        { label: 'Ảnh biên bản nghiệm thu', isRequired: true },
        { label: 'Ảnh seri sản phẩm', isRequired: true },
        { label: 'Ảnh linh kiện thay thế' },
        { label: 'Ảnh đo TDS' },
        { label: 'Ảnh đo áp suất nước' },
        { label: 'Ảnh xác nhận thanh toán' },
      ];
    default:
      return [
        { label: 'Ảnh xác nhận 1', isRequired: true },
        { label: 'Ảnh xác nhận 2', isRequired: true },
        { label: 'Ảnh xác nhận 3' },
        { label: 'Ảnh xác nhận 4' },
      ];
  }
}

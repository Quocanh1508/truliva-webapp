/**
 * Danh sách 63 Tỉnh/Thành phố Việt Nam theo chuẩn mẫu Pancake POS
 * Ưu tiên: TP Hồ Chí Minh, Hà Nội, Đà Nẵng lên đầu.
 * Các tỉnh thành còn lại xếp theo Alphabet A-Z.
 */

export const PRIORITY_PROVINCES = [
  'TP Hồ Chí Minh',
  'Hà Nội',
  'Đà Nẵng'
];

export const REMAINING_PROVINCES = [
  'An Giang',
  'Bà Rịa - Vũng Tàu',
  'Bắc Giang',
  'Bắc Kạn',
  'Bạc Liêu',
  'Bắc Ninh',
  'Bến Tre',
  'Bình Định',
  'Bình Dương',
  'Bình Phước',
  'Bình Thuận',
  'Cà Mau',
  'Cần Thơ',
  'Cao Bằng',
  'Đắk Lắk',
  'Đắk Nông',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Giang',
  'Hà Nam',
  'Hà Tĩnh',
  'Hải Dương',
  'Hải Phòng',
  'Hậu Giang',
  'Hòa Bình',
  'Hưng Yên',
  'Khánh Hòa',
  'Kiên Giang',
  'Kon Tum',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Long An',
  'Nam Định',
  'Nghệ An',
  'Ninh Bình',
  'Ninh Thuận',
  'Phú Thọ',
  'Phú Yên',
  'Quảng Bình',
  'Quảng Nam',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sóc Trăng',
  'Sơn La',
  'Tây Ninh',
  'Thái Bình',
  'Thái Nguyên',
  'Thanh Hóa',
  'Thừa Thiên Huế',
  'Tiền Giang',
  'Trà Vinh',
  'Tuyên Quang',
  'Vĩnh Long',
  'Vĩnh Phúc',
  'Yên Bái'
];

export const PANCAKE_PROVINCES = [...PRIORITY_PROVINCES, ...REMAINING_PROVINCES];

// Hỗ trợ alias tên gọi phổ biến (ví dụ: "Hồ Chí Minh", "TP.HCM", "HCM")
const PROVINCE_ALIASES: Record<string, string> = {
  'hồ chí minh': 'TP Hồ Chí Minh',
  'hcm': 'TP Hồ Chí Minh',
  'tp.hcm': 'TP Hồ Chí Minh',
  'tp hcm': 'TP Hồ Chí Minh',
  'tp. hồ chí minh': 'TP Hồ Chí Minh',
  'tp.hồ chí minh': 'TP Hồ Chí Minh',
  'thành phố hồ chí minh': 'TP Hồ Chí Minh',
  'ha noi': 'Hà Nội',
  'hà nội': 'Hà Nội',
  'da nang': 'Đà Nẵng',
  'đà nẵng': 'Đà Nẵng',
  'thừa thiên - huế': 'Thừa Thiên Huế',
  'thừa thiên huế': 'Thừa Thiên Huế',
  'tp cần thơ': 'Cần Thơ',
  'tp hải phòng': 'Hải Phòng',
  'ba ria - vung tau': 'Bà Rịa - Vũng Tàu',
  'bà rịa vũng tàu': 'Bà Rịa - Vũng Tàu'
};

/**
 * Chuẩn hóa tên tỉnh thành từ đầu vào (nếu khớp với danh sách Pancake POS)
 */
export function normalizeProvince(input: string): string | null {
  if (!input || !input.trim()) return '';
  const trimmed = input.trim();
  
  // 1. Khớp chính xác
  const exact = PANCAKE_PROVINCES.find(p => p.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  // 2. Khớp theo Aliases
  const lower = trimmed.toLowerCase();
  if (PROVINCE_ALIASES[lower]) return PROVINCE_ALIASES[lower];

  // 3. Khớp mờ loại bỏ bớt dấu "TP " hoặc "Tỉnh "
  const stripped = lower.replace(/^(tỉnh|tp\.|tp)\s+/, '');
  const foundStripped = PANCAKE_PROVINCES.find(p => {
    const pLower = p.toLowerCase().replace(/^(tỉnh|tp\.|tp)\s+/, '');
    return pLower === stripped;
  });
  if (foundStripped) return foundStripped;

  return null;
}

/**
 * Kiểm tra xem chuỗi có thuộc danh sách Tỉnh/TP chuẩn Pancake POS không
 */
export function isValidProvince(input: string): boolean {
  return normalizeProvince(input) !== null;
}

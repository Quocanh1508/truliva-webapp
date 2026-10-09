/**
 * Danh sách 63 Tỉnh/Thành phố Việt Nam theo chuẩn chính thức của Pancake POS
 * Ưu tiên: Hồ Chí Minh, Hà Nội, Đà Nẵng lên đầu.
 * Các tỉnh thành còn lại xếp theo Alphabet A-Z.
 */

export const PRIORITY_PROVINCES = [
  'Hồ Chí Minh',
  'Hà Nội',
  'Đà Nẵng'
];

export const REMAINING_PROVINCES = [
  'An Giang',
  'Bà Rịa-Vũng Tàu',
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

// Hỗ trợ alias tên gọi phổ biến (ví dụ: "TP Hồ Chí Minh", "TP.HCM", "HCM", "Bà Rịa - Vũng Tàu")
const PROVINCE_ALIASES: Record<string, string> = {
  // Hồ Chí Minh
  'hồ chí minh': 'Hồ Chí Minh',
  'tp hồ chí minh': 'Hồ Chí Minh',
  'tp. hồ chí minh': 'Hồ Chí Minh',
  'tp.hồ chí minh': 'Hồ Chí Minh',
  'thành phố hồ chí minh': 'Hồ Chí Minh',
  'tp hcm': 'Hồ Chí Minh',
  'tp.hcm': 'Hồ Chí Minh',
  'tphcm': 'Hồ Chí Minh',
  'hcm': 'Hồ Chí Minh',
  'ho chi minh': 'Hồ Chí Minh',
  'tp ho chi minh': 'Hồ Chí Minh',
  'ho chi minh city': 'Hồ Chí Minh',

  // Hà Nội
  'hà nội': 'Hà Nội',
  'ha noi': 'Hà Nội',
  'tp hà nội': 'Hà Nội',
  'tp. hà nội': 'Hà Nội',
  'tp.hà nội': 'Hà Nội',
  'thành phố hà nội': 'Hà Nội',
  'hanoi': 'Hà Nội',

  // Đà Nẵng
  'đà nẵng': 'Đà Nẵng',
  'da nang': 'Đà Nẵng',
  'tp đà nẵng': 'Đà Nẵng',
  'tp. đà nẵng': 'Đà Nẵng',
  'thành phố đà nẵng': 'Đà Nẵng',

  // Hải Phòng
  'hải phòng': 'Hải Phòng',
  'hai phong': 'Hải Phòng',
  'tp hải phòng': 'Hải Phòng',
  'tp. hải phòng': 'Hải Phòng',

  // Cần Thơ
  'cần thơ': 'Cần Thơ',
  'can tho': 'Cần Thơ',
  'tp cần thơ': 'Cần Thơ',
  'tp. cần thơ': 'Cần Thơ',

  // Bà Rịa - Vũng Tàu
  'bà rịa-vũng tàu': 'Bà Rịa-Vũng Tàu',
  'bà rịa - vũng tàu': 'Bà Rịa-Vũng Tàu',
  'bà rịa vũng tàu': 'Bà Rịa-Vũng Tàu',
  'ba ria - vung tau': 'Bà Rịa-Vũng Tàu',
  'ba ria-vung tau': 'Bà Rịa-Vũng Tàu',
  'ba ria vung tau': 'Bà Rịa-Vũng Tàu',
  'vũng tàu': 'Bà Rịa-Vũng Tàu',

  // Thừa Thiên Huế
  'thừa thiên huế': 'Thừa Thiên Huế',
  'thừa thiên - huế': 'Thừa Thiên Huế',
  'huế': 'Thừa Thiên Huế',
  'hue': 'Thừa Thiên Huế',

  // Khánh Hòa
  'khánh hòa': 'Khánh Hòa',
  'khánh hoà': 'Khánh Hòa',
  'khanh hoa': 'Khánh Hòa',

  // Thanh Hóa
  'thanh hóa': 'Thanh Hóa',
  'thanh hoá': 'Thanh Hóa',
  'thanh hoa': 'Thanh Hóa',
  'tỉnh thanh hóa': 'Thanh Hóa',
  'tỉnh thanh hoá': 'Thanh Hóa',
  'tp thanh hóa': 'Thanh Hóa',
  'tp thanh hoá': 'Thanh Hóa',
  'thành phố thanh hóa': 'Thanh Hóa',
  'thành phố thanh hoá': 'Thanh Hóa',

  // Hòa Bình
  'hòa bình': 'Hòa Bình',
  'hoà bình': 'Hòa Bình',
  'hoa binh': 'Hòa Bình',
  'tỉnh hòa bình': 'Hòa Bình',
  'tỉnh hoà bình': 'Hòa Bình',

  // Đắk Lắk & Đắk Nông
  'đắk lắk': 'Đắk Lắk',
  'đắc lắc': 'Đắk Lắk',
  'dak lak': 'Đắk Lắk',
  'daklak': 'Đắk Lắk',
  'đắk nông': 'Đắk Nông',
  'đắc nông': 'Đắk Nông',
  'dak nong': 'Đắk Nông',
  'daknong': 'Đắk Nông',

  // Khác
  'đồng nai': 'Đồng Nai',
  'bình dương': 'Bình Dương'
};

/**
 * Chuẩn hóa tên tỉnh thành từ đầu vào về chuẩn duy nhất của Pancake POS
 */
export function normalizeProvince(input: string | null | undefined): string | null {
  if (!input || !input.trim()) return null;
  const trimmed = input.trim();
  
  // 1. Khớp chính xác
  const exact = PANCAKE_PROVINCES.find(p => p.toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  // 2. Khớp theo Aliases
  const lower = trimmed.toLowerCase();
  if (PROVINCE_ALIASES[lower]) return PROVINCE_ALIASES[lower];

  // 3. Khớp mờ loại bỏ bớt dấu "TP " hoặc "Tỉnh " hoặc "Thành phố "
  const stripped = lower.replace(/^(thành phố|tỉnh|tp\.|tp)\s+/i, '').trim();
  const foundStripped = PANCAKE_PROVINCES.find(p => {
    const pLower = p.toLowerCase().replace(/^(thành phố|tỉnh|tp\.|tp)\s+/i, '').trim();
    return pLower === stripped;
  });
  if (foundStripped) return foundStripped;

  // 4. Khớp alias cho chuỗi đã stripped
  if (PROVINCE_ALIASES[stripped]) return PROVINCE_ALIASES[stripped];

  return null;
}

/**
 * Kiểm tra xem chuỗi có thuộc danh sách Tỉnh/TP chuẩn Pancake POS không
 */
export function isValidProvince(input: string | null | undefined): boolean {
  return normalizeProvince(input) !== null;
}

/**
 * Lấy các biến thể tìm kiếm của một Tỉnh/TP để phục vụ truy vấn linh hoạt
 */
export function getProvinceSearchVariants(province: string): string[] {
  const norm = normalizeProvince(province) || province.trim();
  const variants = new Set<string>([norm]);

  if (norm === 'Hồ Chí Minh') {
    variants.add('TP Hồ Chí Minh');
    variants.add('TP. Hồ Chí Minh');
    variants.add('TP.Hồ Chí Minh');
    variants.add('TP.HCM');
    variants.add('TP HCM');
    variants.add('Hồ Chí Minh');
  } else if (norm === 'Hà Nội') {
    variants.add('TP Hà Nội');
    variants.add('TP. Hà Nội');
    variants.add('TP.Hà Nội');
    variants.add('Hà Nội');
  } else if (norm === 'Đà Nẵng') {
    variants.add('TP Đà Nẵng');
    variants.add('TP. Đà Nẵng');
    variants.add('Đà Nẵng');
  } else if (norm === 'Hải Phòng') {
    variants.add('TP Hải Phòng');
    variants.add('TP. Hải Phòng');
    variants.add('Hải Phòng');
  } else if (norm === 'Cần Thơ') {
    variants.add('TP Cần Thơ');
    variants.add('TP. Cần Thơ');
    variants.add('Cần Thơ');
  } else if (norm === 'Bà Rịa-Vũng Tàu') {
    variants.add('Bà Rịa - Vũng Tàu');
    variants.add('Bà Rịa-Vũng Tàu');
    variants.add('Bà Rịa Vũng Tàu');
  } else if (norm === 'Khánh Hòa') {
    variants.add('Khánh Hòa');
    variants.add('Khánh Hoà');
  } else if (norm === 'Thanh Hóa') {
    variants.add('Thanh Hóa');
    variants.add('Thanh Hoá');
  } else if (norm === 'Thừa Thiên Huế') {
    variants.add('Thừa Thiên Huế');
    variants.add('Thừa Thiên - Huế');
    variants.add('Huế');
  }

  return Array.from(variants);
}

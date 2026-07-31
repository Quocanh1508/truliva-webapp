/**
 * Utility kiêm tra định dạng Số điện thoại Việt Nam chuẩn 10 chữ số tự nhiên.
 * Yêu cầu: Nhập đủ 10 ký tự số tự nhiên (0-9) liền kề nhau.
 */
export function isValidPhone(phone: string | null | undefined, allowEmpty = false): boolean {
  if (!phone || !phone.trim()) {
    return allowEmpty;
  }
  const cleaned = phone.trim();
  return /^\d{10}$/.test(cleaned);
}

export const PHONE_ERROR_MSG = 'Số điện thoại không hợp lệ. Vui lòng nhập đúng 10 chữ số tự nhiên liền kề (ví dụ: 0912345678).';

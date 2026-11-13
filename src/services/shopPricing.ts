import prisma from '../config/database';

/**
 * Mức giảm tiền cố định của từng mã voucher Shop Zalo Mini App.
 * Dùng chung cho tính giá đơn mới và suy ngược số điểm đã tiêu ở các đơn cũ.
 */
export const VOUCHER_FIXED_DISCOUNTS: Record<string, number> = {
  TRULIVA500: 500000,
  GIAM100K: 100000,
  '12THANGBH': 0
};

/**
 * Tạo các biến thể định dạng SĐT (0xxx, 84xxx, xxx, +84xxx) để truy vấn khớp chính xác.
 */
export function buildPhoneVariants(phone: string | null | undefined): string[] {
  if (!phone) return [];
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  if (!cleanPhone) return [];
  const standardPhone = cleanPhone.startsWith('84') && cleanPhone.length >= 11 ? '0' + cleanPhone.substring(2) : cleanPhone;
  return Array.from(new Set([
    standardPhone,
    standardPhone.startsWith('0') ? '84' + standardPhone.substring(1) : standardPhone,
    standardPhone.startsWith('0') ? standardPhone.substring(1) : standardPhone,
    standardPhone.startsWith('0') ? '+84' + standardPhone.substring(1) : standardPhone
  ]));
}

/**
 * Tổng số điểm tích lũy khách đã dùng để trừ tiền trên các đơn Shop chưa hủy.
 * Điểm đã dùng của 1 đơn = (discountAmount - giảm giá voucher) / 1000 (1 điểm = 1.000đ).
 */
export async function getRedeemedPoints(phoneVariants: string[], userId?: string | null): Promise<number> {
  const or: any[] = [];
  if (phoneVariants.length > 0) or.push({ customerPhone: { in: phoneVariants } });
  if (userId) or.push({ zaloUserId: userId });
  if (or.length === 0) return 0;

  const orders = await prisma.shopOrder.findMany({
    where: {
      OR: or,
      orderStatus: { not: 'CANCELLED' },
      discountAmount: { gt: 0 }
    },
    select: { discountAmount: true, voucherCode: true }
  });

  let redeemed = 0;
  for (const o of orders) {
    const voucherDiscount = o.voucherCode ? (VOUCHER_FIXED_DISCOUNTS[o.voucherCode] ?? 0) : 0;
    const pointsDiscount = Math.max(0, o.discountAmount - voucherDiscount);
    redeemed += Math.ceil(pointsDiscount / 1000);
  }
  return redeemed;
}

/**
 * Kiểm tra khách hàng Mini App (req.user) có phải chủ của đơn Shop không.
 */
export function isShopOrderOwner(
  order: { zaloUserId: string | null; customerPhone: string },
  user: { id: string; phoneNumber?: string | null } | undefined | null
): boolean {
  if (!user?.id) return false;
  if (order.zaloUserId && order.zaloUserId === user.id) return true;
  const userVariants = buildPhoneVariants(user.phoneNumber);
  const orderVariants = buildPhoneVariants(order.customerPhone);
  return userVariants.length > 0 && orderVariants.some(p => userVariants.includes(p));
}

import logger from '../utils/logger';
import { sendZaloDirectZns, sendFnsServiceCompletion, ZaloZnsError } from './zaloService';
import { formatVnDate } from './installZnsService';

/**
 * TIN ZNS XÁC NHẬN HOÀN THÀNH DỊCH VỤ THAY LỌC
 *
 *  - Gửi trực tiếp qua Zalo OA, mẫu 643643 (tag TRANSACTION).
 *    Tham số: _TEN_KHACH_HANG_, _ID_DON_HANG_ (mã dịch vụ), _TONG_TIEN_ (CURRENCY), _NGAY_BAO_HANH_ (hạn bảo hành lõi lọc)
 *  - Zalo từ chối rõ ràng (mã lỗi / thiếu token) → dự phòng FPT FNS 10233.
 *    Timeout / không có phản hồi → KHÔNG dự phòng (tránh khách nhận 2 tin).
 */

export const ZNS_TEMPLATE_FILTER_SERVICE = String(process.env.ZNS_TEMPLATE_ID_THAY_LOC || '643643');
export const FNS_TEMPLATE_SERVICE = String(process.env.FNS_TEMPLATE_ID_DICH_VU || '10233');
/** Thời hạn bảo hành lõi lọc sau khi thay (tháng) */
export const FILTER_WARRANTY_MONTHS = Number(process.env.FILTER_WARRANTY_MONTHS || 3);

/** Các mẫu tính là "tin hoàn thành dịch vụ thay lọc" (dùng cho chống gửi trùng) */
export const FILTER_SERVICE_TEMPLATE_IDS = [ZNS_TEMPLATE_FILTER_SERVICE, FNS_TEMPLATE_SERVICE];

export interface FilterServiceZnsInput {
  phone: string;
  customerName?: string | null;
  serviceCode: string;              // Mã dịch vụ / mã đơn hiển thị (Pancake)
  totalCollected: number | string;  // Tổng tiền thu thực tế
  serialNumber?: string | null;
  orderId?: string | null;
  reportId?: string | null;
  expiryDate?: string | null;       // DD/MM/YYYY — bỏ trống thì tự tính = hôm nay + FILTER_WARRANTY_MONTHS
}

export interface FilterServiceZnsResult {
  templateId: string;
  gateway: string;
  messageId: string | null;
  fallbackUsed: boolean;
  expiryDate: string;
  amount: number;
}

/** Tiền VNĐ là số nguyên: chuỗi kiểu "1.405.000" / "1,405,000đ" → 1405000 */
export function toVndAmount(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? Number(v.replace(/[^0-9]/g, '')) || 0 : Number(v) || 0;
  return Math.max(0, Math.round(n));
}

export function computeFilterExpiry(from: Date = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + FILTER_WARRANTY_MONTHS);
  return formatVnDate(d);
}

export async function sendFilterServiceZns(input: FilterServiceZnsInput): Promise<FilterServiceZnsResult> {
  const customerName = (input.customerName || 'Quý Khách').trim() || 'Quý Khách';
  const serviceCode = String(input.serviceCode || '').trim() || 'SRV';
  const amount = toVndAmount(input.totalCollected);
  const expiryDate = (input.expiryDate || '').trim() || computeFilterExpiry();

  const templateData = {
    _TEN_KHACH_HANG_: customerName.substring(0, 30),
    _ID_DON_HANG_: serviceCode.substring(0, 30),
    _TONG_TIEN_: amount, // CURRENCY: số nguyên, không dấu phân cách
    _NGAY_BAO_HANH_: expiryDate.substring(0, 30)
  };

  try {
    const res = await sendZaloDirectZns({
      phone: input.phone,
      templateId: ZNS_TEMPLATE_FILTER_SERVICE,
      templateData,
      trackingId: `TL-${serviceCode}-${Date.now()}`,
      log: {
        serialNumber: input.serialNumber || null,
        customerName,
        productName: `Dịch vụ Thay lọc: ${serviceCode}`,
        orderNumber: serviceCode,
        reportId: input.reportId || null
      }
    });
    return { templateId: ZNS_TEMPLATE_FILTER_SERVICE, gateway: res.gateway, messageId: res.messageId, fallbackUsed: false, expiryDate, amount };
  } catch (err: any) {
    if (!(err instanceof ZaloZnsError) || !err.definitive) {
      throw err; // Không chắc tin đã đi hay chưa → không gửi dự phòng
    }

    logger.warn('Zalo OA từ chối tin hoàn thành thay lọc, chuyển sang FPT FNS 10233 dự phòng', {
      templateId: ZNS_TEMPLATE_FILTER_SERVICE, error: err.message, code: err.code, serviceCode
    });

    const fns = await sendFnsServiceCompletion({
      recipientPhone: input.phone,
      customerName,
      serviceCode,
      totalCollected: amount,
      serialNumber: input.serialNumber || undefined,
      orderId: input.orderId || undefined,
      workType: 'Thay lọc',
      reportId: input.reportId || undefined
    });
    return {
      templateId: FNS_TEMPLATE_SERVICE,
      gateway: fns?.gateway || 'FPT FNS Gateway',
      messageId: fns?.data?.message_id || null,
      fallbackUsed: true,
      expiryDate,
      amount
    };
  }
}

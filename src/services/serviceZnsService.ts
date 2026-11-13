import logger from '../utils/logger';
import { sendZaloDirectZns, sendFnsServiceCompletion, ZaloZnsError } from './zaloService';
import { formatVnDate } from './installZnsService';

/**
 * TIN ZNS XÁC NHẬN HOÀN THÀNH DỊCH VỤ (gửi trực tiếp qua Zalo OA, tag TRANSACTION)
 *
 *  - Thay lọc            → mẫu 643643: _TEN_KHACH_HANG_, _ID_DON_HANG_, _TONG_TIEN_, _NGAY_BAO_HANH_ (hạn BH lõi lọc)
 *  - Bảo hành / Sửa chữa → mẫu 663746: _TEN_KHACH_HANG_, _ID_DON_HANG_, _TONG_TIEN_
 *  _ID_DON_HANG_ = mã dịch vụ / mã đơn; _TONG_TIEN_ kiểu CURRENCY (số nguyên, không dấu phân cách).
 *
 *  Zalo từ chối rõ ràng (mã lỗi / thiếu token) → dự phòng FPT FNS 10233.
 *  Timeout / không có phản hồi → KHÔNG dự phòng (tránh khách nhận 2 tin).
 */

export type ServiceZnsKind = 'FILTER' | 'REPAIR';

export const ZNS_TEMPLATE_FILTER_SERVICE = String(process.env.ZNS_TEMPLATE_ID_THAY_LOC || '643643');
export const ZNS_TEMPLATE_REPAIR_SERVICE = String(process.env.ZNS_TEMPLATE_ID_BH_SC || '663746');
export const FNS_TEMPLATE_SERVICE = String(process.env.FNS_TEMPLATE_ID_DICH_VU || '10233');
/** Thời hạn bảo hành lõi lọc sau khi thay (tháng) — áp dụng chung mọi loại lõi */
export const FILTER_WARRANTY_MONTHS = Number(process.env.FILTER_WARRANTY_MONTHS || 3);

/** Mẫu Zalo OA chính theo loại dịch vụ */
export function serviceTemplateId(kind: ServiceZnsKind): string {
  return kind === 'FILTER' ? ZNS_TEMPLATE_FILTER_SERVICE : ZNS_TEMPLATE_REPAIR_SERVICE;
}

/** Các mẫu tính là "đã gửi tin hoàn thành dịch vụ" cho loại này (chống gửi trùng) — gồm cả FNS 10233 đã gửi trước đây */
export function serviceTemplateIds(kind: ServiceZnsKind): string[] {
  return [serviceTemplateId(kind), FNS_TEMPLATE_SERVICE];
}

/** 'thay lọc' → FILTER; 'bảo hành' / 'sửa chữa' → REPAIR; khác → null */
export function getServiceZnsKind(workType?: string | null): ServiceZnsKind | null {
  const clean = (workType || '').trim().toLowerCase();
  if (clean === 'thay lọc') return 'FILTER';
  if (clean === 'bảo hành' || clean === 'sửa chữa') return 'REPAIR';
  return null;
}

export interface ServiceZnsInput {
  kind: ServiceZnsKind;
  phone: string;
  customerName?: string | null;
  serviceCode: string;              // Mã dịch vụ / mã đơn hiển thị (Pancake)
  totalCollected: number | string;  // Tổng tiền thu thực tế
  serialNumber?: string | null;
  orderId?: string | null;
  reportId?: string | null;
  workType?: string | null;         // Ghi log / FNS dự phòng
  expiryDate?: string | null;       // Chỉ FILTER: DD/MM/YYYY — bỏ trống thì = hôm nay + FILTER_WARRANTY_MONTHS
}

export interface ServiceZnsResult {
  templateId: string;
  gateway: string;
  messageId: string | null;
  fallbackUsed: boolean;
  expiryDate: string | null;
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

/** Dữ liệu điền vào mẫu Zalo OA (dùng cho gửi thật và bắn thử) */
export function buildServiceTemplateData(input: {
  kind: ServiceZnsKind;
  customerName?: string | null;
  serviceCode: string;
  totalCollected: number | string | null | undefined;
  expiryDate?: string | null;
}): { templateData: Record<string, string | number>; expiryDate: string | null; amount: number } {
  const customerName = (input.customerName || '').trim() || 'Quý Khách';
  const amount = toVndAmount(input.totalCollected);
  const templateData: Record<string, string | number> = {
    _TEN_KHACH_HANG_: customerName.substring(0, 30),
    _ID_DON_HANG_: (String(input.serviceCode || '').trim() || 'SRV').substring(0, 30),
    _TONG_TIEN_: amount
  };
  let expiryDate: string | null = null;
  if (input.kind === 'FILTER') {
    expiryDate = (input.expiryDate || '').trim() || computeFilterExpiry();
    templateData._NGAY_BAO_HANH_ = expiryDate.substring(0, 30);
  }
  return { templateData, expiryDate, amount };
}

export async function sendServiceCompletionZns(input: ServiceZnsInput): Promise<ServiceZnsResult> {
  const templateId = serviceTemplateId(input.kind);
  const { templateData, expiryDate, amount } = buildServiceTemplateData(input);
  const customerName = String(templateData._TEN_KHACH_HANG_);
  const serviceCode = String(templateData._ID_DON_HANG_);
  const workType = (input.workType || '').trim() || (input.kind === 'FILTER' ? 'Thay lọc' : 'Bảo hành / Sửa chữa');

  try {
    const res = await sendZaloDirectZns({
      phone: input.phone,
      templateId,
      templateData,
      trackingId: `${input.kind === 'FILTER' ? 'TL' : 'SC'}-${serviceCode}-${Date.now()}`,
      log: {
        serialNumber: input.serialNumber || null,
        customerName,
        productName: `Dịch vụ ${workType}: ${serviceCode}`,
        orderNumber: serviceCode,
        reportId: input.reportId || null
      }
    });
    return { templateId, gateway: res.gateway, messageId: res.messageId, fallbackUsed: false, expiryDate, amount };
  } catch (err: any) {
    if (!(err instanceof ZaloZnsError) || !err.definitive) {
      throw err; // Không chắc tin đã đi hay chưa → không gửi dự phòng
    }

    logger.warn('Zalo OA từ chối tin hoàn thành dịch vụ, chuyển sang FPT FNS 10233 dự phòng', {
      templateId, error: err.message, code: err.code, serviceCode, kind: input.kind
    });

    const fns = await sendFnsServiceCompletion({
      recipientPhone: input.phone,
      customerName,
      serviceCode,
      totalCollected: amount,
      serialNumber: input.serialNumber || undefined,
      orderId: input.orderId || undefined,
      workType,
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

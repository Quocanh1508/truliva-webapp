import prisma from '../config/database';
import logger from '../utils/logger';
import { formatZaloPhone, sendFnsServiceCompletion } from './zaloService';
import { sendInstallWarrantyZns, InstallZnsResult, INSTALL_TEMPLATE_IDS, ZNS_TEMPLATE_INSTALL_WATER } from './installZnsService';
import { sendFilterServiceZns, FilterServiceZnsResult, FILTER_SERVICE_TEMPLATE_IDS, ZNS_TEMPLATE_FILTER_SERVICE } from './filterServiceZnsService';

/**
 * GỬI TIN ZALO (ZNS/FNS) THEO BÁO CÁO KTV
 *
 * Quy tắc:
 *  - Ca Lắp đặt / Giao hàng và lắp đặt  → Template 10232 (kích hoạt bảo hành)
 *  - Ca Thay lọc                         → Zalo OA 643643 (hoàn thành thay lọc + hạn BH lõi), dự phòng FNS 10233
 *  - Ca Bảo hành / Sửa chữa              → Template 10233 (xác nhận hoàn thành dịch vụ)
 *  - Chỉ gửi khi báo cáo đã APPROVED. Báo cáo PENDING sẽ tự gửi khi Admin/Điều phối duyệt.
 *  - Số nhận tin là `znsPhone` do KTV xác nhận khi nộp báo cáo. Không có `znsPhone` → không tự động gửi.
 *  - Chống gửi trùng: đã có tin SUCCESS cùng mẫu + cùng SĐT cho cùng báo cáo / mã đơn / serial thì bỏ qua,
 *    trừ khi gửi lại thủ công có `force = true`.
 */

const INSTALL_WORK_TYPES = ['lắp đặt', 'giao hàng và lắp đặt'];
const SERVICE_WORK_TYPES = ['thay lọc', 'bảo hành', 'sửa chữa'];

export type ReportZnsKind = 'INSTALL' | 'SERVICE';

export type ReportZnsStatus =
  | 'SENT'
  | 'ALREADY_SENT'
  | 'PENDING_APPROVAL'
  | 'NOT_APPLICABLE'
  | 'NO_PHONE'
  | 'FAILED';

export interface ReportZnsResult {
  status: ReportZnsStatus;
  message: string;
  phone?: string;
  templateId?: string;
  serviceCode?: string;
  messageId?: string | null;
  sentAt?: Date;
}

// Chặn 2 yêu cầu gửi song song cho cùng một báo cáo (bấm 2 lần, đồng bộ offline trùng...)
const inFlight = new Set<string>();

export function getReportZnsKind(workType?: string | null): ReportZnsKind | null {
  const clean = (workType || '').trim().toLowerCase();
  if (INSTALL_WORK_TYPES.includes(clean)) return 'INSTALL';
  if (SERVICE_WORK_TYPES.includes(clean)) return 'SERVICE';
  return null;
}

export function isFilterWorkType(workType?: string | null): boolean {
  return (workType || '').trim().toLowerCase() === 'thay lọc';
}

export function isValidZnsPhone(phone?: string | null): boolean {
  const formatted = formatZaloPhone((phone || '').trim());
  return /^84\d{9}$/.test(formatted);
}

function buildServiceCode(order: { id: string; pancakeOrderId: number | null } | null, fallback: string): string {
  if (order) {
    if (order.pancakeOrderId !== null && order.pancakeOrderId !== undefined) {
      return order.pancakeOrderId < 0 ? `M${Math.abs(order.pancakeOrderId)}` : String(order.pancakeOrderId);
    }
    return order.id.slice(-6).toUpperCase();
  }
  return fallback;
}

function templateIdFor(kind: ReportZnsKind, isFilter: boolean): string {
  if (kind === 'INSTALL') return ZNS_TEMPLATE_INSTALL_WATER; // mẫu thực tế (666024/666039 hoặc FNS dự phòng) do installZnsService quyết định
  if (isFilter) return ZNS_TEMPLATE_FILTER_SERVICE;          // 643643, hoặc FNS 10233 nếu phải dự phòng
  return String(process.env.FNS_TEMPLATE_ID_DICH_VU || '10233');
}

/**
 * Gửi tin Zalo cho một báo cáo. Không bao giờ throw — mọi lỗi trả về dạng `status: 'FAILED'`.
 */
export async function sendReportZns(
  reportId: string,
  opts: { trigger: 'CREATE' | 'UPDATE' | 'APPROVE' | 'MANUAL'; phoneOverride?: string; force?: boolean }
): Promise<ReportZnsResult> {
  if (inFlight.has(reportId)) {
    return { status: 'ALREADY_SENT', message: 'Tin nhắn cho báo cáo này đang được gửi, vui lòng chờ trong giây lát.' };
  }
  inFlight.add(reportId);

  try {
    const report = await prisma.serviceReport.findUnique({
      where: { id: reportId },
      include: {
        order: { select: { id: true, pancakeOrderId: true, totalPrice: true, workType: true } }
      }
    });

    if (!report) {
      return { status: 'FAILED', message: 'Không tìm thấy báo cáo' };
    }

    const workType = report.workType || report.order?.workType || '';
    const kind = getReportZnsKind(workType);
    if (!kind) {
      return { status: 'NOT_APPLICABLE', message: `Loại công việc "${workType || 'không xác định'}" không gửi tin Zalo` };
    }

    if (report.approvalStatus === 'PENDING') {
      return {
        status: 'PENDING_APPROVAL',
        message: 'Báo cáo đang chờ duyệt. Tin nhắn Zalo sẽ tự động gửi khi Admin/Điều phối duyệt báo cáo.'
      };
    }
    if (report.approvalStatus !== 'APPROVED') {
      return { status: 'NOT_APPLICABLE', message: 'Báo cáo đã bị từ chối hoặc đã được thay thế, không gửi tin Zalo.' };
    }

    const rawPhone = (opts.phoneOverride || report.znsPhone || '').trim();
    if (!rawPhone) {
      return { status: 'NO_PHONE', message: 'Báo cáo chưa có số Zalo nhận tin được xác nhận.' };
    }
    if (!isValidZnsPhone(rawPhone)) {
      return { status: 'FAILED', message: `Số điện thoại "${rawPhone}" không hợp lệ để nhận tin Zalo.`, phone: rawPhone };
    }

    // Lưu lại số Zalo đã dùng nếu KTV đổi số khi gửi lại thủ công
    if (opts.phoneOverride && rawPhone !== (report.znsPhone || '')) {
      await prisma.serviceReport.update({ where: { id: report.id }, data: { znsPhone: rawPhone } });
    }

    const formattedPhone = formatZaloPhone(rawPhone);
    const isFilter = kind === 'SERVICE' && isFilterWorkType(workType);
    let templateId = templateIdFor(kind, isFilter);
    const serial = (report.serialNumber || '').trim();
    const hasValidSerial = !!serial && !/^X+$/i.test(serial);
    const serviceCode = buildServiceCode(report.order, hasValidSerial ? serial : 'SRV');

    // ── Chống gửi trùng ──
    if (!opts.force) {
      const sameTarget: any[] = [{ reportId: report.id }];
      if (kind === 'SERVICE') sameTarget.push({ orderNumber: serviceCode });
      if (kind === 'INSTALL') {
        if (report.order) sameTarget.push({ orderNumber: serviceCode });
        if (hasValidSerial) sameTarget.push({ serialNumber: serial });
      }
      const templateFilter = kind === 'INSTALL'
        ? { in: INSTALL_TEMPLATE_IDS }
        : isFilter ? { in: FILTER_SERVICE_TEMPLATE_IDS } : templateId;

      const previous = await prisma.znsMessageLog.findFirst({
        where: { status: 'SUCCESS', templateId: templateFilter, phone: formattedPhone, OR: sameTarget },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true, messageId: true }
      });

      if (previous) {
        return {
          status: 'ALREADY_SENT',
          message: `Tin nhắn đã được gửi tới ${rawPhone} lúc ${previous.sentAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
          phone: rawPhone,
          templateId,
          serviceCode,
          messageId: previous.messageId,
          sentAt: previous.sentAt
        };
      }
    }

    let result: any;
    let installInfo: InstallZnsResult | null = null;
    let filterInfo: FilterServiceZnsResult | null = null;
    if (kind === 'INSTALL') {
      installInfo = await sendInstallWarrantyZns({
        phone: rawPhone,
        customerName: report.customerName,
        serialNumber: hasValidSerial ? serial : null,
        orderId: report.orderId,
        orderCode: report.order ? serviceCode : null,
        productNames: report.products || [],
        reportId: report.id
      });
      templateId = installInfo.templateId;
      result = { data: { message_id: installInfo.messageId } };
    } else if (isFilter) {
      filterInfo = await sendFilterServiceZns({
        phone: rawPhone,
        customerName: report.customerName,
        serviceCode,
        totalCollected: report.actualAmount ?? report.order?.totalPrice ?? 0,
        serialNumber: hasValidSerial ? serial : null,
        orderId: report.orderId,
        reportId: report.id
      });
      templateId = filterInfo.templateId;
      result = { data: { message_id: filterInfo.messageId } };
    } else {
      const totalCollected = report.actualAmount ?? report.order?.totalPrice ?? 0;
      result = await sendFnsServiceCompletion({
        recipientPhone: rawPhone,
        customerName: report.customerName || 'Quý Khách',
        serviceCode,
        totalCollected,
        serialNumber: hasValidSerial ? serial : undefined,
        orderId: report.orderId || undefined,
        workType,
        reportId: report.id
      });
    }

    logger.info('Report ZNS sent', { reportId: report.id, trigger: opts.trigger, kind, templateId, phone: formattedPhone, force: !!opts.force });

    return {
      status: 'SENT',
      message: kind === 'INSTALL'
        ? `Đã gửi tin kích hoạt bảo hành (${installInfo?.productName}, hạn ${installInfo?.expiryDate}) tới Zalo ${rawPhone}${installInfo?.fallbackUsed ? ' qua kênh dự phòng FNS' : ''}.`
        : filterInfo
          ? `Đã gửi tin hoàn thành thay lọc (Mã ${serviceCode}, bảo hành lõi đến ${filterInfo.expiryDate}) tới Zalo ${rawPhone}${filterInfo.fallbackUsed ? ' qua kênh dự phòng FNS' : ''}.`
          : `Đã gửi tin xác nhận hoàn thành dịch vụ (Mã ${serviceCode}) tới Zalo ${rawPhone}.`,
      phone: rawPhone,
      templateId,
      serviceCode,
      messageId: result?.data?.message_id || null,
      sentAt: new Date()
    };
  } catch (err: any) {
    logger.error('Report ZNS send failed', { reportId, trigger: opts.trigger, error: err.message, details: err.response?.data });
    if (err?.name === 'ZaloZnsError' && err.definitive === false) {
      return {
        status: 'FAILED',
        message: 'Không nhận được phản hồi từ Zalo, tin có thể đã đến khách. Vui lòng kiểm tra lịch sử ZNS trước khi gửi lại.'
      };
    }
    return { status: 'FAILED', message: `Gửi tin Zalo thất bại: ${err.message}` };
  } finally {
    inFlight.delete(reportId);
  }
}

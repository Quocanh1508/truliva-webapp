import prisma from '../config/database';
import logger from '../utils/logger';
import { formatZaloPhone } from './zaloService';
import { sendInstallWarrantyZns, InstallZnsResult, INSTALL_TEMPLATE_IDS, ZNS_TEMPLATE_INSTALL_WATER } from './installZnsService';
import { sendServiceCompletionZns, ServiceZnsResult, getServiceZnsKind, serviceTemplateId, serviceTemplateIds } from './serviceZnsService';

/**
 * GỬI TIN ZALO (ZNS/FNS) THEO BÁO CÁO KTV
 *
 * Quy tắc:
 *  - Ca Lắp đặt / Giao hàng và lắp đặt  → Zalo OA 666024 / 666039 (kích hoạt bảo hành), dự phòng FNS 10232
 *  - Ca Thay lọc                         → Zalo OA 643643 (hoàn thành thay lọc + hạn BH lõi), dự phòng FNS 10233
 *  - Ca Bảo hành / Sửa chữa              → Zalo OA 663746 (xác nhận hoàn thành dịch vụ), dự phòng FNS 10233
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
    // Mẫu thực tế (666024/666039, hoặc FNS dự phòng) do service con quyết định sau khi gửi
    const serviceKind = kind === 'SERVICE' ? getServiceZnsKind(workType) : null;
    let templateId = serviceKind ? serviceTemplateId(serviceKind) : ZNS_TEMPLATE_INSTALL_WATER;
    const serial = (report.serialNumber || '').trim();
    const hasValidSerial = !!serial && !/^X+$/i.test(serial);
    const serviceCode = buildServiceCode(report.order, hasValidSerial ? serial : 'SRV');

    // ── Chống gửi trùng ──
    if (!opts.force) {
      const sameTarget: any[] = [{ reportId: report.id }];
      // Chỉ so mã đơn khi báo cáo gắn đơn thật — mã dự phòng ('SRV' / serial) không định danh được 1 ca
      if (report.order) sameTarget.push({ orderNumber: serviceCode });
      if (kind === 'INSTALL' && hasValidSerial) sameTarget.push({ serialNumber: serial });
      const templateFilter = { in: serviceKind ? serviceTemplateIds(serviceKind) : INSTALL_TEMPLATE_IDS };

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
    let serviceInfo: ServiceZnsResult | null = null;
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
    } else {
      serviceInfo = await sendServiceCompletionZns({
        kind: serviceKind || 'REPAIR',
        phone: rawPhone,
        customerName: report.customerName,
        serviceCode,
        totalCollected: report.actualAmount ?? report.order?.totalPrice ?? 0,
        serialNumber: hasValidSerial ? serial : null,
        orderId: report.orderId,
        reportId: report.id,
        workType
      });
      templateId = serviceInfo.templateId;
      result = { data: { message_id: serviceInfo.messageId } };
    }

    logger.info('Report ZNS sent', { reportId: report.id, trigger: opts.trigger, kind, templateId, phone: formattedPhone, force: !!opts.force });

    return {
      status: 'SENT',
      message: kind === 'INSTALL'
        ? `Đã gửi tin kích hoạt bảo hành (${installInfo?.productName}, hạn ${installInfo?.expiryDate}) tới Zalo ${rawPhone}${installInfo?.fallbackUsed ? ' qua kênh dự phòng FNS' : ''}.`
        : serviceKind === 'FILTER'
          ? `Đã gửi tin hoàn thành thay lọc (Mã ${serviceCode}, bảo hành lõi đến ${serviceInfo?.expiryDate}) tới Zalo ${rawPhone}${serviceInfo?.fallbackUsed ? ' qua kênh dự phòng FNS' : ''}.`
          : `Đã gửi tin xác nhận hoàn thành dịch vụ (Mã ${serviceCode}) tới Zalo ${rawPhone}${serviceInfo?.fallbackUsed ? ' qua kênh dự phòng FNS' : ''}.`,
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

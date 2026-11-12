import prisma from '../config/database';
import logger from '../utils/logger';
import { sendZaloDirectZns, sendZnsWarrantyActivation, ZaloZnsError } from './zaloService';

/**
 * TIN ZNS KÍCH HOẠT BẢO HÀNH CHO CA LẮP ĐẶT / GIAO HÀNG LẮP ĐẶT / KHÁCH TỰ KÍCH HOẠT
 *
 *  - Sản phẩm thuộc danh mục máy lọc nước (Water CT / UTS / WM Device) → mẫu Zalo 666024
 *  - Sản phẩm khác (vòi sen, máy lọc không khí...)                     → mẫu Zalo 666039
 *  Tham số: _TEN_KHACH_HANG_, _TEN_SAN_PHAM_, _ID_BAO_HANH_, _NGAY_BAO_HANH_ (ngày HẾT HẠN bảo hành)
 *
 *  Gửi trực tiếp qua Zalo OA. Nếu Zalo từ chối rõ ràng (mã lỗi / thiếu token) → dự phòng FPT FNS 10232.
 *  Timeout / không có phản hồi → KHÔNG dự phòng (tránh khách nhận 2 tin).
 */

export const WATER_PURIFIER_CATEGORIES = ['water ct device', 'water uts device', 'water wm device'];

export const ZNS_TEMPLATE_INSTALL_WATER = String(process.env.ZNS_TEMPLATE_ID_LAP_DAT_MAY_LOC || '666024');
export const ZNS_TEMPLATE_INSTALL_OTHER = String(process.env.ZNS_TEMPLATE_ID_LAP_DAT_KHAC || '666039');
export const FNS_TEMPLATE_INSTALL_FALLBACK = String(process.env.FNS_TEMPLATE_ID_LAP_DAT || '10232');

/** Tất cả mẫu tính là "tin kích hoạt bảo hành" (dùng cho chống gửi trùng) */
export const INSTALL_TEMPLATE_IDS = [ZNS_TEMPLATE_INSTALL_WATER, ZNS_TEMPLATE_INSTALL_OTHER, FNS_TEMPLATE_INSTALL_FALLBACK];

export interface InstallZnsInput {
  phone: string;
  customerName?: string | null;
  serialNumber?: string | null;     // Có thể là 'XXXXX' với sản phẩm không có serial
  orderId?: string | null;
  orderCode?: string | null;        // Mã đơn hiển thị (Pancake), dùng làm mã bảo hành khi không có serial
  productNames?: string[];          // Tên sản phẩm trong đơn / báo cáo
  reportId?: string | null;
}

export interface InstallZnsResult {
  templateId: string;
  gateway: string;
  messageId: string | null;
  fallbackUsed: boolean;
  productName: string;
  warrantyId: string;
  expiryDate: string;
  isWaterPurifier: boolean;
}

function isValidSerial(sn?: string | null): sn is string {
  const s = (sn || '').trim();
  return !!s && !/^X+$/i.test(s);
}

function formatDate(d: Date): string {
  const vn = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  return `${String(vn.getDate()).padStart(2, '0')}/${String(vn.getMonth() + 1).padStart(2, '0')}/${vn.getFullYear()}`;
}

/** Bỏ hậu tố số lượng kiểu "Tên sản phẩm x2" */
function cleanProductName(name: string): string {
  return name.replace(/\s*x\s*\d+\s*$/i, '').trim();
}

function isPurifierCategory(category?: string | null): boolean {
  return WATER_PURIFIER_CATEGORIES.includes((category || '').trim().toLowerCase());
}

interface ProductPick {
  name: string;
  category: string | null;
  isWaterPurifier: boolean;
}

/** Tìm danh mục của serial bằng cách so dòng máy / model với tên sản phẩm */
async function pickFromSerial(serial: { model: string; productLine: string | null }): Promise<ProductPick> {
  const keys = [serial.productLine, serial.model].filter((k): k is string => !!k && k.trim().length >= 3);
  for (const key of keys) {
    const p = await prisma.product.findFirst({
      where: { name: { contains: key.trim(), mode: 'insensitive' }, category: { not: null } },
      select: { name: true, category: true }
    });
    if (p) {
      return { name: serial.productLine || p.name, category: p.category, isWaterPurifier: isPurifierCategory(p.category) };
    }
  }
  // Không khớp được sản phẩm nào: serial bảo hành điện tử chủ yếu là máy lọc nước / nóng lạnh
  const text = `${serial.productLine || ''} ${serial.model}`.toLowerCase();
  const looksLikePurifier = text.includes('lọc nước') || text.includes('nóng lạnh') || /\bur\d{3,}/i.test(text);
  return { name: serial.productLine || serial.model, category: null, isWaterPurifier: looksLikePurifier };
}

/**
 * Chọn sản phẩm đại diện để gửi tin:
 *  1) Sản phẩm thuộc danh mục máy lọc nước (khớp tên chính xác)
 *  2) Tên combo có chứa tên một máy lọc nước (VD: "Máy lọc nước Truliva UR3626 + Vòi nóng")
 *  3) Serial của báo cáo là máy lọc nước
 *  4) Thiết bị khác (category có "device") → 5) SP không phải lõi lọc / linh kiện → 6) SP đầu tiên
 */
async function pickProduct(productNames: string[], serial: { model: string; productLine: string | null } | null): Promise<ProductPick | null> {
  const names = Array.from(new Set(productNames.map(cleanProductName).filter(Boolean)));

  if (names.length > 0) {
    const products = await prisma.product.findMany({
      where: { name: { in: names, mode: 'insensitive' } },
      select: { name: true, category: true }
    });
    const withCat = names.map(n => {
      const p = products.find(x => x.name.toLowerCase() === n.toLowerCase());
      return { name: p?.name || n, category: p?.category || null };
    });

    const purifier = withCat.find(p => isPurifierCategory(p.category));
    if (purifier) return { ...purifier, isWaterPurifier: true };

    // Tên combo / tên ghép: tìm máy lọc nước có tên nằm trong chuỗi (ưu tiên tên dài nhất = khớp cụ thể nhất)
    const unmatched = withCat.filter(p => !p.category).map(p => p.name.toLowerCase());
    if (unmatched.length > 0) {
      const purifierProducts = await prisma.product.findMany({
        where: { OR: WATER_PURIFIER_CATEGORIES.map(c => ({ category: { equals: c, mode: 'insensitive' as const } })) },
        select: { name: true, category: true }
      });
      const hit = purifierProducts
        .filter(pp => pp.name.trim().length >= 8 && unmatched.some(u => u.includes(pp.name.trim().toLowerCase())))
        .sort((a, b) => b.name.length - a.name.length)[0];
      if (hit) return { name: hit.name, category: hit.category, isWaterPurifier: true };
    }

    if (serial) {
      const fromSerial = await pickFromSerial(serial);
      if (fromSerial.isWaterPurifier) return fromSerial;
    }

    const device = withCat.find(p => (p.category || '').toLowerCase().includes('device'));
    if (device) return { ...device, isWaterPurifier: false };

    const notConsumable = withCat.find(p => {
      const c = (p.category || '').toLowerCase();
      return c && !c.includes('filter') && !c.includes('spare part');
    });
    if (notConsumable) return { ...notConsumable, isWaterPurifier: false };

    return { ...withCat[0], isWaterPurifier: false };
  }

  // Không có danh sách sản phẩm (VD: khách tự kích hoạt) → suy ra từ serial
  if (serial) return pickFromSerial(serial);

  return null;
}

async function computeExpiryFromPolicy(productName: string): Promise<Date> {
  const policies = await prisma.warrantyPolicy.findMany();
  const lower = productName.toLowerCase();
  const matched = policies.find(p => lower.includes(p.modelKeyword.toLowerCase()));
  const months = matched?.warrantyMonths || 12;
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Tính toán mẫu + dữ liệu tin (KHÔNG gửi). Dùng cho gửi thật và để kiểm tra/xem trước.
 */
export async function resolveInstallZnsPlan(input: InstallZnsInput) {
  const serialInput = (input.serialNumber || '').trim().toUpperCase();
  const serial = isValidSerial(serialInput)
    ? await prisma.serial.findFirst({
        where: { OR: [{ serialNumber: serialInput }, { serialNumber: serialInput.replace(/[-_]/g, '') }] },
        select: { serialNumber: true, model: true, productLine: true, warrantyExpiryDate: true, customerName: true }
      })
    : null;

  let productNames = input.productNames || [];
  if (productNames.length === 0 && input.orderId) {
    const items = await prisma.orderItem.findMany({ where: { orderId: input.orderId }, select: { productName: true } });
    productNames = items.map(i => i.productName || '').filter(Boolean);
  }

  const pick = await pickProduct(productNames, serial);

  // Máy lọc nước có serial: ưu tiên tên dòng máy của serial cho chính xác model
  let productName = pick?.name || serial?.productLine || serial?.model || 'Sản phẩm Truliva';
  if (pick?.isWaterPurifier && serial?.productLine) productName = serial.productLine;

  const isWaterPurifier = pick ? pick.isWaterPurifier : !!serial;
  const templateId = isWaterPurifier ? ZNS_TEMPLATE_INSTALL_WATER : ZNS_TEMPLATE_INSTALL_OTHER;

  const warrantyId = serial?.serialNumber || (isValidSerial(serialInput) ? serialInput : '') || input.orderCode || 'N/A';
  const expiry = serial?.warrantyExpiryDate ? new Date(serial.warrantyExpiryDate) : await computeExpiryFromPolicy(productName);
  const expiryDate = formatDate(expiry);
  const customerName = (input.customerName || serial?.customerName || 'Quý Khách').trim();

  const templateData = {
    _TEN_KHACH_HANG_: customerName.substring(0, 30),
    _TEN_SAN_PHAM_: productName.substring(0, 200),
    _ID_BAO_HANH_: warrantyId.substring(0, 30),
    _NGAY_BAO_HANH_: expiryDate
  };

  const logInfo = {
    serialNumber: serial?.serialNumber || (isValidSerial(serialInput) ? serialInput : null),
    customerName,
    productName,
    orderNumber: input.orderCode || null,
    reportId: input.reportId || null
  };

  return { templateId, templateData, logInfo, productName, warrantyId, expiryDate, isWaterPurifier, customerName, category: pick?.category || null };
}

export async function sendInstallWarrantyZns(input: InstallZnsInput): Promise<InstallZnsResult> {
  const { templateId, templateData, logInfo, productName, warrantyId, expiryDate, isWaterPurifier, customerName } = await resolveInstallZnsPlan(input);

  try {
    const res = await sendZaloDirectZns({
      phone: input.phone,
      templateId,
      templateData,
      trackingId: `BH-${warrantyId}-${Date.now()}`,
      log: logInfo
    });
    return { templateId, gateway: res.gateway, messageId: res.messageId, fallbackUsed: false, productName, warrantyId, expiryDate, isWaterPurifier };
  } catch (err: any) {
    if (!(err instanceof ZaloZnsError) || !err.definitive) {
      throw err; // Không chắc tin đã đi hay chưa → không gửi dự phòng
    }

    logger.warn('Zalo OA từ chối tin kích hoạt bảo hành, chuyển sang FPT FNS dự phòng', {
      templateId, error: err.message, code: err.code, warrantyId
    });

    const fns = await sendZnsWarrantyActivation(warrantyId, input.phone, 12, {
      customerName,
      productName,
      expiryDateStr: expiryDate,
      reportId: input.reportId || undefined,
      orderNumber: input.orderCode || undefined
    });
    return {
      templateId: FNS_TEMPLATE_INSTALL_FALLBACK,
      gateway: fns?.gateway || 'FPT FNS Gateway',
      messageId: fns?.data?.message_id || null,
      fallbackUsed: true,
      productName,
      warrantyId,
      expiryDate,
      isWaterPurifier
    };
  }
}

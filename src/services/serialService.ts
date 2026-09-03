import prisma from '../config/database';
import logger from '../utils/logger';
import { activateSerialWarranty } from './warrantyService';
import { sendZnsWarrantyActivation } from './zaloService';

/**
 * Parse ngày tháng từ giá trị ô Excel
 */
export function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      const hour = match[4] ? parseInt(match[4], 10) : 0;
      const minute = match[5] ? parseInt(match[5], 10) : 0;
      const second = match[6] ? parseInt(match[6], 10) : 0;
      const date = new Date(year, month, day, hour, minute, second);
      if (!isNaN(date.getTime())) return date;
    }
    const isoDate = new Date(trimmed);
    if (!isNaN(isoDate.getTime())) return isoDate;
  }
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    if (!isNaN(date.getTime())) return date;
  }
  return null;
}

/**
 * Chuẩn hóa số serial: trim, uppercase, loại bỏ ký tự đặc biệt
 */
export function cleanSerialNumber(serial: string): string {
  return serial.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
}

/**
 * Lấy giá trị string từ cell Excel
 */
export function getCellText(cell: any): string {
  if (!cell) return '';
  const value = cell.value !== undefined ? cell.value : cell;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.richText) {
    return value.richText.map((rt: any) => rt.text || '').join('');
  }
  if (typeof value === 'object' && value.text) {
    return String(value.text);
  }
  return String(value).trim();
}

/**
 * Preview warranty duration based on model and orderId
 */
export async function getPreviewDuration(modelInput: string, orderId?: string) {
  const model = (modelInput || '').trim();
  const isUR5840 = model.toUpperCase().includes('UR5840');
  let standardMonths = isUR5840 ? 24 : 12;

  if (model) {
    const policies = await prisma.warrantyPolicy.findMany();
    const matchedPolicy = policies.find((p: any) => 
      model.toLowerCase().includes(p.modelKeyword.toLowerCase())
    );
    if (matchedPolicy) {
      standardMonths = matchedPolicy.warrantyMonths;
    }
  }

  let promoMonths = 0;
  let promoCode = null;

  if (orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { promoCode: true }
    });
    if (order && order.promoCode) {
      if (isUR5840 && order.promoCode.trim().toUpperCase() === '12THANGBH') {
        promoMonths = 0;
        promoCode = order.promoCode;
      } else {
        const promo = await prisma.warrantyPromo.findUnique({
          where: { code: order.promoCode }
        });
        if (promo && !promo.isLocked) {
          const now = new Date();
          const isStarted = !promo.startDate || now >= new Date(promo.startDate);
          const isNotExpired = !promo.endDate || now <= new Date(promo.endDate);
          const isModelApplicable = !promo.applicableModels || 
                                   promo.applicableModels.length === 0 || 
                                   promo.applicableModels.some(kw => 
                                     model.toLowerCase().includes(kw.toLowerCase())
                                   );
          if (isStarted && isNotExpired && isModelApplicable) {
            promoMonths = promo.promoMonths;
            promoCode = order.promoCode;
          }
        }
      }
    }
  }

  return {
    standardMonths,
    promoMonths,
    totalMonths: standardMonths + promoMonths,
    promoCode
  };
}

/**
 * Check serial info for public activation page
 */
export async function checkSerialPublicInfo(serialNumber: string, orderId?: string) {
  const cleaned = cleanSerialNumber(serialNumber);
  const serial = await prisma.serial.findUnique({
    where: { serialNumber: cleaned }
  });

  if (!serial) return null;

  let standardMonths = 12;
  const policies = await prisma.warrantyPolicy.findMany();
  const matchedPolicy = policies.find((p: any) => 
    serial.model.toLowerCase().includes(p.modelKeyword.toLowerCase())
  );
  if (matchedPolicy) {
    standardMonths = matchedPolicy.warrantyMonths;
  }

  let promoMonths = 0;
  let promoCode = null;

  if (orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { promoCode: true }
    });
    if (order && order.promoCode) {
      const promo = await prisma.warrantyPromo.findUnique({
        where: { code: order.promoCode }
      });
      if (promo && !promo.isLocked) {
        const now = new Date();
        const isStarted = !promo.startDate || now >= new Date(promo.startDate);
        const isNotExpired = !promo.endDate || now <= new Date(promo.endDate);
        const isModelApplicable = !promo.applicableModels || 
                                 promo.applicableModels.length === 0 || 
                                 promo.applicableModels.some(kw => 
                                   serial.model.toLowerCase().includes(kw.toLowerCase())
                                 );
        if (isStarted && isNotExpired && isModelApplicable) {
          promoMonths = promo.promoMonths;
          promoCode = order.promoCode;
        }
      }
    }
  }

  const isActivated = serial.status === 'Đã kích hoạt' || serial.status === 'KH xác nhận';

  return {
    serialNumber: serial.serialNumber,
    model: serial.model,
    status: serial.status,
    isActivated,
    standardMonths,
    promoMonths,
    totalMonths: standardMonths + promoMonths,
    promoCode,
    activationDate: isActivated ? serial.activationDate : null,
    warrantyExpiryDate: isActivated ? serial.warrantyExpiryDate : null
  };
}

/**
 * Search serials with filters and stats
 */
export async function getSerialsFiltered(params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  modelFilter?: string;
  batchFilter?: string;
}) {
  const { page, limit, search, status, modelFilter, batchFilter } = params;
  const skip = (page - 1) * limit;

  const where: any = {};

  if (search) {
    where.OR = [
      { serialNumber: { contains: search, mode: 'insensitive' } },
      { customerName: { contains: search, mode: 'insensitive' } },
      { customerPhone: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (status) {
    if (status === 'Đã hết hạn') {
      where.status = { in: ['Đã kích hoạt', 'KH xác nhận'] };
      where.warrantyExpiryDate = { lt: new Date() };
    } else if (status === 'Đã kích hoạt') {
      where.status = 'Đã kích hoạt';
      where.OR = [
        { warrantyExpiryDate: null },
        { warrantyExpiryDate: { gte: new Date() } }
      ];
    } else if (status === 'KH xác nhận') {
      where.status = 'KH xác nhận';
      where.OR = [
        { warrantyExpiryDate: null },
        { warrantyExpiryDate: { gte: new Date() } }
      ];
    } else {
      where.status = status;
    }
  }

  if (modelFilter) {
    where.model = { contains: modelFilter, mode: 'insensitive' };
  }

  if (batchFilter) {
    where.importBatchId = batchFilter;
  }

  const [serials, total] = await Promise.all([
    prisma.serial.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        importedBy: {
          select: { fullName: true, username: true, email: true }
        }
      }
    }),
    prisma.serial.count({ where }),
  ]);

  const now = new Date();
  const [totalAll, activated, unactivated, confirmed, pending, expired, valid] = await Promise.all([
    prisma.serial.count(),
    prisma.serial.count({ where: { status: 'Đã kích hoạt' } }),
    prisma.serial.count({ where: { status: 'Chưa kích hoạt' } }),
    prisma.serial.count({ where: { status: 'KH xác nhận' } }),
    prisma.serial.count({ where: { status: 'Chờ duyệt' } }),
    prisma.serial.count({
      where: {
        status: { in: ['Đã kích hoạt', 'KH xác nhận'] },
        warrantyExpiryDate: { lt: now }
      }
    }),
    prisma.serial.count({
      where: {
        status: { in: ['Đã kích hoạt', 'KH xác nhận'] },
        OR: [
          { warrantyExpiryDate: null },
          { warrantyExpiryDate: { gte: now } }
        ]
      }
    }),
  ]);

  return {
    serials,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    stats: {
      total: totalAll,
      activated,
      unactivated,
      confirmed,
      pending,
      expired,
      valid,
    },
  };
}

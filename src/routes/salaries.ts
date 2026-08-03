import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import ExcelJS from 'exceljs';
import path from 'path';

const router = Router();

// Helper to normalize phone numbers for matching
function normalizePhone(phone: any): string {
  if (phone === null || phone === undefined) return '';
  const str = String(phone).replace(/\D/g, ''); // keep only digits
  if (str.startsWith('84')) {
    return str.substring(2);
  }
  if (str.startsWith('0')) {
    return str.substring(1);
  }
  return str;
}

// Map workType to the Station rate fields
function getRateType(workType: string | null | undefined): 'giaoHang' | 'baoHanh' | 'suaChua' | 'thayLoc' | 'lapDat' | 'giaoHangLapDat' | 'thaoLapLai' {
  if (!workType) return 'baoHanh';
  const normalized = workType.toLowerCase().trim();
  if (normalized.includes('tháo máy & lắp đặt lại') || normalized.includes('tháo máy và lắp đặt lại') || normalized.includes('tháo lắp') || normalized.includes('thao_lap_lai')) {
    return 'thaoLapLai';
  }
  if (normalized.includes('giao hàng và lắp đặt') || normalized.includes('giao_hang_lap_dat') || normalized.includes('giao lắp')) {
    return 'giaoHangLapDat';
  }
  if (normalized.includes('giao hàng') || normalized.includes('giao_hang')) {
    return 'giaoHang';
  }
  if (normalized.includes('thay lọc') || normalized.includes('thay_loc') || normalized.includes('thay lõi')) {
    return 'thayLoc';
  }
  if (normalized.includes('lắp đặt') || normalized.includes('lap_dat') || normalized.includes('lắp mới') || normalized.includes('lắp lại')) {
    return 'lapDat';
  }
  if (normalized.includes('sửa chữa') || normalized.includes('sua_chua') || normalized.includes('sửa máy')) {
    return 'suaChua';
  }
  return 'baoHanh';
}

// Official Truliva KTV rates (from Quy định tính lương Kỹ thuật viên Máy lọc nước Truliva.docx)
function getOfficialTrulivaBaseRate(workType: string | null | undefined): number {
  if (!workType) return 60000;
  const normalized = workType.toLowerCase().trim();

  if (normalized.includes('tháo máy & lắp đặt lại') || normalized.includes('tháo máy và lắp đặt lại')) {
    return 160000;
  }
  if (normalized.includes('giao hàng và lắp đặt') || normalized.includes('giao_hang_lap_dat') || normalized.includes('giao lắp')) {
    return 120000;
  }
  if (normalized.includes('lắp đặt') || normalized.includes('lap_dat') || normalized.includes('lắp mới') || normalized.includes('lắp lại')) {
    return 100000;
  }
  if (normalized.includes('bảo hành') || normalized.includes('sửa chữa') || normalized.includes('tháo máy')) {
    return 60000;
  }
  if (normalized.includes('thay lọc') || normalized.includes('thay_loc') || normalized.includes('thay lõi')) {
    return 40000;
  }
  if (normalized.includes('giao hàng') || normalized.includes('giao_hang')) {
    return 20000;
  }
  return 60000;
}

// Flat rates for unlisted external KTVs
function getKtvFlatRate(workType: string | null | undefined): number {
  if (!workType) return 120000;
  const normalized = workType.toLowerCase().trim();
  if (normalized.includes('giao hàng và lắp đặt') || normalized.includes('giao_hang_lap_dat') || normalized.includes('giao lắp')) {
    return 120000;
  }
  if (normalized.includes('lắp đặt') || normalized.includes('lap_dat')) {
    return 100000;
  }
  if (normalized.includes('bảo hành') || normalized.includes('sửa chữa')) {
    return 60000;
  }
  if (normalized.includes('thay lọc') || normalized.includes('thay_loc') || normalized.includes('thay lõi')) {
    return 40000;
  }
  if (normalized.includes('giao hàng') || normalized.includes('giao_hang')) {
    return 0;
  }
  return 60000;
}

// Load Station rates from Excel spreadsheet ("cơ cấu tính lương.xlsx")
async function loadStationRates(): Promise<Map<string, any>> {
  const ratesMap = new Map<string, any>();
  try {
    const fs = require('fs');
    const workbook = new ExcelJS.Workbook();
    let filePath = path.join(process.cwd(), 'SalaryDoc', 'cơ cấu tính lương.xlsx');
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.cwd(), 'SalaryDoc', 'Cơ cấu tính chi phí Trạm KT_KTV Truliva.xlsx');
    }
    
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      logger.warn('Worksheet not found in Excel file');
      return ratesMap;
    }

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < 4) return;

      // Helper to extract string from possible ExcelJS formula cell {formula, result}
      const getStr = (val: any): string => {
        if (val === null || val === undefined) return '';
        if (typeof val === 'object' && val.result !== undefined) return String(val.result);
        return String(val);
      };

      const province = getStr(row.getCell(1).value).trim();
      const status = getStr(row.getCell(2).value).trim();
      const contactName = getStr(row.getCell(4).value).trim();
      const contactPhoneRaw = row.getCell(5).value;

      if (status === 'Ngừng HĐ' || !contactPhoneRaw) return;

      const phones = getStr(contactPhoneRaw)
        .split(/[\n,;/\\&]+/)
        .map(p => normalizePhone(p.trim()))
        .filter(p => p.length > 0);

      const getNum = (val: any) => {
        if (val === null || val === undefined || val === '') return 0;
        // ExcelJS formula cells return { formula: '...', result: <number> }
        if (typeof val === 'object' && val.result !== undefined) {
          val = val.result;
        }
        const num = Number(String(val).replace(/,/g, ''));
        return isNaN(num) ? 0 : num;
      };

      const notes = (getStr(row.getCell(30).value) || getStr(row.getCell(29).value) || '').trim();
      let kmRate = getNum(row.getCell(29).value) || getNum(row.getCell(28).value) || 3000;
      let freeKmThreshold = 20;
      let noDistanceCost = false;

      // Special Rules from Notes / Phone Number
      if (phones.includes('913092258')) {
        // Nguyễn Văn Thế (Quảng Trị): >40km, 4000đ/km
        freeKmThreshold = 40;
        kmRate = 4000;
      } else if (phones.includes('949601622')) {
        // Lưu Đức Thắng: >20km, 4000đ/km
        freeKmThreshold = 20;
        kmRate = 4000;
      } else if (notes.toLowerCase().includes('không khoảng cách')) {
        noDistanceCost = true;
      }

      const isOfficialTruliva = phones.includes('392110073') || contactName.includes('Thuận');

      const rateInfo = {
        province,
        contactName,
        isOfficialTruliva,
        rates: {
          giaoHang: getNum(row.getCell(17).value),
          baoHanh: getNum(row.getCell(18).value),
          thayLoc: getNum(row.getCell(19).value),
          lapDat: getNum(row.getCell(20).value),
          giaoHangLapDat: getNum(row.getCell(21).value),
        },
        kmRate,
        freeKmThreshold,
        noDistanceCost,
        notes
      };

      for (const phone of phones) {
        ratesMap.set(phone, rateInfo);
      }
    });
  } catch (error: any) {
    logger.error('Failed to load station rates from Excel', { error: error.message });
  }
  return ratesMap;
}

// Single source of truth calculation helper for a single service report
function calculateReportCost(report: any, ktvPhoneNorm: string, stationRate: any, customKtvRatesMap?: Map<string, number>) {
  let baseCost = 0;
  let distanceCost = 0;
  const workType = report.workType || report.order?.workType || 'Bảo hành';
  const rateType = getRateType(workType);
  const notes = (report.notes || report.order?.note || '').toLowerCase();
  
  // Chỉ duy nhất Nguyễn Minh Thuận (0392110073) thuộc Luồng KTV Trạm Truliva
  const isOfficialTrulivaKtv = ktvPhoneNorm === '392110073';

  // 1. Ghi đè thủ công theo ca cụ thể
  if (report.customBaseCost !== null && report.customBaseCost !== undefined) {
    baseCost = report.customBaseCost;
  } 
  // 2. LUỒNG 1: KTV Trạm Truliva (Nguyễn Minh Thuận)
  else if (isOfficialTrulivaKtv) {
    if (customKtvRatesMap && customKtvRatesMap.has(rateType) && (customKtvRatesMap.get(rateType) ?? 0) > 0) {
      baseCost = customKtvRatesMap.get(rateType)!;
    } else {
      baseCost = getOfficialTrulivaBaseRate(workType);
    }
    // Thưởng tăng ca / hoàn thành cho KTV trạm Truliva (+100.000đ)
    if (notes.includes('hoàn thành') || notes.includes('tăng ca')) {
      baseCost += 100000;
    }
  } 
  // 3. LUỒNG 2: KTV Ngoại / Trạm Ngoài (Song song với Luồng 1)
  else {
    // 3.1. Ưu tiên 1: Giá tùy chỉnh trong Ma trận đơn giá (nếu có)
    if (customKtvRatesMap && customKtvRatesMap.has(rateType) && (customKtvRatesMap.get(rateType) ?? 0) > 0) {
      baseCost = customKtvRatesMap.get(rateType)!;
    } else if (rateType === 'suaChua' && customKtvRatesMap && customKtvRatesMap.has('baoHanh') && (customKtvRatesMap.get('baoHanh') ?? 0) > 0) {
      // Phí Sửa chữa bằng Phí Bảo hành nếu không được cài riêng
      baseCost = customKtvRatesMap.get('baoHanh')!;
    }
    // 3.2. Ưu tiên 2: Đơn giá theo File Excel Trạm Kỹ Thuật
    else if (stationRate) {
      if (stationRate.province === 'TP.HCM' && rateType === 'giaoHangLapDat' && notes.includes('giao lắp')) {
        baseCost = 250000;
      } else {
        const specificRate = stationRate.rates[rateType] || (rateType === 'suaChua' ? stationRate.rates['baoHanh'] : null);
        baseCost = (specificRate !== undefined && specificRate !== null && specificRate > 0) 
          ? specificRate 
          : getKtvFlatRate(workType);
      }
    } 
    // 3.3. Ưu tiên 3: Flat Rate mặc định cho KTV ngoài
    else {
      baseCost = getKtvFlatRate(workType);
    }
  }

  // Distance Allowance
  const distance = report.distanceKm ?? 0;
  
  let kmRate = 3000;
  let threshold = 20;

  if (customKtvRatesMap && customKtvRatesMap.has('kmRate') && (customKtvRatesMap.get('kmRate') ?? 0) > 0) {
    kmRate = customKtvRatesMap.get('kmRate')!;
  } else if (stationRate?.kmRate) {
    kmRate = stationRate.kmRate;
  }

  // Tách biệt ngưỡng di chuyển theo loại công việc:
  // - Nếu là ca Thay Lọc ('thayLoc') hoặc Sửa Chữa ('suaChua'): ngưỡng mặc định 50km (hoặc tùy chỉnh)
  // - Nếu là các ca khác (Lắp đặt, Giao hàng, Giao lắp, Bảo hành): ngưỡng mặc định 20km (hoặc tùy chỉnh)
  const isTLSC = rateType === 'thayLoc' || rateType === 'suaChua';

  if (isTLSC) {
    threshold = 50;
    if (customKtvRatesMap && customKtvRatesMap.has('freeKmThresholdTLSC') && customKtvRatesMap.get('freeKmThresholdTLSC') !== undefined) {
      threshold = customKtvRatesMap.get('freeKmThresholdTLSC')!;
    } else if (stationRate?.freeKmThresholdTLSC) {
      threshold = stationRate.freeKmThresholdTLSC;
    }
  } else {
    threshold = 20;
    if (customKtvRatesMap && customKtvRatesMap.has('freeKmThreshold') && customKtvRatesMap.get('freeKmThreshold') !== undefined) {
      threshold = customKtvRatesMap.get('freeKmThreshold')!;
    } else if (stationRate?.freeKmThreshold) {
      threshold = stationRate.freeKmThreshold;
    }
  }

  if (!stationRate?.noDistanceCost) {
    if (distance > threshold) {
      distanceCost = (distance - threshold) * kmRate;
    }
  }

  return {
    workType,
    rateType: getRateType(workType),
    baseCost,
    distance,
    distanceCost,
    totalCost: baseCost + distanceCost
  };
}

// Single source of truth breakdown calculation for a single service report
function getReportCostBreakdown(report: any, ktvPhoneNorm: string, stationRate: any, userCustomRates?: Map<string, number>) {
  const costResult = calculateReportCost(report, ktvPhoneNorm, stationRate, userCustomRates);
  const customCostsObj = (report.customCosts as any) || {};
  const hasManualOverride = report.customBaseCost !== null && report.customBaseCost !== undefined;

  const baoHanhCost = (hasManualOverride && customCostsObj.baoHanhCost !== undefined)
    ? Number(customCostsObj.baoHanhCost)
    : (costResult.rateType === 'baoHanh' ? costResult.baseCost : 0);

  const suaChuaCost = (hasManualOverride && customCostsObj.suaChuaCost !== undefined)
    ? Number(customCostsObj.suaChuaCost)
    : (costResult.rateType === 'suaChua' ? costResult.baseCost : 0);

  const giaoHangCost = (hasManualOverride && customCostsObj.giaoHangCost !== undefined)
    ? Number(customCostsObj.giaoHangCost)
    : (costResult.rateType === 'giaoHang' ? costResult.baseCost : 0);

  const lapDatCost = (hasManualOverride && customCostsObj.lapDatCost !== undefined)
    ? Number(customCostsObj.lapDatCost)
    : (costResult.rateType === 'lapDat' ? costResult.baseCost : 0);

  const giaoLapCost = (hasManualOverride && customCostsObj.giaoLapCost !== undefined)
    ? Number(customCostsObj.giaoLapCost)
    : (costResult.rateType === 'giaoHangLapDat' ? costResult.baseCost : 0);

  const thayLocCost = (hasManualOverride && customCostsObj.thayLocCost !== undefined)
    ? Number(customCostsObj.thayLocCost)
    : (costResult.rateType === 'thayLoc' ? costResult.baseCost : 0);

  const distanceCost = customCostsObj.distanceCost !== undefined
    ? Number(customCostsObj.distanceCost)
    : costResult.distanceCost;

  const otherCost = customCostsObj.otherCost !== undefined
    ? Number(customCostsObj.otherCost)
    : (report.additionalCost || 0);

  const totalReportCost = baoHanhCost + suaChuaCost + giaoHangCost + lapDatCost + giaoLapCost + thayLocCost + distanceCost + otherCost;

  return {
    workType: costResult.workType,
    rateType: costResult.rateType,
    baseCost: costResult.baseCost,
    distance: costResult.distance,
    distanceCost,
    baoHanhCost,
    suaChuaCost,
    giaoHangCost,
    lapDatCost,
    giaoLapCost,
    thayLocCost,
    otherCost,
    totalCost: totalReportCost
  };
}

/**
 * GET /api/salaries/calculate
 * Calculate estimated salary for a given month (MM/YYYY)
 */
router.get('/calculate', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const month = req.query.month as string;
    if (!month || !/^\d{2}\/\d{4}$/.test(month)) {
      res.status(400).json({ error: 'Định dạng tháng không hợp lệ. Vui lòng chọn MM/YYYY (VD: 07/2026)' });
      return;
    }

    // 1. Get all KTVs
    const ktvs = await prisma.user.findMany({
      where: { role: 'KTV', isActive: true },
      select: {
        id: true,
        fullName: true,
        username: true,
        phoneNumber: true,
        techStation: {
          select: {
            name: true,
            mainStation: { select: { name: true } }
          }
        }
      }
    });

    // 2. Load station rates & DB custom KTV rates
    const stationRates = await loadStationRates();
    const dbCustomRates = await prisma.ktvServiceRate.findMany();
    const customKtvRatesByUser = new Map<string, Map<string, number>>();
    for (const r of dbCustomRates) {
      if (!customKtvRatesByUser.has(r.userId)) {
        customKtvRatesByUser.set(r.userId, new Map());
      }
      customKtvRatesByUser.get(r.userId)!.set(r.workType, r.rate);
    }

    // 3. Get existing records to preserve manual overrides
    const savedRecords = await prisma.salaryRecord.findMany({
      where: { month }
    });
    const savedRecordsMap = new Map(savedRecords.map(r => [r.userId, r]));

    // 4. Calculate for each KTV
    const result = [];
    for (const ktv of ktvs) {
      // Tính toán khoảng ngày bắt đầu - kết thúc của tháng (dựa trên thời gian hoàn thành báo cáo createdAt)
      const [mStr, yStr] = month.split('/');
      const mNum = Number(mStr);
      const yNum = Number(yStr);

      const monthVariants = [
        month,
        `${mNum}/${yNum}`,
        `${String(mNum).padStart(2, '0')}/${yNum}`
      ];

      const startDate = new Date(Date.UTC(yNum, mNum - 1, 1, 0, 0, 0, 0));
      const endDate = new Date(Date.UTC(yNum, mNum, 0, 23, 59, 59, 999));

      const reports = await prisma.serviceReport.findMany({
        where: {
          ktvUserId: ktv.id,
          approvalStatus: 'APPROVED',
          OR: [
            { month: { in: monthVariants } },
            { createdAt: { gte: startDate, lte: endDate } }
          ]
        },
        include: { order: true }
      });

      // Find Excel row match for Station rates
      const ktvPhoneNorm = normalizePhone(ktv.phoneNumber);
      const stationRate = ktvPhoneNorm ? stationRates.get(ktvPhoneNorm) : null;
      const isStationPaid = !!stationRate;
      const userCustomRates = customKtvRatesByUser.get(ktv.id);

      let calculatedCost = 0;
      const reportsDetail = [];

      for (const report of reports) {
        const breakdown = getReportCostBreakdown(report, ktvPhoneNorm, stationRate, userCustomRates);
        const isSunday = new Date(report.createdAt).getDay() === 0;

        calculatedCost += breakdown.totalCost;

        reportsDetail.push({
          reportId: report.id,
          orderId: report.orderId,
          pancakeOrderId: report.order?.pancakeOrderId,
          customerName: report.customerName,
          customerPhone: report.customerPhone || report.order?.billPhoneNumber || '',
          province: report.province || '',
          address: report.address || '',
          orderNote: report.order?.note || null,
          reportNote: report.notes || null,
          workType: breakdown.workType,
          isSunday,
          baseCost: breakdown.baseCost,
          distance: breakdown.distance,
          distanceCost: breakdown.distanceCost,
          baoHanhCost: breakdown.baoHanhCost,
          suaChuaCost: breakdown.suaChuaCost,
          giaoHangCost: breakdown.giaoHangCost,
          lapDatCost: breakdown.lapDatCost,
          giaoLapCost: breakdown.giaoLapCost,
          thayLocCost: breakdown.thayLocCost,
          otherCost: breakdown.otherCost,
          totalCost: breakdown.totalCost,
          rateType: breakdown.rateType,
          customCosts: report.customCosts || null,
          createdAt: report.createdAt,
          appointmentTime: report.order?.appointmentTime,
          ktvCalledAt: report.order?.ktvCalledAt,
          products: report.products
        });
      }

      const saved = savedRecordsMap.get(ktv.id);
      const isFinal = saved?.status === 'FINAL';

      // Nếu tháng đã KHÓA (FINAL), bảo lưu tuyệt đối con số lịch sử đã chốt!
      // Nếu tháng chưa khóa (DRAFT hoặc chưa lưu), cập nhật con số mới nhất theo Ma trận đơn giá.
      const finalCalculatedCost = isFinal ? saved.calculatedCost : calculatedCost;
      const finalAdjustedCost = isFinal 
        ? saved.adjustedCost 
        : (saved ? (saved.adjustmentNote ? saved.adjustedCost : calculatedCost) : calculatedCost);
      
      result.push({
        userId: ktv.id,
        fullName: ktv.fullName,
        username: ktv.username,
        phoneNumber: ktv.phoneNumber || 'Không có',
        stationName: ktv.techStation?.name || (stationRate ? stationRate.province : 'Không có'),
        mainStationName: ktv.techStation?.mainStation?.name || 'Không có',
        isStationPaid,
        stationRateInfo: isStationPaid ? {
          stationName: stationRate.stationName,
          role: stationRate.role
        } : null,
        casesCount: reports.length,
        calculatedCost: finalCalculatedCost,
        adjustedCost: finalAdjustedCost,
        adjustmentNote: saved ? saved.adjustmentNote : '',
        status: saved ? saved.status : 'DRAFT',
        cases: reportsDetail
      });
    }

    res.json({ month, salaries: result });
  } catch (error: any) {
    logger.error('Calculate salaries error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi tính toán thù lao' });
  }
});

/**
 * POST /api/salaries/save
 * Save draft salary records
 */
router.post('/save', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { month, salaries } = req.body;
    if (!month || !/^\d{2}\/\d{4}$/.test(month)) {
      res.status(400).json({ error: 'Định dạng tháng không hợp lệ (MM/YYYY)' });
      return;
    }
    if (!Array.isArray(salaries)) {
      res.status(400).json({ error: 'Dữ liệu thù lao không hợp lệ' });
      return;
    }

    const savedRecords = [];
    for (const item of salaries) {
      const { userId, calculatedCost, adjustedCost, adjustmentNote } = item;
      if (!userId) continue;

      const existing = await prisma.salaryRecord.findUnique({
        where: { month_userId: { month, userId } }
      });

      // Nếu bản ghi tháng này đã CHỐT (FINAL) -> Không được ghi đè!
      if (existing && existing.status === 'FINAL') {
        continue;
      }

      // Upsert record
      const record = await prisma.salaryRecord.upsert({
        where: {
          month_userId: { month, userId }
        },
        create: {
          month,
          userId,
          calculatedCost: Number(calculatedCost) || 0,
          adjustedCost: Number(adjustedCost) ?? Number(calculatedCost) ?? 0,
          adjustmentNote: adjustmentNote || '',
          status: 'DRAFT'
        },
        update: {
          calculatedCost: Number(calculatedCost) || 0,
          adjustedCost: Number(adjustedCost) ?? Number(calculatedCost) ?? 0,
          adjustmentNote: adjustmentNote || '',
        }
      });
      savedRecords.push(record);
    }

    logger.info('Draft salary records saved', { month, count: savedRecords.length });
    res.json({ message: 'Lưu nháp thành công', count: savedRecords.length });
  } catch (error: any) {
    logger.error('Save salary records error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi lưu nháp bảng thù lao' });
  }
});

/**
 * POST /api/salaries/lock
 * Lock salary records for a month (Lock changes)
 */
router.post('/lock', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.body;
    if (!month || !/^\d{2}\/\d{4}$/.test(month)) {
      res.status(400).json({ error: 'Định dạng tháng không hợp lệ (MM/YYYY)' });
      return;
    }

    // Mark all existing salary records of this month as FINAL
    const updated = await prisma.salaryRecord.updateMany({
      where: { month },
      data: { status: 'FINAL' }
    });

    logger.info('Salary records locked', { month, count: updated.count });
    res.json({ message: 'Chốt và khóa bảng thù lao thành công', count: updated.count });
  } catch (error: any) {
    logger.error('Lock salary records error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi chốt bảng thù lao' });
  }
});

/**
 * POST /api/salaries/update-base-cost
 * Update custom base cost or specific cost breakdown (customCosts) for a report
 */
router.post('/update-base-cost', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { reportId, baseCost, customCosts, fieldName, fieldValue } = req.body;
    if (!reportId) {
      res.status(400).json({ error: 'Thiếu reportId' });
      return;
    }

    const currentReport = await prisma.serviceReport.findUnique({
      where: { id: reportId },
      select: { customCosts: true, customBaseCost: true }
    });

    let newCustomCosts = (currentReport?.customCosts as any) || {};

    if (customCosts && typeof customCosts === 'object') {
      newCustomCosts = { ...newCustomCosts, ...customCosts };
    }

    let updatedCustomBaseCost = baseCost !== undefined ? (baseCost !== null ? Number(baseCost) : null) : currentReport?.customBaseCost;

    if (fieldName) {
      const numVal = fieldValue === '' || fieldValue === null ? 0 : Number(fieldValue);
      newCustomCosts[fieldName] = isNaN(numVal) ? 0 : numVal;
      if (fieldName !== 'otherCost' && fieldName !== 'distanceCost') {
        updatedCustomBaseCost = isNaN(numVal) ? null : numVal;
      }
    }

    await prisma.serviceReport.update({
      where: { id: reportId },
      data: {
        customBaseCost: updatedCustomBaseCost,
        customCosts: newCustomCosts
      }
    });

    res.json({ success: true, message: 'Cập nhật đơn giá ca thành công' });
  } catch (error: any) {
    logger.error('Update custom base cost error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi cập nhật đơn giá ca' });
  }
});

/**
 * POST /api/salaries/add-custom-case
 * Admin tự thêm ca / mục phí dịch vụ bổ sung vào bảng lương chi tiết
 */
router.post('/add-custom-case', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { month, ktvUserId, customerName, customerPhone, province, address, workType, amount, otherCost, notes } = req.body;

    if (!month || !ktvUserId || !customerName) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin bắt buộc (Tháng, KTV, Tên ca/khách hàng)' });
      return;
    }

    const costNum = amount === '' || amount === null ? 0 : Number(amount);
    const otherCostNum = otherCost === '' || otherCost === null ? 0 : Number(otherCost);

    const workTypeStr = workType || 'Phí khác';
    const rateType = getRateType(workTypeStr);

    const customCosts: Record<string, number> = {
      baoHanhCost: rateType === 'baoHanh' ? costNum : 0,
      giaoHangCost: rateType === 'giaoHang' ? costNum : 0,
      lapDatCost: rateType === 'lapDat' ? costNum : 0,
      giaoLapCost: rateType === 'giaoHangLapDat' ? costNum : 0,
      thayLocCost: rateType === 'thayLoc' ? costNum : 0,
      distanceCost: 0,
      otherCost: otherCostNum
    };

    const newReport = await prisma.serviceReport.create({
      data: {
        month,
        ktvUserId,
        customerName,
        customerPhone: customerPhone || '0900000000',
        province: province || 'Khác',
        address: address || '',
        serviceType: workTypeStr,
        workType: workTypeStr,
        notes: notes || 'Thêm ca / chi phí dịch vụ bổ sung',
        products: [],
        imageUrls: [],
        customBaseCost: costNum,
        customCosts,
        additionalCost: otherCostNum,
        approvalStatus: 'APPROVED'
      }
    });

    logger.info('Admin added custom salary case', { month, ktvUserId, customerName, amount: costNum });
    res.json({ success: true, report: newReport, message: 'Thêm ca / chi phí bổ sung thành công!' });
  } catch (error: any) {
    logger.error('Add custom salary case error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi thêm ca / chi phí bổ sung' });
  }
});

/**
 * GET /api/salaries/export
 * Export payroll to Excel
 */
router.get('/export', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const month = req.query.month as string;
    const ktvId = req.query.ktvId as string | undefined;
    const stationId = req.query.stationId as string | undefined;
    const mainStationId = req.query.mainStationId as string | undefined;
    const workTypeFilter = req.query.workType as string | undefined;
    const completedDate = req.query.completedDate as string | undefined;
    const searchQuery = (req.query.search as string || req.query.q as string || '').trim().toLowerCase();

    if (!month || !/^\d{2}\/\d{4}$/.test(month)) {
      res.status(400).json({ error: 'Định dạng tháng không hợp lệ (MM/YYYY)' });
      return;
    }

    const [mStr, yStr] = month.split('/');
    const mNum = Number(mStr);
    const yNum = Number(yStr);

    const monthVariants = [
      month,
      `${mNum}/${yNum}`,
      `${String(mNum).padStart(2, '0')}/${yNum}`
    ];

    const startDate = new Date(Date.UTC(yNum, mNum - 1, 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(yNum, mNum, 0, 23, 59, 59, 999));

    const ktvIdsList = ktvId ? ktvId.split(',').map(s => s.trim()).filter(Boolean) : [];
    const stationIdsList = stationId ? stationId.split(',').map(s => s.trim()).filter(Boolean) : [];
    const mainStationIdsList = mainStationId ? mainStationId.split(',').map(s => s.trim()).filter(Boolean) : [];
    const workTypesList = workTypeFilter ? workTypeFilter.split(',').map(s => s.trim()).filter(Boolean) : [];

    const parsedTechNames = stationIdsList.map(s => s.includes('::') ? s.split('::')[1] : s).filter(Boolean);
    const parsedMainNames = mainStationIdsList.map(s => s.includes('::') ? s.split('::')[0] : s).filter(Boolean);

    // 1. Load KTVs according to filter
    const ktvWhere: Prisma.UserWhereInput = {
      role: 'KTV',
      isActive: true
    };

    if (ktvIdsList.length > 0) {
      ktvWhere.id = { in: ktvIdsList };
    }
    if (stationIdsList.length > 0) {
      ktvWhere.OR = [
        { techStationId: { in: stationIdsList } },
        { techStation: { name: { in: parsedTechNames } } },
        { techStation: { id: { in: stationIdsList } } }
      ];
    }
    if (mainStationIdsList.length > 0) {
      ktvWhere.techStation = {
        mainStation: {
          OR: [
            { id: { in: mainStationIdsList } },
            { name: { in: parsedMainNames } },
            { name: { in: mainStationIdsList } }
          ]
        }
      };
    }

    let ktvs = await prisma.user.findMany({
      where: ktvWhere,
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        techStation: { select: { name: true } }
      }
    });

    if (searchQuery) {
      ktvs = ktvs.filter(k => 
        k.fullName.toLowerCase().includes(searchQuery) || 
        (k.phoneNumber && k.phoneNumber.toLowerCase().includes(searchQuery))
      );
    }

    // 2. Load Excel rates
    const stationRates = await loadStationRates();

    // 3. Load saved DB records
    const savedRecords = await prisma.salaryRecord.findMany({
      where: { month }
    });
    const savedMap = new Map(savedRecords.map(r => [r.userId, r]));

    // Build common ServiceReport filter helper
    const buildReportWhere = (targetKtvId?: string): Prisma.ServiceReportWhereInput => {
      const reportWhere: Prisma.ServiceReportWhereInput = {
        approvalStatus: 'APPROVED',
        OR: [
          { month: { in: monthVariants } },
          { createdAt: { gte: startDate, lte: endDate } }
        ]
      };

      if (targetKtvId) {
        reportWhere.ktvUserId = targetKtvId;
      } else if (ktvIdsList.length > 0) {
        reportWhere.ktvUserId = { in: ktvIdsList };
      }

      if (stationIdsList.length > 0) {
        reportWhere.ktvUser = {
          ...((reportWhere.ktvUser as any) || {}),
          OR: [
            { techStationId: { in: stationIdsList } },
            { techStation: { name: { in: parsedTechNames } } },
            { techStation: { id: { in: stationIdsList } } }
          ]
        };
      }

      if (mainStationIdsList.length > 0) {
        reportWhere.ktvUser = {
          ...((reportWhere.ktvUser as any) || {}),
          techStation: {
            mainStation: {
              OR: [
                { id: { in: mainStationIdsList } },
                { name: { in: parsedMainNames } },
                { name: { in: mainStationIdsList } }
              ]
            }
          }
        };
      }

      if (workTypesList.length > 0) {
        const orConds = workTypesList.map(w => ({
          OR: [
            { workType: { contains: w, mode: 'insensitive' as const } },
            { serviceType: { contains: w, mode: 'insensitive' as const } }
          ]
        }));
        reportWhere.AND = [
          ...((reportWhere.AND as any[]) || []),
          { OR: orConds }
        ];
      }

      if (completedDate) {
        let compStart: Date;
        let compEnd: Date;
        if (completedDate.includes('/')) {
          const [d, m, y] = completedDate.split('/');
          compStart = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0));
          compEnd = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999));
        } else {
          compStart = new Date(`${completedDate}T00:00:00.000Z`);
          compEnd = new Date(`${completedDate}T23:59:59.999Z`);
        }
        reportWhere.createdAt = { gte: compStart, lte: compEnd };
      }

      return reportWhere;
    };

    const matchSearch = (r: any, ktvName?: string, ktvPhone?: string) => {
      if (!searchQuery) return true;
      const target = [
        ktvName || r.ktvUser?.fullName || '',
        ktvPhone || r.ktvUser?.phoneNumber || '',
        r.customerName || '',
        r.customerPhone || '',
        r.province || '',
        r.notes || '',
        r.order?.orderSourceId || '',
        String(r.order?.pancakeOrderId || '')
      ].join(' ').toLowerCase();
      return target.includes(searchQuery);
    };

    const workbook = new ExcelJS.Workbook();

    // ==========================================
    // SHEET 1: TỔNG HỢP THÙ LAO KTV
    // ==========================================
    const wsSummary = workbook.addWorksheet('Tong_Hop_KTV');

    // Title Block
    wsSummary.addRow(['CÔNG TY TNHH THƯƠNG MẠI VÀ DỊCH VỤ PURE VITA']);
    wsSummary.addRow(['Nhãn hàng Máy lọc nước Truliva']);
    wsSummary.addRow([`BẢNG TỔNG HỢP CHI PHÍ VẬN HÀNH THÙ LAO KTV - THÁNG ${month}`]);

    wsSummary.getRow(1).font = { size: 13, bold: true, color: { argb: 'FF1B3A6B' } };
    wsSummary.getRow(2).font = { size: 10, italic: true, color: { argb: 'FF4B5563' } };
    wsSummary.getRow(3).font = { size: 14, bold: true, color: { argb: 'FF1B3A6B' } };

    // Columns config for Sheet 1 (Row 5 Header)
    const summaryHeaders = ['STT', 'Tên KTV', 'Số điện thoại', 'Trạm quản lý', 'Số ca hoàn thành', 'Thù lao tự động (VND)', 'Thực nhận (VND)', 'Ghi chú điều chỉnh', 'Trạng thái'];
    
    // Rows list for Summary Sheet
    const summaryRowsData: any[] = [];
    let summaryIdx = 1;
    let sumTotalCases = 0;
    let sumCalculated = 0;
    let sumAdjusted = 0;

    for (const ktv of ktvs) {
      let reports = await prisma.serviceReport.findMany({
        where: buildReportWhere(ktv.id),
        include: { order: true }
      });

      if (searchQuery) {
        reports = reports.filter(r => matchSearch(r, ktv.fullName, ktv.phoneNumber || ''));
      }

      // Skip KTVs with 0 reports if workType or completedDate filter is active
      if (reports.length === 0 && (workTypesList.length > 0 || completedDate)) {
        continue;
      }

      const ktvPhoneNorm = normalizePhone(ktv.phoneNumber);
      const stationRate = ktvPhoneNorm ? stationRates.get(ktvPhoneNorm) : null;
      let calculatedCost = 0;

      for (const report of reports) {
        const costResult = calculateReportCost(report, ktvPhoneNorm, stationRate);
        calculatedCost += costResult.totalCost;
      }

      const saved = savedMap.get(ktv.id);
      const calculated = calculatedCost;
      const adjusted = saved ? saved.adjustedCost : calculatedCost;
      const note = saved ? saved.adjustmentNote : '';
      const status = saved ? (saved.status === 'FINAL' ? 'Đã chốt' : 'Nháp') : (reports.length > 0 ? 'Nháp' : 'Chưa lưu');

      sumTotalCases += reports.length;
      sumCalculated += calculated;
      sumAdjusted += adjusted;

      summaryRowsData.push([
        summaryIdx++,
        ktv.fullName,
        ktv.phoneNumber || '',
        ktv.techStation?.name || '',
        reports.length,
        calculated,
        adjusted,
        note,
        status
      ]);
    }

    const hasSummaryRows = summaryRowsData.length > 0;
    const lastSummaryDataRow = hasSummaryRows ? 5 + summaryRowsData.length : 5;

    // Top Summary Row Sheet 1 (Row 4 - Always visible above filter)
    const topSummaryRow1 = wsSummary.addRow([
      'TỔNG CỘNG THEO BỘ LỌC:',
      '', '', '',
      hasSummaryRows ? { formula: `SUBTOTAL(109, E6:E${lastSummaryDataRow})`, result: sumTotalCases } : 0,
      hasSummaryRows ? { formula: `SUBTOTAL(109, F6:F${lastSummaryDataRow})`, result: sumCalculated } : 0,
      hasSummaryRows ? { formula: `SUBTOTAL(109, G6:G${lastSummaryDataRow})`, result: sumAdjusted } : 0,
      '', ''
    ]);
    wsSummary.mergeCells(`A4:D4`);
    topSummaryRow1.font = { bold: true, color: { argb: 'FF1B3A6B' } };
    topSummaryRow1.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };
    topSummaryRow1.getCell(1).alignment = { horizontal: 'center' };
    topSummaryRow1.getCell(5).alignment = { horizontal: 'center' };
    topSummaryRow1.getCell(6).numFmt = '#,##0';
    topSummaryRow1.getCell(7).numFmt = '#,##0';

    const summaryHeaderRow = wsSummary.addRow(summaryHeaders);
    summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B3A6B' } // Truliva Navy
    };
    summaryHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };

    summaryRowsData.forEach(rowData => {
      const row = wsSummary.addRow(rowData);
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(6).numFmt = '#,##0';
      row.getCell(7).numFmt = '#,##0';
      row.getCell(9).alignment = { horizontal: 'center' };
    });

    // Bottom Total Row Sheet 1
    const totalRowSheet1 = wsSummary.addRow([
      'TỔNG CỘNG',
      '', '', '',
      hasSummaryRows ? { formula: `SUBTOTAL(109, E6:E${lastSummaryDataRow})`, result: sumTotalCases } : 0,
      hasSummaryRows ? { formula: `SUBTOTAL(109, F6:F${lastSummaryDataRow})`, result: sumCalculated } : 0,
      hasSummaryRows ? { formula: `SUBTOTAL(109, G6:G${lastSummaryDataRow})`, result: sumAdjusted } : 0,
      '', ''
    ]);
    wsSummary.mergeCells(`A${totalRowSheet1.number}:D${totalRowSheet1.number}`);
    totalRowSheet1.font = { bold: true };
    totalRowSheet1.getCell(1).alignment = { horizontal: 'center' };
    totalRowSheet1.getCell(5).alignment = { horizontal: 'center' };
    totalRowSheet1.getCell(6).numFmt = '#,##0';
    totalRowSheet1.getCell(7).numFmt = '#,##0';
    totalRowSheet1.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };

    // Set AutoFilter and column widths Sheet 1
    const autoFilterEndRow = hasSummaryRows ? lastSummaryDataRow : 5;
    wsSummary.autoFilter = `A5:I${autoFilterEndRow}`;
    [8, 25, 16, 22, 16, 22, 22, 35, 15].forEach((w, i) => {
      wsSummary.getColumn(i + 1).width = w;
    });

    // Style borders Sheet 1
    wsSummary.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };
        });
      }
    });

    // ==========================================
    // SHEET 2: CHI TIẾT CA DỊCH VỤ (KTV / TRẠM)
    // ==========================================
    const wsDetail = workbook.addWorksheet('Chi_Tiet_Ca_Dich_Vu');

    // Title Block Sheet 2
    wsDetail.addRow(['CÔNG TY TNHH THƯƠNG MẠI VÀ DỊCH VỤ PURE VITA']);
    wsDetail.addRow(['Nhãn hàng Máy lọc nước Truliva']);
    wsDetail.addRow([`BẢNG TỔNG HỢP CHI PHÍ CA DỊCH VỤ CHI TIẾT - THÁNG ${month}`]);

    wsDetail.getRow(1).font = { size: 13, bold: true, color: { argb: 'FF1B3A6B' } };
    wsDetail.getRow(2).font = { size: 10, italic: true, color: { argb: 'FF4B5563' } };
    wsDetail.getRow(3).font = { size: 14, bold: true, color: { argb: 'FF1B3A6B' } };

    // Fetch all approved reports matching filters
    let reports = await prisma.serviceReport.findMany({
      where: buildReportWhere(),
      include: {
        ktvUser: {
          select: {
            fullName: true,
            phoneNumber: true,
            techStation: { select: { name: true } }
          }
        },
        order: true
      },
      orderBy: { createdAt: 'asc' }
    });

    if (searchQuery) {
      reports = reports.filter(r => matchSearch(r));
    }

    // Load DB custom KTV rates for export
    const dbCustomRates = await prisma.ktvServiceRate.findMany();
    const customKtvRatesByUser = new Map<string, Map<string, number>>();
    for (const r of dbCustomRates) {
      if (!customKtvRatesByUser.has(r.userId)) {
        customKtvRatesByUser.set(r.userId, new Map());
      }
      customKtvRatesByUser.get(r.userId)!.set(r.workType, r.rate);
    }

    const hasDetailReports = reports.length > 0;
    const startDataRow = 6;
    const lastDataRow = hasDetailReports ? startDataRow + reports.length - 1 : startDataRow;

    // Top Summary Row Sheet 2 (Row 4 - Always visible above AutoFilter)
    const topSummaryRow2 = wsDetail.addRow([
      'TỔNG CỘNG THEO BỘ LỌC:',
      '', '', '', '', '', '', '', '', '', '',
      hasDetailReports ? { formula: `SUBTOTAL(109, L${startDataRow}:L${lastDataRow})`, result: 0 } : 0,
      hasDetailReports ? { formula: `SUBTOTAL(109, M${startDataRow}:M${lastDataRow})`, result: 0 } : 0,
      hasDetailReports ? { formula: `SUBTOTAL(109, N${startDataRow}:N${lastDataRow})`, result: 0 } : 0,
      hasDetailReports ? { formula: `SUBTOTAL(109, O${startDataRow}:O${lastDataRow})`, result: 0 } : 0,
      hasDetailReports ? { formula: `SUBTOTAL(109, P${startDataRow}:P${lastDataRow})`, result: 0 } : 0,
      hasDetailReports ? { formula: `SUBTOTAL(109, Q${startDataRow}:Q${lastDataRow})`, result: 0 } : 0,
      hasDetailReports ? { formula: `SUBTOTAL(109, R${startDataRow}:R${lastDataRow})`, result: 0 } : 0,
      hasDetailReports ? { formula: `SUBTOTAL(109, S${startDataRow}:S${lastDataRow})`, result: 0 } : 0,
      hasDetailReports ? { formula: `SUBTOTAL(109, T${startDataRow}:T${lastDataRow})`, result: 0 } : 0
    ]);
    wsDetail.mergeCells(`A4:K4`);
    topSummaryRow2.font = { bold: true, color: { argb: 'FF1B3A6B' } };
    topSummaryRow2.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };
    topSummaryRow2.getCell(1).alignment = { horizontal: 'center' };
    for (let c = 12; c <= 20; c++) {
      topSummaryRow2.getCell(c).numFmt = '#,##0';
    }

    // Row 5 Header (20 columns)
    const detailHeaders = [
      'STT',
      'Ngày hoàn thành',
      'KTV',
      'Trạm',
      'Tên KH',
      'SĐT KH',
      'Tỉnh/TP',
      'Sản phẩm',
      'Loại dịch vụ',
      'Ghi chú',
      'Khoảng cách (km)',
      'Bảo Hành',
      'Sửa chữa',
      'Giao hàng',
      'Lắp đặt',
      'Giao lắp',
      'Thay lọc',
      'Phí KC',
      'Khác',
      'Tổng'
    ];

    const detailHeaderRow = wsDetail.addRow(detailHeaders);
    detailHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    detailHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B3A6B' }
    };
    detailHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };

    let detailIdx = 1;
    let sumBaoHanh = 0;
    let sumSuaChua = 0;
    let sumGiaoHang = 0;
    let sumLapDat = 0;
    let sumGiaoLap = 0;
    let sumThayLoc = 0;
    let sumDistanceCost = 0;
    let sumOtherCost = 0;
    let sumTotalCost = 0;

    for (const r of reports) {
      const ktvPhoneNorm = normalizePhone(r.ktvUser?.phoneNumber);
      const stationRate = ktvPhoneNorm ? stationRates.get(ktvPhoneNorm) : null;
      const userCustomRates = customKtvRatesByUser.get(r.ktvUserId);

      const breakdown = getReportCostBreakdown(r, ktvPhoneNorm, stationRate, userCustomRates);

      // Accumulate totals
      sumBaoHanh += breakdown.baoHanhCost;
      sumSuaChua += breakdown.suaChuaCost;
      sumGiaoHang += breakdown.giaoHangCost;
      sumLapDat += breakdown.lapDatCost;
      sumGiaoLap += breakdown.giaoLapCost;
      sumThayLoc += breakdown.thayLocCost;
      sumDistanceCost += breakdown.distanceCost;
      sumOtherCost += breakdown.otherCost;
      sumTotalCost += breakdown.totalCost;

      // Format date: DD/MM/YYYY HH:mm
      const d = new Date(r.createdAt);
      const formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      const row = wsDetail.addRow([
        detailIdx++,
        formattedDate,
        r.ktvUser?.fullName || '',
        r.ktvUser?.techStation?.name || '',
        r.customerName || '',
        r.customerPhone || '',
        r.province || '',
        (r.products || []).join(', '),
        breakdown.workType,
        r.notes || '',
        breakdown.distance > 0 ? breakdown.distance : '-',
        breakdown.baoHanhCost > 0 ? breakdown.baoHanhCost : '-',
        breakdown.suaChuaCost > 0 ? breakdown.suaChuaCost : '-',
        breakdown.giaoHangCost > 0 ? breakdown.giaoHangCost : '-',
        breakdown.lapDatCost > 0 ? breakdown.lapDatCost : '-',
        breakdown.giaoLapCost > 0 ? breakdown.giaoLapCost : '-',
        breakdown.thayLocCost > 0 ? breakdown.thayLocCost : '-',
        breakdown.distanceCost > 0 ? breakdown.distanceCost : '-',
        breakdown.otherCost > 0 ? breakdown.otherCost : '-',
        breakdown.totalCost
      ]);

      // Alignments & Number formats
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'center' };
      row.getCell(11).alignment = { horizontal: 'right' };

      // Currency columns L to T (index 12 to 20)
      for (let c = 12; c <= 20; c++) {
        const cell = row.getCell(c);
        if (typeof cell.value === 'number') {
          cell.numFmt = '#,##0';
        } else {
          cell.alignment = { horizontal: 'center' };
        }
      }
    }

    // Update Top Summary Row Sheet 2 Results
    topSummaryRow2.getCell(12).value = { formula: `SUBTOTAL(109, L${startDataRow}:L${lastDataRow})`, result: sumBaoHanh };
    topSummaryRow2.getCell(13).value = { formula: `SUBTOTAL(109, M${startDataRow}:M${lastDataRow})`, result: sumSuaChua };
    topSummaryRow2.getCell(14).value = { formula: `SUBTOTAL(109, N${startDataRow}:N${lastDataRow})`, result: sumGiaoHang };
    topSummaryRow2.getCell(15).value = { formula: `SUBTOTAL(109, O${startDataRow}:O${lastDataRow})`, result: sumLapDat };
    topSummaryRow2.getCell(16).value = { formula: `SUBTOTAL(109, P${startDataRow}:P${lastDataRow})`, result: sumGiaoLap };
    topSummaryRow2.getCell(17).value = { formula: `SUBTOTAL(109, Q${startDataRow}:Q${lastDataRow})`, result: sumThayLoc };
    topSummaryRow2.getCell(18).value = { formula: `SUBTOTAL(109, R${startDataRow}:R${lastDataRow})`, result: sumDistanceCost };
    topSummaryRow2.getCell(19).value = { formula: `SUBTOTAL(109, S${startDataRow}:S${lastDataRow})`, result: sumOtherCost };
    topSummaryRow2.getCell(20).value = { formula: `SUBTOTAL(109, T${startDataRow}:T${lastDataRow})`, result: sumTotalCost };

    // Bottom Total Row Sheet 2
    if (reports.length > 0) {
      const totalRowSheet2 = wsDetail.addRow([
        'TỔNG CỘNG',
        '', '', '', '', '', '', '', '', '', '',
        { formula: `SUBTOTAL(109, L${startDataRow}:L${lastDataRow})`, result: sumBaoHanh },
        { formula: `SUBTOTAL(109, M${startDataRow}:M${lastDataRow})`, result: sumSuaChua },
        { formula: `SUBTOTAL(109, N${startDataRow}:N${lastDataRow})`, result: sumGiaoHang },
        { formula: `SUBTOTAL(109, O${startDataRow}:O${lastDataRow})`, result: sumLapDat },
        { formula: `SUBTOTAL(109, P${startDataRow}:P${lastDataRow})`, result: sumGiaoLap },
        { formula: `SUBTOTAL(109, Q${startDataRow}:Q${lastDataRow})`, result: sumThayLoc },
        { formula: `SUBTOTAL(109, R${startDataRow}:R${lastDataRow})`, result: sumDistanceCost },
        { formula: `SUBTOTAL(109, S${startDataRow}:S${lastDataRow})`, result: sumOtherCost },
        { formula: `SUBTOTAL(109, T${startDataRow}:T${lastDataRow})`, result: sumTotalCost }
      ]);

      wsDetail.mergeCells(`A${totalRowSheet2.number}:K${totalRowSheet2.number}`);
      totalRowSheet2.font = { bold: true };
      totalRowSheet2.getCell(1).alignment = { horizontal: 'center' };

      for (let c = 12; c <= 20; c++) {
        totalRowSheet2.getCell(c).numFmt = '#,##0';
      }

      totalRowSheet2.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      };
    }

    // Set AutoFilter and Column Widths Sheet 2 (Header at Row 5)
    wsDetail.autoFilter = `A5:T${lastDataRow}`;
    [6, 18, 22, 20, 22, 15, 18, 30, 22, 30, 14, 15, 15, 15, 15, 15, 15, 15, 15, 18].forEach((w, i) => {
      wsDetail.getColumn(i + 1).width = w;
    });

    // Style borders Sheet 2
    wsDetail.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };
        });
      }
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Bang_chi_phi_dich_vu_Truliva_${month.replace('/', '_')}.xlsx`
    );

    await workbook.xlsx.write(res);
  } catch (error: any) {
    logger.error('Export salaries error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi xuất bảng lương Excel' });
  }
});

/**
 * GET /api/salaries/rates
 * Fetch matrix of custom service rates for all KTVs
 */
router.get('/rates', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const ktvs = await prisma.user.findMany({
      where: { role: 'KTV', isActive: true },
      select: {
        id: true,
        fullName: true,
        username: true,
        phoneNumber: true,
        techStation: {
          select: {
            name: true,
            mainStation: { select: { name: true } }
          }
        }
      },
      orderBy: { fullName: 'asc' }
    });

    const rates = await prisma.ktvServiceRate.findMany();
    const rateMapByUser = new Map<string, Record<string, number>>();
    for (const r of rates) {
      if (!rateMapByUser.has(r.userId)) {
        rateMapByUser.set(r.userId, {});
      }
      rateMapByUser.get(r.userId)![r.workType] = r.rate;
    }

    const stationRates = await loadStationRates();

    const defaultRates: Record<string, number> = {
      giaoHang: 20000,
      baoHanh: 60000,
      suaChua: 60000,
      thayLoc: 40000,
      lapDat: 100000,
      giaoHangLapDat: 120000,
      thaoLapLai: 160000,
      kmRate: 3000,
      freeKmThreshold: 20,
      freeKmThresholdTLSC: 50
    };

    const matrix = ktvs.map(ktv => {
      const userRates = rateMapByUser.get(ktv.id) || {};
      const ktvPhoneNorm = normalizePhone(ktv.phoneNumber);
      const stationRate = ktvPhoneNorm ? stationRates.get(ktvPhoneNorm) : null;
      const isOfficialTrulivaKtv = ktvPhoneNorm === '392110073';

      const ratesWithCustomFlag: Record<string, { rate: number; isCustom: boolean }> = {};

      for (const [workType, defRate] of Object.entries(defaultRates)) {
        if (userRates[workType] !== undefined && userRates[workType] !== null) {
          ratesWithCustomFlag[workType] = { rate: userRates[workType], isCustom: true };
        } else if (workType === 'suaChua') {
          // Phí Sửa chữa mặc định bằng Phí Bảo hành của KTV đó
          let suaChuaVal = 60000;
          let isCustom = false;
          if (userRates['baoHanh'] !== undefined && userRates['baoHanh'] !== null) {
            suaChuaVal = userRates['baoHanh'];
            isCustom = true;
          } else if (isOfficialTrulivaKtv) {
            suaChuaVal = 60000;
          } else if (stationRate && stationRate.rates && (stationRate.rates['suaChua'] || stationRate.rates['baoHanh'])) {
            suaChuaVal = stationRate.rates['suaChua'] || stationRate.rates['baoHanh'];
          } else {
            suaChuaVal = 60000;
          }
          ratesWithCustomFlag[workType] = { rate: suaChuaVal, isCustom };
        } else if (isOfficialTrulivaKtv) {
          // KTV Trạm Truliva (Nguyễn Minh Thuận): Mức đơn giá chuẩn Truliva
          ratesWithCustomFlag[workType] = { rate: defRate, isCustom: false };
        } else if (workType === 'kmRate') {
          const rateVal = stationRate?.kmRate || 3000;
          ratesWithCustomFlag[workType] = { rate: rateVal, isCustom: false };
        } else if (workType === 'freeKmThreshold') {
          const rateVal = stationRate?.freeKmThreshold || 20;
          ratesWithCustomFlag[workType] = { rate: rateVal, isCustom: false };
        } else if (workType === 'freeKmThresholdTLSC') {
          const rateVal = stationRate?.freeKmThresholdTLSC || 50;
          ratesWithCustomFlag[workType] = { rate: rateVal, isCustom: false };
        } else if (stationRate && stationRate.rates && stationRate.rates[workType] !== undefined && stationRate.rates[workType] > 0) {
          // KTV Ngoại: Lấy đơn giá theo Trạm trong File Excel
          ratesWithCustomFlag[workType] = { rate: stationRate.rates[workType], isCustom: false };
        } else {
          // KTV Ngoại không thuộc trạm Excel: Lấy Flat Rate KTV ngoài (0đ giao hàng, 60k/100k/120k công)
          const flatRate = getKtvFlatRate(workType);
          ratesWithCustomFlag[workType] = { rate: flatRate, isCustom: false };
        }
      }

      return {
        userId: ktv.id,
        fullName: ktv.fullName,
        username: ktv.username,
        phoneNumber: ktv.phoneNumber,
        stationName: ktv.techStation?.name || (stationRate ? stationRate.province : 'Trực thuộc Truliva'),
        mainStationName: ktv.techStation?.mainStation?.name || 'Truliva Official',
        rates: ratesWithCustomFlag
      };
    });

    res.json({
      success: true,
      defaultRates,
      matrix
    });
  } catch (error: any) {
    logger.error('Fetch KTV service rates error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi tải bảng ma trận đơn giá KTV' });
  }
});

/**
 * POST /api/salaries/rates
 * Bulk save custom service rates for KTVs
 */
router.post('/rates', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rates } = req.body as { rates: Array<{ userId: string; workType: string; rate: number }> };
    if (!Array.isArray(rates)) {
      res.status(400).json({ error: 'Dữ liệu đơn giá không hợp lệ (cần mảng rates)' });
      return;
    }

    const upsertPromises = rates.map(item => {
      let finalRate = Number(item.rate) || 0;
      if (item.workType === 'giaoHang' && finalRate === 120000) {
        finalRate = 0;
      }
      return prisma.ktvServiceRate.upsert({
        where: {
          userId_workType: {
            userId: item.userId,
            workType: item.workType
          }
        },
        update: {
          rate: finalRate
        },
        create: {
          userId: item.userId,
          workType: item.workType,
          rate: finalRate
        }
      });
    });

    await Promise.all(upsertPromises);

    // Tự động đồng bộ lại chi phí chi tiết ca + calculatedCost cho các tháng DRAFT
    // Khi Ma trận đơn giá thay đổi, cần RESET customCosts trên ServiceReport
    // để chi tiết ca phản ánh đúng đơn giá mới (trừ report đã bị Admin ghi đè customBaseCost).
    try {
      // Lấy danh sách userId bị thay đổi đơn giá
      const affectedUserIds = [...new Set(rates.map(r => r.userId))];

      const draftRecords = await prisma.salaryRecord.findMany({
        where: { status: 'DRAFT' },
        select: { month: true }
      });
      const draftMonths = Array.from(new Set(draftRecords.map(r => r.month)));

      if (draftMonths.length > 0) {
        const stationRates = await loadStationRates();
        const dbCustomRates = await prisma.ktvServiceRate.findMany();
        const customKtvRatesByUser = new Map<string, Map<string, number>>();
        for (const r of dbCustomRates) {
          if (!customKtvRatesByUser.has(r.userId)) {
            customKtvRatesByUser.set(r.userId, new Map());
          }
          customKtvRatesByUser.get(r.userId)!.set(r.workType, r.rate);
        }

        for (const draftMonth of draftMonths) {
          const [mStr, yStr] = draftMonth.split('/');
          const mNum = Number(mStr);
          const yNum = Number(yStr);
          const monthVariants = [
            draftMonth,
            `${mNum}/${yNum}`,
            `${String(mNum).padStart(2, '0')}/${yNum}`
          ];
          const startDate = new Date(Date.UTC(yNum, mNum - 1, 1, 0, 0, 0, 0));
          const endDate = new Date(Date.UTC(yNum, mNum, 0, 23, 59, 59, 999));

          const recordsToUpdate = await prisma.salaryRecord.findMany({
            where: { month: draftMonth, status: 'DRAFT' },
            include: { user: true }
          });

          for (const rec of recordsToUpdate) {
            // Chỉ xử lý KTV bị ảnh hưởng bởi thay đổi đơn giá
            if (!affectedUserIds.includes(rec.userId)) continue;

            const reports = await prisma.serviceReport.findMany({
              where: {
                ktvUserId: rec.userId,
                approvalStatus: 'APPROVED',
                OR: [
                  { month: { in: monthVariants } },
                  { createdAt: { gte: startDate, lte: endDate } }
                ]
              },
              include: { order: true }
            });

            const ktvPhoneNorm = normalizePhone(rec.user.phoneNumber);
            const stationRate = ktvPhoneNorm ? stationRates.get(ktvPhoneNorm) : null;
            const userCustomRates = customKtvRatesByUser.get(rec.userId);

            let newCalculated = 0;
            for (const rep of reports) {
              const costResult = calculateReportCost(rep, ktvPhoneNorm, stationRate, userCustomRates);

              // Reset customCosts trên report để phản ánh đơn giá mới từ Ma trận
              // CHỈ reset nếu report KHÔNG có customBaseCost (ghi đè thủ công riêng cho ca)
              if (rep.customBaseCost === null || rep.customBaseCost === undefined) {
                const existingCustom = (rep.customCosts as any) || {};
                // Giữ nguyên otherCost (phụ phí) vì đây là chi phí phát sinh do Admin nhập thủ công
                const preservedOtherCost = existingCustom.otherCost !== undefined ? existingCustom.otherCost : 0;

                // Rebuild customCosts dựa trên đơn giá mới từ calculateReportCost
                const newCustomCosts: Record<string, number> = {
                  baoHanhCost: costResult.rateType === 'baoHanh' ? costResult.baseCost : 0,
                  suaChuaCost: costResult.rateType === 'suaChua' ? costResult.baseCost : 0,
                  giaoHangCost: costResult.rateType === 'giaoHang' ? costResult.baseCost : 0,
                  lapDatCost: costResult.rateType === 'lapDat' ? costResult.baseCost : 0,
                  giaoLapCost: costResult.rateType === 'giaoHangLapDat' ? costResult.baseCost : 0,
                  thayLocCost: costResult.rateType === 'thayLoc' ? costResult.baseCost : 0,
                  distanceCost: costResult.distanceCost,
                  otherCost: preservedOtherCost
                };

                await prisma.serviceReport.update({
                  where: { id: rep.id },
                  data: { customCosts: newCustomCosts }
                });

                const totalReportCost = Object.values(newCustomCosts).reduce((a, b) => a + b, 0);
                newCalculated += totalReportCost;
              } else {
                // Report đã bị ghi đè thủ công: giữ nguyên customCosts hiện tại
                const customCostsObj = (rep.customCosts as any) || {};
                const baoHanhCost = customCostsObj.baoHanhCost !== undefined ? Number(customCostsObj.baoHanhCost) : (costResult.rateType === 'baoHanh' ? costResult.baseCost : 0);
                const suaChuaCost = customCostsObj.suaChuaCost !== undefined ? Number(customCostsObj.suaChuaCost) : (costResult.rateType === 'suaChua' ? costResult.baseCost : 0);
                const giaoHangCost = customCostsObj.giaoHangCost !== undefined ? Number(customCostsObj.giaoHangCost) : (costResult.rateType === 'giaoHang' ? costResult.baseCost : 0);
                const lapDatCost = customCostsObj.lapDatCost !== undefined ? Number(customCostsObj.lapDatCost) : (costResult.rateType === 'lapDat' ? costResult.baseCost : 0);
                const giaoLapCost = customCostsObj.giaoLapCost !== undefined ? Number(customCostsObj.giaoLapCost) : (costResult.rateType === 'giaoHangLapDat' ? costResult.baseCost : 0);
                const thayLocCost = customCostsObj.thayLocCost !== undefined ? Number(customCostsObj.thayLocCost) : (costResult.rateType === 'thayLoc' ? costResult.baseCost : 0);
                const distanceCost = customCostsObj.distanceCost !== undefined ? Number(customCostsObj.distanceCost) : costResult.distanceCost;
                const otherCost = customCostsObj.otherCost !== undefined ? Number(customCostsObj.otherCost) : (rep.additionalCost || 0);
                newCalculated += baoHanhCost + suaChuaCost + giaoHangCost + lapDatCost + giaoLapCost + thayLocCost + distanceCost + otherCost;
              }
            }

            const newAdjusted = rec.adjustmentNote ? rec.adjustedCost : newCalculated;

            await prisma.salaryRecord.update({
              where: { id: rec.id },
              data: {
                calculatedCost: newCalculated,
                adjustedCost: newAdjusted
              }
            });
          }
        }
      }
    } catch (syncErr: any) {
      logger.warn('Auto-sync draft salary records warning', { error: syncErr.message });
    }

    res.json({
      success: true,
      message: `Đã cập nhật đơn giá công dịch vụ cho ${rates.length} mục thành công`
    });
  } catch (error: any) {
    logger.error('Save KTV service rates error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi lưu bảng ma trận đơn giá KTV' });
  }
});

/**
 * DELETE /api/salaries/rates/:userId
 * Reset custom service rates for a KTV back to defaults
 */
router.delete('/rates/:userId', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    await prisma.ktvServiceRate.deleteMany({
      where: { userId: userId as string }
    });

    res.json({
      success: true,
      message: 'Đã khôi phục đơn giá chuẩn cho KTV thành công'
    });
  } catch (error: any) {
    logger.error('Reset KTV service rates error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi khôi phục đơn giá KTV' });
  }
});

export default router;

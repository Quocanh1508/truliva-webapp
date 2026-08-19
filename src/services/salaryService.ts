import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import logger from '../utils/logger';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

// Helper to normalize phone numbers for matching
export function normalizePhone(phone: any): string {
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

export function getRateType(workType: string | null | undefined): 'giaoHang' | 'baoHanh' | 'suaChua' | 'thayLoc' | 'lapDat' | 'giaoHangLapDat' | 'thaoLapLai' | 'other' {
  if (!workType) return 'baoHanh';
  const normalized = workType.toLowerCase().trim();
  if (normalized.includes('phí khác') || normalized.includes('phi_khac') || normalized.includes('phí bổ sung')) {
    return 'other';
  }
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

// Official Truliva KTV rates
export function getOfficialTrulivaBaseRate(workType: string | null | undefined): number {
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
export function getKtvFlatRate(workType: string | null | undefined): number {
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
    return 20000;
  }
  return 60000;
}

// Load Station rates from Excel spreadsheet
export async function loadStationRates(): Promise<Map<string, any>> {
  const ratesMap = new Map<string, any>();
  try {
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

      if (phones.includes('913092258')) {
        freeKmThreshold = 40;
        kmRate = 4000;
      } else if (phones.includes('949601622')) {
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

// Helper to check if a KTV is official company KTV (Nguyen Minh Thuan)
export function checkIsOfficialTrulivaKtv(ktv: { phoneNumber?: string | null; username?: string | null; fullName?: string | null } | string | null | undefined): boolean {
  if (!ktv) return false;
  if (typeof ktv === 'string') {
    const norm = normalizePhone(ktv);
    return norm === '392110073' || ktv.includes('392110073');
  }
  const phoneNorm = normalizePhone(ktv.phoneNumber || ktv.username);
  if (phoneNorm === '392110073' || (ktv.phoneNumber && ktv.phoneNumber.includes('392110073'))) {
    return true;
  }
  if (ktv.fullName && ktv.fullName.toLowerCase().includes('thuận') && ktv.fullName.toLowerCase().includes('nguyễn minh')) {
    return true;
  }
  return false;
}

// Single report cost calculation helper
export function calculateReportCost(
  report: any,
  ktvPhoneNorm: string,
  stationRate: any,
  customKtvRatesMap?: Map<string, number>,
  options?: { isEligibleForDistanceFee?: boolean; isOfficialKtv?: boolean }
) {
  let baseCost = 0;
  let distanceCost = 0;
  const workType = report.workType || report.order?.workType || 'Bảo hành';
  const rateType = getRateType(workType);
  const notes = (report.notes || report.order?.note || '').toLowerCase();
  
  const isOfficialTrulivaKtv = options?.isOfficialKtv ?? checkIsOfficialTrulivaKtv(ktvPhoneNorm);

  if (report.customBaseCost !== null && report.customBaseCost !== undefined) {
    baseCost = report.customBaseCost;
  } else if (isOfficialTrulivaKtv) {
    if (customKtvRatesMap && customKtvRatesMap.has(rateType) && customKtvRatesMap.get(rateType) !== undefined && customKtvRatesMap.get(rateType) !== null) {
      baseCost = customKtvRatesMap.get(rateType)!;
    } else {
      baseCost = getOfficialTrulivaBaseRate(workType);
    }
    if (notes.includes('hoàn thành') || notes.includes('tăng ca')) {
      baseCost += 100000;
    }
  } else {
    if (customKtvRatesMap && customKtvRatesMap.has(rateType) && customKtvRatesMap.get(rateType) !== undefined && customKtvRatesMap.get(rateType) !== null) {
      baseCost = customKtvRatesMap.get(rateType)!;
    } else if (rateType === 'suaChua' && customKtvRatesMap && customKtvRatesMap.has('baoHanh') && customKtvRatesMap.get('baoHanh') !== undefined && customKtvRatesMap.get('baoHanh') !== null) {
      baseCost = customKtvRatesMap.get('baoHanh')!;
    } else if (stationRate) {
      if (stationRate.province === 'TP.HCM' && rateType === 'giaoHangLapDat' && notes.includes('giao lắp')) {
        baseCost = 250000;
      } else {
        const specificRate = stationRate.rates[rateType] ?? (rateType === 'suaChua' ? stationRate.rates['baoHanh'] : null);
        baseCost = (specificRate !== undefined && specificRate !== null && specificRate >= 0) 
          ? specificRate 
          : getKtvFlatRate(workType);
      }
    } else {
      baseCost = getKtvFlatRate(workType);
    }
  }

  const distance = report.distanceKm ?? 0;
  let kmRate = 3000;
  let threshold = 20;

  if (customKtvRatesMap && customKtvRatesMap.has('kmRate') && customKtvRatesMap.get('kmRate') !== undefined && customKtvRatesMap.get('kmRate') !== null) {
    kmRate = customKtvRatesMap.get('kmRate')!;
  } else if (stationRate?.kmRate !== undefined && stationRate?.kmRate !== null) {
    kmRate = stationRate.kmRate;
  }

  if (isOfficialTrulivaKtv) {
    // KTV chính thức: TẤT CẢ các loại dịch vụ đều áp dụng ngưỡng từ 20km
    threshold = 20;
    if (customKtvRatesMap && customKtvRatesMap.has('freeKmThreshold') && customKtvRatesMap.get('freeKmThreshold') !== undefined && customKtvRatesMap.get('freeKmThreshold') !== null) {
      threshold = customKtvRatesMap.get('freeKmThreshold')!;
    } else if (stationRate?.freeKmThreshold !== undefined && stationRate?.freeKmThreshold !== null) {
      threshold = stationRate.freeKmThreshold;
    }
  } else {
    const isTLSC = rateType === 'thayLoc' || rateType === 'suaChua';

    if (isTLSC) {
      threshold = 50;
      if (customKtvRatesMap && customKtvRatesMap.has('freeKmThresholdTLSC') && customKtvRatesMap.get('freeKmThresholdTLSC') !== undefined && customKtvRatesMap.get('freeKmThresholdTLSC') !== null) {
        threshold = customKtvRatesMap.get('freeKmThresholdTLSC')!;
      } else if (stationRate?.freeKmThresholdTLSC !== undefined && stationRate?.freeKmThresholdTLSC !== null) {
        threshold = stationRate.freeKmThresholdTLSC;
      }
    } else {
      threshold = 20;
      if (customKtvRatesMap && customKtvRatesMap.has('freeKmThreshold') && customKtvRatesMap.get('freeKmThreshold') !== undefined && customKtvRatesMap.get('freeKmThreshold') !== null) {
        threshold = customKtvRatesMap.get('freeKmThreshold')!;
      } else if (stationRate?.freeKmThreshold !== undefined && stationRate?.freeKmThreshold !== null) {
        threshold = stationRate.freeKmThreshold;
      }
    }
  }

  const isEligible = options?.isEligibleForDistanceFee ?? true;

  if (isEligible && !stationRate?.noDistanceCost && kmRate > 0) {
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

export function getReportCostBreakdown(
  report: any,
  ktvPhoneNorm: string,
  stationRate: any,
  userCustomRates?: Map<string, number>,
  options?: { isEligibleForDistanceFee?: boolean; isOfficialKtv?: boolean }
) {
  const costResult = calculateReportCost(report, ktvPhoneNorm, stationRate, userCustomRates, options);
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

export async function computeFullSalariesForMonth(month: string) {
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

  const stationRates = await loadStationRates();
  const dbCustomRates = await prisma.ktvServiceRate.findMany();
  const customKtvRatesByUser = new Map<string, Map<string, number>>();
  for (const r of dbCustomRates) {
    if (!customKtvRatesByUser.has(r.userId)) {
      customKtvRatesByUser.set(r.userId, new Map());
    }
    customKtvRatesByUser.get(r.userId)!.set(r.workType, r.rate);
  }

  let mNum = NaN;
  let yNum = NaN;
  if (month.includes('/')) {
    const parts = month.split('/');
    mNum = Number(parts[0]);
    yNum = Number(parts[1]);
  } else if (month.includes('-')) {
    const parts = month.split('-');
    yNum = Number(parts[0]);
    mNum = Number(parts[1]);
  }

  const monthVariants = [
    month,
    !isNaN(mNum) && !isNaN(yNum) ? `${mNum}/${yNum}` : '',
    !isNaN(mNum) && !isNaN(yNum) ? `${String(mNum).padStart(2, '0')}/${yNum}` : '',
    !isNaN(mNum) && !isNaN(yNum) ? `${yNum}-${String(mNum).padStart(2, '0')}` : '',
    !isNaN(mNum) && !isNaN(yNum) ? `${yNum}-${mNum}` : ''
  ].filter(Boolean);

  const startDate = (!isNaN(mNum) && !isNaN(yNum) && mNum >= 1 && mNum <= 12)
    ? new Date(Date.UTC(yNum, mNum - 1, 1, 0, 0, 0, 0))
    : new Date(Date.UTC(2000, 0, 1));
  const endDate = (!isNaN(mNum) && !isNaN(yNum) && mNum >= 1 && mNum <= 12)
    ? new Date(Date.UTC(yNum, mNum, 0, 23, 59, 59, 999))
    : new Date(Date.UTC(2099, 11, 31, 23, 59, 59, 999));

  const savedRecords = await prisma.salaryRecord.findMany({
    where: { month: { in: monthVariants } }
  });
  const savedRecordsMap = new Map(savedRecords.map(r => [r.userId, r]));

  const result = [];
  for (const ktv of ktvs) {
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

    const ktvPhoneNorm = normalizePhone(ktv.phoneNumber);
    const isOfficialTrulivaKtv = checkIsOfficialTrulivaKtv(ktv);
    const stationRate = ktvPhoneNorm ? stationRates.get(ktvPhoneNorm) : null;
    const isStationPaid = !!stationRate;
    const userCustomRates = customKtvRatesByUser.get(ktv.id);

    // KTV chính thức: Mỗi ngày chỉ lấy 1 ca có khoảng cách lớn nhất để tính phí khoảng cách
    const eligibleDistanceReportIds = new Set<string>();
    if (isOfficialTrulivaKtv) {
      const reportsByDay = new Map<string, any[]>();
      for (const r of reports) {
        const dayKey = r.createdAt ? new Date(r.createdAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'no-date';
        if (!reportsByDay.has(dayKey)) {
          reportsByDay.set(dayKey, []);
        }
        reportsByDay.get(dayKey)!.push(r);
      }

      for (const [dayKey, dayReports] of reportsByDay.entries()) {
        let maxDist = -1;
        let maxReportId: string | null = null;
        for (const r of dayReports) {
          const dist = r.distanceKm ?? 0;
          if (dist > maxDist) {
            maxDist = dist;
            maxReportId = r.id;
          }
        }
        if (maxReportId) {
          eligibleDistanceReportIds.add(maxReportId);
        }
      }
    }

    let calculatedCost = 0;
    const reportsDetail = [];

    for (const report of reports) {
      const isEligibleForDistance = isOfficialTrulivaKtv
        ? eligibleDistanceReportIds.has(report.id)
        : true;

      const breakdown = getReportCostBreakdown(report, ktvPhoneNorm, stationRate, userCustomRates, {
        isEligibleForDistanceFee: isEligibleForDistance,
        isOfficialKtv: isOfficialTrulivaKtv
      });
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
        customBaseCost: report.customBaseCost,
        customCosts: report.customCosts,
        totalCost: breakdown.totalCost,
        createdAt: report.createdAt,
        products: report.products || []
      });
    }

    const savedRecord = savedRecordsMap.get(ktv.id);
    const adjustedCost = savedRecord ? savedRecord.adjustedCost : calculatedCost;
    const adjustmentNote = savedRecord ? savedRecord.adjustmentNote : null;

    result.push({
      userId: ktv.id,
      fullName: ktv.fullName,
      username: ktv.username,
      phoneNumber: ktv.phoneNumber,
      province: stationRate?.province || ktv.techStation?.name || 'Chưa cập nhật',
      stationName: ktv.techStation?.name || (stationRate ? stationRate.province : 'Không có'),
      mainStationName: ktv.techStation?.mainStation?.name || 'Không có',
      casesCount: reports.length,
      isStationPaid,
      calculatedCost,
      adjustedCost,
      adjustmentNote,
      cases: reportsDetail
    });
  }
  return result;
}

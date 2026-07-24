import { Router, Request, Response } from 'express';
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
function getRateType(workType: string | null | undefined): 'giaoHang' | 'baoHanh' | 'thayLoc' | 'lapDat' | 'giaoHangLapDat' {
  if (!workType) return 'baoHanh';
  const normalized = workType.toLowerCase().trim();
  if (normalized.includes('giao hàng và lắp đặt') || normalized.includes('giao_hang_lap_dat')) {
    return 'giaoHangLapDat';
  }
  if (normalized.includes('giao hàng') || normalized.includes('giao_hang')) {
    return 'giaoHang';
  }
  if (normalized.includes('thay lọc') || normalized.includes('thay_loc') || normalized.includes('thay lõi')) {
    return 'thayLoc';
  }
  if (normalized.includes('lắp đặt') || normalized.includes('lap_dat') || normalized.includes('lắp đặt lại')) {
    return 'lapDat';
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
    return 120000;
  }
  if (normalized.includes('bảo hành') || normalized.includes('sửa chữa')) {
    return 120000;
  }
  if (normalized.includes('thay lọc') || normalized.includes('thay_loc') || normalized.includes('thay lõi')) {
    return 120000;
  }
  if (normalized.includes('giao hàng') || normalized.includes('giao_hang')) {
    return 0;
  }
  return 120000;
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
function calculateReportCost(report: any, ktvPhoneNorm: string, stationRate: any) {
  let baseCost = 0;
  let distanceCost = 0;
  const workType = report.workType || report.order?.workType || 'Bảo hành';
  const notes = (report.notes || report.order?.note || '').toLowerCase();
  
  const isOfficialTrulivaKtv = ktvPhoneNorm === '392110073' || (stationRate && stationRate.isOfficialTruliva);

  if (report.customBaseCost !== null && report.customBaseCost !== undefined) {
    baseCost = report.customBaseCost;
  } else if (isOfficialTrulivaKtv) {
    baseCost = getOfficialTrulivaBaseRate(workType);
    if (notes.includes('hoàn thành') || notes.includes('tăng ca')) {
      baseCost += 100000;
    }
  } else if (stationRate) {
    const rateType = getRateType(workType);
    if (stationRate.province === 'TP.HCM' && rateType === 'giaoHangLapDat' && notes.includes('giao lắp')) {
      baseCost = 250000;
    } else {
      const specificRate = stationRate.rates[rateType];
      baseCost = (specificRate !== undefined && specificRate !== null && specificRate > 0) 
        ? specificRate 
        : getKtvFlatRate(workType);
    }
  } else {
    baseCost = getKtvFlatRate(workType);
  }

  // Distance Allowance
  const distance = report.distanceKm ?? 0;
  
  if (isOfficialTrulivaKtv) {
    if (distance > 20) {
      distanceCost = (distance - 20) * 3000;
    }
  } else if (stationRate) {
    if (stationRate.noDistanceCost) {
      distanceCost = 0;
    } else {
      const threshold = stationRate.freeKmThreshold || 20;
      const kmRate = stationRate.kmRate || 3000;
      if (distance > threshold) {
        distanceCost = (distance - threshold) * kmRate;
      }
    }
  } else {
    if (distance > 20) {
      distanceCost = (distance - 20) * 3000;
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

    // 2. Load station rates
    const stationRates = await loadStationRates();

    // 3. Get existing records to preserve manual overrides
    const savedRecords = await prisma.salaryRecord.findMany({
      where: { month }
    });
    const savedRecordsMap = new Map(savedRecords.map(r => [r.userId, r]));

    // 4. Calculate for each KTV
    const result = [];
    for (const ktv of ktvs) {
      const reports = await prisma.serviceReport.findMany({
        where: {
          ktvUserId: ktv.id,
          month: month.startsWith('0') ? `${Number(month.substring(0, 2))}/${month.substring(3)}` : month, // supports "7/2026" or "07/2026"
          approvalStatus: 'APPROVED'
        },
        include: { order: true }
      });

      // Find Excel row match for Station rates
      const ktvPhoneNorm = normalizePhone(ktv.phoneNumber);
      const stationRate = ktvPhoneNorm ? stationRates.get(ktvPhoneNorm) : null;
      const isStationPaid = !!stationRate;

      let calculatedCost = 0;
      const reportsDetail = [];

      for (const report of reports) {
        const costResult = calculateReportCost(report, ktvPhoneNorm, stationRate);
        const isSunday = new Date(report.createdAt).getDay() === 0;

        calculatedCost += costResult.totalCost;

        reportsDetail.push({
          reportId: report.id,
          orderId: report.orderId,
          pancakeOrderId: report.order?.pancakeOrderId,
          customerName: report.customerName,
          customerPhone: report.customerPhone || report.order?.billPhoneNumber || '',
          province: report.province || '',
          address: report.address || '',
          notes: report.notes || report.order?.note || '',
          workType: costResult.workType,
          isSunday,
          baseCost: costResult.baseCost,
          distance: costResult.distance,
          distanceCost: costResult.distanceCost,
          totalCost: costResult.totalCost,
          rateType: costResult.rateType,
          baoHanhCost: costResult.rateType === 'baoHanh' ? costResult.baseCost : 0,
          giaoHangCost: costResult.rateType === 'giaoHang' ? costResult.baseCost : 0,
          lapDatCost: costResult.rateType === 'lapDat' ? costResult.baseCost : 0,
          giaoLapCost: costResult.rateType === 'giaoHangLapDat' ? costResult.baseCost : 0,
          thayLocCost: costResult.rateType === 'thayLoc' ? costResult.baseCost : 0,
          createdAt: report.createdAt,
          appointmentTime: report.order?.appointmentTime,
          ktvCalledAt: report.order?.ktvCalledAt,
          products: report.products
        });
      }

      const saved = savedRecordsMap.get(ktv.id);
      
      result.push({
        userId: ktv.id,
        fullName: ktv.fullName,
        username: ktv.username,
        phoneNumber: ktv.phoneNumber || 'Không có',
        stationName: ktv.techStation?.name || 'Không có',
        mainStationName: ktv.techStation?.mainStation?.name || 'Không có',
        isStationPaid,
        stationRateInfo: isStationPaid ? {
          stationName: stationRate.stationName,
          role: stationRate.role
        } : null,
        casesCount: reports.length,
        calculatedCost,
        // If saved, use saved adjustedCost/note, otherwise default to calculatedCost
        adjustedCost: saved ? saved.adjustedCost : calculatedCost,
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
 * Update custom base cost for a report
 */
router.post('/update-base-cost', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { reportId, baseCost } = req.body;
    if (!reportId) {
      res.status(400).json({ error: 'Thiếu reportId' });
      return;
    }
    
    await prisma.serviceReport.update({
      where: { id: reportId },
      data: {
        customBaseCost: baseCost !== null && baseCost !== undefined ? Number(baseCost) : null
      }
    });
    
    res.json({ message: 'Cập nhật đơn giá ca thành công' });
  } catch (error: any) {
    logger.error('Update custom base cost error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi cập nhật đơn giá ca' });
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
    const workTypeFilter = req.query.workType as string | undefined;

    if (!month || !/^\d{2}\/\d{4}$/.test(month)) {
      res.status(400).json({ error: 'Định dạng tháng không hợp lệ (MM/YYYY)' });
      return;
    }

    const formattedMonth = month.startsWith('0') ? `${Number(month.substring(0, 2))}/${month.substring(3)}` : month;

    // 1. Load active KTVs
    const ktvs = await prisma.user.findMany({
      where: {
        role: 'KTV',
        isActive: true,
        ...(ktvId ? { id: ktvId } : {}),
        ...(stationId ? { techStationId: stationId } : {})
      },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        techStation: { select: { name: true } }
      }
    });

    // 2. Load Excel rates
    const stationRates = await loadStationRates();

    // 3. Load saved DB records
    const savedRecords = await prisma.salaryRecord.findMany({
      where: { month }
    });
    const savedMap = new Map(savedRecords.map(r => [r.userId, r]));

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

    const lastSummaryDataRow = 5 + ktvs.length;

    // Top Summary Row Sheet 1 (Row 4 - Always visible above filter)
    const topSummaryRow1 = wsSummary.addRow([
      'TỔNG CỘNG THEO BỘ LỌC:',
      '', '', '',
      { formula: `SUBTOTAL(109, E6:E${lastSummaryDataRow})`, result: 0 },
      { formula: `SUBTOTAL(109, F6:F${lastSummaryDataRow})`, result: 0 },
      { formula: `SUBTOTAL(109, G6:G${lastSummaryDataRow})`, result: 0 },
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

    // Columns config for Sheet 1 (Row 5 Header)
    const summaryHeaders = ['STT', 'Tên KTV', 'Số điện thoại', 'Trạm quản lý', 'Số ca hoàn thành', 'Thù lao tự động (VND)', 'Thực nhận (VND)', 'Ghi chú điều chỉnh', 'Trạng thái'];
    const summaryHeaderRow = wsSummary.addRow(summaryHeaders);
    summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B3A6B' } // Truliva Navy
    };
    summaryHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };

    let summaryIdx = 1;
    let sumTotalCases = 0;
    let sumCalculated = 0;
    let sumAdjusted = 0;

    for (const ktv of ktvs) {
      const reports = await prisma.serviceReport.findMany({
        where: {
          ktvUserId: ktv.id,
          month: formattedMonth,
          approvalStatus: 'APPROVED'
        },
        include: { order: true }
      });

      const ktvPhoneNorm = normalizePhone(ktv.phoneNumber);
      const stationRate = ktvPhoneNorm ? stationRates.get(ktvPhoneNorm) : null;
      const isStationPaid = !!stationRate;

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

      const row = wsSummary.addRow([
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

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(6).numFmt = '#,##0';
      row.getCell(7).numFmt = '#,##0';
      row.getCell(9).alignment = { horizontal: 'center' };
    }

    // Update Top Summary Row Sheet 1 Results
    topSummaryRow1.getCell(5).value = { formula: `SUBTOTAL(109, E6:E${lastSummaryDataRow})`, result: sumTotalCases };
    topSummaryRow1.getCell(6).value = { formula: `SUBTOTAL(109, F6:F${lastSummaryDataRow})`, result: sumCalculated };
    topSummaryRow1.getCell(7).value = { formula: `SUBTOTAL(109, G6:G${lastSummaryDataRow})`, result: sumAdjusted };

    // Bottom Total Row Sheet 1
    const totalRowSheet1 = wsSummary.addRow([
      'TỔNG CỘNG',
      '', '', '',
      { formula: `SUBTOTAL(109, E6:E${lastSummaryDataRow})`, result: sumTotalCases },
      { formula: `SUBTOTAL(109, F6:F${lastSummaryDataRow})`, result: sumCalculated },
      { formula: `SUBTOTAL(109, G6:G${lastSummaryDataRow})`, result: sumAdjusted },
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
    wsSummary.autoFilter = `A5:I${lastSummaryDataRow}`;
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

    // Fetch all approved reports for the month
    const reports = await prisma.serviceReport.findMany({
      where: {
        month: formattedMonth,
        approvalStatus: 'APPROVED',
        ...(ktvId ? { ktvUserId: ktvId } : {}),
        ...(stationId ? { ktvUser: { techStationId: stationId } } : {}),
        ...(workTypeFilter ? {
          OR: [
            { workType: { contains: workTypeFilter, mode: 'insensitive' } },
            { serviceType: { contains: workTypeFilter, mode: 'insensitive' } }
          ]
        } : {})
      },
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

    const startDataRow = 6;
    const lastDataRow = reports.length > 0 ? startDataRow + reports.length - 1 : startDataRow;

    // Top Summary Row Sheet 2 (Row 4 - Always visible above AutoFilter)
    const topSummaryRow2 = wsDetail.addRow([
      'TỔNG CỘNG THEO BỘ LỌC:',
      '', '', '', '', '', '', '', '', '', '',
      { formula: `SUBTOTAL(109, L${startDataRow}:L${lastDataRow})`, result: 0 },
      { formula: `SUBTOTAL(109, M${startDataRow}:M${lastDataRow})`, result: 0 },
      { formula: `SUBTOTAL(109, N${startDataRow}:N${lastDataRow})`, result: 0 },
      { formula: `SUBTOTAL(109, O${startDataRow}:O${lastDataRow})`, result: 0 },
      { formula: `SUBTOTAL(109, P${startDataRow}:P${lastDataRow})`, result: 0 },
      { formula: `SUBTOTAL(109, Q${startDataRow}:Q${lastDataRow})`, result: 0 },
      { formula: `SUBTOTAL(109, R${startDataRow}:R${lastDataRow})`, result: 0 },
      { formula: `SUBTOTAL(109, S${startDataRow}:S${lastDataRow})`, result: 0 }
    ]);
    wsDetail.mergeCells(`A4:K4`);
    topSummaryRow2.font = { bold: true, color: { argb: 'FF1B3A6B' } };
    topSummaryRow2.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };
    topSummaryRow2.getCell(1).alignment = { horizontal: 'center' };
    for (let c = 12; c <= 19; c++) {
      topSummaryRow2.getCell(c).numFmt = '#,##0';
    }

    // Row 5 Header
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
    let sumGiaoHang = 0;
    let sumLapDat = 0;
    let sumGiaoLap = 0;
    let sumThayLoc = 0;
    let sumDistanceCost = 0;
    let sumTotalCost = 0;

    for (const r of reports) {
      const ktvPhoneNorm = normalizePhone(r.ktvUser?.phoneNumber);
      const stationRate = ktvPhoneNorm ? stationRates.get(ktvPhoneNorm) : null;
      const costResult = calculateReportCost(r, ktvPhoneNorm, stationRate);

      const workType = costResult.workType;
      const baseCost = costResult.baseCost;
      const distance = costResult.distance;
      const distanceCost = costResult.distanceCost;
      const totalCost = costResult.totalCost;
      const rateType = costResult.rateType;

      // Accumulate totals
      if (rateType === 'baoHanh') sumBaoHanh += baseCost;
      if (rateType === 'giaoHang') sumGiaoHang += baseCost;
      if (rateType === 'lapDat') sumLapDat += baseCost;
      if (rateType === 'giaoHangLapDat') sumGiaoLap += baseCost;
      if (rateType === 'thayLoc') sumThayLoc += baseCost;
      sumDistanceCost += distanceCost;
      sumTotalCost += totalCost;

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
        workType,
        r.notes || '',
        distance > 0 ? distance : '-',
        rateType === 'baoHanh' ? baseCost : '-',
        rateType === 'giaoHang' ? baseCost : '-',
        rateType === 'lapDat' ? baseCost : '-',
        rateType === 'giaoHangLapDat' ? baseCost : '-',
        rateType === 'thayLoc' ? baseCost : '-',
        distanceCost > 0 ? distanceCost : '-',
        '-',
        totalCost
      ]);

      // Alignments & Number formats
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'center' };
      row.getCell(11).alignment = { horizontal: 'right' };

      // Currency columns L to S (index 12 to 19)
      for (let c = 12; c <= 19; c++) {
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
    topSummaryRow2.getCell(13).value = { formula: `SUBTOTAL(109, M${startDataRow}:M${lastDataRow})`, result: sumGiaoHang };
    topSummaryRow2.getCell(14).value = { formula: `SUBTOTAL(109, N${startDataRow}:N${lastDataRow})`, result: sumLapDat };
    topSummaryRow2.getCell(15).value = { formula: `SUBTOTAL(109, O${startDataRow}:O${lastDataRow})`, result: sumGiaoLap };
    topSummaryRow2.getCell(16).value = { formula: `SUBTOTAL(109, P${startDataRow}:P${lastDataRow})`, result: sumThayLoc };
    topSummaryRow2.getCell(17).value = { formula: `SUBTOTAL(109, Q${startDataRow}:Q${lastDataRow})`, result: sumDistanceCost };
    topSummaryRow2.getCell(18).value = { formula: `SUBTOTAL(109, R${startDataRow}:R${lastDataRow})`, result: 0 };
    topSummaryRow2.getCell(19).value = { formula: `SUBTOTAL(109, S${startDataRow}:S${lastDataRow})`, result: sumTotalCost };

    // Bottom Total Row Sheet 2
    if (reports.length > 0) {
      const totalRowSheet2 = wsDetail.addRow([
        'TỔNG CỘNG',
        '', '', '', '', '', '', '', '', '', '',
        { formula: `SUBTOTAL(109, L${startDataRow}:L${lastDataRow})`, result: sumBaoHanh },
        { formula: `SUBTOTAL(109, M${startDataRow}:M${lastDataRow})`, result: sumGiaoHang },
        { formula: `SUBTOTAL(109, N${startDataRow}:N${lastDataRow})`, result: sumLapDat },
        { formula: `SUBTOTAL(109, O${startDataRow}:O${lastDataRow})`, result: sumGiaoLap },
        { formula: `SUBTOTAL(109, P${startDataRow}:P${lastDataRow})`, result: sumThayLoc },
        { formula: `SUBTOTAL(109, Q${startDataRow}:Q${lastDataRow})`, result: sumDistanceCost },
        { formula: `SUBTOTAL(109, R${startDataRow}:R${lastDataRow})`, result: 0 },
        { formula: `SUBTOTAL(109, S${startDataRow}:S${lastDataRow})`, result: sumTotalCost }
      ]);

      wsDetail.mergeCells(`A${totalRowSheet2.number}:K${totalRowSheet2.number}`);
      totalRowSheet2.font = { bold: true };
      totalRowSheet2.getCell(1).alignment = { horizontal: 'center' };

      for (let c = 12; c <= 19; c++) {
        totalRowSheet2.getCell(c).numFmt = '#,##0';
      }

      totalRowSheet2.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      };
    }

    // Set AutoFilter and Column Widths Sheet 2 (Header at Row 5)
    wsDetail.autoFilter = `A5:S${lastDataRow}`;
    [6, 18, 22, 20, 22, 15, 18, 30, 22, 30, 14, 15, 15, 15, 15, 15, 15, 15, 18].forEach((w, i) => {
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

export default router;

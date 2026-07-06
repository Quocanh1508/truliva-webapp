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

// Flat rates for internal KTVs based on Word document rules
function getKtvFlatRate(workType: string | null | undefined): number {
  if (!workType) return 60000;
  const normalized = workType.toLowerCase().trim();
  if (normalized.includes('tháo máy & lắp đặt lại') || normalized.includes('tháo máy và lắp đặt lại')) {
    return 160000;
  }
  if (normalized.includes('giao hàng và lắp đặt') || normalized.includes('giao_hang_lap_dat')) {
    return 120000;
  }
  if (normalized.includes('lắp đặt') || normalized.includes('lap_dat') || normalized.includes('lắp đặt lại')) {
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

// Load Station rates from the Excel spreadsheet
async function loadStationRates(): Promise<Map<string, any>> {
  const ratesMap = new Map<string, any>();
  try {
    const workbook = new ExcelJS.Workbook();
    const filePath = path.join(process.cwd(), 'SalaryDoc', 'Cơ cấu tính chi phí Trạm KT_KTV Truliva.xlsx');
    await workbook.xlsx.readFile(filePath);
    
    const sheet = workbook.getWorksheet('Trang tính1');
    if (!sheet) {
      logger.warn('Worksheet "Trang tính1" not found in Excel file');
      return ratesMap;
    }

    // Headers are on Row 3, data starts from Row 4
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber < 4) return;

      const stationName = row.getCell(3).value;
      const contactName = row.getCell(4).value;
      const contactPhoneRaw = row.getCell(5).value;
      const role = row.getCell(16).value;

      if (!contactPhoneRaw) return;

      // Extract and normalize each phone number in the contact cell
      const phones = String(contactPhoneRaw)
        .split(/[\n,;/\\&]+/)
        .map(p => normalizePhone(p.trim()))
        .filter(p => p.length > 0);

      const getNum = (val: any) => {
        if (val === null || val === undefined || val === '') return 0;
        const num = Number(String(val).replace(/,/g, ''));
        return isNaN(num) ? 0 : num;
      };

      const rateInfo = {
        stationName: String(stationName || ''),
        contactName: String(contactName || ''),
        role: String(role || ''),
        weekdayRates: {
          giaoHang: getNum(row.getCell(17).value),
          baoHanh: getNum(row.getCell(18).value),
          thayLoc: getNum(row.getCell(19).value),
          lapDat: getNum(row.getCell(20).value),
          giaoHangLapDat: getNum(row.getCell(21).value),
        },
        sundayRates: {
          giaoHang: getNum(row.getCell(22).value),
          baoHanh: getNum(row.getCell(23).value),
          thayLoc: getNum(row.getCell(24).value),
          lapDat: getNum(row.getCell(25).value),
          giaoHangLapDat: getNum(row.getCell(26).value),
        },
        kmRate: getNum(row.getCell(28).value) || 3000,
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
        let baseCost = 0;
        let distanceCost = 0;
        const workType = report.workType || report.order?.workType || 'Bảo hành';
        
        // a. Base Rate Calculation
        const isSunday = new Date(report.createdAt).getDay() === 0;
        if (isStationPaid) {
          const rateType = getRateType(workType);
          baseCost = isSunday
            ? stationRate.sundayRates[rateType]
            : stationRate.weekdayRates[rateType];
        } else {
          baseCost = getKtvFlatRate(workType);
        }

        // b. Distance Allowance (>20km)
        const distance = report.distanceKm ?? 0;
        if (distance > 20) {
          const kmRate = isStationPaid ? stationRate.kmRate : 3000;
          distanceCost = (distance - 20) * kmRate;
        }

        const totalCost = baseCost + distanceCost;
        calculatedCost += totalCost;

        reportsDetail.push({
          reportId: report.id,
          orderId: report.orderId,
          pancakeOrderId: report.order?.pancakeOrderId,
          customerName: report.customerName,
          workType,
          isSunday,
          baseCost,
          distance,
          distanceCost,
          totalCost,
          createdAt: report.createdAt
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
 * GET /api/salaries/export
 * Export payroll to Excel
 */
router.get('/export', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const month = req.query.month as string;
    if (!month || !/^\d{2}\/\d{4}$/.test(month)) {
      res.status(400).json({ error: 'Định dạng tháng không hợp lệ (MM/YYYY)' });
      return;
    }

    // 1. Load active KTVs
    const ktvs = await prisma.user.findMany({
      where: { role: 'KTV', isActive: true },
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
    const worksheet = workbook.addWorksheet(`Thù lao ${month.replace('/', '-')}`);

    // Columns config
    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Tên KTV / Trạm', key: 'fullName', width: 25 },
      { header: 'Số điện thoại', key: 'phone', width: 15 },
      { header: 'Trạm quản lý', key: 'station', width: 20 },
      { header: 'Phân loại', key: 'type', width: 15 },
      { header: 'Số ca', key: 'casesCount', width: 10 },
      { header: 'Thù lao tự động (VND)', key: 'calculated', width: 22 },
      { header: 'Thực nhận (VND)', key: 'adjusted', width: 22 },
      { header: 'Ghi chú điều chỉnh', key: 'note', width: 35 },
      { header: 'Trạng thái', key: 'status', width: 15 }
    ];

    // Style headers
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B3A6B' } // Truliva navy blue
    };

    let idx = 1;
    for (const ktv of ktvs) {
      const reportsCount = await prisma.serviceReport.count({
        where: {
          ktvUserId: ktv.id,
          month: month.startsWith('0') ? `${Number(month.substring(0, 2))}/${month.substring(3)}` : month,
          approvalStatus: 'APPROVED'
        }
      });

      const saved = savedMap.get(ktv.id);
      const isStation = !!(ktv.phoneNumber && stationRates.has(normalizePhone(ktv.phoneNumber)));

      const calculated = saved ? saved.calculatedCost : 0;
      const adjusted = saved ? saved.adjustedCost : 0;
      const note = saved ? saved.adjustmentNote : '';
      const status = saved ? (saved.status === 'FINAL' ? 'Đã chốt' : 'Nháp') : 'Chưa lưu';

      worksheet.addRow({
        stt: idx++,
        fullName: ktv.fullName,
        phone: ktv.phoneNumber || '',
        station: ktv.techStation?.name || '',
        type: isStation ? 'Trạm/Cộng tác' : 'KTV Nội bộ',
        casesCount: reportsCount,
        calculated,
        adjusted,
        note,
        status
      });
    }

    // Number format for currency columns
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell('calculated').numFmt = '#,##0';
      row.getCell('adjusted').numFmt = '#,##0';
      // Center alignment for code and counts
      row.getCell('stt').alignment = { horizontal: 'center' };
      row.getCell('casesCount').alignment = { horizontal: 'center' };
      row.getCell('status').alignment = { horizontal: 'center' };
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Bang_thu_lao_Truliva_${month.replace('/', '_')}.xlsx`
    );

    await workbook.xlsx.write(res);
  } catch (error: any) {
    logger.error('Export salaries error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi xuất bảng lương Excel' });
  }
});

export default router;

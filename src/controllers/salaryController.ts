import { Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import ExcelJS from 'exceljs';
import {
  computeFullSalariesForMonth,
  loadStationRates,
  getRateType,
  checkIsOfficialTrulivaKtv
} from '../services/salaryService';

/**
 * GET /api/salaries/calculate
 * Calculate full salaries for all active KTVs for a given month
 */
export async function getCalculatedSalaries(req: Request, res: Response): Promise<void> {
  try {
    const month = (req.query.month as string) || `${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
    const result = await computeFullSalariesForMonth(month);
    res.json({ month, salaries: result, data: result });
  } catch (error: any) {
    logger.error('Error calculating salaries', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Lỗi khi tính thù lao KTV' });
  }
}

/**
 * POST /api/salaries/adjust
 * Manually adjust a KTV's salary for a specific month
 */
export async function adjustSalary(req: Request, res: Response): Promise<void> {
  try {
    const { userId, month, adjustedCost, adjustmentNote } = req.body;

    if (!userId || !month || adjustedCost === undefined) {
      res.status(400).json({ error: 'Thiếu thông tin điều chỉnh (userId, month, adjustedCost)' });
      return;
    }

    const existing = await prisma.salaryRecord.findFirst({
      where: { userId, month }
    });

    let record;
    if (existing) {
      record = await prisma.salaryRecord.update({
        where: { id: existing.id },
        data: {
          adjustedCost: Number(adjustedCost),
          adjustmentNote: adjustmentNote || null,
          updatedAt: new Date()
        }
      });
    } else {
      record = await prisma.salaryRecord.create({
        data: {
          userId,
          month,
          calculatedCost: Number(adjustedCost),
          adjustedCost: Number(adjustedCost),
          adjustmentNote: adjustmentNote || null
        }
      });
    }

    res.json({ message: 'Cập nhật điều chỉnh lương thành công', data: record });
  } catch (error: any) {
    logger.error('Error adjusting salary', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi điều chỉnh thù lao' });
  }
}

/**
 * GET /api/salaries/export
 * Export salary spreadsheet with unified filtering
 */
export async function exportSalaries(req: Request, res: Response): Promise<void> {
  try {
    const month = (req.query.month as string) || `${new Date().getMonth() + 1}/${new Date().getFullYear()}`;

    const ktvIds = (req.query.ktvIds as string) || (req.query.ktvId as string) || '';
    const stationId = (req.query.stationIds as string) || (req.query.stationId as string) || '';
    const mainStationId = (req.query.mainStationIds as string) || (req.query.mainStationId as string) || '';
    const workTypeFilter = (req.query.workTypes as string) || (req.query.workType as string) || '';
    const completedDate = (req.query.completedDate as string) || '';
    const searchQuery = (req.query.search as string || '').toLowerCase().trim();

    const ktvIdsList = ktvIds ? ktvIds.split(',').map(s => s.trim()).filter(Boolean) : [];
    const stationIdsList = stationId ? stationId.split(',').map(s => s.trim()).filter(Boolean) : [];
    const mainStationIdsList = mainStationId ? mainStationId.split(',').map(s => s.trim()).filter(Boolean) : [];
    const workTypesList = workTypeFilter ? workTypeFilter.split(',').map(s => s.trim()).filter(Boolean) : [];

    const normStr = (str: string | null | undefined): string => {
      if (!str) return '';
      return String(str).toLowerCase().replace(/trạm\s+/g, '').trim();
    };

    const allSalaries = await computeFullSalariesForMonth(month);

    const filteredSalaries = allSalaries.filter(s => {
      const hasActivity = s.casesCount > 0 || (s.adjustedCost !== s.calculatedCost) || !!s.adjustmentNote;
      const matchKtv = ktvIdsList.length === 0 ? hasActivity : ktvIdsList.includes(s.userId);
      if (!matchKtv) return false;

      if (stationIdsList.length > 0) {
        const sMain = s.mainStationName && s.mainStationName !== 'Không có' ? s.mainStationName : 'Trực thuộc Truliva';
        const sTech = s.stationName && s.stationName !== 'Không có' ? s.stationName : 'Khác';
        const sKey = `${sMain}::${sTech}`;

        const normKey = normStr(sKey);
        const normMain = normStr(sMain);
        const normTech = normStr(sTech);

        const matchStation = stationIdsList.some(item => {
          const filter = item.trim();
          if (!filter) return false;
          const normF = normStr(filter);

          if (filter === sKey || normF === normKey) return true;

          if (filter.includes('::')) {
            const [f1, f2] = filter.split('::').map(x => normStr(x));
            return (f1 === normMain && f2 === normTech) || (f1 === normTech && f2 === normMain);
          }

          return normMain === normF || normTech === normF;
        });

        if (!matchStation) return false;
      }

      if (mainStationIdsList.length > 0) {
        const normMain = normStr(s.mainStationName);
        const matchMain = mainStationIdsList.some(m => {
          const normM = normStr(m);
          return normMain === normM;
        });
        if (!matchMain) return false;
      }

      const matchCompletedDate = !completedDate || (s.cases && s.cases.some((c: any) => {
        if (!c.createdAt) return false;
        const cDate = new Date(c.createdAt).toLocaleDateString('sv-SE');
        return cDate === completedDate;
      }));
      if (!matchCompletedDate) return false;

      const matchWorkType = workTypesList.length === 0 || (s.cases && s.cases.some((c: any) =>
        workTypesList.some(wt => c.workType && c.workType.toLowerCase().includes(wt.toLowerCase()))
      ));
      if (!matchWorkType) return false;

      const matchQuery = !searchQuery ||
        s.fullName.toLowerCase().includes(searchQuery) ||
        s.username.toLowerCase().includes(searchQuery) ||
        (s.phoneNumber && s.phoneNumber.includes(searchQuery)) ||
        (s.cases && s.cases.some((c: any) => 
          (c.customerName && c.customerName.toLowerCase().includes(searchQuery)) ||
          (c.customerPhone && c.customerPhone.includes(searchQuery)) ||
          (c.province && c.province.toLowerCase().includes(searchQuery)) ||
          (c.orderNote && c.orderNote.toLowerCase().includes(searchQuery)) ||
          (c.reportNote && c.reportNote.toLowerCase().includes(searchQuery))
        ));
      if (!matchQuery) return false;

      return true;
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Truliva System';
    workbook.created = new Date();

    const wsSummary = workbook.addWorksheet('Tong_Hop_KTV');
    wsSummary.views = [{ showGridLines: true }];

    wsSummary.mergeCells('A1:O1');
    const titleCell = wsSummary.getCell('A1');
    titleCell.value = `BẢNG TỔNG HỢP THÙ LAO KỸ THUẬT VIÊN - THÁNG ${month}`;
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1B3A6B' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsSummary.getRow(1).height = 35;

    wsSummary.mergeCells('A2:O2');
    const subCell = wsSummary.getCell('A2');
    subCell.value = `Ngày xuất file: ${new Date().toLocaleDateString('vi-VN')} | Tổng số KTV trong bộ lọc: ${filteredSalaries.length}`;
    subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsSummary.getRow(2).height = 20;

    const summaryHeaders = [
      'STT', 'Họ và tên KTV', 'Số điện thoại', 'Tỉnh / Trạm KT', 'Trạm Quản Lý',
      'Số ca', 'Bảo hành', 'Sửa chữa', 'Giao hàng', 'Lắp đặt', 'Giao lắp', 'Thay lọc', 'Cước di chuyển', 'Phí khác', 'Tổng thù lao (VNĐ)'
    ];
    const headerRowSummary = wsSummary.addRow(summaryHeaders);
    headerRowSummary.height = 28;

    headerRowSummary.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    let sumTotalCases = 0;
    let sumTotalBaoHanh = 0;
    let sumTotalSuaChua = 0;
    let sumTotalGiaoHang = 0;
    let sumTotalLapDat = 0;
    let sumTotalGiaoLap = 0;
    let sumTotalThayLoc = 0;
    let sumTotalDistance = 0;
    let sumTotalOther = 0;
    let sumGrandTotal = 0;

    const isSpecificCaseFilter = Boolean(completedDate || workTypesList.length > 0 || searchQuery);

    filteredSalaries.forEach((s, idx) => {
      let ktvBaoHanh = 0;
      let ktvSuaChua = 0;
      let ktvGiaoHang = 0;
      let ktvLapDat = 0;
      let ktvGiaoLap = 0;
      let ktvThayLoc = 0;
      let ktvDistance = 0;
      let ktvOther = 0;

      const casesToProcess = (s.cases || []).filter((c: any) => {
        if (completedDate) {
          const cDate = c.createdAt ? new Date(c.createdAt).toLocaleDateString('sv-SE') : '';
          if (cDate !== completedDate) return false;
        }
        if (workTypesList.length > 0) {
          const matchWT = workTypesList.some(wt => c.workType && c.workType.toLowerCase().includes(wt.toLowerCase()));
          if (!matchWT) return false;
        }
        if (searchQuery) {
          const matchQ = s.fullName.toLowerCase().includes(searchQuery) ||
            s.username.toLowerCase().includes(searchQuery) ||
            (s.phoneNumber && s.phoneNumber.includes(searchQuery)) ||
            (c.customerName && c.customerName.toLowerCase().includes(searchQuery)) ||
            (c.customerPhone && c.customerPhone.includes(searchQuery)) ||
            (c.province && c.province.toLowerCase().includes(searchQuery)) ||
            (c.orderNote && c.orderNote.toLowerCase().includes(searchQuery)) ||
            (c.reportNote && c.reportNote.toLowerCase().includes(searchQuery));
          if (!matchQ) return false;
        }
        return true;
      });

      casesToProcess.forEach((c: any) => {
        ktvBaoHanh += c.baoHanhCost || 0;
        ktvSuaChua += c.suaChuaCost || 0;
        ktvGiaoHang += c.giaoHangCost || 0;
        ktvLapDat += c.lapDatCost || 0;
        ktvGiaoLap += c.giaoLapCost || 0;
        ktvThayLoc += c.thayLocCost || 0;
        ktvDistance += c.distanceCost || 0;
        ktvOther += c.otherCost || 0;
      });

      const ktvCalculatedCost = ktvBaoHanh + ktvSuaChua + ktvGiaoHang + ktvLapDat + ktvGiaoLap + ktvThayLoc + ktvDistance + ktvOther;
      const ktvTotalCost = isSpecificCaseFilter ? ktvCalculatedCost : (s.adjustedCost || ktvCalculatedCost);
      const displayCasesCount = isSpecificCaseFilter ? casesToProcess.length : s.casesCount;

      sumTotalCases += displayCasesCount;
      sumTotalBaoHanh += ktvBaoHanh;
      sumTotalSuaChua += ktvSuaChua;
      sumTotalGiaoHang += ktvGiaoHang;
      sumTotalLapDat += ktvLapDat;
      sumTotalGiaoLap += ktvGiaoLap;
      sumTotalThayLoc += ktvThayLoc;
      sumTotalDistance += ktvDistance;
      sumTotalOther += ktvOther;
      sumGrandTotal += ktvTotalCost;

      const row = wsSummary.addRow([
        idx + 1,
        s.fullName,
        s.phoneNumber || '',
        s.stationName || 'Khác',
        s.mainStationName || 'Không có',
        displayCasesCount,
        ktvBaoHanh,
        ktvSuaChua,
        ktvGiaoHang,
        ktvLapDat,
        ktvGiaoLap,
        ktvThayLoc,
        ktvDistance,
        ktvOther,
        ktvTotalCost
      ]);
      row.height = 22;

      row.eachCell((cell, colNum) => {
        cell.alignment = { vertical: 'middle', horizontal: colNum >= 6 ? 'right' : colNum === 1 ? 'center' : 'left' };
        if (colNum >= 7) cell.numFmt = '#,##0';
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
      });
    });

    const topSummaryRow = wsSummary.addRow([
      'TỔNG CỘNG THEO BỘ LỌC:', '', '', '', '',
      sumTotalCases, sumTotalBaoHanh, sumTotalSuaChua, sumTotalGiaoHang,
      sumTotalLapDat, sumTotalGiaoLap, sumTotalThayLoc, sumTotalDistance, sumTotalOther, sumGrandTotal
    ]);
    topSummaryRow.height = 26;
    topSummaryRow.eachCell((cell, colNum) => {
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1B3A6B' } };
      cell.alignment = { vertical: 'middle', horizontal: colNum >= 6 ? 'right' : 'left' };
      if (colNum >= 7) cell.numFmt = '#,##0';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF1B3A6B' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF1B3A6B' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    const hasDataRows = filteredSalaries.length > 0;
    const lastDataRow = hasDataRows ? 4 + filteredSalaries.length : 4;
    wsSummary.autoFilter = `A4:O${lastDataRow}`;

    [6, 25, 15, 20, 20, 10, 14, 14, 14, 14, 14, 14, 16, 14, 20].forEach((w, i) => {
      wsSummary.getColumn(i + 1).width = w;
    });

    // Sheet 2: Chi_Tiet_Ca_Dich_Vu
    const wsDetail = workbook.addWorksheet('Chi_Tiet_Ca_Dich_Vu');
    wsDetail.views = [{ showGridLines: true }];

    wsDetail.mergeCells('A1:U1');
    const detailTitleCell = wsDetail.getCell('A1');
    detailTitleCell.value = `CHI TIẾT DỊCH VỤ & PHÍ CỤ THỂ THEO CA - THÁNG ${month}`;
    detailTitleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1B3A6B' } };
    detailTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsDetail.getRow(1).height = 35;

    wsDetail.mergeCells('A2:U2');
    const detailSubCell = wsDetail.getCell('A2');
    detailSubCell.value = `Ngày xuất file: ${new Date().toLocaleDateString('vi-VN')}`;
    detailSubCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
    detailSubCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsDetail.getRow(2).height = 20;

    const detailHeaders = [
      'STT', 'Ngày hoàn thành', 'Tên KTV', 'Trạm KT KTV', 'Tên khách hàng', 'SĐT Khách hàng', 'Tỉnh / Thành',
      'Sản phẩm', 'Loại công việc', 'Ghi chú đơn', 'Ghi chú báo cáo', 'Khoảng cách (km)',
      'Phí Bảo Hành', 'Phí Sửa Chữa', 'Phí Giao Hàng', 'Phí Lắp Đặt', 'Phí Giao Lắp', 'Phí Thay Lọc', 'Cước Di Chuyển', 'Phí Khác', 'Tổng chi phí ca (VNĐ)'
    ];
    const headerRowDetail = wsDetail.addRow(detailHeaders);
    headerRowDetail.height = 28;

    headerRowDetail.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

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

    const detailRowsData: any[] = [];

    for (const s of filteredSalaries) {
      for (const c of s.cases || []) {
        if (completedDate) {
          const cDate = c.createdAt ? new Date(c.createdAt).toLocaleDateString('sv-SE') : '';
          if (cDate !== completedDate) continue;
        }

        if (workTypesList.length > 0) {
          const matchWT = workTypesList.some(wt => c.workType && c.workType.toLowerCase().includes(wt.toLowerCase()));
          if (!matchWT) continue;
        }

        if (searchQuery) {
          const matchQ = s.fullName.toLowerCase().includes(searchQuery) ||
            s.username.toLowerCase().includes(searchQuery) ||
            (s.phoneNumber && s.phoneNumber.includes(searchQuery)) ||
            (c.customerName && c.customerName.toLowerCase().includes(searchQuery)) ||
            (c.customerPhone && c.customerPhone.includes(searchQuery)) ||
            (c.province && c.province.toLowerCase().includes(searchQuery)) ||
            (c.orderNote && c.orderNote.toLowerCase().includes(searchQuery)) ||
            (c.reportNote && c.reportNote.toLowerCase().includes(searchQuery));
          if (!matchQ) continue;
        }

        sumBaoHanh += c.baoHanhCost || 0;
        sumSuaChua += c.suaChuaCost || 0;
        sumGiaoHang += c.giaoHangCost || 0;
        sumLapDat += c.lapDatCost || 0;
        sumGiaoLap += c.giaoLapCost || 0;
        sumThayLoc += c.thayLocCost || 0;
        sumDistanceCost += c.distanceCost || 0;
        sumOtherCost += c.otherCost || 0;
        sumTotalCost += c.totalCost || 0;

        const d = new Date(c.createdAt);
        const formattedDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

        const customCostsObj = (c.customCosts as any) || {};

        detailRowsData.push([
          detailIdx++,
          formattedDate,
          s.fullName,
          s.stationName || 'Khác',
          c.customerName || '',
          c.customerPhone || '',
          c.province || '',
          (c.products || []).join(', '),
          c.workType,
          c.orderNote || '',
          c.reportNote || '',
          c.distance > 0 ? c.distance : '-',
          (c.baoHanhCost > 0 || customCostsObj.baoHanhCost !== undefined) ? c.baoHanhCost : '-',
          (c.suaChuaCost > 0 || customCostsObj.suaChuaCost !== undefined) ? c.suaChuaCost : '-',
          (c.giaoHangCost > 0 || customCostsObj.giaoHangCost !== undefined) ? c.giaoHangCost : '-',
          (c.lapDatCost > 0 || customCostsObj.lapDatCost !== undefined) ? c.lapDatCost : '-',
          (c.giaoLapCost > 0 || customCostsObj.giaoLapCost !== undefined) ? c.giaoLapCost : '-',
          (c.thayLocCost > 0 || customCostsObj.thayLocCost !== undefined || c.workType === 'Thay lọc') ? c.thayLocCost : '-',
          (c.distanceCost > 0 || customCostsObj.distanceCost !== undefined) ? c.distanceCost : '-',
          (c.otherCost > 0 || customCostsObj.otherCost !== undefined) ? c.otherCost : '-',
          c.totalCost
        ]);
      }
    }

    const hasDetailRows = detailRowsData.length > 0;
    const lastDetailDataRow = hasDetailRows ? 5 + detailRowsData.length : 5;

    const topSummaryRow2 = wsDetail.addRow([
      'TỔNG CỘNG THEO BỘ LỌC:', '', '', '', '', '', '', '', '', '', '', '',
      sumBaoHanh, sumSuaChua, sumGiaoHang, sumLapDat, sumGiaoLap, sumThayLoc, sumDistanceCost, sumOtherCost, sumTotalCost
    ]);
    topSummaryRow2.height = 26;

    topSummaryRow2.eachCell((cell, colNum) => {
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1B3A6B' } };
      cell.alignment = { vertical: 'middle', horizontal: colNum >= 13 ? 'right' : 'left' };
      if (colNum >= 13) cell.numFmt = '#,##0';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF1B3A6B' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF1B3A6B' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    for (const rData of detailRowsData) {
      const row = wsDetail.addRow(rData);
      row.height = 22;
      row.eachCell((cell, colNum) => {
        cell.alignment = { vertical: 'middle', horizontal: colNum >= 12 ? 'right' : colNum === 1 ? 'center' : 'left' };
        if (colNum >= 13 && typeof cell.value === 'number') {
          cell.numFmt = '#,##0';
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
      });
    }

    wsDetail.autoFilter = `A5:U${lastDetailDataRow}`;
    [6, 18, 22, 18, 20, 14, 15, 25, 20, 25, 25, 15, 15, 15, 15, 15, 15, 15, 15, 15, 18].forEach((w, i) => {
      wsDetail.getColumn(i + 1).width = w;
    });

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

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Bang_chi_phi_dich_vu_Truliva_${month.replace('/', '_')}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Export salaries excel error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Lỗi khi xuất file Excel thù lao' });
  }
}

/**
 * GET /api/salaries/rates
 * Fetch matrix of custom service rates for all KTVs
 */
export async function getKtvRates(req: Request, res: Response): Promise<void> {
  try {
    const customRates = await prisma.ktvServiceRate.findMany({
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            techStation: {
              select: {
                name: true,
                mainStation: { select: { name: true } }
              }
            }
          }
        }
      }
    });

    const stationRates = await loadStationRates();

    const allKtvs = await prisma.user.findMany({
      where: { role: 'KTV', isActive: true },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        techStation: {
          select: {
            name: true,
            mainStation: { select: { name: true } }
          }
        }
      }
    });

    const ratesByUserMap = new Map<string, Record<string, number>>();
    for (const r of customRates) {
      if (!ratesByUserMap.has(r.userId)) {
        ratesByUserMap.set(r.userId, {});
      }
      ratesByUserMap.get(r.userId)![r.workType] = r.rate;
    }

    const defaultRates = {
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

    const result = allKtvs.map(ktv => {
      const ktvPhoneNorm = (ktv.phoneNumber || '').replace(/\D/g, '').replace(/^84/, '').replace(/^0/, '');
      const stationRate = ktvPhoneNorm ? stationRates.get(ktvPhoneNorm) : null;
      const customMap = ratesByUserMap.get(ktv.id) || {};

      const isOfficialTrulivaKtv = checkIsOfficialTrulivaKtv(ktv);

      const baseBaoHanh = isOfficialTrulivaKtv ? 60000 : (stationRate?.rates['baoHanh'] || 60000);
      const baseSuaChua = customMap['suaChua'] ?? customMap['baoHanh'] ?? (stationRate?.rates['suaChua'] || baseBaoHanh);
      const baseGiaoHang = isOfficialTrulivaKtv ? 20000 : (stationRate?.rates['giaoHang'] || 20000);
      const baseLapDat = isOfficialTrulivaKtv ? 100000 : (stationRate?.rates['lapDat'] || 100000);
      const baseGiaoLap = isOfficialTrulivaKtv ? 120000 : (stationRate?.rates['giaoHangLapDat'] || 120000);
      const baseThayLoc = isOfficialTrulivaKtv ? 40000 : (stationRate?.rates['thayLoc'] || 40000);

      const baseKmRate = stationRate?.kmRate || 3000;
      const baseFreeKmThreshold = stationRate?.freeKmThreshold || 20;
      const baseFreeKmThresholdTLSC = isOfficialTrulivaKtv ? 20 : (stationRate?.freeKmThresholdTLSC || 50);

      return {
        userId: ktv.id,
        fullName: ktv.fullName,
        phoneNumber: ktv.phoneNumber,
        stationName: ktv.techStation?.name || (stationRate ? stationRate.province : 'Không có'),
        mainStationName: ktv.techStation?.mainStation?.name || 'Không có',
        province: stationRate?.province || ktv.techStation?.name || 'Chưa cập nhật',
        isOfficialTrulivaKtv,
        rates: {
          baoHanh: customMap['baoHanh'] ?? baseBaoHanh,
          suaChua: customMap['suaChua'] ?? baseSuaChua,
          giaoHang: customMap['giaoHang'] ?? baseGiaoHang,
          lapDat: customMap['lapDat'] ?? baseLapDat,
          giaoHangLapDat: customMap['giaoHangLapDat'] ?? baseGiaoLap,
          thayLoc: customMap['thayLoc'] ?? baseThayLoc,
          kmRate: customMap['kmRate'] ?? baseKmRate,
          freeKmThreshold: customMap['freeKmThreshold'] ?? baseFreeKmThreshold,
          freeKmThresholdTLSC: customMap['freeKmThresholdTLSC'] ?? baseFreeKmThresholdTLSC
        },
        hasCustomRates: Object.keys(customMap).length > 0
      };
    });

    res.json({ success: true, defaultRates, matrix: result, data: result });
  } catch (error: any) {
    logger.error('Error fetching KTV rates matrix', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi tải bảng ma trận đơn giá KTV' });
  }
}

/**
 * POST /api/salaries/rates
 * Update single rate entry or batch rate matrix for KTVs
 */
export async function updateKtvRate(req: Request, res: Response): Promise<void> {
  try {
    const { rates, userId, workType, rate } = req.body;

    // 1. Batch update: { rates: [ { userId, workType, rate }, ... ] }
    if (Array.isArray(rates)) {
      if (rates.length === 0) {
        res.json({ success: true, message: 'Không có thay đổi nào cần lưu' });
        return;
      }

      await prisma.$transaction(async (tx) => {
        for (const item of rates) {
          const uId = item.userId;
          const wType = item.workType;
          const rNum = Number(item.rate);

          if (!uId || !wType || isNaN(rNum)) continue;

          if (rNum < 0) {
            await tx.ktvServiceRate.deleteMany({
              where: { userId: uId, workType: wType }
            });
            continue;
          }

          const existing = await tx.ktvServiceRate.findFirst({
            where: { userId: uId, workType: wType }
          });

          if (existing) {
            await tx.ktvServiceRate.update({
              where: { id: existing.id },
              data: {
                rate: rNum,
                updatedAt: new Date()
              }
            });
          } else {
            await tx.ktvServiceRate.create({
              data: {
                userId: uId,
                workType: wType,
                rate: rNum
              }
            });
          }
        }
      });

      res.json({ success: true, message: `Đã lưu thay đổi ma trận đơn giá cho ${rates.length} mục thành công!` });
      return;
    }

    // 2. Single update: { userId, workType, rate }
    if (!userId || !workType || rate === undefined) {
      res.status(400).json({ error: 'Thiếu thông tin (userId, workType, rate) hoặc danh sách rates' });
      return;
    }

    const rateNum = Number(rate);

    if (rateNum < 0) {
      await prisma.ktvServiceRate.deleteMany({
        where: { userId, workType }
      });
      res.json({ success: true, message: 'Đã khôi phục đơn giá mặc định' });
      return;
    }

    const existing = await prisma.ktvServiceRate.findFirst({
      where: { userId, workType }
    });

    let record;
    if (existing) {
      record = await prisma.ktvServiceRate.update({
        where: { id: existing.id },
        data: {
          rate: rateNum,
          updatedAt: new Date()
        }
      });
    } else {
      record = await prisma.ktvServiceRate.create({
        data: {
          userId,
          workType,
          rate: rateNum
        }
      });
    }

    res.json({ success: true, message: 'Cập nhật đơn giá thành công', data: record });
  } catch (error: any) {
    logger.error('Error updating KTV rate', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi cập nhật đơn giá KTV' });
  }
}

/**
 * POST /api/salaries/add-custom-case
 * Admin adds custom salary case for a KTV
 */
export async function addCustomCase(req: Request, res: Response): Promise<void> {
  try {
    const { userId, customerName, customerPhone, province, workType, amount, note, month } = req.body;

    if (!userId || !workType || !month) {
      res.status(400).json({ error: 'Thiếu thông tin bắt buộc (userId, workType, month)' });
      return;
    }

    const targetMonth = String(month).trim();
    const rateType = getRateType(workType);

    const [mStr, yStr] = targetMonth.split('/');
    const mNum = Number(mStr);
    const yNum = Number(yStr);

    let reportDate = new Date();
    if (!isNaN(mNum) && !isNaN(yNum) && mNum >= 1 && mNum <= 12) {
      const now = new Date();
      if (now.getMonth() + 1 === mNum && now.getFullYear() === yNum) {
        reportDate = now;
      } else {
        reportDate = new Date(Date.UTC(yNum, mNum - 1, 15, 12, 0, 0));
      }
    }

    const hasAmount = amount !== undefined && amount !== null && amount !== '';
    const customBaseCost = hasAmount ? Number(amount) : null;

    const customCostsObj: any = {};
    if (rateType === 'other') {
      customCostsObj.otherCost = hasAmount ? Number(amount) : 0;
    } else if (rateType === 'baoHanh') {
      customCostsObj.baoHanhCost = hasAmount ? Number(amount) : 0;
    } else if (rateType === 'suaChua') {
      customCostsObj.suaChuaCost = hasAmount ? Number(amount) : 0;
    } else if (rateType === 'giaoHang') {
      customCostsObj.giaoHangCost = hasAmount ? Number(amount) : 0;
    } else if (rateType === 'lapDat') {
      customCostsObj.lapDatCost = hasAmount ? Number(amount) : 0;
    } else if (rateType === 'giaoHangLapDat') {
      customCostsObj.giaoLapCost = hasAmount ? Number(amount) : 0;
    } else if (rateType === 'thayLoc') {
      customCostsObj.thayLocCost = hasAmount ? Number(amount) : 0;
    }

    const report = await prisma.serviceReport.create({
      data: {
        month: targetMonth,
        ktvUserId: userId,
        reportedById: userId,
        customerName: customerName || 'Ca điều chỉnh bổ sung',
        customerPhone: customerPhone || '',
        province: province || 'Khác',
        workType: workType || 'Phí khác',
        serviceType: 'Phí bổ sung admin',
        approvalStatus: 'APPROVED',
        notes: note || 'Do Admin thêm bổ sung thủ công',
        customBaseCost,
        customCosts: Object.keys(customCostsObj).length > 0 ? customCostsObj : undefined,
        createdAt: reportDate
      }
    });

    res.json({ message: 'Tạo ca bổ sung thành công', data: report });
  } catch (error: any) {
    logger.error('Error adding custom salary case', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Lỗi khi thêm ca bổ sung thủ công' });
  }
}

/**
 * DELETE /api/salaries/custom-case/:reportId
 * Delete a custom salary case
 */
export async function deleteCustomCase(req: Request, res: Response): Promise<void> {
  try {
    const reportId = String(req.params.reportId || '');

    if (!reportId) {
      res.status(400).json({ error: 'Thiếu ID ca dịch vụ' });
      return;
    }

    const report = await prisma.serviceReport.findUnique({
      where: { id: reportId }
    });

    if (!report) {
      res.status(404).json({ error: 'Không tìm thấy ca dịch vụ' });
      return;
    }

    await prisma.serviceReport.delete({
      where: { id: reportId }
    });

    res.json({ message: 'Đã xóa ca dịch vụ bổ sung thành công' });
  } catch (error: any) {
    logger.error('Error deleting custom case', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi xóa ca dịch vụ bổ sung' });
  }
}

/**
 * POST /api/salaries/update-base-cost
 * Update base cost or specific custom cost field for a report
 */
export async function updateBaseCost(req: Request, res: Response): Promise<void> {
  try {
    const { reportId, fieldName, fieldValue } = req.body;
    if (!reportId || fieldName === undefined || fieldValue === undefined) {
      res.status(400).json({ error: 'Thiếu tham số reportId, fieldName hoặc fieldValue' });
      return;
    }

    const report = await prisma.serviceReport.findUnique({
      where: { id: reportId }
    });

    if (!report) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo' });
      return;
    }

    const val = Number(fieldValue);
    const existingCustomCosts = (report.customCosts as any) || {};

    if (fieldName === 'baseCost') {
      await prisma.serviceReport.update({
        where: { id: reportId },
        data: { customBaseCost: val }
      });
    } else {
      const updatedCustomCosts = {
        ...existingCustomCosts,
        [fieldName]: val
      };
      await prisma.serviceReport.update({
        where: { id: reportId },
        data: {
          customBaseCost: val,
          customCosts: updatedCustomCosts
        }
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Update base cost error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật chi phí ca' });
  }
}

/**
 * DELETE /api/salaries/rates/:userId
 * Reset custom service rates for a KTV back to defaults
 */
export async function resetKtvRates(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    await prisma.ktvServiceRate.deleteMany({
      where: { userId: String(userId) }
    });

    res.json({
      success: true,
      message: 'Đã khôi phục đơn giá chuẩn cho KTV thành công'
    });
  } catch (error: any) {
    logger.error('Reset KTV service rates error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi khôi phục đơn giá KTV' });
  }
}

/**
 * POST /api/salaries/save
 * Save draft salary records
 */
export async function saveSalaryDraft(req: Request, res: Response): Promise<void> {
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

      if (existing && existing.status === 'FINAL') {
        continue;
      }

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
}

/**
 * POST /api/salaries/lock
 * Lock salary records for a month (Lock changes)
 */
export async function lockSalaryMonth(req: Request, res: Response): Promise<void> {
  try {
    const { month } = req.body;
    if (!month || !/^\d{2}\/\d{4}$/.test(month)) {
      res.status(400).json({ error: 'Định dạng tháng không hợp lệ (MM/YYYY)' });
      return;
    }

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
}



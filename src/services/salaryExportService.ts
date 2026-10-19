import ExcelJS from 'exceljs';
import prisma from '../config/database';
import logger from '../utils/logger';
import { loadStationRates, checkIsOfficialTrulivaKtv } from './salaryService';
import { computeCommissionsForMonth } from './commissionService';

export interface SalaryExportFilters {
  month: string;
  ktvIdsList: string[];
  stationIdsList: string[];
  mainStationIdsList: string[];
  workTypesList: string[];
  serviceTypesList: string[];
  productsList: string[];
  completedDate: string;
  searchQuery: string;
  commissionSearchQuery?: string;
  commissionKtvId?: string;
  distancePresetsList: string[];
  distanceOp: string;
  distanceMin: string;
  distanceMax: string;
  tab?: string;
}

export interface SalaryExportContext {
  filters: SalaryExportFilters;
  filteredSalaries: any[];
  allSalaries: any[];
  ratesMatrix: any[];
  commissionsData: any;
}

/**
 * Lấy dữ liệu ma trận đơn giá toàn bộ KTV
 */
export async function getRatesMatrixData(): Promise<any[]> {
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

  return allKtvs.map(ktv => {
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
}

/**
 * 1. Sheet Tổng hợp thù lao KTV
 */
export function buildSummarySheet(workbook: ExcelJS.Workbook, ctx: SalaryExportContext): void {
  const { filteredSalaries, filters } = ctx;
  const wsSummary = workbook.addWorksheet('Tong_Hop_KTV');
  wsSummary.views = [{ showGridLines: true }];

  // Tiêu đề
  wsSummary.mergeCells('A1:O1');
  const titleCell = wsSummary.getCell('A1');
  titleCell.value = `BẢNG TỔNG HỢP THÙ LAO KỸ THUẬT VIÊN - THÁNG ${filters.month}`;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1B3A6B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(1).height = 35;

  wsSummary.mergeCells('A2:O2');
  const subCell = wsSummary.getCell('A2');
  subCell.value = `Ngày xuất file: ${new Date().toLocaleDateString('vi-VN')} | Tổng số KTV theo bộ lọc: ${filteredSalaries.length}`;
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

  const isSpecificCaseFilter = Boolean(
    filters.completedDate ||
    filters.workTypesList.length > 0 ||
    filters.serviceTypesList.length > 0 ||
    filters.productsList.length > 0 ||
    filters.searchQuery ||
    filters.distancePresetsList.length > 0
  );

  filteredSalaries.forEach((s, idx) => {
    let ktvBaoHanh = 0;
    let ktvSuaChua = 0;
    let ktvGiaoHang = 0;
    let ktvLapDat = 0;
    let ktvGiaoLap = 0;
    let ktvThayLoc = 0;
    let ktvDistance = 0;
    let ktvOther = 0;

    let displayCasesCount = s.casesCount || 0;
    let ktvTotalCost = 0;

    if (Array.isArray(s.cases) && s.cases.length > 0) {
      displayCasesCount = s.cases.length;
      let ktvSumCasesTotal = 0;

      s.cases.forEach((c: any) => {
        const wt = (c.workType || '').toLowerCase();
        const baseCost = Number(c.baseCost) || 0;
        const distCost = Number(c.distanceCost) || 0;
        let otherCost = Number(c.otherCost) || 0;

        const hasExplicitBreakdown = (
          c.baoHanhCost !== undefined ||
          c.suaChuaCost !== undefined ||
          c.giaoHangCost !== undefined ||
          c.lapDatCost !== undefined ||
          c.giaoLapCost !== undefined ||
          c.thayLocCost !== undefined
        );

        let bh = Number(c.baoHanhCost) || 0;
        let sc = Number(c.suaChuaCost) || 0;
        let gh = Number(c.giaoHangCost) || 0;
        let ld = Number(c.lapDatCost) || 0;
        let gl = Number(c.giaoLapCost) || 0;
        let tl = Number(c.thayLocCost) || 0;

        // Chỉ Fallback theo workType nếu các trường breakdown CHƯA ĐƯỢC GÁN (undefined)
        if (!hasExplicitBreakdown && baseCost > 0) {
          if (wt.includes('bảo hành') || wt.includes('bao hanh')) bh = baseCost;
          else if (wt.includes('sửa chữa') || wt.includes('sua chua')) sc = baseCost;
          else if (wt.includes('giao hàng') && !wt.includes('lắp')) gh = baseCost;
          else if (wt.includes('lắp đặt') && !wt.includes('giao')) ld = baseCost;
          else if (wt.includes('giao hàng và lắp') || wt.includes('giao lap')) gl = baseCost;
          else if (wt.includes('thay lọc') || wt.includes('thay loc')) tl = baseCost;
          else otherCost += baseCost;
        }

        ktvBaoHanh += bh;
        ktvSuaChua += sc;
        ktvGiaoHang += gh;
        ktvLapDat += ld;
        ktvGiaoLap += gl;
        ktvThayLoc += tl;
        ktvDistance += distCost;
        ktvOther += otherCost;

        const cTotal = c.totalCost !== undefined ? Number(c.totalCost) : (bh + sc + gh + ld + gl + tl + distCost + otherCost);
        ktvSumCasesTotal += cTotal;
      });

      if (!isSpecificCaseFilter && s.adjustedCost !== undefined && s.adjustedCost !== null) {
        ktvTotalCost = Number(s.adjustedCost);
      } else {
        ktvTotalCost = ktvSumCasesTotal;
      }
    } else {
      displayCasesCount = s.casesCount || 0;
      ktvTotalCost = (s.adjustedCost !== undefined && s.adjustedCost !== null) ? Number(s.adjustedCost) : (Number(s.calculatedCost) || 0);
    }

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

  // Hàng tổng cộng
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
}

/**
 * 2. Sheet Chi tiết tất cả ca dịch vụ
 */
export function buildCasesSheet(workbook: ExcelJS.Workbook, ctx: SalaryExportContext): void {
  const { filteredSalaries, filters } = ctx;
  const wsDetail = workbook.addWorksheet('Chi_Tiet_Ca_Dich_Vu');
  wsDetail.views = [{ showGridLines: true }];

  wsDetail.mergeCells('A1:U1');
  const detailTitleCell = wsDetail.getCell('A1');
  detailTitleCell.value = `CHI TIẾT DỊCH VỤ & PHÍ CỤ THỂ THEO CA - THÁNG ${filters.month}`;
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
    if (!s.cases || s.cases.length === 0) continue;

    for (const c of s.cases) {
      const wt = (c.workType || '').toLowerCase();
      const baseCost = c.baseCost || 0;
      const distCost = Number(c.distanceCost) || 0;
      const otherCost = (Number(c.otherCost) || 0) + (Number(c.materialCost) || 0) + (Number(c.bonus) || 0) - (Number(c.penalty) || 0);

      const hasExplicitBreakdown = (
        c.baoHanhCost !== undefined ||
        c.suaChuaCost !== undefined ||
        c.giaoHangCost !== undefined ||
        c.lapDatCost !== undefined ||
        c.giaoLapCost !== undefined ||
        c.thayLocCost !== undefined
      );

      let pBaoHanh = Number(c.baoHanhCost) || 0;
      let pSuaChua = Number(c.suaChuaCost) || 0;
      let pGiaoHang = Number(c.giaoHangCost) || 0;
      let pLapDat = Number(c.lapDatCost) || 0;
      let pGiaoLap = Number(c.giaoLapCost) || 0;
      let pThayLoc = Number(c.thayLocCost) || 0;

      // Chỉ Fallback theo workType nếu các trường breakdown CHƯA ĐƯỢC GÁN (undefined)
      if (!hasExplicitBreakdown && baseCost > 0) {
        if (wt.includes('bảo hành') || wt.includes('bao hanh')) pBaoHanh = baseCost;
        else if (wt.includes('sửa chữa') || wt.includes('sua chua')) pSuaChua = baseCost;
        else if (wt.includes('giao hàng') && !wt.includes('lắp')) pGiaoHang = baseCost;
        else if (wt.includes('lắp đặt') && !wt.includes('giao')) pLapDat = baseCost;
        else if (wt.includes('giao hàng và lắp') || wt.includes('giao lap')) pGiaoLap = baseCost;
        else if (wt.includes('thay lọc') || wt.includes('thay loc')) pThayLoc = baseCost;
      }

      const totalCaseCost = c.totalCost !== undefined
        ? Number(c.totalCost)
        : (pBaoHanh + pSuaChua + pGiaoHang + pLapDat + pGiaoLap + pThayLoc + distCost + otherCost);

      sumBaoHanh += pBaoHanh;
      sumSuaChua += pSuaChua;
      sumGiaoHang += pGiaoHang;
      sumLapDat += pLapDat;
      sumGiaoLap += pGiaoLap;
      sumThayLoc += pThayLoc;
      sumDistanceCost += distCost;
      sumOtherCost += otherCost;
      sumTotalCost += totalCaseCost;

      const dateStr = c.completedDate
        ? new Date(c.completedDate).toLocaleDateString('vi-VN')
        : (c.createdAt ? new Date(c.createdAt).toLocaleDateString('vi-VN') : '');

      const prodsStr = Array.isArray(c.products) ? c.products.join(', ') : (c.products || '');

      detailRowsData.push([
        detailIdx++,
        dateStr,
        s.fullName,
        s.stationName || 'Khác',
        c.customerName || '',
        c.customerPhone || '',
        c.province || '',
        prodsStr,
        c.workType || '',
        c.orderNote || '',
        c.reportNote || '',
        c.distance || 0,
        pBaoHanh,
        pSuaChua,
        pGiaoHang,
        pLapDat,
        pGiaoLap,
        pThayLoc,
        distCost,
        otherCost,
        totalCaseCost
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
}

/**
 * 3. Sheet Ma Trận Đơn Giá KTV (Rates Matrix)
 */
export function buildRatesSheet(workbook: ExcelJS.Workbook, ctx: SalaryExportContext): void {
  const { ratesMatrix, filters } = ctx;
  const wsRates = workbook.addWorksheet('Ma_Tran_Don_Gia');
  wsRates.views = [{ showGridLines: true }];

  // Áp dụng bộ lọc cho danh sách Ma trận đơn giá
  const filteredRates = ratesMatrix.filter(k => {
    if (filters.ktvIdsList.length > 0 && !filters.ktvIdsList.includes(k.userId)) {
      return false;
    }
    if (filters.stationIdsList.length > 0) {
      const matchSt = filters.stationIdsList.some(st => {
        const norm = st.toLowerCase().replace(/trạm\s+/g, '').trim();
        return (k.stationName && k.stationName.toLowerCase().includes(norm)) ||
               (k.province && k.province.toLowerCase().includes(norm));
      });
      if (!matchSt) return false;
    }
    if (filters.mainStationIdsList.length > 0) {
      const matchMain = filters.mainStationIdsList.some(m => {
        const norm = m.toLowerCase().replace(/trạm\s+/g, '').trim();
        return k.mainStationName && k.mainStationName.toLowerCase().includes(norm);
      });
      if (!matchMain) return false;
    }
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const matchQ = (k.fullName && k.fullName.toLowerCase().includes(q)) ||
                     (k.phoneNumber && k.phoneNumber.includes(q)) ||
                     (k.stationName && k.stationName.toLowerCase().includes(q)) ||
                     (k.mainStationName && k.mainStationName.toLowerCase().includes(q));
      if (!matchQ) return false;
    }
    return true;
  });

  // Tiêu đề
  wsRates.mergeCells('A1:P1');
  const titleCell = wsRates.getCell('A1');
  titleCell.value = `MA TRẬN ĐƠN GIÁ DỊCH VỤ KỸ THUẬT VIÊN - TRULIVA`;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1B3A6B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsRates.getRow(1).height = 35;

  wsRates.mergeCells('A2:P2');
  const subCell = wsRates.getCell('A2');
  subCell.value = `Ngày xuất file: ${new Date().toLocaleDateString('vi-VN')} | Số KTV theo bộ lọc: ${filteredRates.length}/${ratesMatrix.length}`;
  subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsRates.getRow(2).height = 20;

  const rateHeaders = [
    'STT', 'Họ và tên KTV', 'Số điện thoại', 'Trạm kỹ thuật', 'Trạm quản lý',
    'Giao hàng (VNĐ)', 'Bảo hành (VNĐ)', 'Sửa chữa (VNĐ)', 'Thay lọc (VNĐ)', 'Lắp đặt (VNĐ)', 'Giao + Lắp (VNĐ)',
    'Cước km vượt (VNĐ/km)', 'Ngưỡng km chuẩn (km)', 'Ngưỡng km TLSC (km)', 'Đơn giá riêng?', 'Ghi chú phân loại'
  ];
  const headerRow = wsRates.addRow(rateHeaders);
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
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

  filteredRates.forEach((k, idx) => {
    const r = k.rates || {};
    const hasCustom = Boolean(k.hasCustomRates);
    const row = wsRates.addRow([
      idx + 1,
      k.fullName,
      k.phoneNumber || '',
      k.stationName || 'Khác',
      k.mainStationName || 'Không có',
      r.giaoHang ?? 20000,
      r.baoHanh ?? 60000,
      r.suaChua ?? 60000,
      r.thayLoc ?? 40000,
      r.lapDat ?? 100000,
      r.giaoHangLapDat ?? 120000,
      r.kmRate ?? 3000,
      r.freeKmThreshold ?? 20,
      r.freeKmThresholdTLSC ?? (k.isOfficialTrulivaKtv ? 20 : 50),
      hasCustom ? 'CÓ (Tùy chỉnh)' : 'Mặc định',
      k.isOfficialTrulivaKtv ? 'KTV Trực thuộc Truliva' : 'KTV Trạm Đối tác'
    ]);
    row.height = 22;

    row.eachCell((cell, colNum) => {
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNum >= 6 && colNum <= 14 ? 'right' : colNum === 1 || colNum === 15 ? 'center' : 'left'
      };
      if (colNum >= 6 && colNum <= 12) {
        cell.numFmt = '#,##0';
      } else if (colNum === 13 || colNum === 14) {
        cell.numFmt = '0';
      }

      if (hasCustom && colNum >= 6 && colNum <= 12) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } }; // Light blue highlight
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });
  });

  const lastRateRow = 4 + filteredRates.length;
  wsRates.autoFilter = `A4:P${Math.max(lastRateRow, 4)}`;

  [6, 25, 15, 20, 20, 15, 15, 15, 15, 15, 15, 18, 16, 16, 16, 22].forEach((w, i) => {
    wsRates.getColumn(i + 1).width = w;
  });
}

/**
 * 4. Sheet Hoa Hồng Bán Hàng (Commissions)
 */
export function buildCommissionsSheet(workbook: ExcelJS.Workbook, ctx: SalaryExportContext): void {
  const { commissionsData, filters } = ctx;
  const wsComm = workbook.addWorksheet('Hoa_Hong_Ban_Hang');
  wsComm.views = [{ showGridLines: true }];

  const rawCommissions: any[] = commissionsData?.commissions || [];

  // Lọc danh sách hoa hồng theo bộ lọc đang áp dụng
  const filteredCommissions = rawCommissions.filter(c => {
    // 1. Lọc theo KTV (KTV Bán hàng hoặc KTV được chọn)
    if (filters.commissionKtvId && c.salesKtvId !== filters.commissionKtvId) {
      return false;
    }
    if (filters.ktvIdsList.length > 0) {
      const matchKtv = filters.ktvIdsList.includes(c.salesKtvId);
      if (!matchKtv) return false;
    }

    // 2. Lọc theo Trạm (Trạm của KTV bán hàng)
    if (filters.stationIdsList.length > 0) {
      const sKtvStation = c.salesKtv?.techStation?.name || '';
      const matchStation = filters.stationIdsList.some(st => {
        const norm = st.toLowerCase().replace(/trạm\s+/g, '').trim();
        return sKtvStation.toLowerCase().includes(norm);
      });
      if (!matchStation) return false;
    }

    // 3. Lọc theo Ngày hoàn thành
    if (filters.completedDate) {
      const cDate = c.completedDate ? new Date(c.completedDate).toLocaleDateString('sv-SE') : '';
      if (cDate !== filters.completedDate) return false;
    }

    // 4. Lọc theo Sản phẩm
    if (filters.productsList.length > 0 && Array.isArray(c.itemsDetail)) {
      const matchProd = c.itemsDetail.some((it: any) =>
        filters.productsList.some(p =>
          (it.name && it.name.toLowerCase().includes(p.toLowerCase())) ||
          (it.sku && it.sku.toLowerCase().includes(p.toLowerCase()))
        )
      );
      if (!matchProd) return false;
    }

    // 5. Lọc theo Tìm kiếm tự do
    const q = (filters.commissionSearchQuery || filters.searchQuery || '').toLowerCase().trim();
    if (q) {
      const matchQ = (c.orderCode && c.orderCode.toLowerCase().includes(q)) ||
                     (c.customerName && c.customerName.toLowerCase().includes(q)) ||
                     (c.customerPhone && c.customerPhone.includes(q)) ||
                     (c.salesKtvName && c.salesKtvName.toLowerCase().includes(q)) ||
                     (c.salesKtv?.phoneNumber && c.salesKtv.phoneNumber.includes(q)) ||
                     (c.assignedKtvName && c.assignedKtvName.toLowerCase().includes(q)) ||
                     (c.salesCommissionNote && c.salesCommissionNote.toLowerCase().includes(q));
      if (!matchQ) return false;
    }

    return true;
  });

  // Tính tổng
  let sumDeviceRevenue = 0;
  let sumPreVatDeviceRevenue = 0;
  let sumLapDatDeducted = 0;
  let sumDeviceComm = 0;
  let sumFilterRevenue = 0;
  let sumPreVatFilterRevenue = 0;
  let sumFilterComm = 0;
  let sumCalcComm = 0;
  let sumFinalComm = 0;

  filteredCommissions.forEach(c => {
    sumDeviceRevenue += (c.deviceRevenue || 0) - (c.deviceDiscount || 0);
    sumPreVatDeviceRevenue += c.preVatDeviceRevenue || 0;
    sumLapDatDeducted += c.lapDatCostDeducted || 0;
    sumDeviceComm += Math.max(0, (c.deviceCommissionGross || 0) - (c.lapDatCostDeducted || 0));
    sumFilterRevenue += (c.filterRevenue || 0) - (c.filterDiscount || 0);
    sumPreVatFilterRevenue += c.preVatFilterRevenue || 0;
    sumFilterComm += c.filterCommissionGross || 0;
    sumCalcComm += c.calculatedCommission || 0;
    sumFinalComm += c.finalCommission || 0;
  });

  // Tiêu đề
  wsComm.mergeCells('A1:S1');
  const titleCell = wsComm.getCell('A1');
  titleCell.value = `BẢNG TÍNH HOA HỒNG BÁN HÀNG KỸ THUẬT VIÊN - THÁNG ${filters.month}`;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1B3A6B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsComm.getRow(1).height = 35;

  wsComm.mergeCells('A2:S2');
  const subCell = wsComm.getCell('A2');
  subCell.value = `Ngày xuất file: ${new Date().toLocaleDateString('vi-VN')} | Số đơn hàng: ${filteredCommissions.length} | Tổng hoa hồng thực nhận: ${Math.round(sumFinalComm).toLocaleString('vi-VN')} VNĐ`;
  subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsComm.getRow(2).height = 20;

  const commHeaders = [
    'STT', 'Mã đơn hàng', 'Ngày hoàn thành', 'Khách hàng', 'SĐT Khách hàng',
    'KTV Bán hàng', 'SĐT KTV Bán', 'Trạm KTV Bán', 'KTV Lắp đặt',
    'Doanh số Máy (Trước VAT)', 'Trừ ca GH & LĐ (VNĐ)', 'Hoa hồng Máy (15%)',
    'Doanh số Lõi/PK (Trước VAT)', 'Hoa hồng Lõi/PK (10%)',
    'Hoa hồng tự động tính (VNĐ)', 'Điều chỉnh / Ghi chú', 'Hoa hồng thực nhận (VNĐ)'
  ];
  const headerRow = wsComm.addRow(commHeaders);
  headerRow.height = 28;

  headerRow.eachCell((cell) => {
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

  filteredCommissions.forEach((c, idx) => {
    const dateStr = c.completedDate
      ? new Date(c.completedDate).toLocaleDateString('vi-VN')
      : '';
    const deviceNetComm = Math.max(0, (c.deviceCommissionGross || 0) - (c.lapDatCostDeducted || 0));

    const row = wsComm.addRow([
      idx + 1,
      c.orderCode || c.pancakeOrderId || c.orderId,
      dateStr,
      c.customerName || 'Khách vãng lai',
      c.customerPhone || '',
      c.salesKtvName || c.salesKtv?.fullName || 'Chưa chọn',
      c.salesKtvPhone || c.salesKtv?.phoneNumber || '',
      c.salesKtv?.techStation?.name || '',
      c.assignedKtvName || c.assignedKtv?.fullName || 'Chưa phân KTV',
      c.preVatDeviceRevenue || 0,
      c.lapDatCostDeducted || 0,
      deviceNetComm,
      c.preVatFilterRevenue || 0,
      c.filterCommissionGross || 0,
      c.calculatedCommission || 0,
      c.salesCommissionNote || (c.isAdjustedByAdmin ? 'Admin điều chỉnh' : ''),
      c.finalCommission || 0
    ]);
    row.height = 22;

    row.eachCell((cell, colNum) => {
      cell.alignment = {
        vertical: 'middle',
        horizontal: (colNum >= 10 && colNum <= 15) || colNum === 17 ? 'right' : colNum === 1 || colNum === 2 || colNum === 3 ? 'center' : 'left'
      };
      if ((colNum >= 10 && colNum <= 15) || colNum === 17) {
        cell.numFmt = '#,##0';
      }
      if (colNum === 17) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF065F46' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });
  });

  // Hàng tổng cộng Hoa hồng
  const topSummaryRow = wsComm.addRow([
    'TỔNG CỘNG THEO BỘ LỌC:', '', '', '', '', '', '', '', '',
    sumPreVatDeviceRevenue,
    sumLapDatDeducted,
    sumDeviceComm,
    sumPreVatFilterRevenue,
    sumFilterComm,
    sumCalcComm,
    '',
    sumFinalComm
  ]);
  topSummaryRow.height = 26;
  topSummaryRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1B3A6B' } };
    cell.alignment = { vertical: 'middle', horizontal: (colNum >= 10 && colNum <= 15) || colNum === 17 ? 'right' : 'left' };
    if ((colNum >= 10 && colNum <= 15) || colNum === 17) cell.numFmt = '#,##0';
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF1B3A6B' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF1B3A6B' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  const lastCommRow = 4 + filteredCommissions.length;
  wsComm.autoFilter = `A4:Q${Math.max(lastCommRow, 4)}`;

  [6, 18, 16, 22, 15, 22, 15, 18, 20, 22, 18, 18, 22, 18, 22, 22, 22].forEach((w, i) => {
    wsComm.getColumn(i + 1).width = w;
  });
}

/**
 * Registry Quản lý các Tab xuất Excel cho Module Quản lý Lương
 * Mở rộng: Khi có thêm tab mới, chỉ cần thêm 1 entry vào registry này.
 */
export const SALARY_EXPORT_TABS: Record<string, {
  id: string;
  name: string;
  sheetName: string;
  fileNamePrefix: string;
  build: (workbook: ExcelJS.Workbook, ctx: SalaryExportContext) => Promise<void> | void;
}> = {
  summary: {
    id: 'summary',
    name: 'Tổng hợp theo KTV',
    sheetName: 'Tong_Hop_KTV',
    fileNamePrefix: 'Bang_tong_hop_thu_lao_KTV',
    build: buildSummarySheet
  },
  cases: {
    id: 'cases',
    name: 'Chi tiết ca dịch vụ',
    sheetName: 'Chi_Tiet_Ca_Dich_Vu',
    fileNamePrefix: 'Chi_tiet_ca_dich_vu',
    build: buildCasesSheet
  },
  rates: {
    id: 'rates',
    name: 'Ma trận đơn giá KTV',
    sheetName: 'Ma_Tran_Don_Gia',
    fileNamePrefix: 'Ma_tran_don_gia_KTV',
    build: buildRatesSheet
  },
  commissions: {
    id: 'commissions',
    name: 'Hoa hồng bán hàng',
    sheetName: 'Hoa_Hong_Ban_Hang',
    fileNamePrefix: 'Bang_hoa_hong_ban_hang',
    build: buildCommissionsSheet
  }
};

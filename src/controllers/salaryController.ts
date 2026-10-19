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
import { computeCommissionsForMonth } from '../services/commissionService';
import {
  getRatesMatrixData,
  SALARY_EXPORT_TABS,
  SalaryExportContext,
  SalaryExportFilters
} from '../services/salaryExportService';

/**
 * GET /api/salaries/calculate
 * Calculate full salaries for all active KTVs for a given month
 */
export async function getCalculatedSalaries(req: Request, res: Response): Promise<void> {
  try {
    const month = (req.query.month as string) || `${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
    const [salaryResult, commissionResult] = await Promise.all([
      computeFullSalariesForMonth(month),
      computeCommissionsForMonth(month)
    ]);

    const commissionsByKtv = commissionResult.ktvSummaries || {};
    const mergedSalaries = salaryResult.map((ktv: any) => {
      const comm = commissionsByKtv[ktv.userId];
      const salesCommission = comm ? comm.totalFinalCommission : 0;
      const salesCommissionOrdersCount = comm ? comm.totalOrders : 0;
      const salesCommissionCalculated = comm ? comm.totalCalculatedCommission : 0;
      return {
        ...ktv,
        salesCommission,
        salesCommissionOrdersCount,
        salesCommissionCalculated,
        totalIncome: (ktv.adjustedCost !== undefined && ktv.adjustedCost !== null ? ktv.adjustedCost : ktv.calculatedCost) + salesCommission
      };
    });

    res.json({
      month,
      salaries: mergedSalaries,
      data: mergedSalaries,
      commissionStats: commissionResult.stats
    });
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
    const tab = (req.query.tab as string) || (req.query.sheet as string) || 'all';

    const ktvIds = (req.query.ktvIds as string) || (req.query.ktvId as string) || '';
    const stationId = (req.query.stationIds as string) || (req.query.stationId as string) || '';
    const mainStationId = (req.query.mainStationIds as string) || (req.query.mainStationId as string) || '';
    const workTypeFilter = (req.query.workTypes as string) || (req.query.workType as string) || '';
    const serviceTypeFilter = (req.query.serviceTypes as string) || (req.query.serviceType as string) || '';
    const productFilter = (req.query.products as string) || (req.query.product as string) || '';
    const completedDate = (req.query.completedDate as string) || '';
    const searchQuery = (req.query.search as string || '').toLowerCase().trim();
    const commissionSearchQuery = (req.query.commissionSearch as string || '').toLowerCase().trim();
    const commissionKtvId = (req.query.commissionKtvId as string || '').trim();

    const rawDistancePresets = (req.query.distancePresets as string) || (req.query.distancePreset as string) || '';
    const distancePresetsList = rawDistancePresets ? rawDistancePresets.split(',').map(s => s.trim()).filter(Boolean) : [];
    const distanceOp = (req.query.distanceOp as string) || '>=';
    const distanceMin = (req.query.distanceMin as string) || '';
    const distanceMax = (req.query.distanceMax as string) || '';

    const ktvIdsList = ktvIds ? ktvIds.split(',').map(s => s.trim()).filter(Boolean) : [];
    const stationIdsList = stationId ? stationId.split(',').map(s => s.trim()).filter(Boolean) : [];
    const mainStationIdsList = mainStationId ? mainStationId.split(',').map(s => s.trim()).filter(Boolean) : [];
    const workTypesList = workTypeFilter ? workTypeFilter.split(',').map(s => s.trim()).filter(Boolean) : [];
    const serviceTypesList = serviceTypeFilter ? serviceTypeFilter.split(',').map(s => s.trim()).filter(Boolean) : [];
    const productsList = productFilter ? productFilter.split(',').map(s => s.trim()).filter(Boolean) : [];

    const normStr = (str: string | null | undefined): string => {
      if (!str) return '';
      return String(str).toLowerCase().replace(/trạm\s+/g, '').trim();
    };

    const toSlug = (str: string | null | undefined): string => {
      if (!str) return '';
      return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    };

    const isTLSC = (wt: string | null | undefined): boolean => {
      const s = String(wt || '').toLowerCase();
      return s.includes('thay lọc') || s.includes('thay loc') || s.includes('sửa chữa') || s.includes('sua chua');
    };

    const checkCaseDistance = (c: any) => {
      const dist = typeof c.distance === 'number' ? c.distance : (parseFloat(String(c.distance || 0)) || 0);
      const distCost = c.distanceCost || 0;
      const isTlscCase = isTLSC(c.workType);

      const hasCustom = distancePresetsList.includes('custom') && (distanceMin !== '' || distanceMax !== '');
      if (distancePresetsList.length === 0 && !hasCustom) {
        return true;
      }

      const matchesPreset = distancePresetsList.some(preset => {
        if (preset === '>20' || preset === 'threshold_standard') {
          return !isTlscCase ? dist > 20 : (distancePresetsList.includes('>50') ? false : dist > 20);
        }
        if (preset === '>50' || preset === 'threshold_tlsc') {
          return isTlscCase ? dist > 50 : (distancePresetsList.includes('>20') ? false : dist > 50);
        }
        if (preset === 'has_fee') {
          return distCost > 0;
        }
        if (preset === 'no_fee') {
          return distCost === 0;
        }
        if (preset === '0') {
          return dist === 0;
        }
        if (preset === '1-20') {
          return dist >= 1 && dist <= 20;
        }
        if (preset === '21-50') {
          return dist >= 21 && dist <= 50;
        }
        if (preset === '>50_all' || preset === '>50_range') {
          return dist > 50;
        }
        return false;
      });

      if (matchesPreset) return true;

      if (hasCustom) {
        const min = distanceMin !== '' ? parseFloat(distanceMin) : null;
        const max = distanceMax !== '' ? parseFloat(distanceMax) : null;

        if (distanceOp === '>') {
          if (min !== null && dist > min) return true;
        } else if (distanceOp === '>=') {
          if (min !== null && dist >= min) return true;
        } else if (distanceOp === '<') {
          if (min !== null && dist < min) return true;
        } else if (distanceOp === '<=') {
          if (min !== null && dist <= min) return true;
        } else if (distanceOp === '=') {
          if (min !== null && dist === min) return true;
        } else if (distanceOp === 'between') {
          const m1 = min !== null ? dist >= min : true;
          const m2 = max !== null ? dist <= max : true;
          if (m1 && m2) return true;
        }
      }

      return false;
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

      const matchServiceType = serviceTypesList.length === 0 || (s.cases && s.cases.some((c: any) =>
        serviceTypesList.some(st => c.serviceType && c.serviceType.toLowerCase().includes(st.toLowerCase()))
      ));
      if (!matchServiceType) return false;

      const matchProduct = productsList.length === 0 || (s.cases && s.cases.some((c: any) =>
        productsList.some(p => c.products && Array.isArray(c.products) && c.products.some((prod: any) => String(prod).toLowerCase().includes(p.toLowerCase())))
      ));
      if (!matchProduct) return false;

      const matchDistance = (distancePresetsList.length === 0 && !distancePresetsList.includes('custom')) || (s.cases && s.cases.some((c: any) => checkCaseDistance(c)));
      if (!matchDistance) return false;

      const matchQuery = !searchQuery ||
        s.fullName.toLowerCase().includes(searchQuery) ||
        s.username.toLowerCase().includes(searchQuery) ||
        (s.phoneNumber && s.phoneNumber.includes(searchQuery)) ||
        (s.cases && s.cases.some((c: any) => 
          (c.customerName && c.customerName.toLowerCase().includes(searchQuery)) ||
          (c.customerPhone && c.customerPhone.includes(searchQuery)) ||
          (c.province && c.province.toLowerCase().includes(searchQuery)) ||
          (c.orderNote && c.orderNote.toLowerCase().includes(searchQuery)) ||
          (c.reportNote && c.reportNote.toLowerCase().includes(searchQuery)) ||
          (c.serviceType && c.serviceType.toLowerCase().includes(searchQuery)) ||
          (c.products && Array.isArray(c.products) && c.products.some((prod: any) => String(prod).toLowerCase().includes(searchQuery)))
        ));
      if (!matchQuery) return false;

      return true;
    });

    const [ratesMatrix, commissionsData] = await Promise.all([
      getRatesMatrixData(),
      computeCommissionsForMonth(month)
    ]);

    const exportFilters: SalaryExportFilters = {
      month,
      ktvIdsList,
      stationIdsList,
      mainStationIdsList,
      workTypesList,
      serviceTypesList,
      productsList,
      completedDate,
      searchQuery,
      commissionSearchQuery,
      commissionKtvId,
      distancePresetsList,
      distanceOp,
      distanceMin,
      distanceMax,
      tab
    };

    const ctx: SalaryExportContext = {
      filters: exportFilters,
      filteredSalaries,
      allSalaries,
      ratesMatrix,
      commissionsData
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Truliva System';
    workbook.created = new Date();

    const rawTab = (req.query.tab as string) || (req.query.tabs as string) || (req.query.sheet as string) || 'default';

    // Xác định danh sách các sheet cần xuất (Mặc định: Tất cả ngoại trừ ma trận đơn giá)
    let targetTabKeys: string[] = [];
    if (!rawTab || rawTab === 'default') {
      targetTabKeys = Object.keys(SALARY_EXPORT_TABS).filter(k => k !== 'rates');
    } else if (rawTab === 'all') {
      targetTabKeys = Object.keys(SALARY_EXPORT_TABS);
    } else {
      const requestedKeys = rawTab.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      targetTabKeys = requestedKeys.filter(k => !!SALARY_EXPORT_TABS[k]);
      if (targetTabKeys.length === 0) {
        targetTabKeys = Object.keys(SALARY_EXPORT_TABS).filter(k => k !== 'rates');
      }
    }

    const monthClean = month.replace('/', '_');

    // Xây dựng hậu tố tên file dựa trên bộ lọc áp dụng
    const filterParts: string[] = [];

    if (ktvIdsList.length === 1) {
      const singleKtv = allSalaries.find((s: any) => s.userId === ktvIdsList[0]);
      if (singleKtv && singleKtv.fullName) {
        filterParts.push(`KTV_${toSlug(singleKtv.fullName)}`);
      } else {
        filterParts.push(`KTV_${ktvIdsList[0].slice(0, 8)}`);
      }
    } else if (ktvIdsList.length > 1) {
      filterParts.push(`KTV_${ktvIdsList.length}_nguoi`);
    } else if (commissionKtvId) {
      const commKtv = allSalaries.find((s: any) => s.userId === commissionKtvId);
      if (commKtv && commKtv.fullName) {
        filterParts.push(`KTV_${toSlug(commKtv.fullName)}`);
      }
    }

    if (stationIdsList.length === 1) {
      let stName = stationIdsList[0];
      if (stName.includes('::')) stName = stName.split('::')[1] || stName.split('::')[0];
      filterParts.push(`Tram_${toSlug(stName)}`);
    } else if (stationIdsList.length > 1) {
      filterParts.push(`Tram_${stationIdsList.length}_tram`);
    }

    if (completedDate) {
      const dParts = completedDate.split('-');
      if (dParts.length === 3) {
        filterParts.push(`Ngay_${dParts[2]}_${dParts[1]}_${dParts[0]}`);
      } else {
        filterParts.push(`Ngay_${toSlug(completedDate)}`);
      }
    }

    if (workTypesList.length === 1) {
      filterParts.push(toSlug(workTypesList[0]));
    }

    if (productsList.length === 1) {
      filterParts.push(`SP_${toSlug(productsList[0])}`);
    }

    const filterSuffix = filterParts.length > 0 ? `_${filterParts.join('_')}` : '';
    const monthTag = `T${monthClean}`;

    let basePrefix = 'Bang_thu_lao_Truliva';
    if (targetTabKeys.length === 1) {
      const selectedTab = SALARY_EXPORT_TABS[targetTabKeys[0]];
      await selectedTab.build(workbook, ctx);
      basePrefix = selectedTab.fileNamePrefix;
    } else {
      for (const tabKey of targetTabKeys) {
        await SALARY_EXPORT_TABS[tabKey].build(workbook, ctx);
      }
      if (targetTabKeys.length === Object.keys(SALARY_EXPORT_TABS).length) {
        basePrefix = 'Bang_thu_lao_Truliva_Full';
      } else if (targetTabKeys.includes('rates')) {
        basePrefix = 'Bang_thu_lao_Truliva_Tuy_chon';
      } else {
        basePrefix = 'Bang_thu_lao_Truliva';
      }
    }

    let cleanSuffix = filterSuffix;
    if (basePrefix.endsWith('_KTV') && cleanSuffix.startsWith('_KTV_')) {
      cleanSuffix = cleanSuffix.slice(4);
    }
    const fileName = `${basePrefix}${cleanSuffix}_${monthTag}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

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
    const result = await getRatesMatrixData();
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
      freeKmThresholdTLSC: 20
    };

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

          await tx.ktvServiceRate.upsert({
            where: {
              userId_workType: { userId: uId, workType: wType }
            },
            update: {
              rate: rNum,
              updatedAt: new Date()
            },
            create: {
              userId: uId,
              workType: wType,
              rate: rNum
            }
          });
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

    const record = await prisma.ktvServiceRate.upsert({
      where: {
        userId_workType: { userId, workType }
      },
      update: {
        rate: rateNum,
        updatedAt: new Date()
      },
      create: {
        userId,
        workType,
        rate: rateNum
      }
    });

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
    const { userId, ktvUserId, customerName, customerPhone, province, workType, amount, otherCost, note, notes, month } = req.body;
    const targetUserId = userId || ktvUserId;
    const targetNote = note || notes;

    if (!targetUserId || !workType || !month) {
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
    const parsedAmount = hasAmount ? Number(String(amount).replace(/\D/g, '')) : 0;
    const hasOtherCost = otherCost !== undefined && otherCost !== null && otherCost !== '';
    const parsedOtherCost = hasOtherCost ? Number(String(otherCost).replace(/\D/g, '')) : 0;

    const customCostsObj: any = {};
    if (parsedOtherCost > 0) {
      customCostsObj.otherCost = parsedOtherCost;
    }

    let customBaseCost: number | null = null;

    if (rateType === 'other') {
      if (parsedAmount > 0) {
        customCostsObj.otherCost = (customCostsObj.otherCost || 0) + parsedAmount;
      }
    } else {
      if (parsedAmount > 0) {
        customBaseCost = parsedAmount;
        if (rateType === 'baoHanh') customCostsObj.baoHanhCost = parsedAmount;
        else if (rateType === 'suaChua') customCostsObj.suaChuaCost = parsedAmount;
        else if (rateType === 'giaoHang') customCostsObj.giaoHangCost = parsedAmount;
        else if (rateType === 'lapDat') customCostsObj.lapDatCost = parsedAmount;
        else if (rateType === 'giaoHangLapDat') customCostsObj.giaoLapCost = parsedAmount;
        else if (rateType === 'thayLoc') customCostsObj.thayLocCost = parsedAmount;
      }
    }

    const report = await prisma.serviceReport.create({
      data: {
        month: targetMonth,
        ktvUserId: targetUserId,
        reportedById: targetUserId,
        customerName: customerName || 'Ca điều chỉnh bổ sung',
        customerPhone: customerPhone || '',
        province: province || 'Khác',
        workType: workType || 'Phí khác',
        serviceType: 'Phí bổ sung admin',
        approvalStatus: 'APPROVED',
        notes: targetNote || 'Do Admin thêm bổ sung thủ công',
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

    // [RULE 7 - ZERO HARD-DELETE POLICY] Soft-delete ca bổ sung
    await prisma.serviceReport.update({
      where: { id: reportId },
      data: {
        approvalStatus: 'REJECTED',
        orderId: null,
        notes: '[ĐÃ HỦY CA BỔ SUNG]'
      }
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
      // Mọi cột cụ thể (baoHanhCost, suaChuaCost, giaoHangCost, lapDatCost, giaoLapCost, thayLocCost, distanceCost, otherCost)
      // CHỈ CẬP NHẬT vào customCosts[fieldName]!
      // TUYỆT ĐỐI KHÔNG ghi đè customBaseCost để đảm bảo tính độc lập 100% giữa các cột!
      const updatedCustomCosts = {
        ...existingCustomCosts,
        [fieldName]: val
      };
      await prisma.serviceReport.update({
        where: { id: reportId },
        data: {
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

/**
 * GET /api/salaries/commissions
 * Lấy danh sách hoa hồng bán hàng KTV theo tháng
 */
export async function getCommissions(req: Request, res: Response): Promise<void> {
  try {
    const month = (req.query.month as string) || `${new Date().getMonth() + 1}/${new Date().getFullYear()}`;
    const ktvId = req.query.ktvId as string | undefined;
    const result = await computeCommissionsForMonth(month, ktvId);
    res.json(result);
  } catch (error: any) {
    logger.error('Error getting commissions', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu hoa hồng bán hàng' });
  }
}

/**
 * POST /api/salaries/commissions/adjust
 * Admin điều chỉnh thông tin chi phí / hoa hồng cho đơn hàng
 */
export async function adjustOrderCommission(req: Request, res: Response): Promise<void> {
  try {
    const { orderId, customSalesCommission, commissionAdjustments, salesCommissionNote } = req.body;
    if (!orderId) {
      res.status(400).json({ error: 'Thiếu orderId' });
      return;
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id: orderId }
    });
    if (!existingOrder) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }

    const updateData: any = {};
    if (customSalesCommission !== undefined) {
      updateData.customSalesCommission = customSalesCommission !== null ? Number(customSalesCommission) : null;
    }
    if (commissionAdjustments !== undefined) {
      updateData.commissionAdjustments = commissionAdjustments;
    }
    if (salesCommissionNote !== undefined) {
      updateData.salesCommissionNote = salesCommissionNote;
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: orderId,
        action: 'adjust_commission',
        changes: {
          customSalesCommission,
          commissionAdjustments,
          salesCommissionNote
        },
        userId: req.user?.id || 'admin',
        userName: req.user?.fullName || 'Admin'
      }
    });

    res.json({ success: true, order: updatedOrder });
  } catch (error: any) {
    logger.error('Error adjusting commission', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Lỗi điều chỉnh hoa hồng đơn hàng' });
  }
}




import prisma from '../config/database';
import logger from '../utils/logger';
import { getOfficialTrulivaBaseRate, loadStationRates, normalizePhone } from './salaryService';

export interface ProductCategorization {
  type: 'DEVICE' | 'FILTER_SPARE_PART' | 'OTHER';
  category: string;
}

/**
 * Phân loại sản phẩm: Device (Máy/Thiết bị) vs Filter & Spare part (Lõi lọc & Linh kiện)
 */
export function categorizeProduct(categoryName?: string | null, productName?: string | null): 'DEVICE' | 'FILTER_SPARE_PART' | 'OTHER' {
  const cat = (categoryName || '').trim().toLowerCase();
  const name = (productName || '').trim().toLowerCase();

  // Nhóm Device (Thiết bị)
  // Các category có chứa 'device', ví dụ: 'Device', 'Water CT Device', 'Water UTS Device', 'Water WM Device', 'Air CT Device'
  if (cat.includes('device') || cat === 'thiết bị' || cat === 'thiet bi') {
    return 'DEVICE';
  }

  // Nhóm Filter & Spare part (Lõi lọc & Linh kiện / Phụ kiện)
  // Chú ý: Prefilter là Lõi lọc thô
  if (
    cat.includes('filter') ||
    cat.includes('spare') ||
    cat.includes('lõi') ||
    cat.includes('loi') ||
    cat.includes('linh kiện') ||
    cat.includes('linh kien') ||
    cat.includes('phụ kiện') ||
    cat.includes('phu kien')
  ) {
    return 'FILTER_SPARE_PART';
  }

  // Fallback dựa theo tên sản phẩm nếu category chưa rõ
  if (name.includes('máy lọc') || name.includes('may loc') || name.includes('delica') || name.includes('ultima')) {
    return 'DEVICE';
  }
  if (
    name.includes('lõi lọc') ||
    name.includes('loi loc') ||
    name.includes('lõi') ||
    name.includes('loi') ||
    name.includes('bộ lõi') ||
    name.includes('bo loi') ||
    name.includes('cốc lọc') ||
    name.includes('coc loc') ||
    name.includes('vòi') ||
    name.includes('voi') ||
    name.includes('bơm') ||
    name.includes('adapter') ||
    name.includes('dây cấp') ||
    name.includes('co nối') ||
    name.includes('van')
  ) {
    return 'FILTER_SPARE_PART';
  }

  return 'OTHER';
}

export interface OrderCommissionItem {
  name: string;
  sku?: string | null;
  category: string;
  type: 'DEVICE' | 'FILTER_SPARE_PART' | 'OTHER';
  quantity: number;
  price: number;
  discount: number;
  revenue: number;
  effectiveDiscount: number;
}

export interface OrderCommissionResult {
  orderId: string;
  pancakeOrderId?: number | null;
  orderCode?: string; // Alias: frontend display code
  customerName?: string | null;
  customerPhone?: string | null;
  completionDate?: Date | null;
  completedDate?: Date | null; // Alias for frontend
  salesKtvId: string;
  salesKtvName?: string | null;
  salesKtvPhone?: string | null;
  salesKtv?: any; // Object cho frontend display
  assignedKtvId?: string | null;
  assignedKtvName?: string | null;
  assignedKtv?: any; // Object cho frontend display
  workType?: string | null;
  itemsDetail: OrderCommissionItem[];
  // Device numbers
  deviceRevenue: number;
  deviceDiscount: number;
  preVatDeviceRevenue: number;
  deviceCommissionRate: number; // 15% (0.15)
  deviceCommissionGross: number; // before lapDat deduction
  deviceCommissionPreLapDat?: number; // Alias for frontend
  // Filter numbers
  filterRevenue: number;
  filterDiscount: number;
  preVatFilterRevenue: number;
  filterCommissionRate: number; // 10% (0.10)
  filterCommissionGross: number;
  filterCommission?: number; // Alias for frontend
  // Lap dat / Giao hang & Lap dat deduction
  lapDatCostDeducted: number;
  deliveryInstallCostDeducted?: number;
  lapDatRateSource?: string; // Nguồn đơn giá lắp đặt / giao lắp
  deliveryInstallRateSource?: string;
  hasDevice: boolean;
  // Calculated commission
  calculatedCommission: number;
  // Admin adjustments
  customSalesCommission?: number | null;
  commissionAdjustments?: any;
  salesCommissionNote?: string | null;
  finalCommission: number;
  isAdjustedByAdmin: boolean;
  isCustom?: boolean; // Alias for frontend
}

/**
 * Lấy đơn giá ca Giao hàng & Lắp đặt của KTV bán hàng (salesKtv) + nguồn đơn giá
 */
export function getSalesKtvDeliveryInstallRate(
  salesKtvUser: any,
  stationRate: any,
  customKtvRatesMap?: Map<string, number>
): { rate: number; source: string } {
  // rate = 0 coi như chưa cấu hình → fallback xuống mức tiếp theo
  // 1. Kiểm tra đơn giá KTV tùy chỉnh trong Metric (giaoHangLapDat)
  if (customKtvRatesMap && customKtvRatesMap.has('giaoHangLapDat')) {
    const r = customKtvRatesMap.get('giaoHangLapDat');
    if (r !== undefined && r !== null && r > 0) return { rate: r, source: 'Đơn giá KTV tùy chỉnh (GH & Lắp đặt)' };
  }
  // 2. Biểu phí trạm giaoHangLapDat
  if (stationRate?.rates?.giaoHangLapDat !== undefined && stationRate?.rates?.giaoHangLapDat !== null && stationRate.rates.giaoHangLapDat > 0) {
    return { rate: stationRate.rates.giaoHangLapDat, source: `Đơn giá Trạm ${stationRate?.stationName || ''}` };
  }
  // 3. Fallback: Chuẩn Truliva Giao hàng & Lắp đặt (120k)
  return { rate: getOfficialTrulivaBaseRate('Giao hàng và lắp đặt'), source: 'Chuẩn Truliva (120k)' };
}

// Alias để tương thích ngược
export const getSalesKtvLapDatRate = getSalesKtvDeliveryInstallRate;

/**
 * Tính toán hoa hồng bán hàng cho 1 đơn hàng cụ thể
 */
export function calculateSingleOrderCommission(
  order: any,
  productsMap: Map<string, any>,
  salesKtvLapDatRate: number,
  lapDatRateSource?: string
): OrderCommissionResult {
  const adjustments = (order.commissionAdjustments as any) || {};

  // Nếu Admin đã ghi đè toàn bộ các trường con trong commissionAdjustments
  const hasCustomNumbers = adjustments && typeof adjustments === 'object' && Object.keys(adjustments).length > 0;

  const rawItems = order.items || [];
  const itemsDetail: OrderCommissionItem[] = [];

  let rawDeviceRevenue = 0;
  let rawDeviceDiscount = 0;
  let rawFilterRevenue = 0;
  let rawFilterDiscount = 0;

  // Trích xuất giảm giá item-level từ order.rawData.items (Pancake POS gốc)
  // Mỗi Pancake item có total_discount (số tiền KM thực tế, ví dụ KM 100% = full price)
  // order_items.rawData chỉ lưu variation data nên KHÔNG có total_discount
  const pancakeItemDiscountMap = new Map<string, number>();
  const rawOrderData = (order.rawData || {}) as any;
  const rawOrderItems = rawOrderData.items || rawOrderData.order_items || [];
  for (const ri of rawOrderItems) {
    const td = Number(ri.total_discount || 0);
    if (ri.variation_id) pancakeItemDiscountMap.set(`var:${ri.variation_id}`, td);
    const riSku = ri.variation_info?.display_id || ri.sku || '';
    if (riSku) pancakeItemDiscountMap.set(`sku:${riSku.toLowerCase()}`, td);
  }

  for (const it of rawItems) {
    const pName = it.productName || '';
    const pSku = it.sku || '';
    const pInfo = (pSku ? productsMap.get(`SKU:${pSku.toLowerCase()}`) : null) || productsMap.get(`NAME:${pName.toLowerCase()}`);
    const cat = pInfo?.category || '';
    const type = categorizeProduct(cat, pName);

    const qty = it.quantity || 1;
    const price = it.price || 0;
    const revenue = price * qty;

    // Lấy giảm giá item từ order.rawData.items (Pancake POS) bằng cách match variation_id hoặc SKU
    // order_items.rawData.id = variation UUID trong Pancake
    const itemRawData = (it.rawData || {}) as any;
    const variationId = itemRawData.id;
    const pancakeItemDiscount =
      (variationId ? pancakeItemDiscountMap.get(`var:${variationId}`) : undefined) ??
      (pSku ? pancakeItemDiscountMap.get(`sku:${pSku.toLowerCase()}`) : undefined);

    const itemDiscount = (pancakeItemDiscount !== undefined && pancakeItemDiscount > 0)
      ? pancakeItemDiscount
      : (it.discount || 0) * qty;

    if (type === 'DEVICE') {
      rawDeviceRevenue += revenue;
      rawDeviceDiscount += itemDiscount;
    } else {
      // Bao gồm cả FILTER_SPARE_PART và OTHER vào nhóm 10%
      rawFilterRevenue += revenue;
      rawFilterDiscount += itemDiscount;
    }

    itemsDetail.push({
      name: pName,
      sku: pSku,
      category: cat,
      type,
      quantity: qty,
      price,
      discount: it.discount || 0,
      revenue,
      effectiveDiscount: itemDiscount
    });
  }


  // Phân bổ giảm giá order-level (totalDiscount từ Pancake) theo doanh thu THỰC sau giảm giá item
  // Mục đích: item đã KM 100% (doanh thu thực = 0) không bị phân bổ thêm giảm giá order-level
  const totalOrderDiscount = order.totalDiscount || 0;
  if (totalOrderDiscount > 0) {
    const netDeviceRev = Math.max(0, rawDeviceRevenue - rawDeviceDiscount);
    const netFilterRev = Math.max(0, rawFilterRevenue - rawFilterDiscount);
    const totalNetRev = netDeviceRev + netFilterRev;
    if (totalNetRev > 0) {
      rawDeviceDiscount += Math.round((netDeviceRev / totalNetRev) * totalOrderDiscount);
      rawFilterDiscount += Math.round((netFilterRev / totalNetRev) * totalOrderDiscount);
    }
  }

  const hasDevice = itemsDetail.some(i => i.type === 'DEVICE');

  // Giá trị tính toán thực tế (ưu tiên số liệu Admin điều chỉnh nếu có)
  const deviceRevenue = adjustments.customDeviceRevenue !== undefined ? Number(adjustments.customDeviceRevenue) : rawDeviceRevenue;
  const deviceDiscount = adjustments.customDeviceDiscount !== undefined ? Number(adjustments.customDeviceDiscount) : rawDeviceDiscount;
  const filterRevenue = adjustments.customFilterRevenue !== undefined ? Number(adjustments.customFilterRevenue) : rawFilterRevenue;
  const filterDiscount = adjustments.customFilterDiscount !== undefined ? Number(adjustments.customFilterDiscount) : rawFilterDiscount;

  const deviceCommissionRate = adjustments.customDeviceRate !== undefined ? Number(adjustments.customDeviceRate) : 0.15;
  const filterCommissionRate = adjustments.customFilterRate !== undefined ? Number(adjustments.customFilterRate) : 0.10;

  const lapDatCostDeducted = adjustments.customDeliveryInstallCost !== undefined
    ? Number(adjustments.customDeliveryInstallCost)
    : (adjustments.customLapDatCost !== undefined
      ? Number(adjustments.customLapDatCost)
      : (hasDevice ? salesKtvLapDatRate : 0));

  // Pre-VAT calculations (chia 1.08)
  const netDevice = Math.max(0, deviceRevenue - deviceDiscount);
  const preVatDeviceRevenue = netDevice / 1.08;
  const deviceCommissionGross = Math.round(preVatDeviceRevenue * deviceCommissionRate);

  const netFilter = Math.max(0, filterRevenue - filterDiscount);
  const preVatFilterRevenue = netFilter / 1.08;
  const filterCommissionGross = Math.round(preVatFilterRevenue * filterCommissionRate);

  // Hoa hồng hệ thống tính:
  const calculatedCommission = Math.round(deviceCommissionGross + filterCommissionGross - lapDatCostDeducted);

  // Final commission
  let finalCommission = calculatedCommission;
  let isAdjustedByAdmin = false;

  if (order.customSalesCommission !== null && order.customSalesCommission !== undefined) {
    finalCommission = Number(order.customSalesCommission);
    isAdjustedByAdmin = true;
  } else if (hasCustomNumbers) {
    finalCommission = calculatedCommission;
    isAdjustedByAdmin = true;
  }

  // Xác định ngày hoàn thành (tính theo ngày nghiệm thu của ca)
  let completionDate: Date | null = null;
  if (order.serviceReports && order.serviceReports.length > 0) {
    const approvedReports = order.serviceReports
      .filter((r: any) => r.approvalStatus === 'APPROVED')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (approvedReports.length > 0) {
      completionDate = new Date(approvedReports[0].createdAt);
    }
  }
  if (!completionDate && order.updatedAt) {
    completionDate = new Date(order.updatedAt);
  }

  return {
    orderId: order.id,
    pancakeOrderId: order.pancakeOrderId,
    // Alias cho frontend: orderCode
    orderCode: order.pancakeOrderId ? `#${order.pancakeOrderId}` : order.id?.substring(0, 8),
    customerName: order.customer?.fullName || order.billFullName,
    customerPhone: order.customer?.phoneNumber || order.billPhoneNumber,
    completionDate,
    // Alias cho frontend: completedDate
    completedDate: completionDate,
    salesKtvId: order.salesKtvId,
    salesKtvName: order.salesKtv?.fullName,
    salesKtvPhone: order.salesKtv?.phoneNumber,
    // Object salesKtv cho frontend dropdown/display
    salesKtv: order.salesKtv ? {
      id: order.salesKtv.id,
      fullName: order.salesKtv.fullName,
      phoneNumber: order.salesKtv.phoneNumber,
      techStation: order.salesKtv.techStation
    } : null,
    assignedKtvId: order.assignedKtvId,
    assignedKtvName: order.assignedKtv?.fullName,
    // Object assignedKtv cho frontend display
    assignedKtv: order.assignedKtv ? {
      id: order.assignedKtv.id,
      fullName: order.assignedKtv.fullName,
      phoneNumber: order.assignedKtv.phoneNumber
    } : null,
    workType: order.workType,
    itemsDetail,
    deviceRevenue,
    deviceDiscount,
    preVatDeviceRevenue,
    deviceCommissionRate,
    deviceCommissionGross,
    // Alias cho frontend: deviceCommissionPreLapDat (= gross trước khi trừ lắp đặt)
    deviceCommissionPreLapDat: deviceCommissionGross,
    filterRevenue,
    filterDiscount,
    preVatFilterRevenue,
    filterCommissionRate,
    filterCommissionGross,
    // Alias cho frontend: filterCommission
    filterCommission: filterCommissionGross,
    lapDatCostDeducted,
    deliveryInstallCostDeducted: lapDatCostDeducted,
    // Nguồn đơn giá giao hàng & lắp đặt để hiển thị trên frontend
    lapDatRateSource: lapDatRateSource || 'Chuẩn Truliva (120k)',
    deliveryInstallRateSource: lapDatRateSource || 'Chuẩn Truliva (120k)',
    hasDevice,
    calculatedCommission,
    customSalesCommission: order.customSalesCommission,
    commissionAdjustments: order.commissionAdjustments,
    salesCommissionNote: order.salesCommissionNote,
    finalCommission,
    isAdjustedByAdmin,
    // Alias cho frontend: isCustom
    isCustom: isAdjustedByAdmin
  };
}

/**
 * Tính toán danh sách hoa hồng bán hàng cho một tháng cụ thể (hoàn thành trong tháng)
 */
export async function computeCommissionsForMonth(
  month: string,
  filterKtvId?: string
): Promise<{
  month: string;
  commissions: OrderCommissionResult[];
  ktvSummaries: Record<string, {
    ktvId: string;
    ktvName: string;
    ktvPhone: string;
    totalOrders: number;
    totalPreVatRevenue: number;
    totalCalculatedCommission: number;
    totalFinalCommission: number;
  }>;
  stats: {
    totalOrders: number;
    totalPreVatRevenue: number;
    totalCalculatedCommission: number;
    totalFinalCommission: number;
    totalCommission?: number;
    totalDeviceCommission?: number;
    totalFilterCommission?: number;
    totalSalesKtvs?: number;
  };
}> {
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

  // 1. Tải danh mục sản phẩm từ DB
  const products = await prisma.product.findMany({
    select: { sku: true, name: true, category: true }
  });
  const productsMap = new Map<string, any>();
  for (const p of products) {
    if (p.sku) productsMap.set(`SKU:${p.sku.toLowerCase()}`, p);
    if (p.name) productsMap.set(`NAME:${p.name.toLowerCase()}`, p);
  }

  // 2. Tải biểu phí trạm & đơn giá KTV
  const stationRates = await loadStationRates();
  const dbCustomRates = await prisma.ktvServiceRate.findMany();
  const customKtvRatesByUser = new Map<string, Map<string, number>>();
  for (const r of dbCustomRates) {
    if (!customKtvRatesByUser.has(r.userId)) {
      customKtvRatesByUser.set(r.userId, new Map());
    }
    customKtvRatesByUser.get(r.userId)!.set(r.workType, r.rate);
  }

  // 3. Tìm các đơn hàng có KTV bán hàng và được hoàn thành trong tháng
  const orderWhere: any = {
    salesKtvId: filterKtvId ? filterKtvId : { not: null },
    adminStatus: { notIn: ['hủy đơn', 'huy_don', 'huy don', 'Hủy đơn'] },
    OR: [
      // Đơn có báo cáo nghiệm thu APPROVED trong tháng chỉ định
      {
        serviceReports: {
          some: {
            approvalStatus: 'APPROVED',
            OR: [
              { month: { in: monthVariants } },
              { createdAt: { gte: startDate, lte: endDate } }
            ]
          }
        }
      },
      // Hoặc đơn ở trạng thái hoàn thành cập nhật trong tháng (nếu không qua flow báo cáo)
      {
        adminStatus: 'hoàn thành',
        updatedAt: { gte: startDate, lte: endDate }
      }
    ]
  };

  const orders = await prisma.order.findMany({
    where: orderWhere,
    include: {
      items: true,
      customer: true,
      salesKtv: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          techStation: {
            select: { name: true, mainStation: { select: { name: true } } }
          }
        }
      },
      assignedKtv: {
        select: { id: true, fullName: true, phoneNumber: true }
      },
      serviceReports: {
        where: { approvalStatus: 'APPROVED' },
        orderBy: { createdAt: 'desc' }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  const commissions: OrderCommissionResult[] = [];
  const ktvSummaries: Record<string, any> = {};

  let totalOrders = 0;
  let totalPreVatRevenue = 0;
  let totalCalculatedCommission = 0;
  let totalFinalCommission = 0;
  let totalDeviceCommission = 0;
  let totalFilterCommission = 0;

  for (const order of orders) {
    if (!order.salesKtvId) continue;

    const salesKtvPhoneNorm = normalizePhone(order.salesKtv?.phoneNumber);
    const stationRate = salesKtvPhoneNorm ? stationRates.get(salesKtvPhoneNorm) : null;
    const userCustomRates = customKtvRatesByUser.get(order.salesKtvId);
    const lapDatResult = getSalesKtvLapDatRate(order.salesKtv, stationRate, userCustomRates);
    const salesKtvLapDatRate = lapDatResult.rate;

    const result = calculateSingleOrderCommission(order, productsMap, salesKtvLapDatRate, lapDatResult.source);
    commissions.push(result);

    // Thống kê
    totalOrders++;
    const orderPreVat = result.preVatDeviceRevenue + result.preVatFilterRevenue;
    totalPreVatRevenue += orderPreVat;
    totalCalculatedCommission += result.calculatedCommission;
    totalFinalCommission += result.finalCommission;
    totalDeviceCommission += Math.max(0, result.deviceCommissionGross - result.lapDatCostDeducted);
    totalFilterCommission += result.filterCommissionGross;

    // Nhóm theo KTV
    const ktvId = order.salesKtvId;
    if (!ktvSummaries[ktvId]) {
      ktvSummaries[ktvId] = {
        ktvId,
        ktvName: order.salesKtv?.fullName || 'Chưa đặt tên',
        ktvPhone: order.salesKtv?.phoneNumber || '',
        totalOrders: 0,
        orderCount: 0,
        totalPreVatRevenue: 0,
        totalCalculatedCommission: 0,
        totalFinalCommission: 0,
        totalCommission: 0
      };
    }
    ktvSummaries[ktvId].totalOrders++;
    ktvSummaries[ktvId].orderCount++;
    ktvSummaries[ktvId].totalPreVatRevenue += orderPreVat;
    ktvSummaries[ktvId].totalCalculatedCommission += result.calculatedCommission;
    ktvSummaries[ktvId].totalFinalCommission += result.finalCommission;
    ktvSummaries[ktvId].totalCommission = ktvSummaries[ktvId].totalFinalCommission;
  }

  return {
    month,
    commissions,
    ktvSummaries,
    stats: {
      totalOrders,
      totalPreVatRevenue: Math.round(totalPreVatRevenue),
      totalCalculatedCommission: Math.round(totalCalculatedCommission),
      totalFinalCommission: Math.round(totalFinalCommission),
      totalCommission: Math.round(totalFinalCommission),
      totalDeviceCommission: Math.round(totalDeviceCommission),
      totalFilterCommission: Math.round(totalFilterCommission),
      totalSalesKtvs: Object.keys(ktvSummaries).length
    }
  };
}

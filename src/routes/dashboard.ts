import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireDashboardAccess } from '../middleware/authSession';
import { normalizeProvince, getProvinceSearchVariants } from '../utils/provinces';

const router = Router();

function removeAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// ── Múi giờ Việt Nam (UTC+7, không có giờ mùa hè) ──
// DB lưu mốc thời gian UTC; mọi "ngày" trên dashboard phải hiểu theo ngày VN.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 00:00:00.000 giờ VN của ngày `YYYY-MM-DD` */
function vnDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000+07:00`);
}

/** 23:59:59.999 giờ VN của ngày `YYYY-MM-DD` */
function vnDayEnd(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999+07:00`);
}

/** Ngày VN dạng `YYYY-MM-DD` của một mốc thời gian */
function toVnDateStr(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Cộng/trừ ngày trên chuỗi `YYYY-MM-DD` (không phụ thuộc múi giờ server) */
function addDaysStr(dateStr: string, days: number): string {
  return new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Số ngày giữa 2 chuỗi `YYYY-MM-DD` (b - a) */
function diffDaysStr(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00.000Z`).getTime() - new Date(`${a}T00:00:00.000Z`).getTime()) / DAY_MS);
}

/** Điều kiện lọc khoảng ngày (theo ngày VN) cho Prisma */
function vnDateRange(startDate: any, endDate: any): { gte?: Date; lte?: Date } {
  return {
    ...(startDate ? { gte: vnDayStart(String(startDate)) } : {}),
    ...(endDate ? { lte: vnDayEnd(String(endDate)) } : {})
  };
}

// Báo cáo bị từ chối không được tính là đã làm / đã hoàn thành
const validReportFilter: Prisma.ServiceReportWhereInput = { approvalStatus: { not: 'REJECTED' } };

function parseMultiValue(param: any): string[] {
  if (!param) return [];
  return String(param).split(',').map(s => s.trim()).filter(Boolean);
}

function getSearchProvinces(param: any): string[] {
  const provinces = parseMultiValue(param);
  if (provinces.length === 0) return [];
  return provinces.flatMap(p => {
    const norm = normalizeProvince(p) || p;
    return getProvinceSearchVariants(norm).map(v => removeAccents(v));
  });
}

function matchOrderProvince(order: any, searchProvinces: string[]): boolean {
  if (!searchProvinces || searchProvinces.length === 0) return true;
  const provRaw = order.customer?.provinceName || (order.shippingAddress as any)?.province_name || '';
  const normProv = normalizeProvince(provRaw) || provRaw;
  const provAcc = removeAccents(normProv);
  const provRawAcc = removeAccents(provRaw);
  return searchProvinces.some(sp => provAcc.includes(sp) || provRawAcc.includes(sp));
}

const nonEcomFilter: Prisma.OrderWhereInput = {
  OR: [
    { orderSource: null },
    {
      NOT: [
        { orderSource: { contains: 'shopee', mode: 'insensitive' } },
        { orderSource: { contains: 'lazada', mode: 'insensitive' } },
        { orderSource: { contains: 'tiktok', mode: 'insensitive' } },
        { orderSource: { contains: 'tiki', mode: 'insensitive' } }
      ]
    }
  ]
};

// ── Helper dùng chung giữa các API dashboard (để các tab tính theo CÙNG một công thức) ──

const LEGACY_TRULIVA_STATIONS = ['Trạm Hồ Chí Minh', 'Trạm Đồng Nai', 'Trạm Vũng Tàu'];

/** Tên trạm chính hiển thị của đơn: trạm đang hoạt động; trạm cũ HCM/ĐN/VT gộp thành "Truliva". */
function resolveMainStationName(o: {
  mainStation?: { name: string; isActive: boolean } | null;
  techStation?: { mainStation?: { name: string; isActive: boolean } | null } | null;
}): string {
  const pick = (ms?: { name: string; isActive: boolean } | null) => {
    if (!ms) return null;
    if (ms.isActive) return ms.name;
    if (LEGACY_TRULIVA_STATIONS.includes(ms.name)) return 'Truliva';
    return null;
  };
  return pick(o.mainStation) || pick(o.techStation?.mainStation) || 'Chưa phân trạm';
}

function isEcomSource(src?: string | null): boolean {
  const s = (src || '').toLowerCase();
  return s.includes('shopee') || s.includes('lazada') || s.includes('tiktok') || s.includes('tiki');
}

/** Đơn hợp lệ để thống kê (giống validOrderFilter): bỏ đơn Pancake "mới" (status 0) và đơn đã ẩn. */
function isValidOrder(o: { statusCode?: number | null; pancakeOrderId?: number | null; adminStatus?: string | null }): boolean {
  const statusOk = o.statusCode == null || o.statusCode !== 0 || (o.pancakeOrderId ?? 0) < 0;
  return statusOk && o.adminStatus !== 'đã ẩn';
}

const CLOSED_STATUSES = ['hoàn thành', 'hủy đơn', 'đã ẩn', 'đang hoàn', 'đã hoàn', 'đang đổi', 'đã đổi', 'hoàn một phần'];
const RETURN_STATUSES = ['đang hoàn', 'đã hoàn', 'đang đổi', 'đã đổi', 'hoàn một phần'];

/**
 * Doanh thu 1 đơn:
 * - totalPrice: Doanh số niêm yết.
 * - moneyToCollect (mặc định): Thực thu — đơn POS lấy COD nếu > 0, COD = 0 (chuyển khoản trước) lấy totalPrice;
 *   ca thủ công lấy tiền thu hộ thực tế.
 */
function smartRevenue(o: { totalPrice?: number | null; moneyToCollect?: number | null; pancakeOrderId?: number | null; orderSource?: string | null }, metric: string): number {
  if (metric === 'totalPrice') return Number(o.totalPrice) || 0;
  const isPosOrder = (o.pancakeOrderId ?? 0) > 100 && o.orderSource !== 'unknown';
  if (isPosOrder) {
    if (o.moneyToCollect != null && Number(o.moneyToCollect) > 0) return Number(o.moneyToCollect);
    return Number(o.totalPrice) || 0;
  }
  return Number(o.moneyToCollect) || 0;
}

/**
 * Kỳ đối chiếu của [startStr, endStr]:
 * - Nếu kỳ là trọn 1 tháng dương lịch → tháng liền trước (trọn tháng).
 * - Ngược lại → khoảng liền trước cùng số ngày.
 */
function previousPeriod(startStr: string, endStr: string): { start: string; end: string } {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const lastDayOfStartMonth = new Date(Date.UTC(sy, sm, 0)).toISOString().slice(0, 10);
  if (sd === 1 && endStr === lastDayOfStartMonth) {
    const prevEnd = addDaysStr(startStr, -1);
    return { start: `${prevEnd.slice(0, 7)}-01`, end: prevEnd };
  }
  const days = Math.max(1, diffDaysStr(startStr, endStr) + 1);
  const end = addDaysStr(startStr, -1);
  return { start: addDaysStr(end, -(days - 1)), end };
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const v = s[lo] + (s[hi] - s[lo]) * (idx - lo);
  return Math.round(v * 10) / 10;
}

/** Đơn giao hàng do đơn vị vận chuyển thực hiện — không tính vào SLA của KTV. */
const isDeliveryOnly = (workType?: string | null) => workType === 'Giao hàng';

/**
 * Phân loại đúng/trễ hẹn theo NGÀY VN, so với lịch hẹn SAU CÙNG (lịch tự sinh +2h vẫn tính).
 * - Ngày hoàn thành = ngày nộp báo cáo nghiệm thu đầu tiên (không tính báo cáo bị từ chối).
 * - Đơn "hoàn thành" không có báo cáo: không xếp đúng/trễ (không dùng updatedAt).
 * - Đơn chưa xong, chưa quá ngày hẹn: "chưa tới hạn".
 */
function classifySla(
  o: { appointmentTime?: Date | null; adminStatus?: string | null; firstReportAt?: Date | null },
  todayStr: string
) {
  const hasAppointment = o.appointmentTime != null;
  const appointmentDateStr = hasAppointment ? toVnDateStr(o.appointmentTime!) : null;
  const hasReport = o.firstReportAt != null;
  const isCompleted = o.adminStatus === 'hoàn thành' || hasReport;
  const isCancelled = o.adminStatus === 'hủy đơn';
  const completionDateStr = hasReport ? toVnDateStr(o.firstReportAt!) : null;
  const completedWithoutReport = isCompleted && !hasReport;

  let isOnTime = false;
  let isLate = false;
  let isNotDue = false;
  let delayDays = 0;

  if (appointmentDateStr) {
    if (isCompleted) {
      if (completionDateStr) {
        if (completionDateStr <= appointmentDateStr) isOnTime = true;
        else {
          isLate = true;
          delayDays = Math.max(0, diffDaysStr(appointmentDateStr, completionDateStr));
        }
      }
    } else if (!isCancelled) {
      if (todayStr > appointmentDateStr) {
        isLate = true;
        delayDays = Math.max(0, diffDaysStr(appointmentDateStr, todayStr));
      } else {
        isNotDue = true;
      }
    }
  }

  return { appointmentDateStr, completionDateStr, isCompleted, isCancelled, completedWithoutReport, isOnTime, isLate, isNotDue, delayDays };
}

// Tất cả dashboard routes yêu cầu quyền dashboard access
router.use(requireAuth, requireDashboardAccess);

/**
 * GET /api/dashboard/stats
 * Trả về dữ liệu thống kê cho Dashboard
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      startDate,
      endDate,
      province,
      mainStationId,
      techStationId,
      workType,
      assignedKtvId,
      includeEcom,
      revenueScope
    } = req.query;

    const isIncludeEcom = includeEcom === 'true' || revenueScope === 'all' || !revenueScope;

    const validOrderFilter: Prisma.OrderWhereInput = {
      AND: [
        {
          OR: [
            { statusCode: { not: 0 } },
            { statusCode: null },
            { pancakeOrderId: { lt: 0 } }
          ]
        },
        {
          OR: [
            { adminStatus: { not: 'đã ẩn' } },
            { adminStatus: null }
          ]
        }
      ]
    };

    // Thống kê theo bộ lọc của user (Lọc theo Ngày tạo đơn hàng trên Pancake, ngày VN).
    // Bản đồ mật độ, tải trọng trạm và KPI đều tính trên CÙNG tập đơn đã lọc này.
    const where: any = {
      AND: [
        validOrderFilter
      ]
    };

    if (!isIncludeEcom) {
      where.AND.push(nonEcomFilter);
    }

    if (startDate || endDate) {
      where.pancakeCreatedAt = {
        not: null,
        ...vnDateRange(startDate, endDate)
      };
    }

    const workTypes = parseMultiValue(workType);
    if (workTypes.length > 0) {
      where.workType = workTypes.length === 1 ? workTypes[0] : { in: workTypes };
    }
    const ktvIds = parseMultiValue(assignedKtvId);
    if (ktvIds.length > 0) {
      where.assignedKtvId = ktvIds.length === 1 ? ktvIds[0] : { in: ktvIds };
    }

    let orders = await prisma.order.findMany({
      where,
      select: {
        adminStatus: true,
        customer: { select: { provinceName: true } },
        shippingAddress: true,
        mainStation: { select: { name: true, isActive: true } },
        techStation: {
          select: {
            name: true,
            mainStation: { select: { name: true, isActive: true } }
          }
        },
        mainStationId: true,
        techStationId: true
      }
    });

    // Lọc theo tỉnh thành trong bộ nhớ (hỗ trợ đa chọn)
    const searchProvinces = getSearchProvinces(province);
    if (searchProvinces.length > 0) {
      orders = orders.filter(order => matchOrderProvince(order, searchProvinces));
    }

    // Lọc theo trạm chính / trạm kỹ thuật trong bộ nhớ (hỗ trợ đa chọn)
    let filteredOrders = orders;
    const mainStationIds = parseMultiValue(mainStationId);
    if (mainStationIds.length > 0) {
      const targetMainStations = await prisma.mainStation.findMany({
        where: { id: { in: mainStationIds } }
      });
      const targetNames = targetMainStations.map(s => s.name);
      if (targetNames.length > 0) {
        filteredOrders = filteredOrders.filter(o => {
          let msName = 'Chưa phân trạm';
          if (o.mainStation) {
            if (o.mainStation.isActive) {
              msName = o.mainStation.name;
            } else if (['Trạm Hồ Chí Minh', 'Trạm Đồng Nai', 'Trạm Vũng Tàu'].includes(o.mainStation.name)) {
              msName = 'Truliva';
            }
          }
          if (msName === 'Chưa phân trạm' && o.techStation?.mainStation) {
            if (o.techStation.mainStation.isActive) {
              msName = o.techStation.mainStation.name;
            } else if (['Trạm Hồ Chí Minh', 'Trạm Đồng Nai', 'Trạm Vũng Tàu'].includes(o.techStation.mainStation.name)) {
              msName = 'Truliva';
            }
          }
          return targetNames.includes(msName);
        });
      }
    }
    const techStationIds = parseMultiValue(techStationId);
    if (techStationIds.length > 0) {
      filteredOrders = filteredOrders.filter(o => o.techStationId != null && techStationIds.includes(o.techStationId));
    }

    let pending = 0;
    let assigned = 0;
    let completed = 0;
    let cancelled = 0;
    let returnExchange = 0;

    const returnExchangeStatuses = ['đang hoàn', 'đã hoàn', 'đang đổi', 'đã đổi', 'hoàn một phần'];

    filteredOrders.forEach(o => {
      const status = o.adminStatus;
      if (status === 'đã ẩn') return; // Bỏ qua hoàn toàn đơn đã ẩn
      if (status === 'đang thực hiện') {
        assigned++;
      } else if (status === 'hoàn thành') {
        completed++;
      } else if (status === 'hủy đơn') {
        cancelled++;
      } else if (returnExchangeStatuses.includes(status || '')) {
        returnExchange++;
      } else {
        pending++;
      }
    });

    // 1. Tải trọng theo Trạm chính / Trạm kỹ thuật (đang hoạt động) trên tập đơn đã lọc
    const stations = await prisma.mainStation.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        techStations: {
          where: { isActive: true },
          select: { id: true, name: true }
        }
      }
    });

    const mainCount: Record<string, number> = {};
    const techCount: Record<string, number> = {};
    const statusCountMap: Record<string, number> = {};
    const density: Record<string, number> = {};

    filteredOrders.forEach(o => {
      if (o.mainStationId) mainCount[o.mainStationId] = (mainCount[o.mainStationId] || 0) + 1;
      if (o.techStationId) techCount[o.techStationId] = (techCount[o.techStationId] || 0) + 1;

      const statusKey = o.adminStatus ?? '';
      statusCountMap[statusKey] = (statusCountMap[statusKey] || 0) + 1;

      // 2. Mật độ theo Tỉnh/Thành (ưu tiên tỉnh khách hàng, fallback địa chỉ giao hàng)
      const provRaw = o.customer?.provinceName || (o.shippingAddress as any)?.province_name || '';
      if (provRaw) {
        let p = normalizeProvince(provRaw) || provRaw;
        p = p.replace(/^(Tỉnh |Thành phố |TP\.?\s*)/i, '').trim();
        if (p) density[p] = (density[p] || 0) + 1;
      }
    });

    const stationStats = stations.map(main => ({
      name: main.name,
      totalOrders: mainCount[main.id] || 0,
      techStations: main.techStations.map(tech => ({
        name: tech.name,
        orders: techCount[tech.id] || 0
      }))
    }));

    // 3. Tổng quan đơn hàng theo trạng thái (giữ nguyên shape groupBy cũ)
    const statusCounts = Object.entries(statusCountMap).map(([adminStatus, count]) => ({
      adminStatus: adminStatus || null,
      _count: { id: count }
    }));

    res.json({
      stationStats,
      mapDensity: density,
      statusCounts,
      orderStats: {
        total: pending + assigned + completed + cancelled + returnExchange,
        pending,
        assigned,
        completed,
        cancelled,
        returnExchange
      }
    });
  } catch (error: any) {
    logger.error('Get dashboard stats error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu dashboard' });
  }
});


/**
 * GET /api/dashboard/dispatch-analysis
 * Lấy dữ liệu phân tích đúng hẹn / trễ hẹn của đơn hàng
 */
router.get('/dispatch-analysis', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      startDate,
      endDate,
      province,
      mainStationId,
      techStationId,
      workType,
      adminStatus,
      assignedKtvId
    } = req.query;

    const where: any = {
      AND: [
        {
          OR: [
            { statusCode: { not: 0 } },
            { statusCode: null },
            { pancakeOrderId: { lt: 0 } } // Đơn thủ công (luôn hiện, bất kể statusCode)
          ]
        },
        nonEcomFilter
      ]
    };

    // Áp dụng bộ lọc thời gian tạo đơn hàng trên Pancake (theo ngày VN)
    if (startDate || endDate) {
      where.pancakeCreatedAt = {
        not: null,
        ...vnDateRange(startDate, endDate)
      };
    }

    const workTypes = parseMultiValue(workType);
    if (workTypes.length > 0) {
      where.workType = workTypes.length === 1 ? workTypes[0] : { in: workTypes };
    }
    const statuses = parseMultiValue(adminStatus);
    if (statuses.length > 0) {
      where.adminStatus = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    const ktvIds = parseMultiValue(assignedKtvId);
    if (ktvIds.length > 0) {
      where.assignedKtvId = ktvIds.length === 1 ? ktvIds[0] : { in: ktvIds };
    }

    // Lấy tất cả các đơn hàng thỏa mãn
    let orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        pancakeOrderId: true,
        billFullName: true,
        billPhoneNumber: true,
        workType: true,
        adminStatus: true,
        appointmentTime: true,
        createdAt: true,
        shippingAddress: true,
        mainStationId: true,
        techStationId: true,
        serviceReports: {
          where: validReportFilter,
          select: {
            createdAt: true
          },
          orderBy: { createdAt: 'asc' },
          take: 1
        },
        customer: {
          select: {
            fullName: true,
            phoneNumber: true,
            provinceName: true
          }
        },
        assignedKtv: {
          select: {
            fullName: true
          }
        },
        mainStation: {
          select: {
            name: true,
            isActive: true
          }
        },
        techStation: {
          select: {
            name: true,
            mainStation: {
              select: {
                name: true,
                isActive: true
              }
            }
          }
        }
      }
    });

    // Lọc theo province (tỉnh/thành phố) bằng JS ở bộ nhớ (hỗ trợ đa chọn)
    const searchProvinces = getSearchProvinces(province);
    if (searchProvinces.length > 0) {
      orders = orders.filter(order => matchOrderProvince(order, searchProvinces));
    }

    const todayStr = toVnDateStr(new Date());

    // 1. Phân loại đúng/trễ cho từng đơn hàng — dùng chung classifySla() với trang Tổng quan
    const processedOrders = orders.map(order => {
      const sla = classifySla(
        { appointmentTime: order.appointmentTime, adminStatus: order.adminStatus, firstReportAt: order.serviceReports?.[0]?.createdAt ?? null },
        todayStr
      );
      const appointmentDateStr = sla.appointmentDateStr ?? 'Chưa xếp lịch';
      const completionDateStr = sla.completionDateStr ?? '';
      const { isCompleted, isCancelled, completedWithoutReport, isOnTime, isLate, isNotDue, delayDays } = sla;

      // Chuẩn hóa tên tỉnh thành
      const rawProvString = order.customer?.provinceName || (order.shippingAddress as any)?.province_name || 'Khác';
      let provName = normalizeProvince(rawProvString) || rawProvString;
      provName = provName.replace(/^(Tỉnh |Thành phố |TP\.?\s*)/i, '').trim();

      const mainStationName = resolveMainStationName(order);

      return {
        id: order.id,
        pancakeOrderId: order.pancakeOrderId,
        customerName: order.billFullName || order.customer?.fullName || 'Khách lẻ',
        customerPhone: order.billPhoneNumber || order.customer?.phoneNumber || '',
        province: provName,
        workType: order.workType || 'Chưa xác định',
        adminStatus: order.adminStatus || 'chờ xử lý',
        appointmentDateStr,
        completionDateStr,
        isOnTime,
        isLate,
        delayDays,
        isNotDue,
        isCancelled,
        completedWithoutReport,
        mainStationName,
        techStationName: order.techStation?.name || 'Chưa phân trạm',
        techStationId: order.techStationId,
        ktvName: order.assignedKtv?.fullName || 'Chưa gán',
        isCompleted
      };
    });

    // Apply mainStationId and techStationId filters in memory (hỗ trợ đa chọn)
    let filteredOrders = processedOrders;
    const mainStationIds = parseMultiValue(mainStationId);
    if (mainStationIds.length > 0) {
      const targetMainStations = await prisma.mainStation.findMany({
        where: { id: { in: mainStationIds } }
      });
      const targetNames = targetMainStations.map(s => s.name);
      if (targetNames.length > 0) {
        filteredOrders = filteredOrders.filter(o => targetNames.includes(o.mainStationName));
      }
    }
    const techStationIds = parseMultiValue(techStationId);
    if (techStationIds.length > 0) {
      filteredOrders = filteredOrders.filter(o => o.techStationId != null && techStationIds.includes(o.techStationId));
    }

    // 2. Tính toán Summary (chỉ tính đối với các đơn đã xếp lịch hẹn)
    // SLA của KTV: KHÔNG tính đơn "Giao hàng" (đơn vị vận chuyển giao, không có báo cáo KTV).
    // Các biểu đồ phân rã theo loại công việc vẫn hiển thị Giao hàng để tham khảo.
    const slaOrders = filteredOrders.filter(o => !isDeliveryOnly(o.workType));
    const withAppointments = slaOrders.filter(o => o.appointmentDateStr !== 'Chưa xếp lịch');
    const totalWithAppointments = withAppointments.length;
    const totalOnTime = slaOrders.filter(o => o.isOnTime).length;
    const totalLate = slaOrders.filter(o => o.isLate).length;
    const totalDeliveryExcluded = filteredOrders.length - slaOrders.length;
    const totalNotDue = withAppointments.filter(o => o.isNotDue).length;
    const totalCancelled = withAppointments.filter(o => o.isCancelled && !o.isCompleted).length;
    const totalCompletedNoReport = withAppointments.filter(o => o.completedWithoutReport).length;
    // Mẫu số tỷ lệ = các ca ĐÃ ĐẾN HẠN đánh giá (đúng + trễ); không gồm đơn hủy,
    // đơn chưa tới hạn và đơn hoàn thành không có báo cáo (không rõ ngày hoàn thành).
    const totalEvaluated = totalOnTime + totalLate;
    const onTimeRate = totalEvaluated > 0 ? Math.round((totalOnTime / totalEvaluated) * 100) : null;

    // 3. Gom nhóm theo Ngày hẹn (Daily Stats - bỏ qua đơn chưa xếp lịch)
    const dailyMap: Record<string, { date: string; onTime: number; late: number; total: number }> = {};
    slaOrders.forEach(o => { // xu hướng đúng/trễ: không gồm Giao hàng
      const d = o.appointmentDateStr;
      if (d === 'Chưa xếp lịch') return;
      if (!dailyMap[d]) {
        dailyMap[d] = { date: d, onTime: 0, late: 0, total: 0 };
      }
      dailyMap[d].total++;
      if (o.isOnTime) dailyMap[d].onTime++;
      if (o.isLate) dailyMap[d].late++;
    });
    const dailyStats = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Helper function để gom nhóm theo một trường
    const groupByField = (field: 'workType' | 'province' | 'techStationName' | 'ktvName') => {
      const map: Record<string, { name: string; onTime: number; late: number; total: number; open: number; cancelled: number; totalLeadTimeDays: number; completedCount: number }> = {};

      filteredOrders.forEach(o => {
        const val = o[field];
        if (!map[val]) {
          map[val] = { name: val, onTime: 0, late: 0, total: 0, open: 0, cancelled: 0, totalLeadTimeDays: 0, completedCount: 0 };
        }
        map[val].total++;
        if (o.isCancelled && !o.isCompleted) map[val].cancelled++;
        else if (!o.isCompleted && !CLOSED_STATUSES.includes(o.adminStatus)) map[val].open++;

        // Đúng/trễ: không tính đơn Giao hàng (đơn vị vận chuyển) — cùng quy ước với summary
        if (isDeliveryOnly(o.workType)) return;
        if (o.isOnTime) map[val].onTime++;
        if (o.isLate) map[val].late++;

        // Chênh lệch ngày nghiệm thu so với ngày hẹn (chỉ ca đã hoàn thành có lịch hẹn)
        if (o.isCompleted && o.completionDateStr && o.appointmentDateStr !== 'Chưa xếp lịch') {
          map[val].totalLeadTimeDays += diffDaysStr(o.appointmentDateStr, o.completionDateStr);
          map[val].completedCount++;
        }
      });

      return Object.values(map).map(item => ({
        name: item.name,
        onTime: item.onTime,
        late: item.late,
        total: item.total,
        open: item.open,
        cancelled: item.cancelled,
        onTimeRate: item.onTime + item.late > 0 ? Math.round((item.onTime / (item.onTime + item.late)) * 100) : null,
        avgLeadTimeDays: item.completedCount > 0 ? Math.round((item.totalLeadTimeDays / item.completedCount) * 10) / 10 : 0
      }));
    };

    const workTypeStats = groupByField('workType');
    const provinceStats = groupByField('province');
    const techStationStats = groupByField('techStationName');
    const ktvStats = groupByField('ktvName');

    // 4. Danh sách các đơn trễ hẹn (để hiển thị bảng)
    const lateOrders = filteredOrders
      // Chỉ các ca CHƯA hoàn thành (kể cả hoàn thành qua báo cáo nghiệm thu) mà đã quá hẹn
      .filter(o => o.isLate && !o.isCompleted)
      .map(o => ({
        id: o.id,
        pancakeOrderId: o.pancakeOrderId,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        province: o.province,
        workType: o.workType,
        appointmentDateStr: o.appointmentDateStr,
        delayDays: o.delayDays,
        adminStatus: o.adminStatus
      }))
      .sort((a, b) => b.delayDays - a.delayDays);

    // 5. Gom nhóm loại công việc theo từng tháng (Monthly Work Type Stats)
    const WORK_TYPES = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc', 'Bảo hành', 'Sửa chữa'];
    const monthlyWorkTypeMap: Record<string, any> = {};
    
    filteredOrders.forEach(o => {
      if (o.appointmentDateStr === 'Chưa xếp lịch') return;
      const monthStr = o.appointmentDateStr.slice(0, 7); // Lấy "YYYY-MM"
      if (!monthlyWorkTypeMap[monthStr]) {
        monthlyWorkTypeMap[monthStr] = { month: monthStr };
        WORK_TYPES.forEach(wt => {
          monthlyWorkTypeMap[monthStr][wt] = 0;
        });
      }
      const wt = o.workType;
      if (monthlyWorkTypeMap[monthStr][wt] === undefined) {
        monthlyWorkTypeMap[monthStr][wt] = 1;
      } else {
        monthlyWorkTypeMap[monthStr][wt]++;
      }
    });
    
    const workTypeMonthlyStats = Object.values(monthlyWorkTypeMap).sort((a: any, b: any) => a.month.localeCompare(b.month));

    // 6. Tính toán đóng góp & phủ sóng của các Trạm chính (không gồm Giao hàng)
    const ordersExcludingDelivery = filteredOrders.filter(o => o.workType !== 'Giao hàng');
    
    // Tỉ lệ đóng góp
    const mainStationMap: Record<string, number> = {};
    ordersExcludingDelivery.forEach(o => {
      const station = o.mainStationName || 'Chưa phân trạm';
      mainStationMap[station] = (mainStationMap[station] || 0) + 1;
    });
    
    const totalExcludingDelivery = ordersExcludingDelivery.length;
    const mainStationWorkloadStats = Object.entries(mainStationMap).map(([name, total]) => ({
      name,
      total,
      percentage: totalExcludingDelivery > 0 ? Math.round((total / totalExcludingDelivery) * 100) : 0
    })).sort((a, b) => b.total - a.total);

    // Mức độ phủ sóng (Dominant main station per province)
    const provinceToStationMap: Record<string, Record<string, number>> = {};
    ordersExcludingDelivery.forEach(o => {
      const prov = o.province;
      const station = o.mainStationName || 'Chưa phân trạm';
      if (!provinceToStationMap[prov]) {
        provinceToStationMap[prov] = {};
      }
      provinceToStationMap[prov][station] = (provinceToStationMap[prov][station] || 0) + 1;
    });

    const mainStationCoverage: Record<string, { mainStationName: string; count: number; total: number; breakdown: Record<string, number> }> = {};
    Object.entries(provinceToStationMap).forEach(([prov, stationsCountMap]) => {
      let dominantStation = 'Lack';
      let maxCount = 0;
      let total = 0;
      Object.entries(stationsCountMap).forEach(([station, count]) => {
        total += count;
        if (count > maxCount) {
          maxCount = count;
          dominantStation = station;
        }
      });
      mainStationCoverage[prov] = {
        mainStationName: dominantStation,
        count: maxCount,
        total,
        breakdown: stationsCountMap
      };
    });

    // 7. Thống kê tình trạng phân công trạm theo Tỉnh (Unassigned Station Ratio per Province)
    const provinceAssignmentMap: Record<string, { province: string; assigned: number; unassigned: number; total: number }> = {};
    filteredOrders.forEach(o => {
      const prov = o.province || 'Khác';
      if (!provinceAssignmentMap[prov]) {
        provinceAssignmentMap[prov] = { province: prov, assigned: 0, unassigned: 0, total: 0 };
      }
      provinceAssignmentMap[prov].total++;
      if (o.mainStationName === 'Chưa phân trạm') {
        provinceAssignmentMap[prov].unassigned++;
      } else {
        provinceAssignmentMap[prov].assigned++;
      }
    });

    const unassignedProvinceStats = Object.values(provinceAssignmentMap)
      .map(item => ({
        ...item,
        unassignedRate: item.total > 0 ? Math.round((item.unassigned / item.total) * 100) : 0
      }))
      .sort((a, b) => b.unassigned - a.unassigned);

    // 8. Hiệu suất & Tỷ lệ hoàn thành của các Trạm chính thực tế (loại bỏ Chưa phân trạm)
    const stationPerfMap: Record<string, { name: string; total: number; completed: number; onTime: number; late: number }> = {};
    slaOrders.forEach(o => { // KPI trạm: không gồm Giao hàng
      if (o.mainStationName === 'Chưa phân trạm') return; // Bỏ qua chưa phân trạm
      const name = o.mainStationName;
      if (!stationPerfMap[name]) {
        stationPerfMap[name] = { name, total: 0, completed: 0, onTime: 0, late: 0 };
      }
      stationPerfMap[name].total++;
      if (o.isCompleted) stationPerfMap[name].completed++;
      if (o.isOnTime) stationPerfMap[name].onTime++;
      if (o.isLate) stationPerfMap[name].late++;
    });

    const stationPerformanceStats = Object.values(stationPerfMap)
      .map(item => ({
        ...item,
        onTimeRate: item.onTime + item.late > 0 ? Math.round((item.onTime / (item.onTime + item.late)) * 100) : null,
        completionRate: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0
      }))
      .sort((a, b) => b.total - a.total);

    res.json({
      summary: {
        totalWithAppointments,
        totalOnTime,
        totalLate,
        totalEvaluated,
        totalNotDue,
        totalCancelled,
        totalCompletedNoReport,
        totalDeliveryExcluded,
        onTimeRate
      },
      dailyStats,
      workTypeStats,
      provinceStats,
      techStationStats,
      ktvStats,
      lateOrders,
      workTypeMonthlyStats,
      mainStationWorkloadStats,
      mainStationCoverage,
      unassignedProvinceStats,
      stationPerformanceStats
    });

  } catch (error: any) {
    logger.error('Get dispatch analysis stats error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu phân tích đúng/trễ hẹn' });
  }
});

/**
 * GET /api/dashboard/product-quality
 * Thống kê và phân tích chất lượng sản phẩm
 */
router.get('/product-quality', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      startDate,
      endDate,
      province,
      mainStationId,
      techStationId,
      product
    } = req.query;

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = vnDateRange(startDate, endDate);
    }

    where.AND = [
      validReportFilter,
      {
        OR: [
          { orderId: null },
          {
            order: nonEcomFilter
          }
        ]
      }
    ];

    // Lấy tất cả báo cáo dịch vụ
    let reports = await prisma.serviceReport.findMany({
      where,
      include: {
        ktvUser: { select: { fullName: true } },
        order: {
          select: {
            pancakeOrderId: true,
            mainStationId: true,
            techStationId: true,
            mainStation: { select: { name: true } },
            techStation: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Lọc theo province (tỉnh/thành phố) bằng JS ở bộ nhớ (hỗ trợ đa chọn)
    const searchProvinces = getSearchProvinces(province);
    if (searchProvinces.length > 0) {
      reports = reports.filter(r => {
        const provRaw = r.province || '';
        const normProv = normalizeProvince(provRaw) || provRaw;
        const provName = removeAccents(normProv);
        const provRawName = removeAccents(provRaw);
        return searchProvinces.some(sp => provName.includes(sp) || provRawName.includes(sp));
      });
    }

    // Lọc theo trạm chính / trạm kỹ thuật (hỗ trợ đa chọn)
    const mainStationIds = parseMultiValue(mainStationId);
    if (mainStationIds.length > 0) {
      reports = reports.filter(r => r.order?.mainStationId != null && mainStationIds.includes(r.order.mainStationId));
    }
    const techStationIds = parseMultiValue(techStationId);
    if (techStationIds.length > 0) {
      reports = reports.filter(r => r.order?.techStationId != null && techStationIds.includes(r.order.techStationId));
    }

    // ── Lấy danh sách sản phẩm duy nhất trước khi lọc sản phẩm ──
    const productSet = new Set<string>();
    reports.forEach(r => {
      if (r.products && Array.isArray(r.products)) {
        r.products.forEach(p => {
          const cleanProd = p.split('x')[0].trim();
          if (cleanProd) productSet.add(cleanProd);
        });
      }
    });
    const allProducts = Array.from(productSet).sort((a, b) => a.localeCompare(b, 'vi'));

    // ── Lọc theo sản phẩm (nếu có, hỗ trợ đa chọn) ──
    const selectedProducts = parseMultiValue(product);
    if (selectedProducts.length > 0) {
      const searchProducts = selectedProducts.map(p => removeAccents(p));
      reports = reports.filter(r =>
        r.products && r.products.some(p => {
          const cleanP = removeAccents(p);
          return searchProducts.some(sp => cleanP.includes(sp));
        })
      );
    }

    // Lọc các báo cáo là Bảo hành hoặc Sửa chữa để phân tích lỗi
    const issueReports = reports.filter(r =>
      r.workType && ['Bảo hành', 'Sửa chữa'].includes(r.workType)
    );

    // Lọc các báo cáo Lắp đặt
    const installReports = reports.filter(r =>
      r.workType && ['Lắp đặt', 'Giao hàng và Lắp đặt'].includes(r.workType)
    );

    // 1. Linh kiện thay thế mỗi case, nguyên nhân, cách xử lý (Bảng chi tiết)
    const cases = reports
      .filter(r => (r.spareParts && r.spareParts.length > 0) || r.issueType || r.handlingMethod)
      .map(r => ({
        id: r.id,
        pancakeOrderId: r.order?.pancakeOrderId || null,
        serialNumber: r.serialNumber || 'Không rõ',
        products: r.products || [],
        spareParts: r.spareParts || [],
        issueType: r.issueType || 'Không rõ',
        handlingMethod: r.handlingMethod || 'Không rõ',
        notes: r.notes || '',
        createdAt: r.createdAt,
        ktvName: r.ktvUser?.fullName || 'Không rõ',
        province: r.province
      }));

    // 2. Dòng máy nào sự cố thường xuyên (Warranty/Repair count grouped by product)
    const productIssueCounts: Record<string, number> = {};
    issueReports.forEach(r => {
      if (r.products && r.products.length > 0) {
        r.products.forEach(p => {
          const cleanProd = p.split('x')[0].trim();
          if (cleanProd) {
            productIssueCounts[cleanProd] = (productIssueCounts[cleanProd] || 0) + 1;
          }
        });
      }
    });
    const productIssues = Object.entries(productIssueCounts)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    // 3. Khu vực nào thường gặp sự cố (Warranty/Repair count grouped by province)
    const provinceIssueCounts: Record<string, number> = {};
    issueReports.forEach(r => {
      let p = r.province || 'Khác';
      p = p.replace(/^(Tỉnh |Thành phố |TP\.?\s*)/i, '').trim();
      provinceIssueCounts[p] = (provinceIssueCounts[p] || 0) + 1;
    });
    const provinceIssues = Object.entries(provinceIssueCounts)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    // Helper hàm chuẩn hóa loại sự cố
    // So khớp theo CỤM TỪ NGUYÊN VẸN (có ranh giới từ) trên chuỗi đã bỏ dấu.
    // Không dùng includes() với chuỗi ngắn: 'ho' từng khớp "không"/"hỏng", 'van' khớp "vấn đề",
    // 'voi' khớp "với" → dồn sai gần hết sự cố vào nhóm "Rò nước & Tắc van".
    // Thứ tự quan trọng: nhóm van/rò (toàn cụm từ cụ thể) đứng trước nhóm Nguồn để
    // "tắc van điện từ" không bị bắt bởi từ "điện".
    const ISSUE_GROUPS: { group: string; phrases: string[] }[] = [
      {
        group: 'Rò nước & Tắc van',
        phrases: ['ro ri', 'ro nuoc', 'ri nuoc', 'bi ro', 'chay nuoc', 'tran nuoc', 'tac van', 'khoa van', 'hong van',
          'van dien tu', 'van cap', 'van xa', 'van mot chieu', 'van ap thap', 'van ap cao', 'bi tac', 'tac loi', 'tac nuoc', 'nghet', 'ong nuoc', 'day ong', 'ro water']
      },
      {
        group: 'Lỗi Nguồn / Điện',
        phrases: ['nguon', 'dien', 'bien ap', 'adapter', 'phich', 'o cam', 'mach', 'bo mach', 'chap', 'e11', 'cau chi']
      },
      {
        group: 'Chất lượng nước & Cảm biến',
        phrases: ['chat luong', 'tds', 'mui', 'nuoc duc', 'vi la', 'cam bien', 'khong lanh', 'khong nong', 'lanh', 'nong',
          'cold', 'voi nuoc', 'voi lanh', 'voi nong', 'hong voi', 'voi bi']
      },
      {
        group: 'Lỗi Lắp đặt & Vỏ máy',
        phrases: ['lap nham', 'lap sai', 'thay doi vi tri', 'doi vi tri', 'vo mat kinh', 'mat kinh', 'vo may', 'bong mieng dan',
          'mieng dan', 'giao nham', 'giao sai', 'giao thieu', 'mop', 'tray xuoc', 'xuoc']
      },
      {
        group: 'Khảo sát & Thay lọc',
        phrases: ['khao sat', 'lay mau', 'thay loc', 'thay loi', 'loi loc']
      }
    ];
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ISSUE_MATCHERS = ISSUE_GROUPS.map(g => ({
      group: g.group,
      regex: new RegExp(`(^|[^a-z0-9])(${g.phrases.map(escapeRegExp).join('|')})(?=$|[^a-z0-9])`)
    }));

    const categorizeIssue = (raw: string): string => {
      if (!raw) return 'Khác';
      const clean = removeAccents(raw);
      const matched = ISSUE_MATCHERS.find(m => m.regex.test(clean));
      return matched ? matched.group : 'Sự cố kỹ thuật khác';
    };

    // 4. Theo tháng, tỉ lệ gặp mỗi sự cố (issueType distribution by month - đã chuẩn hóa nhóm)
    const monthlyIssueMap: Record<string, Record<string, number>> = {};
    issueReports.forEach(r => {
      const monthStr = toVnDateStr(r.createdAt).slice(0, 7); // "YYYY-MM" theo giờ VN
      if (!monthlyIssueMap[monthStr]) {
        monthlyIssueMap[monthStr] = {};
      }
      const issueGroup = categorizeIssue(r.issueType || '');
      monthlyIssueMap[monthStr][issueGroup] = (monthlyIssueMap[monthStr][issueGroup] || 0) + 1;
    });
    
    const monthlyIssuesTrend = Object.entries(monthlyIssueMap)
      .map(([month, issues]) => {
        const total = Object.values(issues).reduce((sum, val) => sum + val, 0);
        return {
          month,
          issues,
          total
        };
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    // 5. Phân tích vòng đời máy (Lắp đặt -> Bảo hành/Sửa chữa)
    const lifecycleList: any[] = [];
    let totalLifecycleDays = 0;

    for (const r of issueReports) {
      let installDate: Date | null = null;

      // 1. Tìm ca lắp đặt theo serialNumber
      if (r.serialNumber && r.serialNumber !== 'Không rõ') {
        const installRep = await prisma.serviceReport.findFirst({
          where: {
            ...validReportFilter,
            serialNumber: r.serialNumber,
            workType: { in: ['Lắp đặt', 'Giao hàng và Lắp đặt'] }
          },
          orderBy: { createdAt: 'asc' }
        });
        if (installRep) {
          installDate = installRep.createdAt;
        }
      }

      // 2. Tìm ca lắp đặt theo đơn hàng / khách hàng
      if (!installDate && r.orderId) {
        const order = await prisma.order.findUnique({
          where: { id: r.orderId },
          select: { pancakeCreatedAt: true, createdAt: true, customerId: true }
        });

        if (order) {
          if (order.customerId) {
            const customerInstall = await prisma.serviceReport.findFirst({
              where: {
                ...validReportFilter,
                order: { customerId: order.customerId },
                workType: { in: ['Lắp đặt', 'Giao hàng và Lắp đặt'] }
              },
              orderBy: { createdAt: 'asc' }
            });
            if (customerInstall) {
              installDate = customerInstall.createdAt;
            }
          }
          if (!installDate) {
            installDate = order.pancakeCreatedAt || order.createdAt;
          }
        }
      }

      if (installDate) {
        const diffMs = r.createdAt.getTime() - installDate.getTime();
        const diffDays = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));

        totalLifecycleDays += diffDays;

        lifecycleList.push({
          serialNumber: r.serialNumber || 'Chưa gán',
          products: r.products || [],
          installDate,
          firstIssueDate: r.createdAt,
          daysToFailure: diffDays,
          issueType: categorizeIssue(r.issueType || ''),
          ktvName: r.ktvUser?.fullName || 'Không rõ'
        });
      }
    }

    const lifecycleCount = lifecycleList.length;
    const avgDaysToFailure = lifecycleCount > 0 ? Math.round(totalLifecycleDays / lifecycleCount) : 0;

    // Phân chia khoảng thời gian hỏng hóc
    const durationRanges = {
      under30: 0,
      between30And90: 0,
      between90And180: 0,
      over180: 0
    };
    lifecycleList.forEach(item => {
      const days = item.daysToFailure;
      if (days < 30) durationRanges.under30++;
      else if (days < 90) durationRanges.between30And90++;
      else if (days < 180) durationRanges.between90And180++;
      else durationRanges.over180++;
    });

    res.json({
      summary: {
        totalReports: reports.length,
        totalIssues: issueReports.length,
        totalInstalls: installReports.length,
        machinesWithIssues: lifecycleCount,
        avgDaysToFailure
      },
      cases,
      productIssues,
      provinceIssues,
      monthlyIssuesTrend,
      lifecycleList: lifecycleList.sort((a, b) => b.firstIssueDate.getTime() - a.firstIssueDate.getTime()),
      durationDist: [
        { name: 'Dưới 1 tháng', value: durationRanges.under30 },
        { name: '1 - 3 tháng', value: durationRanges.between30And90 },
        { name: '3 - 6 tháng', value: durationRanges.between90And180 },
        { name: 'Trên 6 tháng', value: durationRanges.over180 }
      ],
      allProducts
    });

  } catch (error: any) {
    logger.error('Get product quality stats error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu phân tích chất lượng sản phẩm' });
  }
});


/**
 * GET /api/dashboard/revenue
 * Trả về dữ liệu phân tích doanh thu theo các góc nhìn:
 * - Doanh thu theo thời gian + so sánh kỳ trước
 * - Doanh thu theo trạm chính
 * - Doanh thu theo loại công việc & loại dịch vụ
 * - Doanh thu theo kỹ thuật viên (Top KTVs)
 * - Doanh thu theo tỉnh thành (Top Tỉnh)
 */
router.get('/revenue', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      startDate,
      endDate,
      province,
      mainStationId,
      techStationId,
      workType,
      assignedKtvId,
      compareMode,
      prevStartDate,
      prevEndDate,
      includeEcom,
      revenueScope,
      metricType,
      metric
    } = req.query;

    const isIncludeEcom = includeEcom === 'true' || revenueScope === 'all';
    const activeMetric = (metricType as string) || (metric as string) || 'moneyToCollect';

    const parseMulti = (val: any): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(String).filter(Boolean);
      return String(val).split(',').map(s => s.trim()).filter(Boolean);
    };

    const removeAcc = (str: string): string => {
      if (!str) return '';
      return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase();
    };

    // 1. Xác định khoảng thời gian hiện tại (Kỳ này) và Kỳ đối chiếu (Kỳ trước) — theo ngày VN
    const todayVn = toVnDateStr(new Date());
    const [tyStr, tmStr] = todayVn.split('-');
    const lastDayOfMonth = new Date(Date.UTC(Number(tyStr), Number(tmStr), 0)).toISOString().slice(0, 10);
    const currStartStr = (startDate as string) || `${tyStr}-01-01`;
    const currEndStr = (endDate as string) || lastDayOfMonth;

    const shiftYear = (dateStr: string, years: number) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      // 29/02 → 28/02 của năm không nhuận
      const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
      return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
    };

    const mode = (compareMode as string) || 'auto';
    let prevStartStr: string;
    let prevEndStr: string;

    if (mode === 'custom' && prevStartDate && prevEndDate) {
      prevStartStr = String(prevStartDate);
      prevEndStr = String(prevEndDate);
    } else if (mode === 'yoy') {
      prevStartStr = shiftYear(currStartStr, -1);
      prevEndStr = shiftYear(currEndStr, -1);
    } else {
      // mode === 'auto': trọn 1 tháng → tháng trước; khác → khoảng liền trước cùng số ngày
      const prev = previousPeriod(currStartStr, currEndStr);
      prevStartStr = prev.start;
      prevEndStr = prev.end;
    }

    const currStart = vnDayStart(currStartStr);
    const currEnd = vnDayEnd(currEndStr);
    const prevStart = vnDayStart(prevStartStr);
    const prevEnd = vnDayEnd(prevEndStr);

    // 2. Xây dựng điều kiện lọc cơ bản cho Đơn hoàn thành
    const buildWhere = (sDate: Date, eDate: Date) => {
      const whereInput: any = {
        AND: [
          { adminStatus: 'hoàn thành' },
          { pancakeCreatedAt: { gte: sDate, lte: eDate } }
        ]
      };

      if (!isIncludeEcom) {
        whereInput.AND.push(nonEcomFilter);
      }

      const workTypes = parseMulti(workType);
      if (workTypes.length > 0) {
        whereInput.AND.push({ workType: workTypes.length === 1 ? workTypes[0] : { in: workTypes } });
      }

      const ktvIds = parseMulti(assignedKtvId);
      if (ktvIds.length > 0) {
        whereInput.AND.push({ assignedKtvId: ktvIds.length === 1 ? ktvIds[0] : { in: ktvIds } });
      }

      return whereInput;
    };

    // 3. Query đơn hàng kỳ hiện tại và kỳ trước
    const selectFields = {
      id: true,
      // Bắt buộc cho getRevenue(): thiếu 2 trường này thì isPosOrder luôn false
      // → đơn POS đã chuyển khoản trước (COD = 0) bị tính 0đ.
      pancakeOrderId: true,
      orderSource: true,
      moneyToCollect: true,
      totalPrice: true,
      pancakeCreatedAt: true,
      workType: true,
      serviceType: true,
      mainStationId: true,
      techStationId: true,
      customer: { select: { provinceName: true } },
      shippingAddress: true,
      assignedKtv: { select: { id: true, fullName: true } },
      mainStation: { select: { id: true, name: true, isActive: true } },
      techStation: {
        select: {
          id: true,
          name: true,
          mainStation: { select: { id: true, name: true, isActive: true } }
        }
      }
    };

    let currOrders = await prisma.order.findMany({
      where: buildWhere(currStart, currEnd),
      select: selectFields
    });

    let prevOrders = await prisma.order.findMany({
      where: buildWhere(prevStart, prevEnd),
      select: selectFields
    });

    // 4. Lọc bộ nhớ theo tỉnh thành, trạm chính, trạm kỹ thuật
    const filterMemory = async (orderList: typeof currOrders) => {
      let filtered = orderList;

      const searchProvinces = getSearchProvinces(province);
      if (searchProvinces.length > 0) {
        filtered = filtered.filter(order => matchOrderProvince(order, searchProvinces));
      }

      const mainStationIds = parseMulti(mainStationId);
      if (mainStationIds.length > 0) {
        const targetMainStations = await prisma.mainStation.findMany({
          where: { id: { in: mainStationIds } }
        });
        const targetNames = targetMainStations.map(s => s.name);
        if (targetNames.length > 0) {
          filtered = filtered.filter(o => {
            let msName = 'Chưa phân trạm';
            if (o.mainStation) {
              if (o.mainStation.isActive) {
                msName = o.mainStation.name;
              } else if (['Trạm Hồ Chí Minh', 'Trạm Đồng Nai', 'Trạm Vũng Tàu'].includes(o.mainStation.name)) {
                msName = 'Truliva';
              }
            }
            if (msName === 'Chưa phân trạm' && o.techStation?.mainStation) {
              if (o.techStation.mainStation.isActive) {
                msName = o.techStation.mainStation.name;
              } else if (['Trạm Hồ Chí Minh', 'Trạm Đồng Nai', 'Trạm Vũng Tàu'].includes(o.techStation.mainStation.name)) {
                msName = 'Truliva';
              }
            }
            return targetNames.includes(msName);
          });
        }
      }

      const techStationIds = parseMulti(techStationId);
      if (techStationIds.length > 0) {
        filtered = filtered.filter(o => o.techStationId != null && techStationIds.includes(o.techStationId));
      }

      return filtered;
    };

    currOrders = await filterMemory(currOrders);
    prevOrders = await filterMemory(prevOrders);

    // Helper tính chỉ số tài chính thông minh cho 1 đơn hàng:
    // - Nếu activeMetric === 'totalPrice': Doanh số niêm yết (Gross Sales) -> Lấy totalPrice
    // - Nếu activeMetric === 'moneyToCollect': Doanh thu thực thu thông minh (Smart Net Revenue):
    //   + Đơn POS (pancakeOrderId > 100 & orderSource != 'unknown'): Lấy moneyToCollect nếu > 0 (đơn COD), fallback totalPrice nếu == 0 (chuyển khoản trước)
    //   + Ca thủ công: Lấy tiền thu hộ COD thực tế tại nhà khách (moneyToCollect)
    const getRevenue = (o: any) => smartRevenue(o, activeMetric);

    // 5. Tổng doanh thu kỳ hiện tại vs kỳ trước
    const totalCurrRevenue = currOrders.reduce((sum, o) => sum + getRevenue(o), 0);
    const totalPrevRevenue = prevOrders.reduce((sum, o) => sum + getRevenue(o), 0);
    const revDiff = totalCurrRevenue - totalPrevRevenue;
    const revPercentChange = totalPrevRevenue > 0
      ? Math.round((revDiff / totalPrevRevenue) * 100)
      : (totalCurrRevenue > 0 ? 100 : 0);

    // Ngày VN YYYY-MM-DD (không phụ thuộc múi giờ của server)
    const formatKeyDate = (d: Date) => toVnDateStr(d);

    // 6. Doanh thu theo thời gian (Daily breakdown)
    const listDates = (fromStr: string, toStr: string) => {
      const out: string[] = [];
      for (let d = fromStr; d <= toStr && out.length < 3700; d = addDaysStr(d, 1)) out.push(d);
      return out;
    };
    const currDates = listDates(currStartStr, currEndStr);
    const prevDates = listDates(prevStartStr, prevEndStr);

    const currDailyMap: Record<string, { revenue: number; ordersCount: number }> = {};
    currOrders.forEach(o => {
      if (o.pancakeCreatedAt) {
        const dKey = formatKeyDate(new Date(o.pancakeCreatedAt));
        if (!currDailyMap[dKey]) currDailyMap[dKey] = { revenue: 0, ordersCount: 0 };
        currDailyMap[dKey].revenue += getRevenue(o);
        currDailyMap[dKey].ordersCount += 1;
      }
    });

    const prevDailyMap: Record<string, { revenue: number; ordersCount: number }> = {};
    prevOrders.forEach(o => {
      if (o.pancakeCreatedAt) {
        const dKey = formatKeyDate(new Date(o.pancakeCreatedAt));
        if (!prevDailyMap[dKey]) prevDailyMap[dKey] = { revenue: 0, ordersCount: 0 };
        prevDailyMap[dKey].revenue += getRevenue(o);
        prevDailyMap[dKey].ordersCount += 1;
      }
    });

    const timeTrend = currDates.map((cDate, idx) => {
      const pDate = prevDates[idx] || '';
      const cData = currDailyMap[cDate] || { revenue: 0, ordersCount: 0 };
      const pData = pDate ? (prevDailyMap[pDate] || { revenue: 0, ordersCount: 0 }) : { revenue: 0, ordersCount: 0 };
      return {
        date: cDate,
        revenue: cData.revenue,
        ordersCount: cData.ordersCount,
        prevDate: pDate,
        prevRevenue: pData.revenue,
        prevOrdersCount: pData.ordersCount
      };
    });

    // 7. Doanh thu theo Trạm chính
    const stationMap: Record<string, { name: string; revenue: number; ordersCount: number; prevRevenue: number; prevOrdersCount: number }> = {};
    currOrders.forEach(o => {
      let stName = 'Chưa phân trạm';
      if (o.mainStation) stName = o.mainStation.name;
      else if (o.techStation?.mainStation) stName = o.techStation.mainStation.name;

      if (!stationMap[stName]) {
        stationMap[stName] = { name: stName, revenue: 0, ordersCount: 0, prevRevenue: 0, prevOrdersCount: 0 };
      }
      stationMap[stName].revenue += getRevenue(o);
      stationMap[stName].ordersCount += 1;
    });

    prevOrders.forEach(o => {
      let stName = 'Chưa phân trạm';
      if (o.mainStation) stName = o.mainStation.name;
      else if (o.techStation?.mainStation) stName = o.techStation.mainStation.name;

      if (!stationMap[stName]) {
        stationMap[stName] = { name: stName, revenue: 0, ordersCount: 0, prevRevenue: 0, prevOrdersCount: 0 };
      }
      stationMap[stName].prevRevenue += getRevenue(o);
      stationMap[stName].prevOrdersCount += 1;
    });

    const byStation = Object.values(stationMap).sort((a, b) => b.revenue - a.revenue);

    // 8. Doanh thu theo Loại công việc
    const workTypeMap: Record<string, { name: string; revenue: number; ordersCount: number; prevRevenue: number; prevOrdersCount: number }> = {};
    currOrders.forEach(o => {
      const wt = o.workType || 'Chưa xác định';
      if (!workTypeMap[wt]) {
        workTypeMap[wt] = { name: wt, revenue: 0, ordersCount: 0, prevRevenue: 0, prevOrdersCount: 0 };
      }
      workTypeMap[wt].revenue += getRevenue(o);
      workTypeMap[wt].ordersCount += 1;
    });

    prevOrders.forEach(o => {
      const wt = o.workType || 'Chưa xác định';
      if (!workTypeMap[wt]) {
        workTypeMap[wt] = { name: wt, revenue: 0, ordersCount: 0, prevRevenue: 0, prevOrdersCount: 0 };
      }
      workTypeMap[wt].prevRevenue += getRevenue(o);
      workTypeMap[wt].prevOrdersCount += 1;
    });

    const byWorkType = Object.values(workTypeMap).sort((a, b) => b.revenue - a.revenue);

    // 9. Doanh thu theo Loại dịch vụ (serviceType)
    const serviceTypeMap: Record<string, { name: string; revenue: number; ordersCount: number; prevRevenue: number; prevOrdersCount: number }> = {};
    currOrders.forEach(o => {
      const st = o.serviceType || 'Chưa xác định';
      if (!serviceTypeMap[st]) {
        serviceTypeMap[st] = { name: st, revenue: 0, ordersCount: 0, prevRevenue: 0, prevOrdersCount: 0 };
      }
      serviceTypeMap[st].revenue += getRevenue(o);
      serviceTypeMap[st].ordersCount += 1;
    });

    prevOrders.forEach(o => {
      const st = o.serviceType || 'Chưa xác định';
      if (!serviceTypeMap[st]) {
        serviceTypeMap[st] = { name: st, revenue: 0, ordersCount: 0, prevRevenue: 0, prevOrdersCount: 0 };
      }
      serviceTypeMap[st].prevRevenue += getRevenue(o);
      serviceTypeMap[st].prevOrdersCount += 1;
    });

    const byServiceType = Object.values(serviceTypeMap).sort((a, b) => b.revenue - a.revenue);

    // 10. Doanh thu theo Kỹ thuật viên (Top KTVs)
    const ktvMap: Record<string, { id: string; name: string; revenue: number; ordersCount: number; prevRevenue: number; prevOrdersCount: number }> = {};
    currOrders.forEach(o => {
      const kId = o.assignedKtv?.id || 'unassigned';
      const kName = o.assignedKtv?.fullName || 'Chưa phân công';
      if (!ktvMap[kId]) {
        ktvMap[kId] = { id: kId, name: kName, revenue: 0, ordersCount: 0, prevRevenue: 0, prevOrdersCount: 0 };
      }
      ktvMap[kId].revenue += getRevenue(o);
      ktvMap[kId].ordersCount += 1;
    });

    prevOrders.forEach(o => {
      const kId = o.assignedKtv?.id || 'unassigned';
      const kName = o.assignedKtv?.fullName || 'Chưa phân công';
      if (!ktvMap[kId]) {
        ktvMap[kId] = { id: kId, name: kName, revenue: 0, ordersCount: 0, prevRevenue: 0, prevOrdersCount: 0 };
      }
      ktvMap[kId].prevRevenue += getRevenue(o);
      ktvMap[kId].prevOrdersCount += 1;
    });

    const byKtv = Object.values(ktvMap).sort((a, b) => b.revenue - a.revenue);

    // 11. Doanh thu theo Tỉnh/Thành phố
    const provinceMap: Record<string, { name: string; revenue: number; ordersCount: number; prevRevenue: number; prevOrdersCount: number }> = {};
    currOrders.forEach(o => {
      let pName = o.customer?.provinceName || (o.shippingAddress as any)?.province_name || 'Khác';
      pName = pName.replace(/^(Tỉnh |Thành phố |TP\.?\s*)/i, '').trim();
      if (!pName) pName = 'Khác';

      if (!provinceMap[pName]) {
        provinceMap[pName] = { name: pName, revenue: 0, ordersCount: 0, prevRevenue: 0, prevOrdersCount: 0 };
      }
      provinceMap[pName].revenue += getRevenue(o);
      provinceMap[pName].ordersCount += 1;
    });

    prevOrders.forEach(o => {
      let pName = o.customer?.provinceName || (o.shippingAddress as any)?.province_name || 'Khác';
      pName = pName.replace(/^(Tỉnh |Thành phố |TP\.?\s*)/i, '').trim();
      if (!pName) pName = 'Khác';

      if (!provinceMap[pName]) {
        provinceMap[pName] = { name: pName, revenue: 0, ordersCount: 0, prevRevenue: 0, prevOrdersCount: 0 };
      }
      provinceMap[pName].prevRevenue += getRevenue(o);
      provinceMap[pName].prevOrdersCount += 1;
    });

    const byProvince = Object.values(provinceMap).sort((a, b) => b.revenue - a.revenue);

    res.json({
      periodInfo: {
        current: { start: currStartStr, end: currEndStr },
        previous: { start: prevStartStr, end: prevEndStr }
      },
      summary: {
        metricType: activeMetric,
        totalRevenue: totalCurrRevenue,
        prevRevenue: totalPrevRevenue,
        revenueDiff: revDiff,
        percentChange: revPercentChange,
        ordersCount: currOrders.length,
        prevOrdersCount: prevOrders.length,
        avgOrderValue: currOrders.length > 0 ? Math.round(totalCurrRevenue / currOrders.length) : 0
      },
      timeTrend,
      byStation,
      byWorkType,
      byServiceType,
      byKtv,
      byProvince
    });

  } catch (error: any) {
    logger.error('Get revenue analysis error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu phân tích doanh thu' });
  }
});

/**
 * GET /api/dashboard/overview
 * Trang Tổng quan vận hành — 3 tầng:
 *  1. action:   việc cần xử lý NGAY (tính tại thời điểm hiện tại, KHÔNG theo bộ lọc ngày)
 *  2. kpis:     sức khỏe kỳ đang chọn so với kỳ trước (mặc định: tháng hiện tại vs tháng trước)
 *  3. trend / breakdown / dataQuality: xu hướng 6 tháng, phân rã theo loại công việc & kênh, chất lượng dữ liệu
 * Bộ lọc tỉnh / trạm / loại công việc / KTV áp dụng cho cả 3 tầng; bộ lọc ngày chỉ áp dụng cho tầng 2–3.
 * Vận hành (action, SLA, thời gian xử lý) không tính đơn eCom; doanh thu & kênh tính mọi kênh.
 */
const SYSTEM_GO_LIVE = '2026-06-01'; // Trước mốc này là dữ liệu nhập lại: không loại CV, không KTV, không báo cáo
const AUTO_APPOINTMENT_OFFSET_MS = 2 * 60 * 60 * 1000;

router.get('/overview', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, province, mainStationId, techStationId, workType, assignedKtvId } = req.query;

    const now = new Date();
    const todayStr = toVnDateStr(now);
    const tomorrowStr = addDaysStr(todayStr, 1);
    const lastDayOfMonth = (ym: string) => {
      const [y, m] = ym.split('-').map(Number);
      return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    };

    const currStartStr = startDate ? String(startDate) : `${todayStr.slice(0, 7)}-01`;
    const currEndStr = endDate ? String(endDate) : lastDayOfMonth(todayStr.slice(0, 7));
    const prev = previousPeriod(currStartStr, currEndStr);

    // Xu hướng: 6 tháng dương lịch, kết thúc ở tháng chứa ngày cuối kỳ
    const months: string[] = [];
    {
      let [y, m] = currEndStr.slice(0, 7).split('-').map(Number);
      for (let i = 0; i < 6; i++) {
        months.unshift(`${y}-${String(m).padStart(2, '0')}`);
        m--;
        if (m === 0) { m = 12; y--; }
      }
    }
    const trendEndStr = lastDayOfMonth(months[months.length - 1]);
    const fetchStartStr = [prev.start, currStartStr, `${months[0]}-01`].sort()[0];
    const fetchEndStr = [currEndStr, trendEndStr].sort().reverse()[0];

    // ── Bộ lọc dùng chung ──
    const dbFilters: Prisma.OrderWhereInput[] = [];
    const workTypes = parseMultiValue(workType);
    if (workTypes.length > 0) dbFilters.push({ workType: { in: workTypes } });
    const ktvIds = parseMultiValue(assignedKtvId);
    if (ktvIds.length > 0) dbFilters.push({ assignedKtvId: { in: ktvIds } });

    const searchProvinces = getSearchProvinces(province);
    const mainStationIds = parseMultiValue(mainStationId);
    const targetMainNames = mainStationIds.length > 0
      ? (await prisma.mainStation.findMany({ where: { id: { in: mainStationIds } }, select: { name: true } })).map(s => s.name)
      : [];
    const techStationIds = parseMultiValue(techStationId);

    const orderSelect = {
      id: true,
      pancakeOrderId: true,
      statusCode: true,
      adminStatus: true,
      orderSource: true,
      workType: true,
      appointmentTime: true,
      pancakeCreatedAt: true,
      createdAt: true,
      assignedKtvId: true,
      assignedKtv: { select: { id: true, fullName: true } },
      billFullName: true,
      billPhoneNumber: true,
      customer: { select: { fullName: true, phoneNumber: true, provinceName: true } },
      shippingAddress: true,
      mainStationId: true,
      techStationId: true,
      mainStation: { select: { name: true, isActive: true } },
      techStation: { select: { name: true, mainStation: { select: { name: true, isActive: true } } } },
      moneyToCollect: true,
      totalPrice: true,
      serviceReports: {
        where: validReportFilter,
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' as const },
        take: 1
      }
    } satisfies Prisma.OrderSelect;

    type Row = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

    const applyMemoryFilters = (list: Row[]) => list.filter(o => {
      if (searchProvinces.length > 0 && !matchOrderProvince(o, searchProvinces)) return false;
      if (targetMainNames.length > 0 && !targetMainNames.includes(resolveMainStationName(o))) return false;
      if (techStationIds.length > 0 && !(o.techStationId && techStationIds.includes(o.techStationId))) return false;
      return true;
    });

    const [openRaw, periodRaw] = await Promise.all([
      prisma.order.findMany({
        where: {
          AND: [
            { OR: [{ statusCode: { not: 0 } }, { statusCode: null }, { pancakeOrderId: { lt: 0 } }] },
            nonEcomFilter,
            { OR: [{ adminStatus: null }, { adminStatus: { notIn: CLOSED_STATUSES } }] },
            ...dbFilters
          ]
        },
        select: orderSelect
      }),
      prisma.order.findMany({
        where: {
          AND: [
            { pancakeCreatedAt: { gte: vnDayStart(fetchStartStr), lte: vnDayEnd(fetchEndStr) } },
            ...dbFilters
          ]
        },
        select: orderSelect
      })
    ]);

    const openOrders = applyMemoryFilters(openRaw);
    const periodOrders = applyMemoryFilters(periodRaw).filter(isValidOrder);

    const createdAtOf = (o: Row) => o.pancakeCreatedAt || o.createdAt;
    const firstReportOf = (o: Row) => o.serviceReports?.[0]?.createdAt ?? null;
    const isAutoAppointment = (o: Row) =>
      o.appointmentTime != null &&
      Math.abs(o.appointmentTime.getTime() - createdAtOf(o).getTime() - AUTO_APPOINTMENT_OFFSET_MS) < 5 * 60 * 1000;

    // ── Đếm số lần DỜI NGÀY HẸN thật sự (từ audit log) ──
    // Bỏ qua: lần đặt lịch đầu tiên thay cho lịch tự sinh +2h, và đổi giờ trong cùng một ngày.
    const createdById = new Map<string, Date>();
    [...openOrders, ...periodOrders].forEach(o => createdById.set(o.id, createdAtOf(o)));
    const rescheduleCount = new Map<string, number>();
    const idList = Array.from(createdById.keys());
    for (let i = 0; i < idList.length; i += 5000) {
      const logs = await prisma.auditLog.findMany({
        where: { entityType: 'Order', entityId: { in: idList.slice(i, i + 5000) } },
        select: { entityId: true, changes: true }
      });
      for (const log of logs) {
        const items = Array.isArray(log.changes) ? log.changes : (log.changes ? [log.changes] : []);
        for (const it of items as any[]) {
          if (!it || it.field !== 'appointmentTime' || !it.from || !it.to) continue;
          const from = new Date(it.from);
          const to = new Date(it.to);
          if (isNaN(from.getTime()) || isNaN(to.getTime())) continue;
          if (toVnDateStr(from) === toVnDateStr(to)) continue;
          const created = createdById.get(log.entityId);
          if (created && Math.abs(from.getTime() - created.getTime() - AUTO_APPOINTMENT_OFFSET_MS) < 5 * 60 * 1000) continue;
          rescheduleCount.set(log.entityId, (rescheduleCount.get(log.entityId) || 0) + 1);
        }
      }
    }

    // ══ Tầng 1: VIỆC CẦN XỬ LÝ ══
    const AGING = [
      { key: 'lt1', label: '< 1 ngày', max: 1 },
      { key: '1to3', label: '1–3 ngày', max: 3 },
      { key: '3to7', label: '3–7 ngày', max: 7 },
      { key: '7to30', label: '7–30 ngày', max: 30 },
      { key: 'gt30', label: '> 30 ngày', max: Infinity }
    ];
    const aging = AGING.map(a => ({ key: a.key, label: a.label, assigned: 0, unassigned: 0 }));
    const action = {
      open: 0, overdue: 0, dueToday: 0, dueTomorrow: 0, noAppointment: 0,
      unassignedKtv: 0, unassignedStation: 0, reportedNotClosed: 0
    };
    const ktvLoadMap: Record<string, { id: string; name: string; open: number; overdue: number; dueToday: number }> = {};
    const attention: any[] = [];

    for (const o of openOrders) {
      const hasReport = firstReportOf(o) != null;
      const apptStr = o.appointmentTime ? toVnDateStr(o.appointmentTime) : null;
      const ageDays = (now.getTime() - createdAtOf(o).getTime()) / DAY_MS;
      const isOverdue = !hasReport && apptStr != null && apptStr < todayStr;
      const delayDays = isOverdue ? diffDaysStr(apptStr!, todayStr) : 0;
      const noKtv = !hasReport && !o.assignedKtvId;
      const stationName = resolveMainStationName(o);
      const noStation = !hasReport && stationName === 'Chưa phân trạm' && !o.techStationId;

      action.open++;
      if (hasReport) action.reportedNotClosed++;
      if (isOverdue) action.overdue++;
      if (!hasReport && apptStr === todayStr) action.dueToday++;
      if (!hasReport && apptStr === tomorrowStr) action.dueTomorrow++;
      if (!hasReport && apptStr == null) action.noAppointment++;
      if (noKtv) action.unassignedKtv++;
      if (noStation) action.unassignedStation++;

      const bucket = aging[AGING.findIndex(a => ageDays < a.max)];
      if (o.assignedKtvId) bucket.assigned++; else bucket.unassigned++;

      if (!hasReport && o.assignedKtv) {
        const k = (ktvLoadMap[o.assignedKtv.id] ||= { id: o.assignedKtv.id, name: o.assignedKtv.fullName, open: 0, overdue: 0, dueToday: 0 });
        k.open++;
        if (isOverdue) k.overdue++;
        if (apptStr === todayStr) k.dueToday++;
      }

      const reasons: string[] = [];
      if (isOverdue) reasons.push(`Quá hẹn ${delayDays} ngày`);
      if (hasReport) reasons.push('Đã có báo cáo – chưa đóng đơn');
      if (noKtv) reasons.push('Chưa gán KTV');
      if (!hasReport && apptStr == null) reasons.push('Chưa có lịch hẹn');
      if (!hasReport && apptStr === todayStr) reasons.push('Hẹn hôm nay');
      if (reasons.length > 0) {
        attention.push({
          id: o.id,
          pancakeOrderId: o.pancakeOrderId,
          customerName: o.billFullName || o.customer?.fullName || 'Khách lẻ',
          customerPhone: o.billPhoneNumber || o.customer?.phoneNumber || '',
          workType: o.workType || 'Chưa xác định',
          adminStatus: o.adminStatus || 'chờ xử lý',
          ktvName: o.assignedKtv?.fullName || null,
          stationName,
          appointmentDate: apptStr,
          ageDays: Math.floor(ageDays),
          delayDays,
          rescheduleCount: rescheduleCount.get(o.id) || 0,
          reasons
        });
      }
    }
    attention.sort((a, b) => b.delayDays - a.delayDays || b.ageDays - a.ageDays);

    // ══ Tầng 2: KPI kỳ này vs kỳ trước ══
    const inRange = (o: Row, s: string, e: string) => {
      const d = toVnDateStr(createdAtOf(o));
      return d >= s && d <= e;
    };

    const computeKpis = (list: Row[]) => {
      const service = list.filter(o => !isEcomSource(o.orderSource));
      const slaSet = service.filter(o => !isDeliveryOnly(o.workType));
      const completed = service.filter(o => o.adminStatus === 'hoàn thành').length;
      const cancelled = service.filter(o => o.adminStatus === 'hủy đơn').length;
      const returned = service.filter(o => RETURN_STATUSES.includes(o.adminStatus || '')).length;
      const open = service.filter(o => !CLOSED_STATUSES.includes(o.adminStatus || '')).length;

      let onTime = 0;
      let late = 0;
      const leadTimes: number[] = [];
      let rescheduled = 0;
      for (const o of slaSet) {
        const sla = classifySla({ appointmentTime: o.appointmentTime, adminStatus: o.adminStatus, firstReportAt: firstReportOf(o) }, todayStr);
        if (sla.isOnTime) onTime++;
        if (sla.isLate) late++;
        const rep = firstReportOf(o);
        if (rep) leadTimes.push(Math.max(0, (rep.getTime() - createdAtOf(o).getTime()) / DAY_MS));
        if ((rescheduleCount.get(o.id) || 0) > 0) rescheduled++;
      }
      const completedOrders = list.filter(o => o.adminStatus === 'hoàn thành');
      const delivery = service.filter(o => isDeliveryOnly(o.workType));

      return {
        createdAll: list.length,
        ecomCreated: list.length - service.length,
        created: service.length,
        completed,
        cancelled,
        returned,
        open,
        cancelRate: service.length > 0 ? Math.round((cancelled / service.length) * 1000) / 10 : null,
        onTime,
        late,
        onTimeRate: onTime + late > 0 ? Math.round((onTime / (onTime + late)) * 100) : null,
        leadTimeP50: percentile(leadTimes, 0.5),
        leadTimeP80: percentile(leadTimes, 0.8),
        leadTimeSample: leadTimes.length,
        slaOrders: slaSet.length,
        rescheduled,
        rescheduleRate: slaSet.length > 0 ? Math.round((rescheduled / slaSet.length) * 1000) / 10 : null,
        deliveryCreated: delivery.length,
        deliveryCompleted: delivery.filter(o => o.adminStatus === 'hoàn thành').length,
        revenue: completedOrders.reduce((s, o) => s + smartRevenue(o, 'moneyToCollect'), 0),
        grossSales: completedOrders.reduce((s, o) => s + smartRevenue(o, 'totalPrice'), 0),
        completedAll: completedOrders.length
      };
    };

    const currList = periodOrders.filter(o => inRange(o, currStartStr, currEndStr));
    const prevList = periodOrders.filter(o => inRange(o, prev.start, prev.end));
    // Kỳ đang chạy dở (chứa hôm nay): so với CÙNG SỐ NGÀY đầu kỳ trước để không so "nửa tháng" với "cả tháng"
    let previousToDate: { start: string; end: string } | null = null;
    if (todayStr >= currStartStr && todayStr < currEndStr) {
      const elapsed = diffDaysStr(currStartStr, todayStr);
      const end = addDaysStr(prev.start, elapsed);
      previousToDate = { start: prev.start, end: end < prev.end ? end : prev.end };
    }
    const kpis = {
      current: computeKpis(currList),
      previous: computeKpis(prevList),
      previousToDate: previousToDate
        ? computeKpis(periodOrders.filter(o => inRange(o, previousToDate!.start, previousToDate!.end)))
        : null
    };

    // ══ Tầng 3a: Xu hướng 6 tháng (theo tháng TẠO đơn — cohort) ══
    const trend = months.map(m => {
      const list = periodOrders.filter(o => toVnDateStr(createdAtOf(o)).slice(0, 7) === m);
      const k = computeKpis(list);
      return {
        month: m,
        created: k.created,
        completed: k.completed,
        cancelled: k.cancelled,
        returned: k.returned,
        open: k.open,
        onTimeRate: k.onTimeRate,
        leadTimeP50: k.leadTimeP50,
        leadTimeP80: k.leadTimeP80,
        rescheduleRate: k.rescheduleRate,
        revenue: k.revenue,
        isPartial: m === todayStr.slice(0, 7),
        isLegacy: `${m}-01` < SYSTEM_GO_LIVE
      };
    });

    // ══ Tầng 3b: Phân rã kỳ hiện tại ══
    const groupBy = <T extends string>(list: Row[], keyOf: (o: Row) => T) => {
      const map = new Map<T, Row[]>();
      list.forEach(o => {
        const k = keyOf(o);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(o);
      });
      return map;
    };

    const byWorkType = Array.from(groupBy(currList.filter(o => !isEcomSource(o.orderSource)), o => o.workType || 'Chưa xác định').entries())
      .map(([name, list]) => {
        const k = computeKpis(list);
        const delivery = isDeliveryOnly(name);
        return {
          name,
          created: k.created,
          completed: k.completed,
          cancelled: k.cancelled,
          open: k.open,
          cancelRate: k.cancelRate,
          onTimeRate: delivery ? null : k.onTimeRate,
          leadTimeP50: delivery ? null : k.leadTimeP50,
          leadTimeP80: delivery ? null : k.leadTimeP80,
          rescheduleRate: delivery ? null : k.rescheduleRate,
          excludedFromSla: delivery
        };
      })
      .sort((a, b) => b.created - a.created);

    const channelName = (o: Row) => o.orderSource || 'Không ghi nguồn';
    const prevByChannel = groupBy(prevList, channelName);
    const byChannel = Array.from(groupBy(currList, channelName).entries())
      .map(([name, list]) => {
        const completedList = list.filter(o => o.adminStatus === 'hoàn thành');
        const cancelled = list.filter(o => o.adminStatus === 'hủy đơn').length;
        const prevListCh = prevByChannel.get(name) || [];
        return {
          name,
          isEcom: isEcomSource(name),
          created: list.length,
          prevCreated: prevListCh.length,
          completed: completedList.length,
          cancelled,
          cancelRate: list.length > 0 ? Math.round((cancelled / list.length) * 1000) / 10 : null,
          revenue: completedList.reduce((s, o) => s + smartRevenue(o, 'moneyToCollect'), 0),
          prevRevenue: prevListCh.filter(o => o.adminStatus === 'hoàn thành').reduce((s, o) => s + smartRevenue(o, 'moneyToCollect'), 0)
        };
      })
      .sort((a, b) => b.created - a.created);

    // ══ Tầng 3c: Chất lượng dữ liệu (kỳ hiện tại, đơn dịch vụ không eCom) ══
    const dqBase = currList.filter(o => !isEcomSource(o.orderSource));
    const pct = (n: number) => (dqBase.length > 0 ? Math.round((n / dqBase.length) * 1000) / 10 : 0);
    const dqCount = {
      missingWorkType: dqBase.filter(o => !o.workType).length,
      completedNoReport: dqBase.filter(o => o.adminStatus === 'hoàn thành' && !firstReportOf(o) && !isDeliveryOnly(o.workType)).length,
      autoAppointment: dqBase.filter(o => isAutoAppointment(o) && (rescheduleCount.get(o.id) || 0) === 0).length,
      unassignedStation: dqBase.filter(o => resolveMainStationName(o) === 'Chưa phân trạm' && !o.techStationId).length,
      missingSource: dqBase.filter(o => !o.orderSource).length
    };
    const dataQuality = {
      total: dqBase.length,
      items: [
        { key: 'missingWorkType', label: 'Thiếu loại công việc', count: dqCount.missingWorkType, pct: pct(dqCount.missingWorkType) },
        { key: 'completedNoReport', label: 'Hoàn thành nhưng không có báo cáo nghiệm thu (trừ Giao hàng)', count: dqCount.completedNoReport, pct: pct(dqCount.completedNoReport) },
        { key: 'autoAppointment', label: 'Lịch hẹn tự sinh (+2h) chưa được điều phối chỉnh', count: dqCount.autoAppointment, pct: pct(dqCount.autoAppointment) },
        { key: 'unassignedStation', label: 'Chưa phân trạm', count: dqCount.unassignedStation, pct: pct(dqCount.unassignedStation) },
        { key: 'missingSource', label: 'Không ghi nguồn đơn', count: dqCount.missingSource, pct: pct(dqCount.missingSource) }
      ],
      includesLegacyData: currStartStr < SYSTEM_GO_LIVE || prev.start < SYSTEM_GO_LIVE,
      systemGoLive: SYSTEM_GO_LIVE
    };

    res.json({
      generatedAt: now.toISOString(),
      today: todayStr,
      period: {
        current: { start: currStartStr, end: currEndStr },
        previous: prev,
        previousToDate,
        currentToDate: previousToDate ? { start: currStartStr, end: todayStr } : null
      },
      action: {
        ...action,
        aging,
        attentionTotal: attention.length,
        attentionList: attention.slice(0, 100),
        ktvLoad: Object.values(ktvLoadMap).sort((a, b) => b.open - a.open)
      },
      kpis,
      trend,
      breakdown: { byWorkType, byChannel },
      dataQuality
    });
  } catch (error: any) {
    logger.error('Get dashboard overview error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu tổng quan' });
  }
});

export default router;


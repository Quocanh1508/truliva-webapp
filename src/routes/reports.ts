import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import { sendPushNotification } from '../services/notificationService';
import { sendWebPushNotification } from '../services/webPushService';
import ExcelJS from 'exceljs';

const router = Router();

// Reusable function to build standard & advanced report filter queries
async function buildReportFilter(query: any, user: any): Promise<any> {
  const {
    month,
    ktvId,
    province,
    serviceType,
    isPaid,
    search,
    startDate,
    endDate,
    workTypes,
    serviceTypes,
    productCategories,
    products,
    mainStationId,
    techStationIds,
    ktvIds,
    completedStart,
    completedEnd,
    createdStart,
    createdEnd,
    updatedStart,
    updatedEnd
  } = query;

  const where: any = {};

  // Phân quyền: KTV chỉ thấy của mình
  if (user.role === 'KTV') {
    where.ktvUserId = user.id;
  } else if (ktvId) {
    where.ktvUserId = ktvId;
  } else if (ktvIds) {
    const list = (ktvIds as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      where.ktvUserId = { in: list };
    }
  }

  if (month) where.month = month;
  if (province) where.province = { contains: province as string, mode: 'insensitive' };
  
  // Lọc Loại công việc (chọn nhiều)
  if (workTypes) {
    const list = (workTypes as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      where.workType = { in: list };
    }
  }

  // Lọc Loại dịch vụ (chọn nhiều)
  if (serviceTypes) {
    const list = (serviceTypes as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      where.serviceType = { in: list };
    }
  } else if (serviceType) {
    where.serviceType = serviceType;
  }

  if (isPaid !== undefined) where.isPaid = isPaid === 'true';

  // Lọc Danh mục sản phẩm (chọn nhiều)
  if (productCategories) {
    const categories = (productCategories as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (categories.length > 0) {
      const dbProducts = await prisma.product.findMany({
        where: { category: { in: categories, mode: 'insensitive' } },
        select: { name: true }
      });
      const productNames = dbProducts.map((p: any) => p.name);
      if (productNames.length > 0) {
        where.products = {
          hasSome: productNames
        };
      } else {
        where.id = 'none'; // force return nothing
      }
    }
  }

  // Lọc Sản phẩm (chọn nhiều)
  if (products) {
    const list = (products as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      where.products = {
        hasSome: list
      };
    }
  }

  // Lọc Trạm chính, Trạm kỹ thuật
  const orConditions: any[] = [];
  if (mainStationId) {
    orConditions.push(
      { order: { mainStationId } },
      { ktvUser: { techStation: { mainStationId } } }
    );
  }
  if (techStationIds) {
    const list = (techStationIds as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      orConditions.push(
        { order: { techStationId: { in: list } } },
        { ktvUser: { techStationId: { in: list } } }
      );
    }
  }

  if (orConditions.length > 0) {
    where.AND = where.AND || [];
    where.AND.push({ OR: orConditions });
  }

  // Lọc tìm kiếm tổng hợp
  if (search) {
    const searchStr = search as string;
    const parsedOrderId = parseInt(searchStr);
    
    const searchConditions: any[] = [
      { customerName: { contains: searchStr, mode: 'insensitive' } },
      { customerPhone: { contains: searchStr } },
      { ktvUser: { fullName: { contains: searchStr, mode: 'insensitive' } } }
    ];
    
    if (!isNaN(parsedOrderId)) {
      searchConditions.push({
        order: {
          pancakeOrderId: parsedOrderId
        }
      });
    }

    where.AND = where.AND || [];
    where.AND.push({ OR: searchConditions });
  }

  // Lọc theo Khoảng thời gian hoàn thành (ServiceReport.createdAt)
  const compStart = completedStart || startDate;
  const compEnd = completedEnd || endDate;
  if (compStart || compEnd) {
    where.createdAt = {};
    if (compStart) {
      where.createdAt.gte = new Date(`${compStart}T00:00:00.000Z`);
    }
    if (compEnd) {
      where.createdAt.lte = new Date(`${compEnd}T23:59:59.999Z`);
    }
  }

  // Lọc theo Khoảng thời gian tạo đơn (Order.pancakeCreatedAt hoặc Order.createdAt)
  if (createdStart || createdEnd) {
    const orderDateFilter: any = {};
    if (createdStart) {
      orderDateFilter.gte = new Date(`${createdStart}T00:00:00.000Z`);
    }
    if (createdEnd) {
      orderDateFilter.lte = new Date(`${createdEnd}T23:59:59.999Z`);
    }
    
    where.order = where.order || {};
    where.order.pancakeCreatedAt = orderDateFilter;
  }

  // Lọc theo Khoảng thời gian cập nhật báo cáo (ServiceReport.updatedAt)
  if (updatedStart || updatedEnd) {
    where.updatedAt = {};
    if (updatedStart) {
      where.updatedAt.gte = new Date(`${updatedStart}T00:00:00.000Z`);
    }
    if (updatedEnd) {
      where.updatedAt.lte = new Date(`${updatedEnd}T23:59:59.999Z`);
    }
  }

  return where;
}

// Tất cả routes cần đăng nhập
router.use(requireAuth);

/**
 * POST /api/reports
 * KTV tạo báo cáo mới
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      month,
      customerName,
      customerPhone,
      province,
      products,
      serviceType,
      imageUrls,
      notes,
      serialNumber,
      distanceKm,
      serviceCost,
      additionalCost,
      orderId,
      // ── Trường mới theo loại công việc ──
      workType,
      address,
      actualAmount,
      waterSource,
      tdsIn,
      tdsOut,
      waterPressure,
      spareParts,
      issueType,
      handlingMethod,
    } = req.body;

    // Validation
    if (!customerName || !customerPhone) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin bắt buộc' });
      return;
    }

    if (!orderId) {
      res.status(400).json({ error: 'Vui lòng chọn đơn hàng để báo cáo' });
      return;
    }

    // Tự động lấy tháng hiện tại nếu không truyền
    const reportMonth = month || `${new Date().getMonth() + 1}/${new Date().getFullYear()}`;

    const report = await prisma.serviceReport.create({
      data: {
        month: reportMonth,
        ktvUserId: req.user!.id,
        customerName,
        customerPhone,
        province: province || 'N/A',
        products: products || [],
        serviceType: serviceType || 'N/A',
        imageUrls: imageUrls || [],
        notes: notes || null,
        serialNumber: serialNumber ? serialNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : null,
        distanceKm: distanceKm ? parseFloat(distanceKm) : null,
        serviceCost: serviceCost ? parseFloat(serviceCost) : null,
        additionalCost: additionalCost ? parseFloat(additionalCost) : null,
        orderId: orderId || null,
        // ── Trường mới ──
        workType: workType || null,
        address: address || null,
        actualAmount: actualAmount ? parseFloat(actualAmount) : null,
        waterSource: waterSource || null,
        tdsIn: tdsIn ? parseFloat(tdsIn) : null,
        tdsOut: tdsOut ? parseFloat(tdsOut) : null,
        waterPressure: waterPressure ? parseFloat(waterPressure) : null,
        spareParts: spareParts || [],
        issueType: issueType || null,
        handlingMethod: handlingMethod || null,
      } as any,
      include: {
        ktvUser: { select: { fullName: true } },
      },
    });

    // Tự động chuyển trạng thái đơn hàng sang "hoàn thành" khi KTV nộp báo cáo
    if (orderId) {
      try {
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (order) {
          const currentShippingAddress = (order.shippingAddress as any) || {};
          const updatedShippingAddress = {
            ...currentShippingAddress,
            province_name: province || currentShippingAddress.province_name,
            full_address: address || currentShippingAddress.full_address,
          };
          await prisma.order.update({
            where: { id: orderId },
            data: { 
              adminStatus: 'hoàn thành',
              serviceType: serviceType || undefined,
              billFullName: customerName || undefined,
              billPhoneNumber: customerPhone || undefined,
              shippingAddress: updatedShippingAddress,
            },
          });
        }
        await prisma.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: orderId,
            action: 'updated',
            changes: { adminStatus: { from: 'đang thực hiện', to: 'hoàn thành' } },
            userId: req.user!.id,
            userName: req.user!.fullName,
          },
        });
        logger.info('Order status auto-updated to hoàn thành due to KTV report submission', { orderId });
      } catch (err: any) {
        logger.error('Failed to auto-update order status on report creation', { orderId, error: err.message });
      }
    }

    logger.info('Report created', { reportId: report.id, ktvId: req.user!.id });
    res.status(201).json({ report });
  } catch (error: any) {
    logger.error('Create report error', { error: error.message });
    res.status(500).json({ error: 'Lỗi tạo báo cáo' });
  }
});

/**
 * GET /api/reports
 * Lấy danh sách báo cáo.
 * KTV chỉ thấy của mình, Admin thấy tất cả.
 * Query params: month, ktvId, province, page, limit
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      page = '1', 
      limit = '20'
    } = req.query;

    const where = await buildReportFilter(req.query, req.user);

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const [reports, total] = await Promise.all([
      prisma.serviceReport.findMany({
        where,
        include: {
          ktvUser: { 
            select: { 
              fullName: true, 
              username: true,
              techStation: {
                select: {
                  name: true,
                  mainStation: { select: { name: true } }
                }
              }
            } 
          },
          order: { 
            select: { 
              pancakeOrderId: true, 
              ktvCalledAt: true,
              appointmentTime: true,
              adminStatus: true,
              mainStation: { select: { name: true } },
              techStation: { select: { name: true } }
            } 
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.serviceReport.count({ where }),
    ]);

    res.json({
      reports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    logger.error('Get reports error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách' });
  }
});

/**
 * GET /api/reports/my-stats
 * Thống kê cá nhân của KTV
 */
router.get('/my-stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const ktvUserId = req.user!.id;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : null;

    // Lấy tất cả các đơn hàng trong vòng 90 ngày qua được gán cho KTV này
    const orders = await prisma.order.findMany({
      where: {
        assignedKtvId: ktvUserId,
        createdAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        }
      },
      include: {
        serviceReports: {
          orderBy: { createdAt: 'asc' },
          take: 1
        }
      }
    });

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const todayTime = new Date(todayStr).getTime();

    const processed = orders.map(order => {
      const hasReport = order.serviceReports && order.serviceReports.length > 0;
      const isCompleted = order.adminStatus === 'hoàn thành' || hasReport;
      
      let status: 'chưa làm' | 'đang làm' | 'hoàn thành' | 'hủy' = 'chưa làm';
      if (isCompleted) {
        status = 'hoàn thành';
      } else if (order.adminStatus === 'hủy đơn') {
        status = 'hủy';
      } else if (order.ktvCalledAt !== null) {
        status = 'đang làm';
      } else {
        status = 'chưa làm';
      }

      // Lấy ngày hoàn thành hoặc ngày hẹn/ngày tạo
      let filterDate: Date;
      if (isCompleted) {
        filterDate = hasReport ? order.serviceReports[0].createdAt : order.updatedAt;
      } else {
        filterDate = order.appointmentTime || order.createdAt;
      }

      // Phân loại đúng hẹn / trễ hẹn
      let isOnTime = false;
      let isLate = false;
      const hasAppointment = order.appointmentTime !== null;
      if (hasAppointment) {
        const appointmentDateStr = order.appointmentTime!.toISOString().slice(0, 10);
        const appointmentTimeMs = new Date(appointmentDateStr).getTime();
        
        let completionTimeMs = 0;
        if (hasReport) {
          const completionDateStr = order.serviceReports[0].createdAt.toISOString().slice(0, 10);
          completionTimeMs = new Date(completionDateStr).getTime();
        } else if (order.adminStatus === 'hoàn thành') {
          const completionDateStr = order.updatedAt.toISOString().slice(0, 10);
          completionTimeMs = new Date(completionDateStr).getTime();
        }

        if (isCompleted) {
          if (completionTimeMs <= appointmentTimeMs) {
            isOnTime = true;
          } else {
            isLate = true;
          }
        } else if (order.adminStatus !== 'hủy đơn') {
          if (todayTime > appointmentTimeMs) {
            isLate = true;
          } else {
            isOnTime = true;
          }
        }
      }

      return {
        id: order.id,
        workType: order.workType || 'Chưa xác định',
        status,
        filterDate,
        isOnTime,
        isLate,
        hasAppointment
      };
    });

    // Lọc theo khoảng thời gian
    const filtered = processed.filter(item => {
      if (start && item.filterDate < start) return false;
      if (end && item.filterDate > end) return false;
      return true;
    });

    // Thống kê tổng quan trạng thái
    let total = 0;
    let pending = 0;
    let progress = 0;
    let completed = 0;

    filtered.forEach(item => {
      if (item.status === 'hủy') return;
      total++;
      if (item.status === 'chưa làm') pending++;
      else if (item.status === 'đang làm') progress++;
      else if (item.status === 'hoàn thành') completed++;
    });

    // Thống kê theo loại công việc (trạng thái)
    const workTypeMap: Record<string, { pending: number, progress: number, completed: number }> = {};
    filtered.forEach(item => {
      if (item.status === 'hủy') return;
      if (!workTypeMap[item.workType]) {
        workTypeMap[item.workType] = { pending: 0, progress: 0, completed: 0 };
      }
      if (item.status === 'chưa làm') workTypeMap[item.workType].pending++;
      else if (item.status === 'đang làm') workTypeMap[item.workType].progress++;
      else if (item.status === 'hoàn thành') workTypeMap[item.workType].completed++;
    });

    const workTypeStats = Object.entries(workTypeMap).map(([name, counts]) => ({
      name,
      ...counts
    }));

    // Thống kê đúng/trễ hẹn
    let onTimeCount = 0;
    let lateCount = 0;
    filtered.forEach(item => {
      if (item.status === 'hủy' || !item.hasAppointment) return;
      if (item.isOnTime) onTimeCount++;
      if (item.isLate) lateCount++;
    });

    const totalAppointed = onTimeCount + lateCount;
    const onTimePercent = totalAppointed > 0 ? Math.round((onTimeCount / totalAppointed) * 100) : 100;
    const latePercent = totalAppointed > 0 ? 100 - onTimePercent : 0;

    // Thống kê đúng/trễ hẹn theo loại công việc
    const delayMap: Record<string, { onTime: number, late: number }> = {};
    filtered.forEach(item => {
      if (item.status === 'hủy' || !item.hasAppointment) return;
      if (!delayMap[item.workType]) {
        delayMap[item.workType] = { onTime: 0, late: 0 };
      }
      if (item.isOnTime) delayMap[item.workType].onTime++;
      if (item.isLate) delayMap[item.workType].late++;
    });

    const delayStats = Object.entries(delayMap).map(([name, counts]) => ({
      name,
      ...counts
    }));

    // Thống kê số ca hoàn thành mỗi ngày trong tháng và loại công việc
    const dailyCompleted: Record<string, Record<string, number>> = {};
    filtered.forEach(item => {
      if (item.status === 'hoàn thành') {
        const d = item.filterDate;
        const dayStr = String(d.getDate()).padStart(2, '0');
        const monthStr = String(d.getMonth() + 1).padStart(2, '0');
        const yearStr = d.getFullYear();
        const dateStr = `${dayStr}/${monthStr}/${yearStr}`;

        if (!dailyCompleted[dateStr]) {
          dailyCompleted[dateStr] = {};
        }
        if (!dailyCompleted[dateStr][item.workType]) {
          dailyCompleted[dateStr][item.workType] = 0;
        }
        dailyCompleted[dateStr][item.workType]++;
      }
    });

    const dailyBreakdown = Object.entries(dailyCompleted).map(([date, workTypes]) => {
      const totalCount = Object.values(workTypes).reduce((a, b) => a + b, 0);
      const details = Object.entries(workTypes).map(([wt, count]) => `${wt}: ${count}`).join(', ');
      return {
        date,
        total: totalCount,
        details,
        workTypes: Object.entries(workTypes).map(([name, count]) => ({ name, count }))
      };
    }).sort((a, b) => {
      const [dayA, monthA, yearA] = a.date.split('/').map(Number);
      const [dayB, monthB, yearB] = b.date.split('/').map(Number);
      const dateA = new Date(yearA, monthA - 1, dayA);
      const dateB = new Date(yearB, monthB - 1, dayB);
      return dateB.getTime() - dateA.getTime();
    });

    res.json({
      summary: {
        total,
        pending,
        progress,
        completed
      },
      workTypeStats,
      delaySummary: {
        onTime: onTimeCount,
        onTimePercent,
        late: lateCount,
        latePercent
      },
      delayStats,
      dailyBreakdown
    });
  } catch (error: any) {
    logger.error('Get KTV stats error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy thống kê báo cáo' });
  }
});

/**
 * GET /api/reports/filter-options
 * Lấy các tùy chọn cho bộ lọc nâng cao (Admin only)
 */
router.get('/filter-options', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const [
      workTypes,
      serviceTypes,
      products,
      categories,
      mainStations,
      techStations,
      ktvs,
      provinces
    ] = await Promise.all([
      prisma.serviceReport.findMany({ select: { workType: true }, distinct: ['workType'] }),
      prisma.serviceReport.findMany({ select: { serviceType: true }, distinct: ['serviceType'] }),
       prisma.product.findMany({ select: { name: true, category: true }, orderBy: { name: 'asc' } }),
      prisma.product.findMany({ select: { category: true }, distinct: ['category'] }),
      prisma.mainStation.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.techStation.findMany({ select: { id: true, name: true, mainStationId: true }, orderBy: { name: 'asc' } }),
      prisma.user.findMany({
        where: { role: 'KTV', isActive: true },
        select: { id: true, fullName: true, techStationId: true },
        orderBy: { fullName: 'asc' }
      }),
      prisma.serviceReport.findMany({ select: { province: true }, distinct: ['province'] })
    ]);

    res.json({
      workTypes: workTypes.map((w: any) => w.workType).filter(Boolean),
      serviceTypes: serviceTypes.map((s: any) => s.serviceType).filter(Boolean),
      products: products.map((p: any) => p.name).filter(Boolean),
      productsDetailed: products.map((p: any) => ({ name: p.name, category: p.category })),
      categories: categories.map((c: any) => c.category).filter(Boolean),
      mainStations,
      techStations,
      ktvs,
      provinces: provinces.map((p: any) => p.province).filter(Boolean)
    });
  } catch (error: any) {
    logger.error('Get filter options error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh mục bộ lọc' });
  }
});

/**
 * GET /api/reports/stats
 * Thống kê tổng hợp (Admin only)
 */
router.get('/stats', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.query;
    const where: any = {};
    if (month) where.month = month;

    const [totalReports, totalPaid, aggregations, byServiceType, byProvince] = await Promise.all([
      prisma.serviceReport.count({ where }),
      prisma.serviceReport.count({ where: { ...where, isPaid: true } }),
      prisma.serviceReport.aggregate({
        where,
        _sum: { serviceCost: true, additionalCost: true, distanceKm: true },
      }),
      prisma.serviceReport.groupBy({
        by: ['serviceType'],
        where,
        _count: true,
      }),
      prisma.serviceReport.groupBy({
        by: ['province'],
        where,
        _count: true,
        orderBy: { _count: { province: 'desc' } },
        take: 10,
      }),
    ]);

    res.json({
      totalReports,
      totalPaid,
      totalUnpaid: totalReports - totalPaid,
      totalServiceCost: aggregations._sum.serviceCost || 0,
      totalAdditionalCost: aggregations._sum.additionalCost || 0,
      totalDistanceKm: aggregations._sum.distanceKm || 0,
      byServiceType: byServiceType.map((s) => ({ type: s.serviceType, count: s._count })),
      byProvince: byProvince.map((p) => ({ province: p.province, count: p._count })),
    });
  } catch (error: any) {
    logger.error('Get stats error', { error: error.message });
    res.status(500).json({ error: 'Lỗi thống kê' });
  }
});

/**
 * GET /api/reports/export
 * Export Excel (Admin only)
 */
router.get('/export', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.query;
    const where = await buildReportFilter(req.query, req.user);

    const reports = await prisma.serviceReport.findMany({
      where,
      include: { 
        ktvUser: { select: { fullName: true } },
        order: { select: { pancakeOrderId: true, ktvCalledAt: true } }
      },
      orderBy: { createdAt: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Báo cáo KTV');

    sheet.columns = [
      { header: 'Tháng', key: 'month', width: 12 },
      { header: 'Thời gian', key: 'createdAt', width: 20 },
      { header: 'Tên KTV', key: 'ktvName', width: 25 },
      { header: 'Mã Đơn', key: 'pancakeOrderId', width: 15 },
      { header: 'Tên khách hàng', key: 'customerName', width: 25 },
      { header: 'SĐT khách hàng', key: 'customerPhone', width: 18 },
      { header: 'Địa chỉ', key: 'address', width: 30 },
      { header: 'Tỉnh/TP', key: 'province', width: 20 },
      { header: 'Loại công việc', key: 'workType', width: 22 },
      { header: 'Sản phẩm', key: 'products', width: 40 },
      { header: 'Loại dịch vụ', key: 'serviceType', width: 25 },
      { header: 'Số serial', key: 'serialNumber', width: 22 },
      { header: 'Nguyên nhân / Sự cố', key: 'issueType', width: 25 },
      { header: 'Cách xử lý', key: 'handlingMethod', width: 25 },
      { header: 'Nguồn nước', key: 'waterSource', width: 20 },
      { header: 'TDS đầu vào (ppm)', key: 'tdsIn', width: 18 },
      { header: 'TDS đầu ra (ppm)', key: 'tdsOut', width: 18 },
      { header: 'Áp suất (psi)', key: 'waterPressure', width: 16 },
      { header: 'Linh kiện phát sinh', key: 'spareParts', width: 30 },
      { header: 'Khoảng cách (km)', key: 'distanceKm', width: 18 },
      { header: 'Tiền thu thực tế', key: 'actualAmount', width: 18 },
      { header: 'Đã trả tiền', key: 'isPaid', width: 14 },
      { header: 'Ghi chú', key: 'notes', width: 30 },
      { header: 'Hình ảnh', key: 'imageUrls', width: 50 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };

    reports.forEach((r: any) => {
      sheet.addRow({
        month: r.month,
        createdAt: r.createdAt.toLocaleString('vi-VN'),
        ktvName: r.ktvUser.fullName,
        pancakeOrderId: r.order?.pancakeOrderId || '',
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        address: r.address || '',
        province: r.province,
        workType: r.workType || '',
        products: r.products.join(', '),
        serviceType: r.serviceType,
        serialNumber: r.serialNumber || '',
        issueType: r.issueType || '',
        handlingMethod: r.handlingMethod || '',
        waterSource: r.waterSource || '',
        tdsIn: r.tdsIn || '',
        tdsOut: r.tdsOut || '',
        waterPressure: r.waterPressure || '',
        spareParts: r.spareParts?.join(', ') || '',
        distanceKm: r.distanceKm || '',
        actualAmount: r.actualAmount || 0,
        isPaid: r.isPaid ? 'Đã trả' : 'Chưa trả',
        notes: r.notes || '',
        imageUrls: r.imageUrls.join(', '),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=bao-cao-ktv-${month || 'all'}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Export error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xuất file' });
  }
});

/**
 * GET /api/reports/check-serial
 * Kiểm tra xem Số Serial máy đã được ghi nhận lắp đặt trong hệ thống chưa.
 * Dành cho ca Bảo hành / Sửa chữa.
 */
router.get('/check-serial', async (req: Request, res: Response): Promise<void> => {
  try {
    const { serialNumber } = req.query;
    if (!serialNumber) {
      res.status(400).json({ error: 'Thiếu số Serial' });
      return;
    }

    const cleanInput = (serialNumber as string).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!cleanInput) {
      res.json({ exists: false });
      return;
    }

    // 1. Tìm chính xác tuyệt đối
    const exactMatch = await prisma.serviceReport.findFirst({
      where: {
        serialNumber: {
          mode: 'insensitive',
          equals: (serialNumber as string).trim()
        },
        workType: { in: ['Lắp đặt', 'Giao hàng và Lắp đặt'] }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (exactMatch) {
      res.json({
        exists: true,
        installDate: exactMatch.createdAt,
        customerName: exactMatch.customerName,
        products: exactMatch.products,
        serialNumber: exactMatch.serialNumber
      });
      return;
    }

    // 2. Tìm kiếm linh hoạt nếu KTV gõ có khoảng trắng/dấu gạch
    const possibleReports = await prisma.serviceReport.findMany({
      where: {
        workType: { in: ['Lắp đặt', 'Giao hàng và Lắp đặt'] },
        serialNumber: { not: null }
      },
      select: {
        id: true,
        serialNumber: true,
        createdAt: true,
        customerName: true,
        products: true
      }
    });

    const fuzzyMatch = possibleReports.find((r: any) => {
      const cleanDb = (r.serialNumber || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return cleanDb === cleanInput;
    });

    if (fuzzyMatch) {
      res.json({
        exists: true,
        installDate: fuzzyMatch.createdAt,
        customerName: fuzzyMatch.customerName,
        products: fuzzyMatch.products,
        serialNumber: fuzzyMatch.serialNumber
      });
      return;
    }

    res.json({ exists: false });
  } catch (error: any) {
    logger.error('Check serial error', { error: error.message });
    res.status(500).json({ error: 'Lỗi kiểm tra số Serial' });
  }
});

/**
 * GET /api/reports/:id
 * Chi tiết 1 báo cáo
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const report = await prisma.serviceReport.findUnique({
      where: { id: req.params.id as string },
      include: { ktvUser: { select: { fullName: true, username: true } } },
    });

    if (!report) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo' });
      return;
    }

    // KTV chỉ xem được báo cáo của mình
    if (req.user!.role === 'KTV' && report.ktvUserId !== req.user!.id) {
      res.status(403).json({ error: 'Không có quyền xem' });
      return;
    }

    res.json({ report });
  } catch (error: any) {
    logger.error('Get report error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy báo cáo' });
  }
});

/**
 * PUT /api/reports/:id
 * Admin cập nhật báo cáo — hỗ trợ sửa toàn bộ trường.
 * Khi admin sửa, KTV sẽ nhận thông báo.
 */
router.put('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      isPaid, serviceCost, additionalCost, notes,
      customerName, customerPhone, province, address,
      products, serviceType, workType,
      serialNumber, distanceKm, actualAmount,
      waterSource, tdsIn, tdsOut, waterPressure,
      spareParts, issueType, handlingMethod,
      imageUrls,
    } = req.body;

    const updateData: any = {};
    if (isPaid !== undefined) updateData.isPaid = isPaid;
    if (serviceCost !== undefined) updateData.serviceCost = parseFloat(serviceCost);
    if (additionalCost !== undefined) updateData.additionalCost = parseFloat(additionalCost);
    if (notes !== undefined) updateData.notes = notes;

    // ── Trường thông tin chung ──
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (province !== undefined) updateData.province = province;
    if (address !== undefined) updateData.address = address;
    if (products !== undefined) updateData.products = products;
    if (serviceType !== undefined) updateData.serviceType = serviceType;
    if (workType !== undefined) updateData.workType = workType;
    if (actualAmount !== undefined) updateData.actualAmount = actualAmount !== null && actualAmount !== '' ? parseFloat(actualAmount) : null;

    // ── Trường kỹ thuật ──
    if (serialNumber !== undefined) updateData.serialNumber = serialNumber ? serialNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() : null;
    if (distanceKm !== undefined) updateData.distanceKm = distanceKm !== null && distanceKm !== '' ? parseFloat(distanceKm) : null;
    if (waterSource !== undefined) updateData.waterSource = waterSource || null;
    if (tdsIn !== undefined) updateData.tdsIn = tdsIn !== null && tdsIn !== '' ? parseFloat(tdsIn) : null;
    if (tdsOut !== undefined) updateData.tdsOut = tdsOut !== null && tdsOut !== '' ? parseFloat(tdsOut) : null;
    if (waterPressure !== undefined) updateData.waterPressure = waterPressure !== null && waterPressure !== '' ? parseFloat(waterPressure) : null;
    if (spareParts !== undefined) updateData.spareParts = spareParts || [];
    if (issueType !== undefined) updateData.issueType = issueType || null;
    if (handlingMethod !== undefined) updateData.handlingMethod = handlingMethod || null;

    // ── Hình ảnh ──
    if (imageUrls !== undefined) updateData.imageUrls = imageUrls || [];

    // Lấy báo cáo hiện tại để biết ktvUserId và thông tin đơn hàng
    const existingReport = await prisma.serviceReport.findUnique({
      where: { id: req.params.id as string },
      include: { order: { select: { pancakeOrderId: true } } },
    });

    if (!existingReport) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo' });
      return;
    }

    const report = await prisma.serviceReport.update({
      where: { id: req.params.id as string },
      data: updateData,
      include: { ktvUser: { select: { fullName: true } } },
    });

    // ── Gửi thông báo cho KTV nếu admin sửa nội dung (không chỉ isPaid) ──
    const hasContentEdit = Object.keys(updateData).some(k => k !== 'isPaid');
    if (hasContentEdit) {
      try {
        const orderNum = existingReport.order?.pancakeOrderId;
        const orderText = orderNum ? `#${orderNum}` : '(không rõ mã đơn)';
        const title = 'Báo cáo đã được Admin chỉnh sửa';
        const content = `Báo cáo cho đơn hàng ${orderText} của bạn đã được Admin sửa thông tin.`;

        await prisma.notification.create({
          data: {
            userId: existingReport.ktvUserId,
            title,
            content,
          },
        });

        // 1. Gửi qua FCM Native
        sendPushNotification(existingReport.ktvUserId, title, content, {
          type: 'REPORT_UPDATED',
          reportId: report.id,
          orderId: report.orderId || ''
        }).catch(err => {
          logger.error('Failed to trigger push notification for report update', { error: err.message });
        });

        // 2. Gửi qua Web Push PWA
        sendWebPushNotification(existingReport.ktvUserId, title, content, {
          type: 'REPORT_UPDATED',
          reportId: report.id,
          orderId: report.orderId || ''
        }).catch(err => {
          logger.error('Failed to trigger Web Push notification for report update', { error: err.message });
        });
      } catch (notifErr: any) {
        logger.error('Failed to create edit notification', { error: notifErr.message });
      }
    }

    logger.info('Report updated by admin', { reportId: report.id, by: req.user!.id, fieldsUpdated: Object.keys(updateData) });
    res.json({ report });
  } catch (error: any) {
    logger.error('Update report error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật' });
  }
});

/**
 * DELETE /api/reports/:id
 * Admin xóa báo cáo
 */
router.delete('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const reportId = req.params.id as string;
    const { deleteReason } = req.body;

    if (!deleteReason || !deleteReason.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập lý do xóa báo cáo' });
      return;
    }

    const existingReport = await prisma.serviceReport.findUnique({
      where: { id: reportId },
      include: {
        order: { select: { pancakeOrderId: true } },
      }
    });

    if (!existingReport) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo' });
      return;
    }

    // 1. Tạo thông báo cho KTV
    const orderNum = existingReport.order?.pancakeOrderId;
    const orderText = orderNum ? `#${orderNum}` : '(không rõ mã đơn)';
    const notificationContent = `Báo cáo cho đơn hàng ${orderText} của bạn đã bị Admin xóa.\nLý do: ${deleteReason.trim()}`;
    const title = 'Báo cáo bị xóa';

    await prisma.notification.create({
      data: {
        userId: existingReport.ktvUserId,
        title,
        content: notificationContent,
      }
    });

    // 1. Gửi qua FCM Native
    sendPushNotification(existingReport.ktvUserId, title, notificationContent, {
      type: 'REPORT_DELETED',
      reportId: existingReport.id,
      orderId: existingReport.orderId || ''
    }).catch(err => {
      logger.error('Failed to trigger push notification for report deletion', { error: err.message });
    });

    // 2. Gửi qua Web Push PWA
    sendWebPushNotification(existingReport.ktvUserId, title, notificationContent, {
      type: 'REPORT_DELETED',
      reportId: existingReport.id,
      orderId: existingReport.orderId || ''
    }).catch(err => {
      logger.error('Failed to trigger Web Push notification for report deletion', { error: err.message });
    });

    // 2. Thực hiện xóa báo cáo khỏi cơ sở dữ liệu
    await prisma.serviceReport.delete({
      where: { id: reportId },
    });

    logger.info('Report deleted by Admin', { reportId, adminId: req.user!.id, deleteReason });
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Delete report error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xóa báo cáo' });
  }
});

export default router;

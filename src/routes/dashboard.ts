import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';

const router = Router();

// Tất cả dashboard routes yêu cầu quyền admin
router.use(requireAuth, requireAdmin);

/**
 * GET /api/dashboard/stats
 * Trả về dữ liệu thống kê cho Dashboard
 */
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    // 1. Thống kê số lượng đơn hàng theo Trạm (Main Station)
    const stations = await prisma.mainStation.findMany({
      where: { isActive: true },
      select: {
        name: true,
        _count: {
          select: { orders: true }
        },
        techStations: {
          where: { isActive: true },
          select: {
            name: true,
            _count: {
              select: { orders: true }
            }
          }
        }
      }
    });

    const stationStats = stations.map(main => ({
      name: main.name,
      totalOrders: main._count.orders,
      techStations: main.techStations.map(tech => ({
        name: tech.name,
        orders: tech._count.orders
      }))
    }));

    // 2. Mật độ đơn hàng theo Tỉnh/Thành phố
    const customers = await prisma.customer.findMany({
      where: { provinceName: { not: null } },
      select: {
        provinceName: true,
        _count: {
          select: { orders: true }
        }
      }
    });

    const density: Record<string, number> = {};
    customers.forEach(c => {
      let p = c.provinceName || '';
      // Clean up common prefixes to match map data
      p = p.replace(/^(Tỉnh |Thành phố |TP\.?\s*)/i, '').trim();
      density[p] = (density[p] || 0) + c._count.orders;
    });

    // 3. Tổng quan đơn hàng theo trạng thái
    const statusCounts = await prisma.order.groupBy({
      by: ['adminStatus'],
      _count: { id: true }
    });

    // 4. Thống kê theo yêu cầu của user
    const totalOrders = await prisma.order.count();
    const pendingOrders = await prisma.order.count({
      where: { adminStatus: 'chờ xử lý' }
    });
    const assignedOrders = await prisma.order.count({
      where: { adminStatus: 'đang thực hiện' }
    });
    const completedOrders = await prisma.order.count({
      where: { adminStatus: 'hoàn thành' }
    });

    res.json({
      stationStats,
      mapDensity: density,
      statusCounts,
      orderStats: {
        total: totalOrders,
        pending: pendingOrders,
        assigned: assignedOrders,
        completed: completedOrders
      }
    });
  } catch (error: any) {
    logger.error('Get dashboard stats error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu dashboard' });
  }
});

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
      appointmentTime: { not: null },
    };

    // Áp dụng bộ lọc thời gian hẹn khách
    if (startDate || endDate) {
      where.appointmentTime = {
        not: null,
        ...(startDate ? { gte: new Date(startDate as string) } : {}),
        ...(endDate ? { lte: new Date(endDate as string) } : {})
      };
    }

    if (workType) {
      where.workType = workType as string;
    }
    if (adminStatus) {
      where.adminStatus = adminStatus as string;
    }
    if (assignedKtvId) {
      where.assignedKtvId = assignedKtvId as string;
    }

    // Lấy tất cả các đơn hàng thỏa mãn
    let orders = await prisma.order.findMany({
      where,
      include: {
        serviceReports: {
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

    // Lọc theo province (tỉnh/thành phố) bằng JS ở bộ nhớ để tránh phức tạp hóa JSONB query
    if (province) {
      const searchProvince = removeAccents(province as string);
      orders = orders.filter(order => {
        const provName = order.customer?.provinceName || (order.shippingAddress as any)?.province_name || '';
        return removeAccents(provName).includes(searchProvince);
      });
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const todayTime = new Date(todayStr).getTime();

    // 1. Phân loại đúng/trễ cho từng đơn hàng
    const processedOrders = orders.map(order => {
      const appointmentDateStr = order.appointmentTime!.toISOString().slice(0, 10);
      const appointmentTimeMs = new Date(appointmentDateStr).getTime();
      
      const hasReport = order.serviceReports && order.serviceReports.length > 0;
      const isCompleted = order.adminStatus === 'hoàn thành' || hasReport;
      
      let completionDateStr = '';
      let completionTimeMs = 0;
      
      if (hasReport) {
        completionDateStr = order.serviceReports[0].createdAt.toISOString().slice(0, 10);
        completionTimeMs = new Date(completionDateStr).getTime();
      } else if (order.adminStatus === 'hoàn thành') {
        completionDateStr = order.updatedAt.toISOString().slice(0, 10);
        completionTimeMs = new Date(completionDateStr).getTime();
      }
      
      let isOnTime = false;
      let isLate = false;
      let delayDays = 0;
      
      if (isCompleted) {
        if (completionTimeMs <= appointmentTimeMs) {
          isOnTime = true;
        } else {
          isLate = true;
          delayDays = Math.max(0, Math.floor((completionTimeMs - appointmentTimeMs) / (24 * 60 * 60 * 1000)));
        }
      } else {
        if (order.adminStatus !== 'hủy đơn') {
          if (todayTime > appointmentTimeMs) {
            isLate = true;
            delayDays = Math.max(0, Math.floor((todayTime - appointmentTimeMs) / (24 * 60 * 60 * 1000)));
          }
        }
      }
      
      // Chuẩn hóa tên tỉnh thành
      let provName = order.customer?.provinceName || (order.shippingAddress as any)?.province_name || 'Khác';
      provName = provName.replace(/^(Tỉnh |Thành phố |TP\.?\s*)/i, '').trim();

      // Determine mapped main station name
      let mainStationName = 'Chưa phân trạm';
      if (order.mainStation) {
        if (order.mainStation.isActive) {
          mainStationName = order.mainStation.name;
        } else if (['Trạm Hồ Chí Minh', 'Trạm Đồng Nai', 'Trạm Vũng Tàu'].includes(order.mainStation.name)) {
          mainStationName = 'Truliva';
        }
      }
      if (mainStationName === 'Chưa phân trạm' && order.techStation?.mainStation) {
        if (order.techStation.mainStation.isActive) {
          mainStationName = order.techStation.mainStation.name;
        } else if (['Trạm Hồ Chí Minh', 'Trạm Đồng Nai', 'Trạm Vũng Tàu'].includes(order.techStation.mainStation.name)) {
          mainStationName = 'Truliva';
        }
      }

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
        mainStationName,
        techStationName: order.techStation?.name || 'Chưa phân trạm',
        techStationId: order.techStationId,
        ktvName: order.assignedKtv?.fullName || 'Chưa gán',
        isCompleted
      };
    });

    // Apply mainStationId and techStationId filters in memory to handle mapped stations correctly
    let filteredOrders = processedOrders;
    if (mainStationId) {
      const targetMainStation = await prisma.mainStation.findUnique({
        where: { id: mainStationId as string }
      });
      if (targetMainStation) {
        filteredOrders = filteredOrders.filter(o => o.mainStationName === targetMainStation.name);
      }
    }
    if (techStationId) {
      filteredOrders = filteredOrders.filter(o => o.techStationId === techStationId);
    }

    // 2. Tính toán Summary
    const totalWithAppointments = filteredOrders.length;
    const totalOnTime = filteredOrders.filter(o => o.isOnTime).length;
    const totalLate = filteredOrders.filter(o => o.isLate).length;
    const onTimeRate = totalWithAppointments > 0 ? Math.round((totalOnTime / totalWithAppointments) * 100) : 100;

    // 3. Gom nhóm theo Ngày hẹn (Daily Stats)
    const dailyMap: Record<string, { date: string; onTime: number; late: number; total: number }> = {};
    filteredOrders.forEach(o => {
      const d = o.appointmentDateStr;
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
      const map: Record<string, { name: string; onTime: number; late: number; total: number; totalLeadTimeDays: number; completedCount: number }> = {};
      
      filteredOrders.forEach(o => {
        const val = o[field];
        if (!map[val]) {
          map[val] = { name: val, onTime: 0, late: 0, total: 0, totalLeadTimeDays: 0, completedCount: 0 };
        }
        map[val].total++;
        if (o.isOnTime) map[val].onTime++;
        if (o.isLate) map[val].late++;
        
        // Tính thời gian xử lý trung bình đối với ca đã hoàn thành
        if (o.isCompleted && o.completionDateStr) {
          const compTime = new Date(o.completionDateStr).getTime();
          const appTime = new Date(o.appointmentDateStr).getTime();
          const diffDays = Math.floor((compTime - appTime) / (24 * 60 * 60 * 1000));
          map[val].totalLeadTimeDays += diffDays;
          map[val].completedCount++;
        }
      });

      return Object.values(map).map(item => ({
        name: item.name,
        onTime: item.onTime,
        late: item.late,
        total: item.total,
        avgLeadTimeDays: item.completedCount > 0 ? Math.round((item.totalLeadTimeDays / item.completedCount) * 10) / 10 : 0
      }));
    };

    const workTypeStats = groupByField('workType');
    const provinceStats = groupByField('province');
    const techStationStats = groupByField('techStationName');
    const ktvStats = groupByField('ktvName');

    // 4. Danh sách các đơn trễ hẹn (để hiển thị bảng)
    const lateOrders = filteredOrders
      .filter(o => o.isLate)
      .map(o => ({
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

    res.json({
      summary: {
        totalWithAppointments,
        totalOnTime,
        totalLate,
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
      mainStationCoverage
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
    } = req.query;

    const where: any = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

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

    // Lọc theo province (tỉnh/thành phố) bằng JS ở bộ nhớ
    if (province) {
      const searchProvince = removeAccents(province as string);
      reports = reports.filter(r => {
        return removeAccents(r.province || '').includes(searchProvince);
      });
    }

    // Lọc theo trạm chính / trạm kỹ thuật
    if (mainStationId) {
      reports = reports.filter(r => r.order?.mainStationId === mainStationId);
    }
    if (techStationId) {
      reports = reports.filter(r => r.order?.techStationId === techStationId);
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

    // 4. Theo tháng, tỉ lệ gặp mỗi sự cố (issueType distribution by month)
    const monthlyIssueMap: Record<string, Record<string, number>> = {};
    issueReports.forEach(r => {
      const monthStr = r.createdAt.toISOString().slice(0, 7); // "YYYY-MM"
      if (!monthlyIssueMap[monthStr]) {
        monthlyIssueMap[monthStr] = {};
      }
      const issue = r.issueType || 'Khác';
      monthlyIssueMap[monthStr][issue] = (monthlyIssueMap[monthStr][issue] || 0) + 1;
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

    // 5. Phân tích vòng đời máy qua Serial Number (Lắp đặt -> Bảo hành/Sửa chữa)
    const serialsWithIssues = Array.from(new Set(
      issueReports.map(r => r.serialNumber).filter(Boolean) as string[]
    ));

    const lifecycleList: any[] = [];
    let totalLifecycleDays = 0;
    let lifecycleCount = 0;

    for (const serial of serialsWithIssues) {
      // Tìm báo cáo lắp đặt gốc của số serial này
      const installRep = await prisma.serviceReport.findFirst({
        where: {
          serialNumber: serial,
          workType: { in: ['Lắp đặt', 'Giao hàng và Lắp đặt'] }
        },
        orderBy: { createdAt: 'asc' }
      });

      // Tìm báo cáo bảo hành/sửa chữa đầu tiên
      const firstIssueRep = issueReports.find(r => r.serialNumber === serial);

      if (installRep && firstIssueRep) {
        const installDate = installRep.createdAt;
        const issueDate = firstIssueRep.createdAt;
        const diffMs = issueDate.getTime() - installDate.getTime();
        const diffDays = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));

        totalLifecycleDays += diffDays;
        lifecycleCount++;

        lifecycleList.push({
          serialNumber: serial,
          products: firstIssueRep.products,
          installDate,
          firstIssueDate: issueDate,
          daysToFailure: diffDays,
          issueType: firstIssueRep.issueType || 'Khác',
          ktvName: firstIssueRep.ktvUser?.fullName || 'Không rõ'
        });
      }
    }

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
      ]
    });

  } catch (error: any) {
    logger.error('Get product quality stats error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu phân tích chất lượng sản phẩm' });
  }
});

export default router;

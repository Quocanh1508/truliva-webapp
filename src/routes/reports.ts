import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import ExcelJS from 'exceljs';

const router = Router();

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
    } = req.body;

    // Validation
    if (!customerName || !customerPhone || !province || !serviceType) {
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
        province,
        products: products || [],
        serviceType,
        imageUrls: imageUrls || [],
        notes: notes || null,
        serialNumber: serialNumber || null,
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
      } as any,
      include: {
        ktvUser: { select: { fullName: true } },
      },
    });

    // Tự động chuyển trạng thái đơn hàng sang "hoàn thành" khi KTV nộp báo cáo
    if (orderId) {
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: { adminStatus: 'hoàn thành' },
        });
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
      month, 
      ktvId, 
      province, 
      serviceType, 
      isPaid, 
      page = '1', 
      limit = '20',
      search,
      startDate,
      endDate
    } = req.query;

    const where: any = {};

    // KTV chỉ thấy báo cáo của mình
    if (req.user!.role === 'KTV') {
      where.ktvUserId = req.user!.id;
    } else if (ktvId) {
      where.ktvUserId = ktvId;
    }

    if (month) where.month = month;
    if (province) where.province = { contains: province as string, mode: 'insensitive' };
    if (serviceType) where.serviceType = serviceType;
    if (isPaid !== undefined) where.isPaid = isPaid === 'true';

    // Tìm kiếm tổng hợp
    if (search) {
      const searchStr = search as string;
      const parsedOrderId = parseInt(searchStr);
      
      where.OR = [
        { customerName: { contains: searchStr, mode: 'insensitive' } },
        { customerPhone: { contains: searchStr } },
        { ktvUser: { fullName: { contains: searchStr, mode: 'insensitive' } } }
      ];
      
      if (!isNaN(parsedOrderId)) {
        where.OR.push({
          order: {
            pancakeOrderId: parsedOrderId
          }
        });
      }
    }

    // Lọc theo khoảng thời gian tạo báo cáo
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const [reports, total] = await Promise.all([
      prisma.serviceReport.findMany({
        where,
        include: {
          ktvUser: { select: { fullName: true, username: true } },
          order: { select: { pancakeOrderId: true } },
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
    const { 
      month, 
      ktvId, 
      province, 
      serviceType, 
      isPaid, 
      search,
      startDate,
      endDate
    } = req.query;

    const where: any = {};

    if (ktvId) where.ktvUserId = ktvId as string;
    if (month) where.month = month as string;
    if (province) where.province = { contains: province as string, mode: 'insensitive' };
    if (serviceType) where.serviceType = serviceType as string;
    if (isPaid !== undefined) where.isPaid = isPaid === 'true';

    // Tìm kiếm tổng hợp
    if (search) {
      const searchStr = search as string;
      const parsedOrderId = parseInt(searchStr);
      
      where.OR = [
        { customerName: { contains: searchStr, mode: 'insensitive' } },
        { customerPhone: { contains: searchStr } },
        { ktvUser: { fullName: { contains: searchStr, mode: 'insensitive' } } }
      ];
      
      if (!isNaN(parsedOrderId)) {
        where.OR.push({
          order: {
            pancakeOrderId: parsedOrderId
          }
        });
      }
    }

    // Lọc theo khoảng thời gian tạo báo cáo
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    const reports = await prisma.serviceReport.findMany({
      where,
      include: { 
        ktvUser: { select: { fullName: true } },
        order: { select: { pancakeOrderId: true } }
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
 * Admin cập nhật báo cáo (isPaid, serviceCost, etc.)
 */
router.put('/:id', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { isPaid, serviceCost, additionalCost, notes } = req.body;

    const updateData: any = {};
    if (isPaid !== undefined) updateData.isPaid = isPaid;
    if (serviceCost !== undefined) updateData.serviceCost = parseFloat(serviceCost);
    if (additionalCost !== undefined) updateData.additionalCost = parseFloat(additionalCost);
    if (notes !== undefined) updateData.notes = notes;

    const report = await prisma.serviceReport.update({
      where: { id: req.params.id as string },
      data: updateData,
      include: { ktvUser: { select: { fullName: true } } },
    });

    logger.info('Report updated', { reportId: report.id, by: req.user!.id });
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

    await prisma.notification.create({
      data: {
        userId: existingReport.ktvUserId,
        title: 'Báo cáo bị xóa',
        content: notificationContent,
      }
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

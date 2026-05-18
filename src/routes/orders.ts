import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import { Prisma } from '@prisma/client';

const router = Router();

/**
 * GET /api/orders
 * Lấy danh sách đơn hàng với hỗ trợ phân trang và bộ lọc/sắp xếp
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      page = '1', 
      limit = '50',
      sortBy = 'createdAt', // appointmentTime, createdAt, updatedAt
      sortOrder = 'desc',   // asc, desc
      status,               // custom adminStatus
      search                // search theo tên, sdt, mã đơn
    } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Xây dựng điều kiện tìm kiếm
    const where: Prisma.OrderWhereInput = {};
    
    // Nếu user là KTV, chỉ lấy các đơn hàng được giao cho KTV đó
    if (req.user?.role === 'KTV') {
      where.assignedKtvId = req.user.id;
    }

    if (status) {
      where.adminStatus = status as string;
    }

    if (search) {
      const searchStr = String(search).trim();
      where.OR = [
        { billFullName: { contains: searchStr, mode: 'insensitive' } },
        { billPhoneNumber: { contains: searchStr } },
      ];
      // Nếu có thể parse sang int, tìm theo mã đơn Pancake
      const pancakeId = parseInt(searchStr, 10);
      if (!isNaN(pancakeId)) {
        where.OR.push({ pancakeOrderId: pancakeId });
      }
    }

    // Xây dựng điều kiện sắp xếp
    const orderBy: Prisma.OrderOrderByWithRelationInput = {};
    const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    if (sortBy === 'appointmentTime') {
      orderBy.appointmentTime = orderDirection;
    } else if (sortBy === 'updatedAt') {
      orderBy.updatedAt = orderDirection;
    } else {
      orderBy.createdAt = orderDirection;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy,
        skip,
        take: limitNumber,
        include: {
          items: true,
          customer: {
            select: {
              fullName: true,
              phoneNumber: true,
            }
          },
          assignedKtv: {
            select: {
              id: true,
              fullName: true,
            }
          }
        }
      }),
      prisma.order.count({ where })
    ]);

    res.json({
      orders,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber)
      }
    });
  } catch (error: any) {
    logger.error('Get orders error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách đơn hàng' });
  }
});

/**
 * GET /api/orders/:id/audit
 * Lấy lịch sử thay đổi của 1 đơn hàng
 */
router.get('/:id/audit', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'Order', entityId: req.params.id as string },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(logs);
  } catch (error: any) {
    logger.error('Get audit log error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy lịch sử' });
  }
});

/**
 * PATCH /api/orders/:id
 * Cập nhật đơn hàng (trạng thái, phân công, loại CV, trạm, hủy/khôi phục...)
 */
router.patch('/:id', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const {
      adminStatus, appointmentTime, assignedKtvId,
      workType, serviceType, mainStationId, techStationId,
      rescheduleReason, cancelReason, note
    } = req.body;

    // Lấy order hiện tại để so sánh cho audit
    const oldOrder = await prisma.order.findUnique({ where: { id } });
    if (!oldOrder) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }

    const updateData: any = {};
    const changes: any[] = [];

    // Helper ghi nhận thay đổi
    const track = (field: string, newVal: any) => {
      const oldVal = (oldOrder as any)[field];
      if (newVal !== undefined && newVal !== oldVal) {
        updateData[field] = newVal;
        changes.push({ field, from: oldVal, to: newVal });
      }
    };

    track('adminStatus', adminStatus);
    track('workType', workType);
    track('serviceType', serviceType);
    track('mainStationId', mainStationId || null);
    track('techStationId', techStationId || null);
    track('rescheduleReason', rescheduleReason);
    track('cancelReason', cancelReason);
    track('note', note);

    if (assignedKtvId !== undefined) {
      const val = assignedKtvId || null;
      track('assignedKtvId', val);
    }

    if (appointmentTime !== undefined) {
      const val = appointmentTime ? new Date(appointmentTime) : null;
      updateData.appointmentTime = val;
      if (String(val) !== String(oldOrder.appointmentTime)) {
        changes.push({ field: 'appointmentTime', from: oldOrder.appointmentTime, to: val });
      }
    }

    // Thực hiện cập nhật
    const order = await prisma.order.update({
      where: { id },
      data: updateData,
    });

    // Ghi audit log
    if (changes.length > 0) {
      // Xác định action
      let action = 'updated';
      if (adminStatus === 'hủy đơn') action = 'cancelled';
      if (assignedKtvId && !oldOrder.assignedKtvId) action = 'assigned';
      if (oldOrder.adminStatus === 'hủy đơn' && adminStatus && adminStatus !== 'hủy đơn') action = 'restored';

      await prisma.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: id,
          action,
          changes,
          userId: req.user!.id,
          userName: req.user!.fullName
        }
      });
    }

    logger.info('Order updated by admin', { orderId: id, by: req.user?.id, changes });
    res.json({ order });
  } catch (error: any) {
    logger.error('Update order error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật đơn hàng' });
  }
});

export default router;

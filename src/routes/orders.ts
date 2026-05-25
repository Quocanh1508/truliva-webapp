import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import { Prisma } from '@prisma/client';
import { syncRecentOrders } from '../services/orderSyncScheduler';

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
      search,               // search theo tên, sdt, mã đơn
      startDate,
      endDate,
      adminStatuses,
      assignedKtvIds,
      workTypes,
      mainStationIds,
      customerName,
      customerPhone,
      pancakeOrderId
    } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Xây dựng điều kiện tìm kiếm
    const where: Prisma.OrderWhereInput = {};
    const conditions: Prisma.OrderWhereInput[] = [];

    // Chỉ hiển thị các đơn hàng đã được xác nhận bên POS (ẩn các đơn nháp status = 0)
    conditions.push({
      OR: [
        { statusCode: { not: 0 } },
        { statusCode: null }
      ]
    });
    
    // Nếu user là KTV, chỉ lấy các đơn hàng được giao cho KTV đó
    if (req.user?.role === 'KTV') {
      conditions.push({ assignedKtvId: req.user.id });
    }

    if (pancakeOrderId) {
      const parsedId = parseInt(pancakeOrderId as string, 10);
      if (!isNaN(parsedId)) {
        conditions.push({ pancakeOrderId: parsedId });
      }
    }

    if (customerName) {
      conditions.push({ billFullName: { contains: customerName as string, mode: 'insensitive' } });
    }

    if (customerPhone) {
      conditions.push({ billPhoneNumber: { contains: customerPhone as string } });
    }

    if (adminStatuses) {
      const statusesList = typeof adminStatuses === 'string' ? adminStatuses.split(',') : (Array.isArray(adminStatuses) ? adminStatuses as string[] : []);
      if (statusesList.length > 0) {
        conditions.push({ adminStatus: { in: statusesList } });
      }
    } else if (status) {
      conditions.push({ adminStatus: status as string });
    }

    if (assignedKtvIds) {
      const ktvIdsList = typeof assignedKtvIds === 'string' ? assignedKtvIds.split(',') : (Array.isArray(assignedKtvIds) ? assignedKtvIds as string[] : []);
      if (ktvIdsList.length > 0) {
        const hasNullKtv = ktvIdsList.includes('null') || ktvIdsList.includes('');
        const actualKtvIds = ktvIdsList.filter(id => id && id !== 'null');
        
        if (hasNullKtv && actualKtvIds.length > 0) {
          conditions.push({
            OR: [
              { assignedKtvId: { in: actualKtvIds } },
              { assignedKtvId: null }
            ]
          });
        } else if (hasNullKtv) {
          conditions.push({ assignedKtvId: null });
        } else {
          conditions.push({ assignedKtvId: { in: actualKtvIds } });
        }
      }
    }

    if (workTypes) {
      const workTypesList = typeof workTypes === 'string' ? workTypes.split(',') : (Array.isArray(workTypes) ? workTypes as string[] : []);
      if (workTypesList.length > 0) {
        const hasNullWorkType = workTypesList.includes('null') || workTypesList.includes('');
        const actualWorkTypes = workTypesList.filter(w => w && w !== 'null');
        
        if (hasNullWorkType && actualWorkTypes.length > 0) {
          conditions.push({
            OR: [
              { workType: { in: actualWorkTypes } },
              { workType: null }
            ]
          });
        } else if (hasNullWorkType) {
          conditions.push({ workType: null });
        } else {
          conditions.push({ workType: { in: actualWorkTypes } });
        }
      }
    }

    if (mainStationIds) {
      const mainStationIdsList = typeof mainStationIds === 'string' ? mainStationIds.split(',') : (Array.isArray(mainStationIds) ? mainStationIds as string[] : []);
      if (mainStationIdsList.length > 0) {
        const hasNullStation = mainStationIdsList.includes('null') || mainStationIdsList.includes('');
        const actualStationIds = mainStationIdsList.filter(id => id && id !== 'null');
        
        if (hasNullStation && actualStationIds.length > 0) {
          conditions.push({
            OR: [
              { mainStationId: { in: actualStationIds } },
              { mainStationId: null }
            ]
          });
        } else if (hasNullStation) {
          conditions.push({ mainStationId: null });
        } else {
          conditions.push({ mainStationId: { in: actualStationIds } });
        }
      }
    }

    if (startDate || endDate) {
      const dateCond: any = {};
      if (startDate) {
        dateCond.gte = new Date(startDate as string);
      }
      if (endDate) {
        dateCond.lte = new Date(endDate as string);
      }
      conditions.push({ pancakeCreatedAt: dateCond });
    }

    if (search) {
      const searchStr = String(search).trim();
      const searchOR: Prisma.OrderWhereInput[] = [
        { billFullName: { contains: searchStr, mode: 'insensitive' } },
        { billPhoneNumber: { contains: searchStr } },
        {
          rawData: {
            path: ['id'],
            equals: searchStr
          }
        }
      ];
      const pancakeId = parseInt(searchStr, 10);
      if (!isNaN(pancakeId)) {
        searchOR.push({ pancakeOrderId: pancakeId });
      }
      conditions.push({ OR: searchOR });
    }

    if (conditions.length > 0) {
      where.AND = conditions;
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
              fullAddress: true,
            }
          },
          mainStation: {
            select: {
              name: true,
            }
          },
          assignedKtv: {
            select: {
              id: true,
              fullName: true,
              techStation: {
                select: {
                  mainStation: {
                    select: {
                      name: true,
                    }
                  }
                }
              }
            }
          },
          serviceReports: {
            select: {
              id: true
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

/**
 * POST /api/orders/sync
 * Đồng bộ thủ công 50 đơn hàng gần nhất từ Pancake POS
 */
router.post('/sync', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Manual orders sync initiated by admin', { userId: req.user?.id });
    const count = await syncRecentOrders(50);
    res.json({ success: true, message: `Đồng bộ thành công ${count} đơn hàng gần đây từ Pancake.` });
  } catch (error: any) {
    logger.error('Manual orders sync failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi đồng bộ đơn hàng từ Pancake' });
  }
});

export default router;

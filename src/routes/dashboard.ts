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
      p = p.replace(/^(Tỉnh |Thành phố |TP |TP\. )/i, '').trim();
      density[p] = (density[p] || 0) + c._count.orders;
    });

    // 3. Tổng quan đơn hàng theo trạng thái
    const statusCounts = await prisma.order.groupBy({
      by: ['adminStatus'],
      _count: { id: true }
    });

    res.json({
      stationStats,
      mapDensity: density,
      statusCounts
    });
  } catch (error: any) {
    logger.error('Get dashboard stats error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu dashboard' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';

const router = Router();

// Tất cả routes cần đăng nhập
router.use(requireAuth);

/**
 * GET /api/stations
 * Lấy danh sách Trạm chính + Trạm kỹ thuật (cascade)
 * Dành cho mọi role đã đăng nhập
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string; // 'active' | 'locked' | 'all'
    let mainWhere: any = {};
    let techWhere: any = {};

    if (status === 'locked') {
      mainWhere = {
        OR: [
          { isActive: false },
          {
            techStations: {
              some: { isActive: false }
            }
          }
        ]
      };
      techWhere = {
        OR: [
          { isActive: false },
          { mainStation: { isActive: false } }
        ]
      };
    } else if (status === 'all') {
      mainWhere = {};
      techWhere = {};
    } else {
      // default: active
      mainWhere = { isActive: true };
      techWhere = { isActive: true };
    }

    const mainStations = await prisma.mainStation.findMany({
      where: mainWhere,
      include: {
        techStations: {
          where: techWhere,
          include: {
            users: {
              where: { isActive: true, role: 'KTV' },
              select: { id: true, fullName: true, phoneNumber: true }
            }
          },
          orderBy: { name: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(mainStations);
  } catch (error: any) {
    logger.error('Get stations error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách trạm' });
  }
});

// ── Các routes bên dưới yêu cầu Admin ──
router.use(requireAdmin);

/**
 * POST /api/stations/main
 * Tạo trạm chính mới
 */
router.post('/main', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name?.trim()) {
      res.status(400).json({ error: 'Tên trạm chính không được trống' });
      return;
    }

    const station = await prisma.mainStation.create({
      data: { name: name.trim() }
    });

    logger.info('MainStation created', { id: station.id, by: req.user?.id });
    res.status(201).json(station);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Tên trạm chính đã tồn tại' });
      return;
    }
    logger.error('Create main station error', { error: error.message });
    res.status(500).json({ error: 'Lỗi tạo trạm chính' });
  }
});

/**
 * POST /api/stations/tech
 * Tạo trạm kỹ thuật mới (thuộc 1 trạm chính)
 */
router.post('/tech', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, mainStationId } = req.body;
    if (!name?.trim() || !mainStationId) {
      res.status(400).json({ error: 'Tên trạm kỹ thuật và trạm chính là bắt buộc' });
      return;
    }

    const station = await prisma.techStation.create({
      data: {
        name: name.trim(),
        mainStationId
      }
    });

    logger.info('TechStation created', { id: station.id, by: req.user?.id });
    res.status(201).json(station);
  } catch (error: any) {
    logger.error('Create tech station error', { error: error.message });
    res.status(500).json({ error: 'Lỗi tạo trạm kỹ thuật' });
  }
});

/**
 * DELETE /api/stations/main/:id
 * Vô hiệu hóa trạm chính
 */
router.delete('/main/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.mainStation.update({
      where: { id: req.params.id as string },
      data: { isActive: false }
    });
    res.json({ message: 'Đã vô hiệu hóa trạm chính' });
  } catch (error: any) {
    logger.error('Delete main station error', { error: error.message });
    res.status(500).json({ error: 'Lỗi vô hiệu hóa' });
  }
});

/**
 * DELETE /api/stations/tech/:id
 * Vô hiệu hóa trạm kỹ thuật
 */
router.delete('/tech/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.techStation.update({
      where: { id: req.params.id as string },
      data: { isActive: false }
    });
    res.json({ message: 'Đã vô hiệu hóa trạm kỹ thuật' });
  } catch (error: any) {
    logger.error('Delete tech station error', { error: error.message });
    res.status(500).json({ error: 'Lỗi vô hiệu hóa' });
  }
});

/**
 * PATCH /api/stations/main/:id
 * Cập nhật trạm chính (tên và/hoặc tình trạng isActive)
 */
router.patch('/main/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, isActive } = req.body;
    const { id } = req.params;

    const data: any = {};
    if (name !== undefined) {
      if (!name.trim()) {
        res.status(400).json({ error: 'Tên trạm chính không được trống' });
        return;
      }
      data.name = name.trim();
    }
    if (isActive !== undefined) {
      data.isActive = !!isActive;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Không có thông tin cập nhật' });
      return;
    }

    const updated = await prisma.mainStation.update({
      where: { id: id as string },
      data
    });

    logger.info('MainStation updated', { id: updated.id, data, by: req.user?.id });
    res.json(updated);
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Tên trạm chính đã tồn tại' });
      return;
    }
    logger.error('Update main station error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật trạm chính' });
  }
});

/**
 * PATCH /api/stations/tech/:id
 * Cập nhật trạm kỹ thuật (tên và/hoặc tình trạng isActive)
 */
router.patch('/tech/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, isActive, mainStationId } = req.body;
    const { id } = req.params;

    const data: any = {};
    if (name !== undefined) {
      if (!name.trim()) {
        res.status(400).json({ error: 'Tên trạm kỹ thuật không được trống' });
        return;
      }
      data.name = name.trim();
    }
    if (isActive !== undefined) {
      data.isActive = !!isActive;
    }
    if (mainStationId !== undefined) {
      data.mainStationId = mainStationId;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Không có thông tin cập nhật' });
      return;
    }

    const updated = await prisma.techStation.update({
      where: { id: id as string },
      data
    });

    logger.info('TechStation updated', { id: updated.id, data, by: req.user?.id });
    res.json(updated);
  } catch (error: any) {
    logger.error('Update tech station error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật trạm kỹ thuật' });
  }
});

export default router;

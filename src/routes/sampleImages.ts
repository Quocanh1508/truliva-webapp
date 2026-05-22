import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';

const router = Router();

// Tất cả routes cần đăng nhập
router.use(requireAuth);

/**
 * GET /api/sample-images
 * Lấy danh sách toàn bộ ảnh mẫu
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { workType } = req.query;
    const whereClause: any = {};
    if (workType) {
      whereClause.workType = workType as string;
    }

    const samples = await prisma.workTypeSampleImage.findMany({
      where: whereClause,
      orderBy: [
        { workType: 'asc' },
        { slotLabel: 'asc' }
      ]
    });

    res.json(samples);
  } catch (error: any) {
    logger.error('Get sample images error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách ảnh mẫu' });
  }
});

// Các routes bên dưới yêu cầu Admin
router.use(requireAdmin);

/**
 * POST /api/sample-images
 * Tạo hoặc cập nhật ảnh mẫu cho một slot của loại công việc
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { workType, slotLabel, imageUrl } = req.body;

    if (!workType?.trim() || !slotLabel?.trim() || !imageUrl?.trim()) {
      res.status(400).json({ error: 'Thiếu thông tin loại công việc, nhãn slot hoặc đường dẫn ảnh' });
      return;
    }

    const sample = await prisma.workTypeSampleImage.upsert({
      where: {
        workType_slotLabel: {
          workType: workType.trim(),
          slotLabel: slotLabel.trim(),
        }
      },
      update: {
        imageUrl: imageUrl.trim(),
      },
      create: {
        workType: workType.trim(),
        slotLabel: slotLabel.trim(),
        imageUrl: imageUrl.trim(),
      }
    });

    logger.info('Sample image upserted', { id: sample.id, workType, slotLabel, by: req.user?.id });
    res.status(200).json(sample);
  } catch (error: any) {
    logger.error('Upsert sample image error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lưu ảnh mẫu' });
  }
});

/**
 * DELETE /api/sample-images/:id
 * Xóa ảnh mẫu theo ID
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const sample = await prisma.workTypeSampleImage.delete({
      where: { id: id as string }
    });

    logger.info('Sample image deleted', { id, workType: sample.workType, slotLabel: sample.slotLabel, by: req.user?.id });
    res.json({ message: 'Đã xóa ảnh mẫu thành công' });
  } catch (error: any) {
    logger.error('Delete sample image error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xóa ảnh mẫu' });
  }
});

export default router;

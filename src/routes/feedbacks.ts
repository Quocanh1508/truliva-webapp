import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/authSession';

const router = Router();

// Middleware kiểm tra quyền DEV
function requireDev(req: Request, res: Response, next: any): void {
  if (req.user?.role !== 'DEV') {
    res.status(403).json({ error: 'Không có quyền truy cập. Chỉ dành cho DEV.' });
    return;
  }
  next();
}

/**
 * POST /api/feedbacks
 * Gửi đóng góp ý kiến (KTV & ADMIN)
 */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { content, imageUrls } = req.body;

    if (!content || typeof content !== 'string' || content.trim() === '') {
      res.status(400).json({ error: 'Nội dung đóng góp không được để trống' });
      return;
    }

    const urls = Array.isArray(imageUrls) ? imageUrls : [];
    if (urls.length > 4) {
      res.status(400).json({ error: 'Tối đa chỉ được tải lên 4 ảnh' });
      return;
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId: req.user!.id,
        content: content.trim(),
        imageUrls: urls,
      },
      include: {
        user: {
          select: {
            username: true,
            role: true,
            fullName: true,
          }
        }
      }
    });

    logger.info('Feedback submitted', { feedbackId: feedback.id, userId: req.user!.id });
    res.status(201).json(feedback);
  } catch (error: any) {
    logger.error('Submit feedback error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi gửi đóng góp ý kiến' });
  }
});

/**
 * GET /api/feedbacks
 * Danh sách đóng góp ý kiến (Chỉ DEV được xem)
 */
router.get('/', requireAuth, requireDev, async (req: Request, res: Response): Promise<void> => {
  try {
    const feedbacks = await prisma.feedback.findMany({
      include: {
        user: {
          select: {
            username: true,
            role: true,
            fullName: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc',
      }
    });

    res.json({ feedbacks });
  } catch (error: any) {
    logger.error('Fetch feedbacks error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi tải danh sách đóng góp ý kiến' });
  }
});

/**
 * DELETE /api/feedbacks/:id
 * Xóa phản hồi (Chỉ DEV được xóa)
 */
router.delete('/:id', requireAuth, requireDev, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await prisma.feedback.delete({ where: { id } });
    res.json({ message: 'Đã xóa phản hồi' });
  } catch (error: any) {
    logger.error('Delete feedback error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi xóa phản hồi' });
  }
});

export default router;

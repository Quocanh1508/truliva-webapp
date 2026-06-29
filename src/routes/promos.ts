import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/authSession';

const router = Router();

// Tất cả các route yêu cầu đăng nhập
router.use(requireAuth);

/**
 * Middleware cho phép Admin và Dev sửa đổi cấu hình khuyến mãi.
 */
function requireAdminOrDev(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'DEV') {
    res.status(403).json({ error: 'Không có quyền thực hiện hành động này. Chỉ dành cho Admin/Dev.' });
    return;
  }
  next();
}

/**
 * Middleware cho phép Admin, Dev, Coordinator, Sales, Hotline xem cấu hình khuyến mãi.
 */
function requirePromoAccess(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  const allowedRoles = ['ADMIN', 'DEV', 'COORDINATOR', 'SALER', 'SALE_SUPERVISOR', 'HOTLINE'];
  if (!role || !allowedRoles.includes(role)) {
    res.status(403).json({ error: 'Không có quyền truy cập.' });
    return;
  }
  next();
}

/**
 * GET /api/promos
 * Lấy danh sách tất cả các chương trình khuyến mãi bảo hành
 */
router.get('/', requirePromoAccess, async (req: Request, res: Response): Promise<void> => {
  try {
    const promos = await prisma.warrantyPromo.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(promos);
  } catch (error: any) {
    logger.error('Lỗi lấy danh sách khuyến mãi', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách khuyến mãi' });
  }
});

/**
 * POST /api/promos
 * Tạo mã khuyến mãi mới (Chỉ dành cho Admin/Dev)
 */
router.post('/', requireAdminOrDev, async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, promoMonths, description, startDate, endDate, applicableModels } = req.body;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Mã khuyến mãi không hợp lệ' });
      return;
    }

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      res.status(400).json({ error: 'Mã khuyến mãi không được để trống' });
      return;
    }

    const months = parseInt(promoMonths);
    if (isNaN(months) || months <= 0) {
      res.status(400).json({ error: 'Số tháng khuyến mãi phải lớn hơn 0' });
      return;
    }

    // Kiểm tra trùng mã
    const existing = await prisma.warrantyPromo.findUnique({
      where: { code: cleanCode },
    });
    if (existing) {
      res.status(400).json({ error: 'Mã khuyến mãi này đã tồn tại' });
      return;
    }

    const promo = await prisma.warrantyPromo.create({
      data: {
        code: cleanCode,
        promoMonths: months,
        description: description || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        applicableModels: Array.isArray(applicableModels) ? applicableModels : [],
      },
    });

    logger.info('Tạo mã khuyến mãi mới thành công', { code: cleanCode, createdBy: req.user?.username });
    res.json(promo);
  } catch (error: any) {
    logger.error('Lỗi tạo khuyến mãi', { error: error.message });
    res.status(500).json({ error: 'Lỗi tạo khuyến mãi' });
  }
});

/**
 * PUT /api/promos/:id
 * Chỉnh sửa mã khuyến mãi (Chỉ dành cho Admin/Dev)
 */
router.put('/:id', requireAdminOrDev, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { code, promoMonths, description, startDate, endDate, applicableModels, isLocked } = req.body;

    const existing = await prisma.warrantyPromo.findUnique({
      where: { id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Không tìm thấy mã khuyến mãi' });
      return;
    }

    const months = parseInt(promoMonths);
    if (isNaN(months) || months <= 0) {
      res.status(400).json({ error: 'Số tháng khuyến mãi phải lớn hơn 0' });
      return;
    }

    let cleanCode = existing.code;
    if (code) {
      cleanCode = code.trim().toUpperCase();
      if (!cleanCode) {
        res.status(400).json({ error: 'Mã khuyến mãi không được để trống' });
        return;
      }
      // Kiểm tra trùng mã khác
      const codeCheck = await prisma.warrantyPromo.findFirst({
        where: { code: cleanCode, id: { not: id } },
      });
      if (codeCheck) {
        res.status(400).json({ error: 'Mã khuyến mãi này đã bị trùng' });
        return;
      }
    }

    const updated = await prisma.warrantyPromo.update({
      where: { id },
      data: {
        code: cleanCode,
        promoMonths: months,
        description: description ?? null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        applicableModels: Array.isArray(applicableModels) ? applicableModels : [],
        isLocked: typeof isLocked === 'boolean' ? isLocked : existing.isLocked,
      },
    });

    logger.info('Cập nhật mã khuyến mãi thành công', { id, code: cleanCode, updatedBy: req.user?.username });
    res.json(updated);
  } catch (error: any) {
    logger.error('Lỗi cập nhật khuyến mãi', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật khuyến mãi' });
  }
});

/**
 * PATCH /api/promos/:id/toggle-lock
 * Khóa hoặc mở khóa mã khuyến mãi (Chỉ dành cho Admin/Dev)
 */
router.patch('/:id/toggle-lock', requireAdminOrDev, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const promo = await prisma.warrantyPromo.findUnique({
      where: { id },
    });
    if (!promo) {
      res.status(404).json({ error: 'Không tìm thấy mã khuyến mãi' });
      return;
    }

    const updated = await prisma.warrantyPromo.update({
      where: { id },
      data: {
        isLocked: !promo.isLocked,
      },
    });

    logger.info('Khóa/Mở khóa mã khuyến mãi', { id, code: promo.code, isLocked: updated.isLocked, updatedBy: req.user?.username });
    res.json(updated);
  } catch (error: any) {
    logger.error('Lỗi khóa/mở khóa khuyến mãi', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật trạng thái khóa khuyến mãi' });
  }
});

/**
 * DELETE /api/promos/:id
 * Xóa mã khuyến mãi (Chỉ dành cho Admin/Dev)
 */
router.delete('/:id', requireAdminOrDev, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const promo = await prisma.warrantyPromo.findUnique({
      where: { id },
    });
    if (!promo) {
      res.status(404).json({ error: 'Không tìm thấy mã khuyến mãi' });
      return;
    }

    await prisma.warrantyPromo.delete({
      where: { id },
    });

    logger.info('Xóa mã khuyến mãi', { id, code: promo.code, deletedBy: req.user?.username });
    res.json({ success: true, message: 'Đã xóa mã khuyến mãi thành công' });
  } catch (error: any) {
    logger.error('Lỗi xóa khuyến mãi', { error: error.message });
    res.status(500).json({ error: 'Lỗi xóa khuyến mãi' });
  }
});

/**
 * POST /api/promos/validate
 * Kiểm tra tính hợp lệ của mã khuyến mãi (Sử dụng cho cả Admin khi thiết lập đơn hàng và API công khai)
 */
router.post('/validate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, model } = req.body;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ isValid: false, error: 'Vui lòng cung cấp mã khuyến mãi' });
      return;
    }

    const cleanCode = code.trim().toUpperCase();
    const promo = await prisma.warrantyPromo.findUnique({
      where: { code: cleanCode },
    });

    if (!promo) {
      res.status(400).json({ isValid: false, error: 'Mã khuyến mãi không tồn tại' });
      return;
    }

    if (promo.isLocked) {
      res.status(400).json({ isValid: false, error: 'Mã khuyến mãi này hiện đang bị khóa' });
      return;
    }

    const now = new Date();
    if (promo.startDate && now < new Date(promo.startDate)) {
      res.status(400).json({ isValid: false, error: 'Mã khuyến mãi này chưa đến thời gian áp dụng' });
      return;
    }

    if (promo.endDate && now > new Date(promo.endDate)) {
      res.status(400).json({ isValid: false, error: 'Mã khuyến mãi này đã hết hạn sử dụng' });
      return;
    }

    // Kiểm tra dòng máy áp dụng (nếu cấu hình applicableModels không rỗng)
    if (promo.applicableModels && promo.applicableModels.length > 0) {
      if (!model || typeof model !== 'string') {
        res.status(400).json({ isValid: false, error: 'Thiếu dòng máy để đối chiếu mã khuyến mãi' });
        return;
      }
      
      const isMatched = promo.applicableModels.some((kw: string) => 
        model.toLowerCase().includes(kw.trim().toLowerCase())
      );
      
      if (!isMatched) {
        res.status(400).json({ 
          isValid: false, 
          error: `Mã khuyến mãi này không áp dụng cho dòng máy ${model}` 
        });
        return;
      }
    }

    res.json({
      isValid: true,
      code: promo.code,
      promoMonths: promo.promoMonths,
      description: promo.description,
    });
  } catch (error: any) {
    logger.error('Lỗi kiểm tra mã khuyến mãi', { error: error.message });
    res.status(500).json({ isValid: false, error: 'Lỗi kiểm tra mã khuyến mãi trên hệ thống' });
  }
});

export default router;

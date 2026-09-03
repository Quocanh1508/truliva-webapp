/**
 * Routes: /api/combos
 * CRUD cho Dynamic Combo Management
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import {
  getAllCombos,
  createCombo,
  updateCombo,
  deleteCombo
} from '../services/comboService';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/combos
 * Lấy danh sách tất cả combo definitions (bao gồm cả inactive)
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const combos = await getAllCombos();
    res.json({ combos });
  } catch (error: any) {
    logger.error('[CombosAPI] GET /api/combos error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách gói combo' });
  }
});

/**
 * POST /api/combos
 * Tạo combo mới (Admin only)
 */
router.post('/', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { comboKey, displayName, keywords, components } = req.body;

    if (!comboKey || !displayName || !components || !Array.isArray(components) || components.length === 0) {
      res.status(400).json({ error: 'Thiếu thông tin: comboKey, displayName, và ít nhất 1 component là bắt buộc' });
      return;
    }

    const combo = await createCombo({
      comboKey,
      displayName,
      keywords: keywords || [],
      components
    });

    logger.info('[CombosAPI] Created new combo', { comboKey: combo.comboKey, id: combo.id });
    res.status(201).json({ combo });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: `Mã combo "${req.body.comboKey}" đã tồn tại trong hệ thống` });
      return;
    }
    logger.error('[CombosAPI] POST /api/combos error', { error: error.message });
    res.status(500).json({ error: 'Lỗi tạo gói combo mới' });
  }
});

/**
 * PUT /api/combos/:id
 * Cập nhật combo (Admin only)
 */
router.put('/:id', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { comboKey, displayName, keywords, isActive, components } = req.body;

    const combo = await updateCombo(id, {
      comboKey,
      displayName,
      keywords,
      isActive,
      components
    });

    logger.info('[CombosAPI] Updated combo', { comboKey: combo.comboKey, id: combo.id });
    res.json({ combo });
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Không tìm thấy gói combo' });
      return;
    }
    if (error.code === 'P2002') {
      res.status(409).json({ error: `Mã combo "${req.body.comboKey}" đã tồn tại` });
      return;
    }
    logger.error('[CombosAPI] PUT /api/combos/:id error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật gói combo' });
  }
});

/**
 * DELETE /api/combos/:id
 * Xóa combo (Admin only)
 */
router.delete('/:id', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await deleteCombo(id);

    logger.info('[CombosAPI] Deleted combo', { id });
    res.json({ success: true, message: 'Đã xóa gói combo' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Không tìm thấy gói combo' });
      return;
    }
    logger.error('[CombosAPI] DELETE /api/combos/:id error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xóa gói combo' });
  }
});

export default router;

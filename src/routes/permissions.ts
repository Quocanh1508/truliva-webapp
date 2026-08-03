import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import { SYSTEM_FEATURES, SYSTEM_MODULES, SYSTEM_ROLES, getDefaultPermission } from '../config/permissions';
import { UserRole } from '@prisma/client';

const router = Router();

/**
 * GET /api/permissions
 * Trả về danh sách nhóm tính năng, các vai trò và ma trận phân quyền hiện tại (DB overrides + Defaults)
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Lấy tất cả bản ghi tùy chỉnh từ DB
    const dbPermissions = await prisma.rolePermission.findMany();
    
    // Tạo Map để tra cứu nhanh: "ROLE:FEATURE_KEY" -> isAllowed
    const permMap = new Map<string, boolean>();
    dbPermissions.forEach(p => {
      permMap.set(`${p.role}:${p.featureKey}`, p.isAllowed);
    });

    // 2. Xây dựng Ma trận Phân quyền cho tất cả Roles & Features
    const matrix: Record<string, Record<string, boolean>> = {};

    SYSTEM_ROLES.forEach(r => {
      matrix[r.key] = {};
      SYSTEM_FEATURES.forEach(f => {
        const key = `${r.key}:${f.key}`;
        if (permMap.has(key)) {
          matrix[r.key][f.key] = permMap.get(key)!;
        } else {
          matrix[r.key][f.key] = getDefaultPermission(r.key, f.key);
        }
      });
    });

    res.json({
      success: true,
      modules: SYSTEM_MODULES,
      features: SYSTEM_FEATURES,
      roles: SYSTEM_ROLES,
      matrix
    });
  } catch (error: any) {
    logger.error('Failed to get permissions matrix', { error: error.message });
    res.status(500).json({ error: 'Lỗi máy chủ khi lấy ma trận phân quyền' });
  }
});

/**
 * POST /api/permissions/update
 * Cập nhật bật/tắt 1 quyền (hoặc nhiều quyền) cho một Role (Chỉ Admin)
 */
router.post('/update', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, featureKey, isAllowed, updates } = req.body;

    if (updates && Array.isArray(updates)) {
      // Cập nhật hàng loạt
      for (const item of updates) {
        if (!item.role || !item.featureKey) continue;
        await prisma.rolePermission.upsert({
          where: {
            role_featureKey: {
              role: item.role as UserRole,
              featureKey: item.featureKey
            }
          },
          update: {
            isAllowed: Boolean(item.isAllowed)
          },
          create: {
            role: item.role as UserRole,
            featureKey: item.featureKey,
            isAllowed: Boolean(item.isAllowed)
          }
        });
      }

      logger.info('Bulk updated role permissions', { count: updates.length, updatedBy: req.user?.username });
      res.json({ success: true, message: 'Cập nhật phân quyền hàng loạt thành công!' });
      return;
    }

    if (!role || !featureKey) {
      res.status(400).json({ error: 'Thiếu thông tin role hoặc featureKey' });
      return;
    }

    const updated = await prisma.rolePermission.upsert({
      where: {
        role_featureKey: {
          role: role as UserRole,
          featureKey
        }
      },
      update: {
        isAllowed: Boolean(isAllowed)
      },
      create: {
        role: role as UserRole,
        featureKey,
        isAllowed: Boolean(isAllowed)
      }
    });

    logger.info('Updated role permission', { role, featureKey, isAllowed, updatedBy: req.user?.username });
    res.json({ success: true, permission: updated });
  } catch (error: any) {
    logger.error('Failed to update permission', { error: error.message });
    res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật phân quyền' });
  }
});

export default router;

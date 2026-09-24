import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import { SYSTEM_FEATURES, SYSTEM_MODULES, SYSTEM_ROLES, getDefaultPermission } from '../config/permissions';
import { UserRole } from '@prisma/client';

const router = Router();

const PREDEFINED_GROUPS: string[] = ['DTC', 'eCom', 'Service', 'DT South', 'DT North', 'Marketing', 'Admin'];

/**
 * GET /api/permissions
 * Trả về danh sách nhóm tính năng, các vai trò, danh sách groups và ma trận phân quyền hiện tại (Role-level & Group-level)
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Lấy danh sách Group thực tế trong hệ thống (Loại trừ CUSTOMER Zalo)
    const dbUsersWithGroup = await prisma.user.findMany({
      where: { 
        group: { not: null },
        NOT: [
          { group: 'CUSTOMER' },
          { username: { startsWith: 'zalo_' } }
        ]
      },
      select: { group: true },
      distinct: ['group']
    });
    const dbGroups = dbUsersWithGroup.map(u => u.group?.trim()).filter(Boolean) as string[];
    const allGroups = Array.from(new Set([...PREDEFINED_GROUPS, ...dbGroups]));

    // 2. Lấy tất cả bản ghi tùy chỉnh từ DB
    const dbPermissions = await prisma.rolePermission.findMany();
    
    // Map cho Role-level: "ROLE:FEATURE_KEY" -> isAllowed
    const rolePermMap = new Map<string, boolean>();
    // Map cho Group-level: "ROLE::GROUP:FEATURE_KEY" -> isAllowed
    const groupPermMap = new Map<string, boolean>();

    dbPermissions.forEach(p => {
      const grp = (p.group || '').trim();
      if (!grp) {
        rolePermMap.set(`${p.role}:${p.featureKey}`, p.isAllowed);
      } else {
        groupPermMap.set(`${p.role}::${grp}:${p.featureKey}`, p.isAllowed);
      }
    });

    // 3. Xây dựng Ma trận Phân quyền Role-level
    const matrix: Record<string, Record<string, boolean>> = {};
    SYSTEM_ROLES.forEach(r => {
      matrix[r.key] = {};
      SYSTEM_FEATURES.forEach(f => {
        const key = `${r.key}:${f.key}`;
        if (rolePermMap.has(key)) {
          matrix[r.key][f.key] = rolePermMap.get(key)!;
        } else {
          matrix[r.key][f.key] = getDefaultPermission(r.key, f.key);
        }
      });
    });

    // 4. Xây dựng Ma trận Phân quyền Group-level: groupMatrix["ROLE::GROUP"][featureKey]
    const groupMatrix: Record<string, Record<string, boolean>> = {};
    SYSTEM_ROLES.forEach(r => {
      allGroups.forEach(grp => {
        const groupKey = `${r.key}::${grp}`;
        groupMatrix[groupKey] = {};
        SYSTEM_FEATURES.forEach(f => {
          const directKey = `${r.key}::${grp}:${f.key}`;
          if (groupPermMap.has(directKey)) {
            // Có cấu hình riêng cho nhóm
            groupMatrix[groupKey][f.key] = groupPermMap.get(directKey)!;
          } else {
            // Thừa kế từ Role
            groupMatrix[groupKey][f.key] = matrix[r.key][f.key];
          }
        });
      });
    });

    // Trả về cả danh sách các key nhóm có cấu hình riêng để UI đánh dấu badge
    const customGroupKeys = Array.from(groupPermMap.keys()).map(k => {
      const lastColon = k.lastIndexOf(':');
      return k.slice(0, lastColon); // "ROLE::GROUP"
    });
    const customGroupKeysSet = Array.from(new Set(customGroupKeys));

    // 5. Phát hiện tính năng mới chưa được Admin review
    // Logic: Feature có addedAt !== 'v1.0' và chưa có bất kỳ RolePermission nào trong DB
    const allDbFeatureKeys = new Set(dbPermissions.map(p => p.featureKey));
    const newFeatureKeys = SYSTEM_FEATURES
      .filter(f => f.addedAt !== 'v1.0' && !allDbFeatureKeys.has(f.key))
      .map(f => f.key);

    // 6. Lấy tất cả User-Level Permission Overrides
    const userPermissions = await prisma.userPermission.findMany({
      include: { user: { select: { id: true, username: true, fullName: true, role: true, group: true } } }
    });

    // Tạo userPermMatrix: { userId: { featureKey: isAllowed } }
    const userPermMatrix: Record<string, Record<string, boolean>> = {};
    userPermissions.forEach((up: any) => {
      if (!userPermMatrix[up.userId]) userPermMatrix[up.userId] = {};
      userPermMatrix[up.userId][up.featureKey] = up.isAllowed;
    });

    // Danh sách users đã có cấu hình riêng
    const usersWithOverrides = Object.keys(userPermMatrix).map(uid => {
      const up = userPermissions.find((p: any) => p.userId === uid);
      return up?.user || null;
    }).filter(Boolean);

    res.json({
      success: true,
      modules: SYSTEM_MODULES,
      features: SYSTEM_FEATURES,
      roles: SYSTEM_ROLES,
      groups: allGroups,
      matrix,
      groupMatrix,
      customGroupKeys: customGroupKeysSet,
      newFeatureKeys,
      userPermMatrix,
      usersWithOverrides
    });
  } catch (error: any) {
    logger.error('Failed to get permissions matrix', { error: error.message });
    res.status(500).json({ error: 'Lỗi máy chủ khi lấy ma trận phân quyền' });
  }
});

/**
 * POST /api/permissions/update
 * Cập nhật bật/tắt 1 quyền (hoặc nhiều quyền) cho Role hoặc Group (Chỉ Admin)
 */
router.post('/update', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, group, featureKey, isAllowed, updates, action } = req.body;

    // Reset toàn bộ quyền riêng của 1 group về Role default
    if (action === 'reset_group' && role && group) {
      const grp = String(group).trim();
      await prisma.rolePermission.deleteMany({
        where: {
          role: role as UserRole,
          group: grp
        }
      });
      logger.info('Reset group permissions to role default', { role, group: grp, updatedBy: req.user?.username });
      res.json({ success: true, message: `Đã khôi phục quyền nhóm ${grp} về mặc định của ${role}` });
      return;
    }

    if (updates && Array.isArray(updates)) {
      // Cập nhật hàng loạt
      for (const item of updates) {
        if (!item.role || !item.featureKey) continue;
        const grp = (item.group || '').trim();
        await prisma.rolePermission.upsert({
          where: {
            role_group_featureKey: {
              role: item.role as UserRole,
              group: grp,
              featureKey: item.featureKey
            }
          },
          update: {
            isAllowed: Boolean(item.isAllowed)
          },
          create: {
            role: item.role as UserRole,
            group: grp,
            featureKey: item.featureKey,
            isAllowed: Boolean(item.isAllowed)
          }
        });
      }

      logger.info('Bulk updated role/group permissions', { count: updates.length, updatedBy: req.user?.username });
      res.json({ success: true, message: 'Cập nhật phân quyền hàng loạt thành công!' });
      return;
    }

    if (!role || !featureKey) {
      res.status(400).json({ error: 'Thiếu thông tin role hoặc featureKey' });
      return;
    }

    const grp = (group || '').trim();

    const updated = await prisma.rolePermission.upsert({
      where: {
        role_group_featureKey: {
          role: role as UserRole,
          group: grp,
          featureKey
        }
      },
      update: {
        isAllowed: Boolean(isAllowed)
      },
      create: {
        role: role as UserRole,
        group: grp,
        featureKey,
        isAllowed: Boolean(isAllowed)
      }
    });

    logger.info('Updated role/group permission', { role, group: grp, featureKey, isAllowed, updatedBy: req.user?.username });
    res.json({ success: true, permission: updated });
  } catch (error: any) {
    logger.error('Failed to update permission', { error: error.message });
    res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật phân quyền' });
  }
});

/**
 * POST /api/permissions/user-update
 * Cập nhật quyền cấp cá nhân cho 1 user (Chỉ Admin)
 */
router.post('/user-update', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, featureKey, isAllowed, action } = req.body;

    // Reset toàn bộ quyền riêng của user về Role/Group default
    if (action === 'reset_user' && userId) {
      await prisma.userPermission.deleteMany({ where: { userId } });
      logger.info('Reset user permissions to role default', { userId, updatedBy: req.user?.username });
      res.json({ success: true, message: 'Đã xóa toàn bộ quyền riêng của user' });
      return;
    }

    if (!userId || !featureKey) {
      res.status(400).json({ error: 'Thiếu thông tin userId hoặc featureKey' });
      return;
    }

    const updated = await prisma.userPermission.upsert({
      where: {
        userId_featureKey: { userId, featureKey }
      },
      update: { isAllowed: Boolean(isAllowed) },
      create: { userId, featureKey, isAllowed: Boolean(isAllowed) }
    });

    logger.info('Updated user permission', { userId, featureKey, isAllowed, updatedBy: req.user?.username });
    res.json({ success: true, permission: updated });
  } catch (error: any) {
    logger.error('Failed to update user permission', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi cập nhật quyền cá nhân' });
  }
});

/**
 * GET /api/permissions/users-search?q=xxx
 * Tìm kiếm users để thêm vào phân quyền cá nhân (Chỉ Admin)
 */
router.get('/users-search', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      res.json({ users: [] });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        NOT: { username: { startsWith: 'zalo_' } },
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } }
        ]
      },
      select: { id: true, username: true, fullName: true, role: true, group: true },
      take: 20
    });

    res.json({ users });
  } catch (error: any) {
    logger.error('Failed to search users for permissions', { error: error.message });
    res.status(500).json({ error: 'Lỗi tìm kiếm nhân viên' });
  }
});

export default router;

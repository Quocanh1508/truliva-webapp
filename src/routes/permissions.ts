import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin, checkDynamicPermission } from '../middleware/authSession';
import { SYSTEM_FEATURES, SYSTEM_MODULES, SYSTEM_ROLES, FEATURE_BY_KEY, getDefaultPermission } from '../config/permissions';
import {
  ensurePermissionCatalogSynced,
  syncPermissionCatalog,
  getUnreviewedFeatureKeys,
  markFeaturesReviewed,
  getLastPermissionSyncReport
} from '../services/permissionSync';
import { UserRole } from '@prisma/client';

const router = Router();

const PREDEFINED_GROUPS: string[] = ['DTC', 'eCom', 'Service', 'DT South', 'DT North', 'Marketing', 'Admin'];
const VALID_ROLES = new Set<string>(Object.values(UserRole));

function reviewerOf(req: Request): string {
  return req.user?.username || req.user?.id || 'admin';
}

/** Admin bấm vào 1 ô của tính năng MỚI → tự động coi như đã duyệt tính năng đó */
async function autoReview(req: Request, featureKeys: string[]): Promise<void> {
  try {
    await markFeaturesReviewed(featureKeys, reviewerOf(req));
  } catch (err: any) {
    logger.warn('[Permissions] autoReview failed', { error: err.message });
  }
}

/**
 * GET /api/permissions
 * Danh mục tính năng + ma trận 3 tầng (Role → Group → User).
 * - matrix:               quyền hiệu lực theo Role
 * - groupMatrix:          quyền hiệu lực theo Role::Group (đã gộp kế thừa)
 * - groupOverrideMatrix:  CHỈ các ô Group được ghi đè riêng (để UI phân biệt Kế thừa / Ghi đè)
 * - userPermMatrix:       CHỈ các ô User được ghi đè riêng
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    await ensurePermissionCatalogSynced();

    const role = req.user?.role || '';
    const canManage = role === 'ADMIN' ||
      await checkDynamicPermission(role, 'USER_PERMISSIONS_MATRIX', req.user?.group, req.user?.id);

    // 1. Danh sách Group thực tế (loại trừ khách Zalo)
    const dbUsersWithGroup = await prisma.user.findMany({
      where: {
        group: { not: null },
        NOT: [{ group: 'CUSTOMER' }, { username: { startsWith: 'zalo_' } }]
      },
      select: { group: true },
      distinct: ['group']
    });
    const dbGroups = dbUsersWithGroup.map(u => u.group?.trim()).filter(Boolean) as string[];

    // 2. Toàn bộ bản ghi Role/Group
    const dbPermissions = await prisma.rolePermission.findMany();
    const rolePermMap = new Map<string, boolean>();
    const groupOverrideMatrix: Record<string, Record<string, boolean>> = {};
    dbPermissions.forEach(p => {
      const grp = (p.group || '').trim();
      if (!grp) {
        rolePermMap.set(`${p.role}:${p.featureKey}`, p.isAllowed);
      } else {
        const gk = `${p.role}::${grp}`;
        (groupOverrideMatrix[gk] ||= {})[p.featureKey] = p.isAllowed;
      }
    });
    const overrideGroups = Object.keys(groupOverrideMatrix).map(k => k.split('::')[1]);
    const allGroups = Array.from(new Set([...PREDEFINED_GROUPS, ...dbGroups, ...overrideGroups]));

    // 3. Ma trận Role-level (DB → mặc định trong code)
    const matrix: Record<string, Record<string, boolean>> = {};
    SYSTEM_ROLES.forEach(r => {
      matrix[r.key] = {};
      SYSTEM_FEATURES.forEach(f => {
        const v = rolePermMap.get(`${r.key}:${f.key}`);
        matrix[r.key][f.key] = v !== undefined ? v : getDefaultPermission(r.key, f.key);
      });
    });

    // 4. Ma trận Group-level hiệu lực (ghi đè nhóm → kế thừa Role)
    const groupMatrix: Record<string, Record<string, boolean>> = {};
    SYSTEM_ROLES.forEach(r => {
      allGroups.forEach(grp => {
        const gk = `${r.key}::${grp}`;
        const ov = groupOverrideMatrix[gk] || {};
        groupMatrix[gk] = {};
        SYSTEM_FEATURES.forEach(f => {
          groupMatrix[gk][f.key] = ov[f.key] !== undefined ? ov[f.key] : matrix[r.key][f.key];
        });
      });
    });
    const customGroupKeys = Object.keys(groupOverrideMatrix);

    // 5. Tính năng mới chờ duyệt (registry permission_features)
    const newFeatureKeys = await getUnreviewedFeatureKeys();

    // 6. User-level overrides — người không có quyền quản trị chỉ nhận dữ liệu của chính mình
    const userPermissions = await prisma.userPermission.findMany({
      where: canManage ? undefined : { userId: req.user?.id || '__none__' },
      include: { user: { select: { id: true, username: true, fullName: true, role: true, group: true } } }
    });
    const userPermMatrix: Record<string, Record<string, boolean>> = {};
    const userInfoMap = new Map<string, any>();
    userPermissions.forEach(up => {
      (userPermMatrix[up.userId] ||= {})[up.featureKey] = up.isAllowed;
      if (up.user) userInfoMap.set(up.userId, up.user);
    });
    const usersWithOverrides = canManage ? Array.from(userInfoMap.values()) : [];

    res.json({
      success: true,
      modules: SYSTEM_MODULES,
      features: SYSTEM_FEATURES,
      roles: SYSTEM_ROLES,
      groups: allGroups,
      matrix,
      groupMatrix,
      groupOverrideMatrix,
      customGroupKeys,
      newFeatureKeys,
      userPermMatrix,
      usersWithOverrides,
      syncReport: canManage ? getLastPermissionSyncReport() : null
    });
  } catch (error: any) {
    logger.error('Failed to get permissions matrix', { error: error.message });
    res.status(500).json({ error: 'Lỗi máy chủ khi lấy ma trận phân quyền' });
  }
});

/**
 * POST /api/permissions/sync  (Admin)
 * Quét danh mục tính năng trong code → INSERT quyền mặc định cho key mới. Không ghi đè key cũ.
 */
router.post('/sync', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const report = await syncPermissionCatalog();
    logger.info('[Permissions] Manual sync', { by: reviewerOf(req), newlyRegistered: report.newlyRegistered });
    res.json({ success: true, report });
  } catch (error: any) {
    logger.error('Failed to sync permission catalog', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi đồng bộ danh mục phân quyền' });
  }
});

/**
 * POST /api/permissions/acknowledge  (Admin)
 * body: { featureKeys?: string[] } — bỏ trống = duyệt toàn bộ tính năng mới.
 * Chỉ đánh dấu "đã duyệt" trên registry; quyền mặc định đã được seed sẵn khi sync.
 */
router.post('/acknowledge', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const requested: string[] = Array.isArray(req.body?.featureKeys) ? req.body.featureKeys.map(String) : [];
    const keys = requested.length ? requested.filter(k => FEATURE_BY_KEY[k]) : await getUnreviewedFeatureKeys();
    const count = await markFeaturesReviewed(keys, reviewerOf(req));
    logger.info('[Permissions] Acknowledged new features', { keys, count, by: reviewerOf(req) });
    res.json({ success: true, acknowledged: count, newFeatureKeys: await getUnreviewedFeatureKeys() });
  } catch (error: any) {
    logger.error('Failed to acknowledge features', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi đánh dấu đã duyệt' });
  }
});

/**
 * POST /api/permissions/update  (Admin)
 * - { role, group?, featureKey, isAllowed }      → bật/tắt 1 ô Role hoặc Group
 * - { updates: [...] }                            → hàng loạt
 * - { action: 'clear_group_override', role, group, featureKey } → bỏ ghi đè 1 ô nhóm (quay về kế thừa Role)
 * - { action: 'reset_group', role, group }        → bỏ toàn bộ ghi đè của nhóm
 */
router.post('/update', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, group, featureKey, isAllowed, updates, action } = req.body;

    if (role && !VALID_ROLES.has(role)) {
      res.status(400).json({ error: `Role không hợp lệ: ${role}` });
      return;
    }

    if (action === 'clear_group_override' && role && group && featureKey) {
      const grp = String(group).trim();
      // Xóa đúng 1 ô ghi đè do Admin chủ động yêu cầu (không ảnh hưởng ô nào khác)
      await prisma.rolePermission.deleteMany({ where: { role: role as UserRole, group: grp, featureKey } });
      logger.info('Cleared group override cell', { role, group: grp, featureKey, updatedBy: reviewerOf(req) });
      await autoReview(req, [featureKey]);
      res.json({ success: true });
      return;
    }

    if (action === 'reset_group' && role && group) {
      const grp = String(group).trim();
      if (!grp) {
        res.status(400).json({ error: 'Thiếu tên nhóm' });
        return;
      }
      await prisma.rolePermission.deleteMany({ where: { role: role as UserRole, group: grp } });
      logger.info('Reset group permissions to role default', { role, group: grp, updatedBy: reviewerOf(req) });
      res.json({ success: true, message: `Đã khôi phục quyền nhóm ${grp} về mặc định của ${role}` });
      return;
    }

    if (updates && Array.isArray(updates)) {
      const valid = updates.filter((u: any) => u?.role && VALID_ROLES.has(u.role) && FEATURE_BY_KEY[u.featureKey]);
      await prisma.$transaction(valid.map((item: any) => {
        const grp = (item.group || '').trim();
        return prisma.rolePermission.upsert({
          where: { role_group_featureKey: { role: item.role as UserRole, group: grp, featureKey: item.featureKey } },
          update: { isAllowed: Boolean(item.isAllowed) },
          create: { role: item.role as UserRole, group: grp, featureKey: item.featureKey, isAllowed: Boolean(item.isAllowed) }
        });
      }));
      await autoReview(req, Array.from(new Set(valid.map((u: any) => u.featureKey))));
      logger.info('Bulk updated role/group permissions', { count: valid.length, updatedBy: reviewerOf(req) });
      res.json({ success: true, message: 'Cập nhật phân quyền hàng loạt thành công!' });
      return;
    }

    if (!role || !featureKey) {
      res.status(400).json({ error: 'Thiếu thông tin role hoặc featureKey' });
      return;
    }
    if (!FEATURE_BY_KEY[featureKey]) {
      res.status(400).json({ error: `Tính năng không tồn tại: ${featureKey}` });
      return;
    }

    const grp = (group || '').trim();
    const updated = await prisma.rolePermission.upsert({
      where: { role_group_featureKey: { role: role as UserRole, group: grp, featureKey } },
      update: { isAllowed: Boolean(isAllowed) },
      create: { role: role as UserRole, group: grp, featureKey, isAllowed: Boolean(isAllowed) }
    });
    await autoReview(req, [featureKey]);

    logger.info('Updated role/group permission', { role, group: grp, featureKey, isAllowed, updatedBy: reviewerOf(req) });
    res.json({ success: true, permission: updated });
  } catch (error: any) {
    logger.error('Failed to update permission', { error: error.message });
    res.status(500).json({ error: 'Lỗi máy chủ khi cập nhật phân quyền' });
  }
});

/**
 * POST /api/permissions/user-update  (Admin)
 * - { userId, featureKey, isAllowed }                     → tạo/đổi ghi đè cá nhân
 * - { action: 'clear_user_override', userId, featureKey } → bỏ ghi đè 1 ô (quay về kế thừa Role/Nhóm)
 * - { action: 'reset_user', userId }                      → bỏ toàn bộ ghi đè của user
 */
router.post('/user-update', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, featureKey, isAllowed, action } = req.body;

    if (action === 'clear_user_override' && userId && featureKey) {
      await prisma.userPermission.deleteMany({ where: { userId, featureKey } });
      logger.info('Cleared user override cell', { userId, featureKey, updatedBy: reviewerOf(req) });
      await autoReview(req, [featureKey]);
      res.json({ success: true });
      return;
    }

    if (action === 'reset_user' && userId) {
      await prisma.userPermission.deleteMany({ where: { userId } });
      logger.info('Reset user permissions to role default', { userId, updatedBy: reviewerOf(req) });
      res.json({ success: true, message: 'Đã xóa toàn bộ quyền riêng của user' });
      return;
    }

    if (!userId || !featureKey) {
      res.status(400).json({ error: 'Thiếu thông tin userId hoặc featureKey' });
      return;
    }
    if (!FEATURE_BY_KEY[featureKey]) {
      res.status(400).json({ error: `Tính năng không tồn tại: ${featureKey}` });
      return;
    }

    const updated = await prisma.userPermission.upsert({
      where: { userId_featureKey: { userId, featureKey } },
      update: { isAllowed: Boolean(isAllowed) },
      create: { userId, featureKey, isAllowed: Boolean(isAllowed) }
    });
    await autoReview(req, [featureKey]);

    logger.info('Updated user permission', { userId, featureKey, isAllowed, updatedBy: reviewerOf(req) });
    res.json({ success: true, permission: updated });
  } catch (error: any) {
    logger.error('Failed to update user permission', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi cập nhật quyền cá nhân' });
  }
});

/**
 * GET /api/permissions/users-search?q=xxx  (Admin)
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

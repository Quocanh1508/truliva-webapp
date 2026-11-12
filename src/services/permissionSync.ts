/**
 * ═══════════════════════════════════════════════════════════════════════
 *  Permission Auto-Sync — NON-DESTRUCTIVE
 * ═══════════════════════════════════════════════════════════════════════
 *  Đối chiếu danh mục tính năng trong code (src/config/permissions.ts) với DB.
 *
 *  BẤT BIẾN AN TOÀN (không bao giờ vi phạm):
 *   - Chỉ dùng CREATE TABLE IF NOT EXISTS và INSERT ... ON CONFLICT DO NOTHING
 *     (Prisma createMany + skipDuplicates). KHÔNG update/delete/upsert bất kỳ bản ghi
 *     role_permissions / user_permissions nào.
 *   - Key đã có cấu hình trong DB → giữ nguyên 100%.
 *   - Key chưa từng có trong DB → seed quyền Role-level theo defaultRoles
 *     (Admin luôn bật, trừ devOnly) và gắn cờ reviewedAt = null để Admin duyệt.
 *   - Key có trong DB nhưng đã bị xóa khỏi code → chỉ báo cáo (orphanKeys), không xóa.
 */
import { UserRole } from '@prisma/client';
import prisma from '../config/database';
import logger from '../utils/logger';
import {
  SYSTEM_FEATURES,
  SYSTEM_MODULES,
  SYSTEM_ROLES,
  ORIGINAL_RELEASE_TAG,
  getDefaultPermission
} from '../config/permissions';

export interface PermissionSyncReport {
  ranAt: string;
  bootstrap: boolean;
  catalogSize: number;
  /** Key lần đầu được ghi nhận vào registry trong lần sync này */
  newlyRegistered: string[];
  /** Key chưa từng có bản ghi nào trong role_permissions → đã seed quyền mặc định */
  seededKeys: string[];
  seededRoleRows: number;
  /** Key đang chờ Admin duyệt (badge MỚI) */
  unreviewedKeys: string[];
  /** Key có trong DB nhưng không còn trong code (không bị xóa, chỉ cảnh báo) */
  orphanKeys: string[];
  catalogWarnings: string[];
}

const VALID_ROLES = new Set<string>(Object.values(UserRole));

/** Kiểm tra tính hợp lệ của danh mục (key trùng, module lạ, role lạ) */
export function validateCatalog(): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const moduleIds = new Set(SYSTEM_MODULES.map(m => m.id));
  for (const role of SYSTEM_ROLES) {
    if (!VALID_ROLES.has(role.key)) warnings.push(`SYSTEM_ROLES chứa role không có trong enum UserRole: ${role.key}`);
  }
  for (const f of SYSTEM_FEATURES) {
    if (seen.has(f.key)) warnings.push(`Key bị trùng: ${f.key}`);
    seen.add(f.key);
    if (!/^[A-Z][A-Z0-9_]*$/.test(f.key)) warnings.push(`Key sai định dạng UPPER_SNAKE: ${f.key}`);
    if (!moduleIds.has(f.module)) warnings.push(`${f.key}: module "${f.module}" không có trong SYSTEM_MODULES`);
    for (const r of f.defaultRoles) {
      if (!VALID_ROLES.has(r)) warnings.push(`${f.key}: defaultRoles chứa role lạ "${r}"`);
    }
  }
  return warnings;
}

let tableEnsured = false;
async function ensureRegistryTable(): Promise<void> {
  if (tableEnsured) return;
  // Khớp chính xác DDL mà Prisma sinh cho model PermissionFeature → `prisma db push` sau này không thấy khác biệt.
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "permission_features" (
      "feature_key" TEXT NOT NULL,
      "first_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "reviewed_at" TIMESTAMP(3),
      "reviewed_by" TEXT,
      CONSTRAINT "permission_features_pkey" PRIMARY KEY ("feature_key")
    )
  `);
  tableEnsured = true;
}

let lastReport: PermissionSyncReport | null = null;
let inFlight: Promise<PermissionSyncReport> | null = null;

/**
 * Chạy đồng bộ (an toàn khi gọi nhiều lần / nhiều process song song).
 */
export function syncPermissionCatalog(): Promise<PermissionSyncReport> {
  if (!inFlight) {
    inFlight = runSync().finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Đảm bảo đã sync ít nhất 1 lần trong process này (dùng cho GET /api/permissions) */
export async function ensurePermissionCatalogSynced(): Promise<void> {
  if (lastReport) return;
  try {
    await syncPermissionCatalog();
  } catch (err: any) {
    logger.error('[PermissionSync] ensure sync failed', { error: err.message });
  }
}

async function runSync(): Promise<PermissionSyncReport> {
  await ensureRegistryTable();
  const catalogWarnings = validateCatalog();

  const [registry, configuredRows] = await Promise.all([
    prisma.permissionFeature.findMany({ select: { featureKey: true } }),
    prisma.rolePermission.findMany({ select: { featureKey: true }, distinct: ['featureKey'] })
  ]);
  const userKeyRows = await prisma.userPermission.findMany({ select: { featureKey: true }, distinct: ['featureKey'] });

  const bootstrap = registry.length === 0;
  const registered = new Set(registry.map(r => r.featureKey));
  // Key "đã tồn tại trong DB" = đã có ít nhất 1 bản ghi role/group (bất kỳ giá trị nào)
  const configuredKeys = new Set(configuredRows.map(r => r.featureKey));

  const toRegister = SYSTEM_FEATURES.filter(f => !registered.has(f.key));
  const seedKeys = toRegister.filter(f => !configuredKeys.has(f.key));

  const roleRowsToSeed = seedKeys.flatMap(f =>
    SYSTEM_ROLES.map(r => ({
      role: r.key as UserRole,
      group: '',
      featureKey: f.key,
      isAllowed: getDefaultPermission(r.key, f.key)
    }))
  );

  const now = new Date();
  const registryRows = toRegister.map(f => {
    // Đã được Admin cấu hình trước đó → coi như đã duyệt.
    // Lần bootstrap đầu tiên: tính năng gốc (v1.0) cũng coi như đã duyệt (giữ đúng hành vi cảnh báo cũ).
    const reviewed = configuredKeys.has(f.key) || (bootstrap && f.addedAt === ORIGINAL_RELEASE_TAG);
    return {
      featureKey: f.key,
      firstSyncedAt: now,
      reviewedAt: reviewed ? now : null,
      reviewedBy: reviewed ? (bootstrap ? 'system:bootstrap' : 'system:preconfigured') : null
    };
  });

  let seededRoleRows = 0;
  if (roleRowsToSeed.length || registryRows.length) {
    const [seeded] = await prisma.$transaction([
      // INSERT ... ON CONFLICT DO NOTHING — tuyệt đối không ghi đè bản ghi đã có
      prisma.rolePermission.createMany({ data: roleRowsToSeed, skipDuplicates: true }),
      prisma.permissionFeature.createMany({ data: registryRows, skipDuplicates: true })
    ]);
    seededRoleRows = seeded.count;
  }

  const catalogKeys = new Set(SYSTEM_FEATURES.map(f => f.key));
  const dbKeys = new Set([...configuredKeys, ...registered, ...userKeyRows.map(r => r.featureKey)]);
  const orphanKeys = [...dbKeys].filter(k => !catalogKeys.has(k)).sort();

  const unreviewedKeys = await getUnreviewedFeatureKeys();

  const report: PermissionSyncReport = {
    ranAt: now.toISOString(),
    bootstrap,
    catalogSize: SYSTEM_FEATURES.length,
    newlyRegistered: toRegister.map(f => f.key),
    seededKeys: seedKeys.map(f => f.key),
    seededRoleRows,
    unreviewedKeys,
    orphanKeys,
    catalogWarnings
  };
  lastReport = report;

  if (report.newlyRegistered.length || orphanKeys.length || catalogWarnings.length) {
    logger.info('[PermissionSync] Đồng bộ danh mục phân quyền', {
      bootstrap,
      newlyRegistered: report.newlyRegistered,
      seededKeys: report.seededKeys,
      seededRoleRows,
      unreviewedKeys,
      orphanKeys,
      catalogWarnings
    });
  }
  return report;
}

/** Danh sách key trong catalog đang chờ Admin duyệt */
export async function getUnreviewedFeatureKeys(): Promise<string[]> {
  await ensureRegistryTable();
  const rows = await prisma.permissionFeature.findMany({
    where: { reviewedAt: null },
    select: { featureKey: true }
  });
  const catalogKeys = new Set(SYSTEM_FEATURES.map(f => f.key));
  return rows.map(r => r.featureKey).filter(k => catalogKeys.has(k));
}

/**
 * Đánh dấu đã duyệt (chỉ cập nhật bảng registry permission_features, KHÔNG chạm vào quyền).
 */
export async function markFeaturesReviewed(featureKeys: string[], reviewedBy: string): Promise<number> {
  if (!featureKeys.length) return 0;
  await ensureRegistryTable();
  const result = await prisma.permissionFeature.updateMany({
    where: { featureKey: { in: featureKeys }, reviewedAt: null },
    data: { reviewedAt: new Date(), reviewedBy }
  });
  return result.count;
}

export function getLastPermissionSyncReport(): PermissionSyncReport | null {
  return lastReport;
}

/**
 * ComboService — Dynamic Combo Management
 * 
 * Thay thế KNOWN_COMBO_DEFINITIONS hardcoded bằng hệ thống combo động từ Database.
 * 
 * Cơ chế:
 * 1. Khi server khởi động → load toàn bộ combos từ DB vào bộ nhớ (in-memory cache)
 * 2. getComboComponents() / getComboMappingsForInventory() đọc từ cache (< 1ms)
 * 3. Khi Admin CRUD combo → invalidateCache() → reload từ DB
 * 4. Nếu DB chưa có data (chưa seed) → tự động fallback về hardcoded definitions gốc
 */

import prisma from '../config/database';
import logger from '../utils/logger';

// ── Types (giữ nguyên signature cũ để backward compatible) ──
export interface ComboComponent {
  name: string;
  sku?: string;
  quantity: number;
}

export interface ComboDefinition {
  displayName: string;
  keywords: string[];
  components: ComboComponent[];
}

// ── Hardcoded fallback (giữ lại để đảm bảo zero-downtime khi migration) ──
const FALLBACK_COMBO_DEFINITIONS: Record<string, ComboDefinition> = {
  'W6412-ECO': {
    displayName: 'Gói Giải pháp W6412 ECO',
    keywords: ['w6412', 'eco'],
    components: [
      { name: 'Máy lọc nước Truliva UR3626', sku: '104338-0002', quantity: 1 },
      { name: 'Máy nóng lạnh treo tường Truliva W6412', sku: '103057-001', quantity: 1 }
    ]
  },
  'W6412-GOLD': {
    displayName: 'Gói Giải pháp W6412 GOLD',
    keywords: ['w6412', 'gold'],
    components: [
      { name: 'Máy lọc nước Truliva UR3626', sku: '104338-0002', quantity: 1 },
      { name: 'Máy nóng lạnh treo tường Truliva W6412', sku: '103057-001', quantity: 1 }
    ]
  },
  'W6412-PLATINUM': {
    displayName: 'Gói Giải pháp W6412 PLATINUM',
    keywords: ['w6412', 'platinum'],
    components: [
      { name: 'Máy lọc nước Truliva UR3626', sku: '104338-0002', quantity: 1 },
      { name: 'Máy nóng lạnh treo tường Truliva W6412', sku: '103057-001', quantity: 1 }
    ]
  },
  'COMBO-5676-GOLD': {
    displayName: 'Combo Lõi lọc UR5676/5640/5440',
    keywords: ['combo', '5676'],
    components: [
      { name: 'Lõi lọc PGP Truliva UR5676/UR5640/UR5440', quantity: 1 },
      { name: 'Lõi lọc CTO Truliva UR5676/UR5640/UR5440', quantity: 1 }
    ]
  },
  'COMBO-5840-2LOI': {
    displayName: 'Combo Lõi lọc UR5840 (2 Lõi)',
    keywords: ['combo', '5840'],
    components: [
      { name: 'Lõi lọc PGP Truliva UR5840', quantity: 1 },
      { name: 'Lõi lọc CTO Truliva UR5840', quantity: 1 }
    ]
  },
  'COMBO-5840-3LOI': {
    displayName: 'Combo Lõi lọc UR5840 (3 Lõi)',
    keywords: ['combo', '5840', '3 lõi', 'ro'],
    components: [
      { name: 'Lõi lọc PGP Truliva UR5840', quantity: 1 },
      { name: 'Lõi lọc CTO Truliva UR5840', quantity: 1 },
      { name: 'Lõi lọc RO Truliva UR5840', quantity: 1 }
    ]
  }
};

// ── In-Memory Cache ──
let comboCache: Record<string, ComboDefinition> = {};
let cacheInitialized = false;

/**
 * Khởi tạo cache combo từ Database.
 * Nếu DB chưa có data → fallback sang hardcoded.
 */
export async function initializeComboCache(): Promise<void> {
  try {
    const combos = await prisma.productCombo.findMany({
      where: { isActive: true },
      include: {
        components: {
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { sortOrder: 'asc' }
    });

    if (combos.length === 0) {
      // DB chưa có data → fallback sang hardcoded
      logger.warn('[ComboService] No combos found in DB, falling back to hardcoded definitions');
      comboCache = { ...FALLBACK_COMBO_DEFINITIONS };
      cacheInitialized = true;
      return;
    }

    const newCache: Record<string, ComboDefinition> = {};
    for (const combo of combos) {
      newCache[combo.comboKey] = {
        displayName: combo.displayName,
        keywords: combo.keywords || [],
        components: combo.components.map(c => ({
          name: c.componentName,
          sku: c.componentSku || undefined,
          quantity: c.quantity
        }))
      };
    }

    comboCache = newCache;
    cacheInitialized = true;
    logger.info(`[ComboService] Loaded ${combos.length} combo definitions from DB`);
  } catch (error: any) {
    logger.error('[ComboService] Failed to load combos from DB, using fallback', { error: error.message });
    comboCache = { ...FALLBACK_COMBO_DEFINITIONS };
    cacheInitialized = true;
  }
}

/**
 * Invalidate cache → reload từ DB.
 * Gọi khi Admin tạo/sửa/xóa combo.
 */
export async function invalidateComboCache(): Promise<void> {
  await initializeComboCache();
}

/**
 * Đảm bảo cache đã được khởi tạo.
 */
function ensureCache(): Record<string, ComboDefinition> {
  if (!cacheInitialized) {
    // Nếu chưa init (edge case), trả fallback
    return FALLBACK_COMBO_DEFINITIONS;
  }
  return comboCache;
}

// ═══════════════════════════════════════════════════════
// PUBLIC API — Giữ nguyên signature cũ 100%
// ═══════════════════════════════════════════════════════

/**
 * Tìm components của 1 sản phẩm combo dựa trên tên sản phẩm hoặc SKU.
 * Giữ nguyên signature: getComboComponents(productName, sku?) → ComboComponent[] | null
 * 
 * Logic matching ưu tiên:
 * 1. Exact SKU match → trả components ngay
 * 2. Keyword matching → duyệt tất cả combos, tìm combo có TẤT CẢ keywords khớp
 *    (combo nhiều keywords hơn được ưu tiên → "COMBO-5840-3LOI" match trước "COMBO-5840-2LOI")
 */
export function getComboComponents(productName: string, sku?: string | null): ComboComponent[] | null {
  const cache = ensureCache();

  // 1. Exact SKU match
  const cleanSku = (sku || '').trim().toUpperCase();
  if (cleanSku && cache[cleanSku]) {
    return cache[cleanSku].components;
  }

  const cleanName = (productName || '').toLowerCase().trim();
  if (!cleanName) return null;

  // 2. Keyword matching — tìm combo khớp NHIỀU keywords nhất (most specific match)
  let bestMatch: ComboDefinition | null = null;
  let bestMatchCount = 0;

  for (const [, def] of Object.entries(cache)) {
    if (!def.keywords || def.keywords.length === 0) continue;

    const allMatch = def.keywords.every(kw => cleanName.includes(kw.toLowerCase()));
    if (allMatch && def.keywords.length > bestMatchCount) {
      bestMatch = def;
      bestMatchCount = def.keywords.length;
    }
  }

  if (bestMatch) {
    return bestMatch.components;
  }

  // 3. Không phải combo → null
  return null;
}

/**
 * Trả danh sách combo mappings cho Inventory UI grouping.
 * Giữ nguyên signature cũ.
 */
export function getComboMappingsForInventory(): Array<{ comboKey: string; comboName: string; components: ComboComponent[] }> {
  const cache = ensureCache();
  return Object.entries(cache).map(([key, def]) => ({
    comboKey: key,
    comboName: def.displayName,
    components: def.components
  }));
}

/**
 * Trả toàn bộ combo definitions (cho CRUD API).
 */
export async function getAllCombos() {
  return prisma.productCombo.findMany({
    include: {
      components: {
        orderBy: { sortOrder: 'asc' }
      }
    },
    orderBy: { sortOrder: 'asc' }
  });
}

/**
 * Tạo combo mới.
 */
export async function createCombo(data: {
  comboKey: string;
  displayName: string;
  keywords: string[];
  components: Array<{ componentName: string; componentSku?: string; quantity: number }>;
}) {
  const combo = await prisma.productCombo.create({
    data: {
      comboKey: data.comboKey.trim().toUpperCase(),
      displayName: data.displayName.trim(),
      keywords: data.keywords.map(k => k.toLowerCase().trim()),
      components: {
        create: data.components.map((c, idx) => ({
          componentName: c.componentName.trim(),
          componentSku: c.componentSku?.trim() || null,
          quantity: c.quantity || 1,
          sortOrder: idx
        }))
      }
    },
    include: { components: true }
  });

  await invalidateComboCache();
  return combo;
}

/**
 * Cập nhật combo.
 */
export async function updateCombo(id: string, data: {
  comboKey?: string;
  displayName?: string;
  keywords?: string[];
  isActive?: boolean;
  components?: Array<{ componentName: string; componentSku?: string; quantity: number }>;
}) {
  const updateData: any = {};
  if (data.comboKey !== undefined) updateData.comboKey = data.comboKey.trim().toUpperCase();
  if (data.displayName !== undefined) updateData.displayName = data.displayName.trim();
  if (data.keywords !== undefined) updateData.keywords = data.keywords.map(k => k.toLowerCase().trim());
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  // Nếu có components mới → xóa cũ, tạo mới (replace strategy)
  if (data.components) {
    await prisma.productComboComponent.deleteMany({ where: { comboId: id } });
    updateData.components = {
      create: data.components.map((c, idx) => ({
        componentName: c.componentName.trim(),
        componentSku: c.componentSku?.trim() || null,
        quantity: c.quantity || 1,
        sortOrder: idx
      }))
    };
  }

  const combo = await prisma.productCombo.update({
    where: { id },
    data: updateData,
    include: { components: { orderBy: { sortOrder: 'asc' } } }
  });

  await invalidateComboCache();
  return combo;
}

/**
 * Xóa combo.
 */
export async function deleteCombo(id: string) {
  await prisma.productCombo.delete({ where: { id } });
  await invalidateComboCache();
}

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
      { name: 'Máy lọc nước Truliva UR5676', sku: '104222-0002', quantity: 1 },
      { name: 'Máy nóng lạnh treo tường Truliva W6412', sku: '103057-001', quantity: 1 }
    ]
  },
  'W6412-PLATINUM': {
    displayName: 'Gói Giải pháp W6412 PLATINUM',
    keywords: ['w6412', 'platinum'],
    components: [
      { name: 'Máy lọc nước Truliva UR5840', sku: '104201-0003', quantity: 1 },
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
 * Làm sạch danh sách sản phẩm trước khi gửi sang Pancake POS hoặc lưu trữ:
 * 1. Nhận diện các sản phẩm Combo cha (dựa vào is_composite === true, có mảng components, hoặc khớp getComboComponents).
 * 2. Thu thập danh sách các linh kiện con (tên và SKU) của các combo cha đó.
 * 3. Loại bỏ mảng `components` đính kèm bên trong combo cha (strip components property) để tránh Pancake POS tự nhân đôi.
 * 4. Lọc bỏ các dòng sản phẩm con sinh ra từ combo (có giá 0đ hoặc tên/SKU nằm trong activeComboComponents hoặc có composite_item_id).
 * 5. Giữ nguyên 100% các sản phẩm đơn lẻ thông thường hoặc quà tặng độc lập.
 */
export function sanitizeItemsForPancake<T extends Record<string, any>>(items: T[]): T[] {
  if (!items || !Array.isArray(items) || items.length === 0) return [];

  const activeComboComponentNames = new Set<string>();
  const activeComboComponentSkus = new Set<string>();

  // Bước 1: Quét tất cả combo cha trong danh sách
  for (const it of items) {
    const raw = (it as any).rawData || it;
    const name = (it as any).productName || (it as any).name || raw?.variation_info?.name || raw?.name || '';
    const sku = (it as any).sku || (it as any).product_sku || raw?.variation_info?.display_id || raw?.sku || '';

    // Lấy components từ database/cache combo service
    const defComps = getComboComponents(name, sku);
    if (defComps && defComps.length > 0) {
      defComps.forEach(c => {
        if (c.name) activeComboComponentNames.add(c.name.trim().toLowerCase());
        if (c.sku) activeComboComponentSkus.add(c.sku.trim().toLowerCase());
      });
    }

    // Lấy components từ rawData nếu có (từ webhook/API Pancake)
    const rawComps = raw?.components || (it as any).components;
    if (Array.isArray(rawComps) && rawComps.length > 0) {
      rawComps.forEach((c: any) => {
        const cName = c.variation_info?.name || c.name || '';
        const cSku = c.variation_info?.display_id || c.variation_info?.id || c.sku || '';
        if (cName) activeComboComponentNames.add(cName.trim().toLowerCase());
        if (cSku) activeComboComponentSkus.add(cSku.trim().toLowerCase());
      });
    }
  }

  // Bước 2: Lọc và làm sạch từng phần tử
  const result: T[] = [];
  for (const it of items) {
    const raw = (it as any).rawData || it;
    const name = (it as any).productName || (it as any).name || raw?.variation_info?.name || raw?.name || '';
    const sku = (it as any).sku || (it as any).product_sku || raw?.variation_info?.display_id || raw?.sku || '';
    const cleanName = name.trim().toLowerCase();
    const cleanSku = sku.trim().toLowerCase();

    const isCombo = Boolean(
      (it as any).is_composite ||
      raw?.is_composite ||
      getComboComponents(name, sku) ||
      (Array.isArray((it as any).components) && (it as any).components.length > 0) ||
      (Array.isArray(raw?.components) && raw.components.length > 0)
    );

    if (isCombo) {
      // Là combo cha: Strip mảng components ra khỏi object trước khi gửi sang Pancake
      const clone = { ...it };
      delete (clone as any).components;
      delete (clone as any).composite_products;
      if ((clone as any).rawData && typeof (clone as any).rawData === 'object') {
        const rawClone = { ...(clone as any).rawData };
        delete rawClone.components;
        delete rawClone.composite_products;
        (clone as any).rawData = rawClone;
      }
      result.push(clone);
    } else {
      // Không phải combo cha: Kiểm tra xem có phải là sản phẩm con thuộc combo không
      const isChildComponent = activeComboComponentNames.has(cleanName) || (cleanSku && activeComboComponentSkus.has(cleanSku));
      const isZeroPrice = Number((it as any).price ?? (it as any).retail_price ?? raw?.retail_price ?? raw?.price ?? 0) === 0;

      // Nếu là sản phẩm con thuộc combo (hoặc sản phẩm con giá 0đ phát sinh từ combo), loại bỏ
      if (isChildComponent && (isZeroPrice || (it as any).composite_item_id || raw?.composite_item_id)) {
        continue;
      }
      result.push(it);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════
// CHỐT CHẶN CUỐI: Lọc dòng sản phẩm con của Combo trong payload `products` gửi Pancake
// ═══════════════════════════════════════════════════════

export interface PancakeProductLine {
  variation_id: string | number | null;
  quantity: number;
  price?: number;
  [key: string]: any;
}

interface CompositeChildSpec {
  variationId?: string;
  name?: string;
  sku?: string;
  quantity: number;
}

const norm = (v: any): string => (v === undefined || v === null ? '' : String(v).trim().toLowerCase());

/** Đọc danh sách sản phẩm con từ rawData variation Pancake (hỗ trợ nhiều tên trường). */
function readCompositeChildrenFromRaw(raw: any): CompositeChildSpec[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = raw.composite_products || raw.components || raw.composite_variations || raw.product_composites;
  if (!Array.isArray(list)) return [];
  return list.map((c: any) => ({
    variationId: norm(c?.variation_id ?? c?.variation_info?.id ?? c?.variation?.id) || undefined,
    name: norm(c?.variation_info?.name ?? c?.name ?? c?.product?.name) || undefined,
    sku: norm(c?.variation_info?.display_id ?? c?.display_id ?? c?.sku) || undefined,
    quantity: Number(c?.quantity) || 1
  }));
}

/**
 * Lọc payload `products` cuối cùng trước khi PATCH sang Pancake POS.
 *
 * Pancake tự bung (auto-expand) sản phẩm con khi nhận 1 dòng Combo (`is_composite`).
 * Nếu payload chứa cả dòng Combo cha lẫn các dòng máy con → đơn bị nhân đôi máy con.
 *
 * Nhận diện Combo cha dựa vào dữ liệu catalog Pancake (Product.rawData: is_composite /
 * composite_products) và bảng Combo nội bộ (getComboComponents), KHÔNG phụ thuộc giá 0đ
 * hay `composite_item_id` (dữ liệu báo cáo KTV/đơn đã lưu không có các trường này).
 *
 * Với mỗi Combo cha, trừ đi đúng số lượng máy con mà Pancake sẽ tự bung
 * (qty combo × qty linh kiện). Phần dư (khách mua thêm lẻ / quà tặng độc lập) được giữ nguyên.
 */
export async function stripComboChildLinesFromPancakePayload<T extends PancakeProductLine>(lines: T[]): Promise<T[]> {
  if (!Array.isArray(lines) || lines.length === 0) return lines || [];

  const ids = Array.from(new Set(lines.map(l => String(l.variation_id ?? '')).filter(Boolean)));
  let products: Array<{ pancakeProductId: string | null; name: string; sku: string | null; rawData: any }> = [];
  try {
    products = await prisma.product.findMany({
      where: { pancakeProductId: { in: ids } },
      select: { pancakeProductId: true, name: true, sku: true, rawData: true }
    });
  } catch (err: any) {
    logger.warn('[ComboService] Không tải được catalog sản phẩm để lọc combo, dùng bảng combo nội bộ', { error: err.message });
  }
  const byId = new Map(products.map(p => [String(p.pancakeProductId), p]));

  const describe = (line: T) => {
    const p = byId.get(String(line.variation_id));
    const raw: any = p?.rawData || {};
    return {
      id: norm(line.variation_id),
      name: norm(p?.name ?? raw?.name ?? raw?.product?.name),
      sku: norm(p?.sku ?? raw?.display_id),
      raw
    };
  };

  // Bước 1: Xác định các dòng Combo cha và ngân sách số lượng máy con Pancake sẽ tự bung
  const budget: Array<CompositeChildSpec & { remaining: number }> = [];
  const parentIdx = new Set<number>();

  lines.forEach((line, idx) => {
    const d = describe(line);
    let children = readCompositeChildrenFromRaw(d.raw);
    if (children.length === 0) {
      const defComps = getComboComponents(d.name, d.sku);
      if (defComps && defComps.length > 0) {
        children = defComps.map(c => ({ name: norm(c.name) || undefined, sku: norm(c.sku) || undefined, quantity: Number(c.quantity) || 1 }));
      }
    }
    const isParent = d.raw?.is_composite === true || children.length > 0;
    if (!isParent) return;

    parentIdx.add(idx);
    const parentQty = Number(line.quantity) || 1;
    for (const c of children) {
      budget.push({ ...c, remaining: c.quantity * parentQty });
    }
  });

  if (parentIdx.size === 0 || budget.length === 0) return lines;

  // Bước 2: Trừ số lượng các dòng máy con tương ứng
  const result: T[] = [];
  const stripped: Array<{ variation_id: any; quantity: number }> = [];

  lines.forEach((line, idx) => {
    if (parentIdx.has(idx)) {
      result.push(line);
      return;
    }
    const d = describe(line);
    let qty = Number(line.quantity) || 0;

    for (const spec of budget) {
      if (qty <= 0) break;
      if (spec.remaining <= 0) continue;
      const matches =
        (spec.variationId && d.id && spec.variationId === d.id) ||
        (spec.sku && d.sku && spec.sku === d.sku) ||
        (spec.name && d.name && spec.name === d.name);
      if (!matches) continue;
      const take = Math.min(spec.remaining, qty);
      spec.remaining -= take;
      qty -= take;
    }

    const removed = (Number(line.quantity) || 0) - qty;
    if (removed > 0) stripped.push({ variation_id: line.variation_id, quantity: removed });
    if (qty > 0) result.push(qty === line.quantity ? line : { ...line, quantity: qty });
  });

  if (stripped.length > 0) {
    logger.info('[ComboService] Stripped combo child lines from Pancake payload (Pancake auto-expands combos)', { stripped });
  }

  return result;
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

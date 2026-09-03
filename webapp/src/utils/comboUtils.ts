/**
 * Utility for Dynamic Product Combo management on the Frontend.
 * Loads combo definitions from /api/combos, with fallback for instant initial render.
 */

import { fetchApi } from '../api/client';

export interface ComboComponent {
  name: string;
  sku?: string;
  quantity: number;
}

export interface ComboDefinition {
  comboKey: string;
  displayName: string;
  keywords: string[];
  components: ComboComponent[];
}

// Fallback initial definitions
const FALLBACK_COMBOS: Record<string, { displayName: string; keywords: string[]; components: ComboComponent[] }> = {
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

let dynamicCombos: Record<string, { displayName: string; keywords: string[]; components: ComboComponent[] }> = { ...FALLBACK_COMBOS };
let isLoadingCombos = false;
let isLoaded = false;

/**
 * Fetch dynamic combos from server
 */
export async function loadDynamicCombos(forceReload = false): Promise<void> {
  if ((isLoaded && !forceReload) || isLoadingCombos) return;
  isLoadingCombos = true;
  try {
    const res = await fetchApi('/combos');
    if (res && Array.isArray(res.combos) && res.combos.length > 0) {
      const newMap: Record<string, { displayName: string; keywords: string[]; components: ComboComponent[] }> = {};
      for (const item of res.combos) {
        if (!item.isActive && item.isActive !== undefined) continue;
        newMap[item.comboKey] = {
          displayName: item.displayName,
          keywords: item.keywords || [],
          components: (item.components || []).map((c: any) => ({
            name: c.componentName || c.name,
            sku: c.componentSku || c.sku || undefined,
            quantity: c.quantity || 1
          }))
        };
      }
      dynamicCombos = newMap;
      isLoaded = true;
    }
  } catch (err) {
    console.warn('[comboUtils] Failed to fetch dynamic combos, using fallback', err);
  } finally {
    isLoadingCombos = false;
  }
}

/**
 * Get components for a combo product by name or SKU
 */
export function getComboComponents(productName: string, sku?: string | null): ComboComponent[] | null {
  const cleanSku = (sku || '').trim().toUpperCase();
  if (cleanSku && dynamicCombos[cleanSku]) {
    return dynamicCombos[cleanSku].components;
  }

  const cleanName = (productName || '').toLowerCase().trim();
  if (!cleanName) return null;

  let bestMatch: { displayName: string; keywords: string[]; components: ComboComponent[] } | null = null;
  let bestMatchCount = 0;

  for (const [, def] of Object.entries(dynamicCombos)) {
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

  return null;
}

// Auto-trigger loading on bundle execution
loadDynamicCombos();

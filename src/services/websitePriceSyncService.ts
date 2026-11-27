import axios from 'axios';
import defaultPrisma from '../config/database';
import logger from '../utils/logger';

export interface WebsiteSyncChange {
  sku: string;
  name: string;
  oldPrice: number;
  newPrice: number;
  oldOriginalPrice: number | null;
  newOriginalPrice: number | null;
}

export interface WebsiteSyncSummary {
  syncedAt: string;
  totalChecked: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  changes: WebsiteSyncChange[];
  errors: Array<{ sku: string; error: string }>;
}

const ALLOWED_WEBSITE_HOSTS = new Set(['trulivavietnam.com', 'www.trulivavietnam.com']);

/**
 * Chỉ cho phép URL HTTPS hợp lệ thuộc website chính thức trulivavietnam.com/products/... (chống SSRF).
 */
export function isSafeTrulivaWebsiteProductUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (!ALLOWED_WEBSITE_HOSTS.has(host)) return false;
    return parsed.pathname.startsWith('/products/') && parsed.pathname.length > '/products/'.length;
  } catch {
    return false;
  }
}

/**
 * Chuẩn hóa URL sản phẩm Haravan sang endpoint `.json`.
 */
export function buildHaravanJsonUrl(productUrl: string): string {
  const parsed = new URL(productUrl.trim());
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  const jsonPath = cleanPath.endsWith('.json') ? cleanPath : `${cleanPath}.json`;
  return `${parsed.origin}${jsonPath}`;
}

/**
 * Bóc tách giá bán ưu đãi & giá niêm yết gốc từ JSON Haravan (`/products/<handle>.json`).
 */
export function parseHaravanPricing(
  payload: any
): { price: number; originalPrice: number | null } | null {
  const variants = Array.isArray(payload?.product?.variants) ? payload.product.variants : [];
  if (variants.length === 0) return null;

  const validVariants = variants
    .map((v: any) => ({
      price: Math.round(Number(v?.price)),
      compareAt: Math.round(Number(v?.compare_at_price || 0)),
      available: v?.available !== false,
    }))
    .filter((v: any) => Number.isFinite(v.price) && v.price >= 10000);

  if (validVariants.length === 0) return null;

  const availablePool = validVariants.filter((v: any) => v.available);
  const chosen = (availablePool.length > 0 ? availablePool : validVariants)[0];

  const originalPrice =
    Number.isFinite(chosen.compareAt) && chosen.compareAt > chosen.price
      ? chosen.compareAt
      : null;

  return {
    price: chosen.price,
    originalPrice,
  };
}

/**
 * Đồng bộ giá bán thực tế & giá niêm yết từ trulivavietnam.com vào bảng ShopProduct.
 */
export async function syncShopPricesFromWebsite(deps?: {
  prisma?: typeof defaultPrisma;
  httpGet?: typeof axios.get;
}): Promise<WebsiteSyncSummary> {
  const prismaClient = deps?.prisma || defaultPrisma;
  const httpGet = deps?.httpGet || axios.get;

  const shopProducts = await prismaClient.shopProduct.findMany({
    where: { isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      originalPrice: true,
      specifications: true,
    },
  });

  const targets = shopProducts.filter((sp: any) => {
    const url = sp?.specifications?.productUrl;
    return typeof url === 'string' && isSafeTrulivaWebsiteProductUrl(url);
  });

  let updatedCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;
  const changes: WebsiteSyncChange[] = [];
  const errors: Array<{ sku: string; error: string }> = [];

  const batchSize = 4;
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (sp: any) => {
        const rawUrl = String(sp.specifications.productUrl);
        try {
          const jsonUrl = buildHaravanJsonUrl(rawUrl);
          const response = await httpGet(jsonUrl, {
            timeout: 10000,
            maxRedirects: 3,
            headers: {
              'User-Agent': 'TrulivaSyncBot/1.0',
              Accept: 'application/json',
            },
          });

          const parsed = parseHaravanPricing(response.data);
          if (!parsed) {
            failedCount += 1;
            errors.push({ sku: sp.sku, error: 'Không đọc được giá hợp lệ từ JSON website' });
            return;
          }

          const currentPrice = Number(sp.price || 0);
          const currentOriginal = sp.originalPrice != null ? Number(sp.originalPrice) : null;

          if (parsed.price === currentPrice && parsed.originalPrice === currentOriginal) {
            unchangedCount += 1;
            return;
          }

          await prismaClient.shopProduct.update({
            where: { id: sp.id },
            data: {
              price: parsed.price,
              originalPrice: parsed.originalPrice,
            },
          });

          updatedCount += 1;
          changes.push({
            sku: sp.sku,
            name: sp.name,
            oldPrice: currentPrice,
            newPrice: parsed.price,
            oldOriginalPrice: currentOriginal,
            newOriginalPrice: parsed.originalPrice,
          });
        } catch (err: any) {
          failedCount += 1;
          errors.push({
            sku: sp.sku,
            error: err?.message || 'Lỗi kết nối website trulivavietnam.com',
          });
        }
      })
    );
  }

  const summary: WebsiteSyncSummary = {
    syncedAt: new Date().toISOString(),
    totalChecked: targets.length,
    updatedCount,
    unchangedCount,
    failedCount,
    changes,
    errors,
  };

  logger.info('[WebsitePriceSync] Completed sync from trulivavietnam.com', {
    totalChecked: summary.totalChecked,
    updatedCount: summary.updatedCount,
    unchangedCount: summary.unchangedCount,
    failedCount: summary.failedCount,
  });

  return summary;
}

let isSyncRunning = false;
let syncTimer: NodeJS.Timeout | null = null;

/**
 * Khởi động lịch tự động đồng bộ giá website trulivavietnam.com định kỳ.
 */
export function startWebsitePriceSyncScheduler(intervalHours = 6): void {
  if (syncTimer) return;

  const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;
  const runSafe = async () => {
    if (isSyncRunning) return;
    isSyncRunning = true;
    try {
      await syncShopPricesFromWebsite();
    } catch (err: any) {
      logger.warn('[WebsitePriceSync] Scheduled sync error', { error: err?.message });
    } finally {
      isSyncRunning = false;
    }
  };

  syncTimer = setInterval(runSafe, intervalMs);
  syncTimer.unref();
  logger.info(`[WebsitePriceSync] Scheduler started (every ${intervalHours}h)`);
}

import defaultPrisma from '../../../config/database';
import { extractModelCodes } from '../memoryManager';

export interface CatalogLookupOutput {
  catalogText: string;
  productCount: number;
  shopProductCount: number;
  comboCount: number;
}

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} đ`;
}

function cleanShortDesc(raw: string | null | undefined, maxLen = 180): string {
  if (!raw || typeof raw !== 'string') return '';
  const singleLine = raw.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, maxLen).trim()}...`;
}

/**
 * Tra cứu đồng bộ ShopProduct (Website/Shop giá ưu đãi) + Product (POS/Linh kiện) + ProductCombo.
 */
export async function lookupCatalog(
  params: { models: string[]; syncCatalog: boolean },
  deps?: { prisma?: typeof defaultPrisma }
): Promise<CatalogLookupOutput> {
  if (!params.syncCatalog) {
    return { catalogText: '', productCount: 0, shopProductCount: 0, comboCount: 0 };
  }

  const prismaClient = deps?.prisma || defaultPrisma;
  const models = Array.from(new Set((params.models || []).filter((m) => m.length >= 3)));

  // 1. Ưu tiên đọc bảng ShopProduct (chứa giá ưu đãi hiện tại từ Website/Shop, giá niêm yết gốc & chính sách)
  let shopProducts: any[] = [];
  if (typeof prismaClient.shopProduct?.findMany === 'function') {
    if (models.length > 0) {
      const orConds = models.flatMap((m) => [
        { name: { contains: m, mode: 'insensitive' as const } },
        { sku: { contains: m, mode: 'insensitive' as const } },
      ]);
      shopProducts = await prismaClient.shopProduct.findMany({
        where: {
          isActive: true,
          OR: orConds,
        },
        select: {
          name: true,
          sku: true,
          category: true,
          price: true,
          originalPrice: true,
          warrantyMonths: true,
          shortDesc: true,
        },
        orderBy: { sortOrder: 'asc' },
        take: 20,
      });
    } else {
      shopProducts = await prismaClient.shopProduct.findMany({
        where: {
          isActive: true,
          OR: [
            { category: 'MAY_LOC_NUOC' },
            { name: { startsWith: 'Máy' } },
          ],
        },
        select: {
          name: true,
          sku: true,
          category: true,
          price: true,
          originalPrice: true,
          warrantyMonths: true,
          shortDesc: true,
        },
        orderBy: { sortOrder: 'asc' },
        take: 10,
      });
    }
  }

  // Đưa máy lọc nước chính lên đầu, lõi lọc xuống sau
  shopProducts.sort((a, b) => {
    const aIsFilter = String(a?.name || '').toLowerCase().startsWith('lõi') ? 1 : 0;
    const bIsFilter = String(b?.name || '').toLowerCase().startsWith('lõi') ? 1 : 0;
    return aIsFilter - bIsFilter;
  });

  const coveredMainModels = new Set<string>();
  const catalogLines: string[] = [];

  if (shopProducts.length > 0) {
    catalogLines.push('1. BẢNG GIÁ BÁN ƯU ĐÃI CHÍNH THỨC (WEBSITE TRULIVA & ZALO SHOP - ƯU TIÊN BÁO GIÁ NÀY):');
    for (const sp of shopProducts) {
      const nameStr = String(sp?.name || '');
      const isFilter = nameStr.toLowerCase().startsWith('lõi');
      if (!isFilter) {
        for (const m of extractModelCodes(`${nameStr} ${sp?.sku || ''}`)) {
          coveredMainModels.add(m);
        }
      }

      const salePrice = Number(sp?.price || 0);
      const origPrice = sp?.originalPrice != null ? Number(sp.originalPrice) : null;
      const warranty = Number(sp?.warrantyMonths || 12);

      let priceInfo: string;
      if (origPrice && origPrice > salePrice && salePrice > 0) {
        const savings = origPrice - salePrice;
        const discountPct = Math.round((savings / origPrice) * 100);
        priceInfo = `Giá ưu đãi hiện tại: ${formatVnd(salePrice)} (Giá niêm yết gốc: ${formatVnd(origPrice)}, giảm ${discountPct}%, tiết kiệm ${formatVnd(savings)})`;
      } else {
        priceInfo = `Giá bán chính thức: ${salePrice > 0 ? formatVnd(salePrice) : 'Liên hệ'}`;
      }

      let extraInfo = ` | Bảo hành chính hãng: ${warranty} tháng`;
      if (!isFilter) {
        extraInfo += ' | Ưu đãi kèm theo: Lắp đặt 0 đồng, giao hàng toàn quốc, hỗ trợ trả góp 0% lãi suất';
      }
      const desc = cleanShortDesc(sp?.shortDesc);
      if (desc) {
        extraInfo += ` | Điểm nổi bật: ${desc}`;
      }

      catalogLines.push(`- ${nameStr} (SKU: ${sp.sku}) | ${priceInfo}${extraInfo}`);
    }
  }

  // 2. Tra cứu bảng Product (POS / linh kiện thay thế)
  let products: any[] = [];
  if (models.length > 0) {
    const orConds = models.flatMap((m) => [
      { name: { contains: m, mode: 'insensitive' as const } },
      { sku: { contains: m, mode: 'insensitive' as const } },
    ]);
    products = await prismaClient.product.findMany({
      where: {
        isActive: true,
        OR: orConds,
      },
      select: { name: true, sku: true, sellingPrice: true, category: true },
      take: 25,
    });
  } else if (shopProducts.length === 0) {
    products = await prismaClient.product.findMany({
      where: {
        isActive: true,
        name: { startsWith: 'Máy lọc nước' },
      },
      select: { name: true, sku: true, sellingPrice: true, category: true },
      orderBy: { sellingPrice: 'desc' },
      take: 12,
    });
  }

  // Loại bỏ bản ghi máy chính trùng ở POS nếu đã có giá chính thức trong ShopProduct (tránh LLM báo nhầm giá cũ)
  const filteredPosProducts = products.filter((p) => {
    const nameLower = String(p?.name || '').toLowerCase();
    if (!nameLower.startsWith('máy lọc nước')) return true;
    const pModels = extractModelCodes(`${p?.name || ''} ${p?.sku || ''}`);
    return !pModels.some((m) => coveredMainModels.has(m));
  });

  filteredPosProducts.sort((a, b) => {
    const aIsMain = String(a?.name || '').startsWith('Máy lọc nước') ? 1 : 0;
    const bIsMain = String(b?.name || '').startsWith('Máy lọc nước') ? 1 : 0;
    if (aIsMain !== bIsMain) return bIsMain - aIsMain;
    return (b?.sellingPrice || 0) - (a?.sellingPrice || 0);
  });

  const posMainMachines = filteredPosProducts.filter((p) => String(p?.name || '').startsWith('Máy lọc nước'));
  const posAccessories = filteredPosProducts.filter((p) => !String(p?.name || '').startsWith('Máy lọc nước'));

  if (posMainMachines.length > 0) {
    catalogLines.push('2. Máy lọc nước khác (Tham khảo danh mục POS):');
    for (const p of posMainMachines) {
      const priceText = p.sellingPrice ? formatVnd(Number(p.sellingPrice)) : 'Liên hệ';
      catalogLines.push(`- ${p.name} (SKU: ${p.sku}) | Giá niêm yết: ${priceText}`);
    }
  }

  if (posAccessories.length > 0) {
    catalogLines.push('3. Phụ kiện / Linh kiện / Lõi lọc thay thế (POS):');
    for (const p of posAccessories.slice(0, 10)) {
      const priceText = p.sellingPrice ? formatVnd(Number(p.sellingPrice)) : 'Liên hệ';
      catalogLines.push(`- ${p.name} (SKU: ${p.sku}) | Giá niêm yết: ${priceText}`);
    }
  }

  // 4. Combo phổ biến
  const combos = await prismaClient.productCombo.findMany({
    where: { isActive: true },
    select: { displayName: true, comboKey: true },
    take: 10,
  });

  if (combos.length > 0) {
    catalogLines.push('4. Các gói Combo sản phẩm phổ biến:');
    for (const c of combos) {
      catalogLines.push(`- ${c.displayName} (${c.comboKey})`);
    }
  }

  const catalogText =
    catalogLines.length > 0
      ? `\nBẢNG GIÁ & DANH MỤC SẢN PHẨM TRULIVA CHÍNH THỨC:\n${catalogLines.join('\n')}`
      : '';

  return {
    catalogText,
    productCount: filteredPosProducts.length,
    shopProductCount: shopProducts.length,
    comboCount: combos.length,
  };
}

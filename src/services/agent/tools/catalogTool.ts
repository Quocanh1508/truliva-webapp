import defaultPrisma from '../../../config/database';

export interface CatalogLookupOutput {
  catalogText: string;
  productCount: number;
  comboCount: number;
}

/**
 * Tra cứu đồng bộ Product + ProductCombo cho cả Facebook Bot và Admin Playground.
 */
export async function lookupCatalog(
  params: { models: string[]; syncCatalog: boolean },
  deps?: { prisma?: typeof defaultPrisma }
): Promise<CatalogLookupOutput> {
  if (!params.syncCatalog) {
    return { catalogText: '', productCount: 0, comboCount: 0 };
  }

  const prismaClient = deps?.prisma || defaultPrisma;
  const models = Array.from(new Set((params.models || []).filter((m) => m.length >= 3)));

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
  }

  if (products.length === 0) {
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

  products.sort((a, b) => {
    const aIsMain = String(a?.name || '').startsWith('Máy lọc nước') ? 1 : 0;
    const bIsMain = String(b?.name || '').startsWith('Máy lọc nước') ? 1 : 0;
    if (aIsMain !== bIsMain) return bIsMain - aIsMain;
    return (b?.sellingPrice || 0) - (a?.sellingPrice || 0);
  });

  const mainMachines = products.filter((p) => String(p?.name || '').startsWith('Máy lọc nước'));
  const accessories = products.filter((p) => !String(p?.name || '').startsWith('Máy lọc nước'));

  const catalogLines: string[] = [];
  if (mainMachines.length > 0) {
    catalogLines.push('1. Máy lọc nước chính hãng (Thiết bị chính):');
    for (const p of mainMachines) {
      const priceText = p.sellingPrice ? `${Number(p.sellingPrice).toLocaleString('vi-VN')} đ` : 'Liên hệ';
      catalogLines.push(`- ${p.name} (SKU: ${p.sku}) | Giá niêm yết: ${priceText}`);
    }
  }

  if (accessories.length > 0) {
    catalogLines.push('2. Phụ kiện / Linh kiện / Lõi lọc đi kèm:');
    for (const p of accessories.slice(0, 10)) {
      const priceText = p.sellingPrice ? `${Number(p.sellingPrice).toLocaleString('vi-VN')} đ` : 'Liên hệ';
      catalogLines.push(`- ${p.name} (SKU: ${p.sku}) | Giá niêm yết: ${priceText}`);
    }
  }

  const combos = await prismaClient.productCombo.findMany({
    where: { isActive: true },
    select: { displayName: true, comboKey: true },
    take: 10,
  });

  if (combos.length > 0) {
    catalogLines.push('3. Các gói Combo sản phẩm phổ biến:');
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
    productCount: products.length,
    comboCount: combos.length,
  };
}

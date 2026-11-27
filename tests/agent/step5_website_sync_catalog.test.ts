import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockPrisma } from './_mockEnv';

installMockPrisma();

import {
  isSafeTrulivaWebsiteProductUrl,
  parseHaravanPricing,
  syncShopPricesFromWebsite,
} from '../../src/services/websitePriceSyncService';
import { lookupCatalog } from '../../src/services/agent/tools/catalogTool';
import { buildSystemInstruction, OFFICIAL_TRULIVA_HOTLINE, OFFICIAL_TRULIVA_WORKING_HOURS, OFFICIAL_TRULIVA_ADDRESS } from '../../src/services/agent/promptBuilder';

test('Step 5.1: isSafeTrulivaWebsiteProductUrl enforces HTTPS and trulivavietnam.com/products/*', () => {
  assert.equal(
    isSafeTrulivaWebsiteProductUrl('https://trulivavietnam.com/products/may-loc-nuoc-am-tu-bep-truliva-ur61096h'),
    true
  );
  assert.equal(
    isSafeTrulivaWebsiteProductUrl('https://www.trulivavietnam.com/products/may-loc-nuoc-ur3626'),
    true
  );
  assert.equal(
    isSafeTrulivaWebsiteProductUrl('http://trulivavietnam.com/products/may-loc-nuoc-ur3626'),
    false
  );
  assert.equal(
    isSafeTrulivaWebsiteProductUrl('https://evil.com/products/may-loc-nuoc-ur3626'),
    false
  );
  assert.equal(
    isSafeTrulivaWebsiteProductUrl('https://trulivavietnam.com/collections/all'),
    false
  );
});

test('Step 5.2: parseHaravanPricing parses promotional price & compare_at_price cleanly', () => {
  const res = parseHaravanPricing({
    product: {
      variants: [
        { price: '17175000', compare_at_price: '22900000', available: true },
      ],
    },
  });
  assert.deepEqual(res, { price: 17175000, originalPrice: 22900000 });

  const noPromo = parseHaravanPricing({
    product: {
      variants: [{ price: '1250000', compare_at_price: null, available: true }],
    },
  });
  assert.deepEqual(noPromo, { price: 1250000, originalPrice: null });

  assert.equal(parseHaravanPricing({ product: { variants: [{ price: '0' }] } }), null);
});

test('Step 5.3: syncShopPricesFromWebsite updates changed prices and isolates per-product fetch errors', async () => {
  const updates: Array<{ id: string; data: any }> = [];

  const mockPrisma = {
    shopProduct: {
      findMany: async () => [
        {
          id: 'sp-1',
          sku: 'UR61096H',
          name: 'Máy Lọc Nước Nóng Âm Tủ Bếp Truliva UR61096H',
          price: 18400000,
          originalPrice: 22900000,
          specifications: {
            productUrl: 'https://trulivavietnam.com/products/may-loc-nuoc-am-tu-bep-truliva-ur61096h',
          },
        },
        {
          id: 'sp-2',
          sku: 'UR3626',
          name: 'Máy Lọc Nước Âm Tủ Bếp Truliva UR3626',
          price: 10900000,
          originalPrice: 12900000,
          specifications: {
            productUrl: 'https://trulivavietnam.com/products/may-loc-nuoc-am-bu-bep-truliva-ur3626',
          },
        },
        {
          id: 'sp-3',
          sku: 'BROKEN',
          name: 'Sản phẩm lỗi mạng',
          price: 5000000,
          originalPrice: null,
          specifications: {
            productUrl: 'https://trulivavietnam.com/products/broken-item',
          },
        },
      ],
      update: async (args: any) => {
        updates.push({ id: args.where.id, data: args.data });
        return args.data;
      },
    },
  } as any;

  const mockHttpGet = (async (url: string) => {
    if (url.includes('ur61096h.json')) {
      return {
        data: {
          product: {
            variants: [{ price: '17175000', compare_at_price: '22900000', available: true }],
          },
        },
      };
    }
    if (url.includes('ur3626.json')) {
      return {
        data: {
          product: {
            variants: [{ price: '10900000', compare_at_price: '12900000', available: true }],
          },
        },
      };
    }
    throw new Error('404 Not Found');
  }) as any;

  const summary = await syncShopPricesFromWebsite({ prisma: mockPrisma, httpGet: mockHttpGet });
  assert.equal(summary.totalChecked, 3);
  assert.equal(summary.updatedCount, 1);
  assert.equal(summary.unchangedCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'sp-1');
  assert.deepEqual(updates[0].data, { price: 17175000, originalPrice: 22900000 });
});

test('Step 5.4: lookupCatalog prioritizes ShopProduct promo prices, deduplicates POS main model, and promptBuilder enforces promo reporting', async () => {
  const mockPrisma = {
    shopProduct: {
      findMany: async () => [
        {
          name: 'Máy Lọc Nước Nóng Âm Tủ Bếp Truliva UR61096H',
          sku: 'UR61096H',
          category: 'MAY_LOC_NUOC',
          price: 17175000,
          originalPrice: 22900000,
          warrantyMonths: 12,
          shortDesc: 'Tốc độ lọc 2,66L/phút, làm nóng siêu tốc 3 giây, vòi điện tử UV thông minh.',
        },
      ],
    },
    product: {
      findMany: async () => [
        { name: 'Máy lọc nước Truliva UR61096H', sku: '104321-0002', sellingPrice: 22900000, category: 'Máy' },
        { name: 'Bơm RO Truliva UR61096H', sku: '305041-0172', sellingPrice: 2400000, category: 'Linh kiện' },
      ],
    },
    productCombo: {
      findMany: async () => [{ displayName: 'Combo UR61096H + PCB', comboKey: '61096PCB' }],
    },
  } as any;

  const res = await lookupCatalog({ models: ['UR61096H'], syncCatalog: true }, { prisma: mockPrisma });
  assert.equal(res.shopProductCount, 1);
  assert.equal(res.productCount, 1); // POS main machine was deduplicated; only spare part remains
  assert.ok(res.catalogText.includes('17.175.000 đ'));
  assert.ok(res.catalogText.includes('22.900.000 đ'));
  assert.ok(res.catalogText.includes('giảm 25%'));
  assert.ok(res.catalogText.includes('tiết kiệm 5.725.000 đ'));
  assert.ok(res.catalogText.includes('Lắp đặt 0 đồng'));
  assert.ok(res.catalogText.includes('Bơm RO Truliva UR61096H'));
  assert.equal(res.catalogText.includes('Máy lọc nước Truliva UR61096H (SKU: 104321-0002)'), false);

  const instruction = buildSystemInstruction({
    config: {
      isEnabled: true,
      syncCatalog: true,
      hotline: OFFICIAL_TRULIVA_HOTLINE,
      workingHours: OFFICIAL_TRULIVA_WORKING_HOURS,
      address: OFFICIAL_TRULIVA_ADDRESS,
      systemPrompt: 'CUSTOM_SYSTEM_PROMPT',
      knowledgeText: '',
      faqs: [],
    },
    turnCount: 0,
    intent: 'PRODUCT_PRICE_SPEC',
    primaryModel: 'UR61096H',
    catalogText: res.catalogText,
  });

  assert.ok(instruction.includes('QUY TẮC BÁO GIÁ ƯU ĐÃI'));
  assert.ok(instruction.includes('17.175.000 đ'));
});

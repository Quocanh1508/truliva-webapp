import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockPrisma } from './_mockEnv';

const mockPrisma = installMockPrisma();

import axios from 'axios';
import { routeIntent } from '../../src/services/agent/intentRouter';
import { ToolExecutor } from '../../src/services/agent/toolExecutor';
import { searchHybridRAG } from '../../src/services/ragService';
import { lookupCatalog } from '../../src/services/agent/tools/catalogTool';
import {
  loadAgentConfig,
  invalidateAgentConfigCache,
  buildSystemInstruction,
  OFFICIAL_TRULIVA_HOTLINE,
} from '../../src/services/agent/promptBuilder';

test('Step 2.1: routeIntent strictly gates GREETING_CHITCHAT and routes domain inquiries cleanly', () => {
  const g1 = routeIntent({ text: 'chào shop', imageCount: 0, activeModels: [] });
  assert.equal(g1.intent, 'GREETING_CHITCHAT');
  assert.deepEqual(g1.toolsToRun, []);

  const g2 = routeIntent({ text: 'Dạ cảm ơn em nhé!', imageCount: 0, activeModels: [] });
  assert.equal(g2.intent, 'GREETING_CHITCHAT');
  assert.deepEqual(g2.toolsToRun, []);

  const g3 = routeIntent({ text: 'ok ạ', imageCount: 0, activeModels: [] });
  assert.equal(g3.intent, 'GREETING_CHITCHAT');

  // Câu có chứa ý định hỏi sau lời cảm ơn KHÔNG được đi vào nhánh GREETING_CHITCHAT
  const qAfterThanks1 = routeIntent({
    text: 'cảm ơn shop, cho hỏi thêm giá máy UR3626',
    imageCount: 0,
    activeModels: [],
  });
  assert.notEqual(qAfterThanks1.intent, 'GREETING_CHITCHAT');
  assert.ok(qAfterThanks1.toolsToRun.length > 0);
  assert.equal(qAfterThanks1.primaryModel, 'UR3626');

  const qAfterThanks2 = routeIntent({
    text: 'cảm ơn shop, cho hỏi thêm...',
    imageCount: 0,
    activeModels: [],
  });
  assert.notEqual(qAfterThanks2.intent, 'GREETING_CHITCHAT');
  assert.ok(qAfterThanks2.toolsToRun.length > 0);

  // Có dấu hỏi chấm -> không bỏ qua tra cứu
  const qQuestionMark = routeIntent({ text: 'alo?', imageCount: 0, activeModels: [] });
  assert.notEqual(qQuestionMark.intent, 'GREETING_CHITCHAT');

  // Có ảnh đính kèm -> VISUAL_INQUIRY
  const qVisual = routeIntent({ text: 'xin chào', imageCount: 1, activeModels: [] });
  assert.equal(qVisual.intent, 'VISUAL_INQUIRY');
  assert.ok(qVisual.ragQuery.length > 0);

  // Hỏi nối tiếp kế thừa activeModels
  const qFollowUp = routeIntent({
    text: 'máy này bảo hành bao lâu?',
    imageCount: 0,
    activeModels: ['UR5840'],
  });
  assert.equal(qFollowUp.intent, 'WARRANTY_POLICY_CONTACT');
  assert.equal(qFollowUp.primaryModel, 'UR5840');
  assert.ok(qFollowUp.ragQuery.startsWith('UR5840 '));

  // Sự cố khẩn cấp -> bật allowHotlineEscalation
  const qUrgent = routeIntent({
    text: 'máy bị rò nước ở gầm tủ',
    imageCount: 0,
    activeModels: [],
  });
  assert.equal(qUrgent.intent, 'TROUBLESHOOT_URGENT');
  assert.equal(qUrgent.allowHotlineEscalation, true);
});

test('Step 2.2: ToolExecutor enforces isolation on timeout/error, deduplication, and MAX_TOOL_ITERATIONS', async () => {
  const executor = new ToolExecutor(2);
  let ragCount = 0;

  const batch1 = await executor.executeBatch([
    {
      tool: 'lookup_catalog',
      args: { models: ['UR3626'] },
      run: async () => ({ catalogText: 'UR3626 12.900.000 đ' }),
    },
    {
      tool: 'search_rag',
      args: { query: 'UR3626' },
      timeoutMs: 120,
      run: async () => {
        ragCount += 1;
        await new Promise((r) => setTimeout(r, 300));
        return { chunks: [] };
      },
    },
    {
      tool: 'match_faq',
      args: { query: 'UR3626' },
      run: async () => {
        throw new Error('DB read glitch');
      },
    },
  ]);

  assert.equal(batch1[0].ok, true);
  assert.deepEqual(batch1[0].data, { catalogText: 'UR3626 12.900.000 đ' });
  assert.equal(batch1[1].ok, false);
  assert.equal(batch1[1].errorCode, 'TOOL_TIMEOUT');
  assert.equal(batch1[2].ok, false);
  assert.equal(batch1[2].errorCode, 'TOOL_ERROR');
  assert.equal(ragCount, 1);

  // Batch 2: duplicate call (lookup_catalog + UR3626) phải bị skip, call mới vẫn chạy
  let newFaqCount = 0;
  const batch2 = await executor.executeBatch([
    {
      tool: 'lookup_catalog',
      args: { models: ['UR3626'] },
      run: async () => {
        throw new Error('Should not re-run duplicate call');
      },
    },
    {
      tool: 'match_faq',
      args: { query: 'UR5840' },
      run: async () => {
        newFaqCount += 1;
        return { matchedCount: 1 };
      },
    },
  ]);

  assert.equal(batch2[0].ok, true);
  assert.equal(batch2[0].skippedAsDuplicate, true);
  assert.equal(batch2[1].ok, true);
  assert.equal(newFaqCount, 1);

  // Batch 3: vượt MAX_TOOL_ITERATIONS = 2 -> bị chặn sạch
  const batch3 = await executor.executeBatch([
    {
      tool: 'lookup_catalog',
      args: { models: ['W6412'] },
      run: async () => ({ catalogText: 'should not run' }),
    },
  ]);
  assert.equal(batch3[0].ok, false);
  assert.equal(batch3[0].errorCode, 'MAX_ITERATIONS_EXCEEDED');
});

test('Step 2.3: searchHybridRAG applies vectorThreshold (>=) in pgvector SQL query', async () => {
  const originalAxiosPost = axios.post;
  const originalQueryRaw = mockPrisma.$queryRawUnsafe;

  let capturedSql = '';
  let capturedParams: any[] = [];

  (axios as any).post = async () => ({
    data: { embedding: { values: [0.1, 0.2, 0.3] } },
  });

  mockPrisma.$queryRawUnsafe = async (sql: string, ...params: any[]) => {
    capturedSql = sql;
    capturedParams = params;
    return [
      {
        id: 'c1',
        documentId: 'd1',
        chunkIndex: 0,
        content: 'Thông số UR3626',
        vectorSimilarity: 0.72,
        textScore: 0.4,
        rrfScore: 0.032,
      },
    ];
  };

  try {
    const results = await searchHybridRAG('giá máy UR3626', 4, 0.42, 'UR3626');
    assert.equal(results.length, 1);
    assert.match(capturedSql, /\(1\s*-\s*\(c\.embedding\s*<=>\s*\$1::vector\)\)\s*>=\s*\$6/);
    assert.equal(capturedParams[5], 0.42);
  } finally {
    (axios as any).post = originalAxiosPost;
    mockPrisma.$queryRawUnsafe = originalQueryRaw;
  }
});

test('Step 2.4: lookupCatalog includes both Product and ProductCombo, and promptBuilder cache invalidates cleanly', async () => {
  const res = await lookupCatalog(
    { models: ['UR3626'], syncCatalog: true },
    {
      prisma: {
        product: {
          findMany: async () => [
            { name: 'Bộ vòi máy UR3626', sku: 'VOI-3626', sellingPrice: 800000, category: 'Phụ kiện' },
            { name: 'Máy lọc nước Truliva UR3626', sku: 'UR3626', sellingPrice: 12900000, category: 'Máy lọc nước' },
          ],
        },
        productCombo: {
          findMany: async () => [{ displayName: 'Combo UR3626 + Lõi', comboKey: 'CB-3626' }],
        },
      } as any,
    }
  );

  assert.equal(res.productCount, 2);
  assert.equal(res.comboCount, 1);
  assert.ok(res.catalogText.includes('Máy lọc nước Truliva UR3626'));
  assert.ok(res.catalogText.includes('Combo UR3626 + Lõi'));

  let dbFetchCount = 0;
  const fakePrismaConfig = {
    aiBotConfig: {
      findUnique: async () => {
        dbFetchCount += 1;
        return {
          isEnabled: true,
          syncCatalog: true,
          hotline: OFFICIAL_TRULIVA_HOTLINE,
          workingHours: '08:00 - 18:00',
          address: '65 Đường 42-AP',
          systemPrompt: `PROMPT_V${dbFetchCount}`,
          knowledgeText: 'KNOWLEDGE',
          faqs: [],
        };
      },
    },
  } as any;

  invalidateAgentConfigCache();
  const c1 = await loadAgentConfig({ prisma: fakePrismaConfig });
  const c2 = await loadAgentConfig({ prisma: fakePrismaConfig });
  assert.equal(dbFetchCount, 1);
  assert.equal(c1.systemPrompt, 'PROMPT_V1');
  assert.equal(c2.systemPrompt, 'PROMPT_V1');

  invalidateAgentConfigCache();
  const c3 = await loadAgentConfig({ prisma: fakePrismaConfig });
  assert.equal(dbFetchCount, 2);
  assert.equal(c3.systemPrompt, 'PROMPT_V2');

  const instr = buildSystemInstruction({
    config: c3,
    turnCount: 2,
    intent: 'PRODUCT_PRICE_SPEC',
    primaryModel: 'UR3626',
    catalogText: res.catalogText,
  });
  assert.ok(instr.includes('TUYỆT ĐỐI KHÔNG chào lại'));
  assert.ok(instr.includes(OFFICIAL_TRULIVA_HOTLINE));
});

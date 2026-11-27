import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockPrisma } from './_mockEnv';

installMockPrisma();

import { MemoryManager } from '../../src/services/agent/memoryManager';
import { invalidateAgentConfigCache } from '../../src/services/agent/promptBuilder';
import { runAgentTurn } from '../../src/services/agent/agentOrchestrator';

function createBaseMockPrisma(overrides?: any) {
  const savedMessages: any[] = [];
  const sessionUpdates: any[] = [];

  const prisma = {
    aiBotConfig: {
      findUnique: async () => ({
        isEnabled: true,
        syncCatalog: true,
        hotline: '1900 63 84 63',
        workingHours: '08:00 - 18:00',
        address: '65 Đường 42-AP',
        systemPrompt: 'SYSTEM_PROMPT_TEST',
        knowledgeText: 'KNOWLEDGE_TEST',
        faqs: [
          { category: 'Bảo hành', question: 'UR5840 bảo hành bao lâu?', answer: '24 tháng' },
        ],
      }),
    },
    aiChatSession: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async (args: any) => ({ id: 'sess-123', ...args?.data }),
      update: async (args: any) => {
        sessionUpdates.push(args);
        return { id: args?.where?.id || 'sess-123' };
      },
    },
    aiChatMessage: {
      create: async (args: any) => {
        savedMessages.push(args?.data);
        return { id: `msg-${savedMessages.length}`, ...args?.data };
      },
    },
    product: {
      findMany: async () => [
        { name: 'Máy lọc nước Truliva UR3626', sku: 'UR3626', sellingPrice: 12900000, category: 'Máy lọc nước' },
      ],
    },
    productCombo: {
      findMany: async () => [],
    },
    ...overrides,
  };

  return { prisma, savedMessages, sessionUpdates };
}

test('Step 3.1: Happy-path product inquiry runs tools, commits memory, strips repeated greeting, and persists tokens', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  invalidateAgentConfigCache();
  try {
  const { prisma, savedMessages } = createBaseMockPrisma();
  const mm = new MemoryManager(false);

  let ragCalled = 0;
  const fakeSearchRag = (async () => {
    ragCalled += 1;
    return [
      {
        id: 'chunk-1',
        documentId: 'doc-1',
        chunkIndex: 0,
        content: 'Thông số UR3626: 1200L/h',
        vectorSimilarity: 0.85,
        textScore: 0.5,
        rrfScore: 0.032,
        sourceTitle: 'Catalogue 2026',
        metadata: { pageNumber: 2 },
      },
    ];
  }) as any;

  const fakeHttpPost = (async () => ({
    data: {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: 'Dạ máy Truliva UR3626 giá 12.900.000 đ ạ.' }] },
        },
      ],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 150 },
    },
  })) as any;

  const res1 = await runAgentTurn(
    { channel: 'FACEBOOK', sessionKey: 'FB_HAPPY', message: 'Cho xin giá máy UR3626' },
    { prisma: prisma as any, memoryManager: mm, searchRagFn: fakeSearchRag, httpPost: fakeHttpPost }
  );

  assert.equal(ragCalled, 1);
  assert.equal(res1.reply, 'Dạ máy Truliva UR3626 giá 12.900.000 đ ạ.');
  assert.equal(res1.sessionId, 'sess-123');
  assert.equal(res1.retrievedChunks.length, 1);
  assert.equal(res1.tokens.totalTokens, 150);
  assert.equal(res1.trace.usedFallbackReply, false);
  assert.equal(mm.getSnapshot('FB_HAPPY')?.turns.length, 2);
  assert.equal(savedMessages.length, 2);

  // Turn 2: LLM lỡ chào lặp "Dạ Truliva xin chào anh/chị, máy này..." -> sanitizeAgentOutput tự cắt lời chào lặp
  const fakeHttpPostTurn2 = (async () => ({
    data: {
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: 'Dạ Truliva xin chào anh/chị! máy UR3626 bảo hành 12 tháng ạ.' }] },
        },
      ],
      usageMetadata: { promptTokenCount: 140, candidatesTokenCount: 25, totalTokenCount: 165 },
    },
  })) as any;

  const res2 = await runAgentTurn(
    { channel: 'FACEBOOK', sessionKey: 'FB_HAPPY', message: 'Máy này bảo hành bao lâu?' },
    { prisma: prisma as any, memoryManager: mm, searchRagFn: fakeSearchRag, httpPost: fakeHttpPostTurn2 }
  );

  assert.equal(res2.reply, 'Máy UR3626 bảo hành 12 tháng ạ.');
  assert.equal(res2.trace.activeModels.includes('UR3626'), true);
  } finally {
    process.env.GEMINI_API_KEY = prevKey;
  }
});

test('Step 3.2: GREETING_CHITCHAT skips DB catalog & RAG tools completely', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  invalidateAgentConfigCache();
  try {
  let productQueried = 0;
  let ragQueried = 0;
  const { prisma } = createBaseMockPrisma({
    product: {
      findMany: async () => {
        productQueried += 1;
        return [];
      },
    },
  });
  const mm = new MemoryManager(false);

  const res = await runAgentTurn(
    { channel: 'FACEBOOK', sessionKey: 'FB_GREET', message: 'Chào shop' },
    {
      prisma: prisma as any,
      memoryManager: mm,
      searchRagFn: (async () => {
        ragQueried += 1;
        return [];
      }) as any,
      httpPost: (async () => ({
        data: {
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Dạ Truliva xin chào anh/chị ạ!' }] } }],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 15, totalTokenCount: 65 },
        },
      })) as any,
    }
  );

  assert.equal(res.trace.intent, 'GREETING_CHITCHAT');
  assert.equal(productQueried, 0);
  assert.equal(ragQueried, 0);
  assert.equal(res.trace.toolResults.length, 0);
  } finally {
    process.env.GEMINI_API_KEY = prevKey;
  }
});

test('Step 3.3: RAG failure is isolated; Gemini 503 retries and falls back to GEMINI_FALLBACK_MODEL within budget', async () => {
  invalidateAgentConfigCache();
  const prevKey = process.env.GEMINI_API_KEY;
  const prevModel = process.env.GEMINI_MODEL;
  const prevFallback = process.env.GEMINI_FALLBACK_MODEL;

  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODEL = 'gemini-primary-test';
  process.env.GEMINI_FALLBACK_MODEL = 'gemini-fallback-test';

  try {
    const { prisma } = createBaseMockPrisma();
    const mm = new MemoryManager(false);
    const calledModels: string[] = [];

    const res = await runAgentTurn(
      { channel: 'PLAYGROUND', sessionKey: 'PG_FB_TEST', message: 'Giá UR3626 bao nhiêu?', turnBudgetMs: 8000 },
      {
        prisma: prisma as any,
        memoryManager: mm,
        sleepFn: async () => {},
        searchRagFn: (async () => {
          throw new Error('pgvector connection refused');
        }) as any,
        httpPost: (async (url: string) => {
          calledModels.push(url);
          if (url.includes('gemini-primary-test')) {
            const err: any = new Error('Service Unavailable');
            err.response = { status: 503, data: { error: { message: 'Overloaded' } } };
            throw err;
          }
          return {
            data: {
              candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Dạ giá niêm yết 12.900.000 đ.' }] } }],
              usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 20, totalTokenCount: 110 },
            },
          };
        }) as any,
      }
    );

    assert.equal(calledModels.filter((u) => u.includes('gemini-primary-test')).length, 2);
    assert.equal(calledModels.filter((u) => u.includes('gemini-fallback-test')).length, 1);
    assert.equal(res.model, 'gemini-fallback-test');
    assert.equal(res.reply, 'Dạ giá niêm yết 12.900.000 đ.');
    assert.equal(res.trace.usedFallbackReply, false);
    assert.equal(res.trace.toolResults.some((t) => t.tool === 'search_rag' && !t.ok), true);
  } finally {
    process.env.GEMINI_API_KEY = prevKey;
    process.env.GEMINI_MODEL = prevModel;
    process.env.GEMINI_FALLBACK_MODEL = prevFallback;
  }
});

test('Step 3.4: Total Gemini outage returns contextual fallback reply and NEVER poisons memory for next turn', async () => {
  invalidateAgentConfigCache();
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';

  try {
    const { prisma } = createBaseMockPrisma();
    const mm = new MemoryManager(false);

    // Turn 1: Urgent troubleshooting while Gemini completely fails
    const failRes = await runAgentTurn(
      { channel: 'FACEBOOK', sessionKey: 'FB_OUTAGE', message: 'Máy bị rò nước ở gầm bếp gấp!' },
      {
        prisma: prisma as any,
        memoryManager: mm,
        sleepFn: async () => {},
        searchRagFn: (async () => []) as any,
        httpPost: (async () => {
          const err: any = new Error('Quota exceeded');
          err.response = { status: 429 };
          throw err;
        }) as any,
      }
    );

    assert.equal(failRes.trace.intent, 'TROUBLESHOOT_URGENT');
    assert.equal(failRes.trace.usedFallbackReply, true);
    assert.ok(failRes.reply.includes('1900 63 84 63'));
    assert.equal(mm.getSnapshot('FB_OUTAGE')?.turns.length, 0, 'Failed turn must NOT leave orphan user turn');

    // Turn 2: Gemini recovers -> contents sent must have clean [user] role without [user, user]
    let capturedContents: any[] = [];
    const okRes = await runAgentTurn(
      { channel: 'FACEBOOK', sessionKey: 'FB_OUTAGE', message: 'Cho xin giá UR3626' },
      {
        prisma: prisma as any,
        memoryManager: mm,
        searchRagFn: (async () => []) as any,
        httpPost: (async (_url: string, body: any) => {
          capturedContents = body.contents;
          return {
            data: {
              candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Dạ giá UR3626 là 12.900.000 đ ạ.' }] } }],
              usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 20, totalTokenCount: 100 },
            },
          };
        }) as any,
      }
    );

    assert.deepEqual(
      capturedContents.map((c) => c.role),
      ['user']
    );
    assert.equal(okRes.trace.usedFallbackReply, false);
    assert.equal(mm.getSnapshot('FB_OUTAGE')?.turns.length, 2);
  } finally {
    process.env.GEMINI_API_KEY = prevKey;
  }
});

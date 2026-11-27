import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockPrisma } from './_mockEnv';

const mockPrisma = installMockPrisma();

import axios from 'axios';
import aiAssistantRouter from '../../src/routes/aiAssistant';
import {
  enqueueSenderTask,
  getActiveSenderLockCount,
  enqueueFacebookMessage,
} from '../../src/services/facebookAiBot';
import { invalidateAgentConfigCache, loadAgentConfig } from '../../src/services/agent/promptBuilder';

function getRouteHandler(router: any, method: 'post' | 'put' | 'get', path: string) {
  const layer = (router.stack || []).find(
    (l: any) => l.route && l.route.path === path && l.route.methods?.[method]
  );
  assert.ok(layer, `Route ${method.toUpperCase()} ${path} must exist`);
  const stack = layer.route.stack || [];
  return stack[stack.length - 1].handle;
}

function createMockRes() {
  const result: { statusCode: number; body: any } = { statusCode: 200, body: null };
  const res: any = {
    status(code: number) {
      result.statusCode = code;
      return res;
    },
    json(payload: any) {
      result.body = payload;
      return res;
    },
  };
  return { res, result };
}

test('Step 4.1: POST /api/ai-assistant/test-chat preserves 100% API contract for AiAssistantManage.tsx (normal & Gemini fallback)', async () => {
  const handler = getRouteHandler(aiAssistantRouter, 'post', '/test-chat');
  const origKey = process.env.GEMINI_API_KEY;
  const origAxiosPost = axios.post;
  const origFindConfig = mockPrisma.aiBotConfig.findUnique;
  const origProducts = mockPrisma.product.findMany;
  const origCombos = mockPrisma.productCombo.findMany;
  const origQueryRaw = mockPrisma.$queryRawUnsafe;

  process.env.GEMINI_API_KEY = 'test-key';
  invalidateAgentConfigCache();

  mockPrisma.aiBotConfig.findUnique = async () => ({
    isEnabled: true,
    syncCatalog: true,
    hotline: '1900 63 84 63',
    workingHours: '08:00 - 18:00',
    address: '65 Đường 42-AP',
    systemPrompt: 'SYSTEM_PROMPT',
    knowledgeText: 'KNOWLEDGE',
    faqs: [],
  });
  mockPrisma.product.findMany = async () => [
    { name: 'Máy lọc nước Truliva UR3626', sku: 'UR3626', sellingPrice: 12900000, category: 'Máy lọc nước' },
  ];
  mockPrisma.productCombo.findMany = async () => [];
  mockPrisma.$queryRawUnsafe = async () => [
    {
      id: 'chunk-1',
      documentId: 'doc-1',
      chunkIndex: 0,
      content: 'UR3626 lưu lượng 1200L/h',
      vectorSimilarity: 0.88,
      textScore: 0.5,
      rrfScore: 0.031,
      sourceTitle: 'Spec UR3626',
      fileName: 'spec.pdf',
      metadata: { pageNumber: 1 },
    },
  ];

  try {
    // 1. Empty message -> 400
    const emptyCtx = createMockRes();
    await handler(
      { body: { message: '   ' }, user: { id: 'u1', fullName: 'Admin' } } as any,
      emptyCtx.res
    );
    assert.equal(emptyCtx.result.statusCode, 400);
    assert.equal(emptyCtx.result.body.success, false);

    // 2. Normal response -> exact JSON keys expected by AiAssistantManage.tsx
    (axios as any).post = async (url: string) => {
      if (url.includes(':embedContent')) {
        return { data: { embedding: { values: [0.1, 0.2] } } };
      }
      return {
        data: {
          candidates: [
            { finishReason: 'STOP', content: { parts: [{ text: 'Dạ UR3626 giá 12.900.000 đ.' }] } },
          ],
          usageMetadata: { promptTokenCount: 111, candidatesTokenCount: 22, totalTokenCount: 133 },
        },
      };
    };

    const okCtx = createMockRes();
    await handler(
      {
        body: {
          message: 'Giá máy UR3626 bao nhiêu?',
          history: [{ role: 'user', text: 'Xin chào' }, { role: 'model', text: 'Dạ chào anh!' }],
        },
        user: { id: 'admin-1', fullName: 'Quốc Anh' },
      } as any,
      okCtx.res
    );

    assert.equal(okCtx.result.statusCode, 200);
    const body = okCtx.result.body;
    assert.equal(body.success, true);
    assert.equal(body.reply, 'Dạ UR3626 giá 12.900.000 đ.');
    assert.equal(typeof body.sessionId, 'string');
    assert.equal(Array.isArray(body.retrievedChunks), true);
    assert.equal(body.retrievedChunks.length, 1);
    assert.equal(typeof body.retrievedChunks[0].rrfScore, 'number');
    assert.deepEqual(body.tokens, { promptTokens: 111, completionTokens: 22, totalTokens: 133 });
    assert.equal(typeof body.latencyMs, 'number');
    assert.equal(typeof body.model, 'string');

    // 3. Gemini total failure -> STILL returns HTTP 200 with safe fallback JSON contract (UI never crashes)
    (axios as any).post = async (url: string) => {
      if (url.includes(':embedContent')) {
        return { data: { embedding: { values: [0.1, 0.2] } } };
      }
      const err: any = new Error('Gateway Timeout');
      err.response = { status: 504 };
      throw err;
    };

    const fallbackCtx = createMockRes();
    await handler(
      {
        body: { message: 'Thông số UR3626 thế nào?', sessionId: 'sess-existing' },
        user: { id: 'admin-1', fullName: 'Quốc Anh' },
      } as any,
      fallbackCtx.res
    );

    assert.equal(fallbackCtx.result.statusCode, 200);
    const fb = fallbackCtx.result.body;
    assert.equal(fb.success, true);
    assert.equal(typeof fb.reply, 'string');
    assert.ok(fb.reply.length > 0);
    assert.equal(Array.isArray(fb.retrievedChunks), true);
    assert.equal(typeof fb.tokens.promptTokens, 'number');
    assert.equal(typeof fb.tokens.completionTokens, 'number');
    assert.equal(typeof fb.tokens.totalTokens, 'number');
    assert.equal(typeof fb.latencyMs, 'number');
    assert.equal(typeof fb.model, 'string');
  } finally {
    process.env.GEMINI_API_KEY = origKey;
    (axios as any).post = origAxiosPost;
    mockPrisma.aiBotConfig.findUnique = origFindConfig;
    mockPrisma.product.findMany = origProducts;
    mockPrisma.productCombo.findMany = origCombos;
    mockPrisma.$queryRawUnsafe = origQueryRaw;
  }
});

test('Step 4.2: PUT /api/ai-assistant/config invalidates promptBuilder config cache immediately', async () => {
  const putHandler = getRouteHandler(aiAssistantRouter, 'put', '/config');
  const origFind = mockPrisma.aiBotConfig.findUnique;
  const origUpsert = mockPrisma.aiBotConfig.upsert;

  let version = 1;
  mockPrisma.aiBotConfig.findUnique = async () => ({
    isEnabled: true,
    syncCatalog: true,
    hotline: '1900 63 84 63',
    workingHours: '08:00 - 18:00',
    address: '65 Đường 42-AP',
    systemPrompt: `PROMPT_V${version}`,
    knowledgeText: 'KNOWLEDGE',
    faqs: [],
  });
  mockPrisma.aiBotConfig.upsert = async () => {
    version = 2;
    return { id: 'default', systemPrompt: 'PROMPT_V2' };
  };

  try {
    invalidateAgentConfigCache();
    const before = await loadAgentConfig();
    assert.equal(before.systemPrompt, 'PROMPT_V1');

    const ctx = createMockRes();
    await putHandler(
      {
        body: { systemPrompt: 'PROMPT_V2', knowledgeText: 'KNOWLEDGE', isEnabled: true, syncCatalog: true },
        user: { id: 'admin-1', fullName: 'Admin' },
      } as any,
      ctx.res
    );

    assert.equal(ctx.result.body.success, true);
    const after = await loadAgentConfig();
    assert.equal(after.systemPrompt, 'PROMPT_V2');
  } finally {
    mockPrisma.aiBotConfig.findUnique = origFind;
    mockPrisma.aiBotConfig.upsert = origUpsert;
  }
});

test('Step 4.3: Per-Sender Mutex runs same-sender tasks sequentially, recovers from errors, cleans up Map, and allows concurrent different senders', async () => {
  const orderSameSender: number[] = [];

  const t1 = enqueueSenderTask('sender-mutex-1', async () => {
    await new Promise((r) => setTimeout(r, 40));
    orderSameSender.push(1);
  });
  const t2 = enqueueSenderTask('sender-mutex-1', async () => {
    orderSameSender.push(2);
    throw new Error('Simulated crash in task 2');
  });
  const t3 = enqueueSenderTask('sender-mutex-1', async () => {
    orderSameSender.push(3);
  });

  // Different sender runs concurrently and finishes before sender-mutex-1's 40ms task
  let concurrentFinishedFirst = false;
  const tOther = enqueueSenderTask('sender-mutex-2', async () => {
    await new Promise((r) => setTimeout(r, 5));
    if (orderSameSender.length === 0) {
      concurrentFinishedFirst = true;
    }
  });

  const results = await Promise.allSettled([t1, t2, t3, tOther]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[2].status, 'fulfilled');
  assert.equal(results[3].status, 'fulfilled');

  assert.deepEqual(orderSameSender, [1, 2, 3]);
  assert.equal(concurrentFinishedFirst, true);
  assert.equal(getActiveSenderLockCount(), 0, 'senderLocks Map must be completely empty after queues drain');
});

test('Step 4.4: enqueueFacebookMessage immediate=true flushes pending debounced buffer cleanly with no double-send', async () => {
  const origFbToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const origGeminiKey = process.env.GEMINI_API_KEY;
  const origAxiosPost = axios.post;

  process.env.FB_PAGE_ACCESS_TOKEN = 'fake-fb-token';
  process.env.GEMINI_API_KEY = 'fake-gemini-key';
  invalidateAgentConfigCache();

  const sentReplies: string[] = [];
  let geminiSeenText = '';

  (axios as any).post = async (url: string, body: any) => {
    if (url.includes('graph.facebook.com')) {
      if (body?.message?.text) {
        sentReplies.push(body.message.text);
      }
      return { data: { message_id: 'mid.1' } };
    }
    if (url.includes('generativelanguage.googleapis.com')) {
      const contents = body?.contents || [];
      geminiSeenText = contents[contents.length - 1]?.parts?.[0]?.text || '';
      return {
        data: {
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Dạ chào anh, em đã nhận thông tin!' }] } }],
          usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 },
        },
      };
    }
    return { data: {} };
  };

  try {
    enqueueFacebookMessage('sender-debounce-1', 'Xin chào shop', [], false);
    enqueueFacebookMessage('sender-debounce-1', 'Cho hỏi giá UR3626', [], true);

    // Wait a brief moment for the queued Promise task to finish
    await new Promise((r) => setTimeout(r, 80));

    assert.equal(sentReplies.length, 1);
    assert.ok(geminiSeenText.includes('Xin chào shop'));
    assert.ok(geminiSeenText.includes('Cho hỏi giá UR3626'));
    assert.equal(getActiveSenderLockCount(), 0);
  } finally {
    process.env.FB_PAGE_ACCESS_TOKEN = origFbToken;
    process.env.GEMINI_API_KEY = origGeminiKey;
    (axios as any).post = origAxiosPost;
  }
});

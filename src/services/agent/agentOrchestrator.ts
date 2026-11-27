import axios from 'axios';
import defaultPrisma from '../../config/database';
import logger from '../../utils/logger';
import { DEFAULT_GEMINI_MODEL, DEFAULT_TURN_BUDGET_MS, generateAgentReply } from './geminiClient';
import { runInputGuardrail } from './inputGuardrail';
import { routeIntent } from './intentRouter';
import { defaultMemoryManager, MemoryManager } from './memoryManager';
import { buildFallbackReply, sanitizeAgentOutput } from './outputFallback';
import { buildSystemInstruction, loadAgentConfig } from './promptBuilder';
import { ToolExecutor } from './toolExecutor';
import { lookupCatalog } from './tools/catalogTool';
import { matchRelevantFaqs } from './tools/faqTool';
import { searchKnowledgeRag } from './tools/ragTool';
import { searchHybridRAG } from '../ragService';
import { AgentTurnInput, AgentTurnOutput, GeminiPart, TokenUsage, ToolResult } from './types';

export interface OrchestratorDeps {
  prisma?: typeof defaultPrisma;
  memoryManager?: MemoryManager;
  httpGet?: typeof axios.get;
  httpPost?: typeof axios.post;
  sleepFn?: (ms: number) => Promise<void>;
  searchRagFn?: typeof searchHybridRAG;
}

const ZERO_TOKENS: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

async function persistChatTurnSafely(params: {
  prismaClient: typeof defaultPrisma;
  input: AgentTurnInput;
  reply: string;
  tokens: TokenUsage;
  latencyMs: number;
  model: string;
  retrievedChunks: any[];
}): Promise<string | null> {
  const { prismaClient, input, reply, tokens, latencyMs, model, retrievedChunks } = params;
  const isPlayground = input.channel === 'PLAYGROUND';

  try {
    let chatSession: any = null;
    if (input.sessionId) {
      chatSession = await prismaClient.aiChatSession.findUnique({
        where: { id: input.sessionId },
      });
    } else {
      chatSession = await prismaClient.aiChatSession.findFirst({
        where: { sessionCode: input.sessionKey, isActive: true },
      });
    }

    if (!chatSession) {
      const cleanPreview = (input.message || '').trim() || 'Tin nhắn mới';
      chatSession = await prismaClient.aiChatSession.create({
        data: {
          sessionCode: isPlayground ? undefined : input.sessionKey,
          title: isPlayground
            ? cleanPreview.substring(0, 80)
            : `Khách Facebook: ${cleanPreview.slice(0, 50)}`,
          channel: input.channel,
          userId: input.userId || null,
          userName: input.userName || (isPlayground ? 'Admin / Dev' : `Khách (${input.sessionKey.slice(-4)})`),
          totalMessages: 0,
          totalTokens: 0,
          isActive: true,
        },
      });
    }

    const userContent =
      (input.message || '').trim() ||
      (Array.isArray(input.imageUrls) && input.imageUrls.length > 0 ? '[Hình ảnh]' : 'Xin chào Truliva!');

    await prismaClient.aiChatMessage.create({
      data: {
        sessionId: chatSession.id,
        role: 'user',
        content: userContent,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    });

    await prismaClient.aiChatMessage.create({
      data: {
        sessionId: chatSession.id,
        role: 'assistant',
        content: reply,
        promptTokens: tokens.promptTokens,
        completionTokens: tokens.completionTokens,
        totalTokens: tokens.totalTokens,
        latencyMs,
        model,
        retrievedChunks: retrievedChunks.length > 0 ? retrievedChunks : undefined,
      },
    });

    await prismaClient.aiChatSession.update({
      where: { id: chatSession.id },
      data: {
        totalMessages: { increment: 2 },
        totalTokens: { increment: tokens.totalTokens },
        updatedAt: new Date(),
      },
    });

    return chatSession.id || null;
  } catch (dbErr: any) {
    logger.warn('Failed to persist AI chat session/tokens in DB', {
      channel: input.channel,
      sessionKey: input.sessionKey,
      error: dbErr?.message,
    });
    return input.sessionId || null;
  }
}

/**
 * Bộ điều phối trung tâm 5 tầng cho toàn bộ chatbot Truliva (Facebook Messenger, Playground, Zalo...).
 */
export async function runAgentTurn(
  input: AgentTurnInput,
  deps?: OrchestratorDeps
): Promise<AgentTurnOutput> {
  const turnStart = Date.now();
  const turnBudgetMs = input.turnBudgetMs ?? DEFAULT_TURN_BUDGET_MS;
  const deadlineMs = turnStart + turnBudgetMs;
  const prismaClient = deps?.prisma || defaultPrisma;
  const memoryManager = deps?.memoryManager || defaultMemoryManager;
  const currentPrimaryModel = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;

  // 1. Config check
  const config = await loadAgentConfig({ prisma: prismaClient });
  if (input.channel === 'FACEBOOK' && !config.isEnabled) {
    logger.info('AI Bot is disabled in admin settings, skipping reply', {
      sessionKey: input.sessionKey,
    });
    return {
      reply: '',
      sessionId: input.sessionId || null,
      retrievedChunks: [],
      tokens: { ...ZERO_TOKENS },
      latencyMs: Date.now() - turnStart,
      model: currentPrimaryModel,
      skippedDisabled: true,
      trace: {
        intent: 'GENERAL_INQUIRY',
        detectedModels: [],
        activeModels: [],
        toolResults: [],
        modelUsed: currentPrimaryModel,
        usedFallbackReply: false,
        totalLatencyMs: Date.now() - turnStart,
      },
    };
  }

  // 2. Input & Guardrail
  const guardrail = await runInputGuardrail(
    { text: input.message, imageUrls: input.imageUrls },
    { httpGet: deps?.httpGet }
  );

  if (guardrail.blocked) {
    const blockedReply = buildFallbackReply({
      intent: 'INJECTION_BLOCKED',
      reason: guardrail.blockReason,
      hotline: config.hotline,
    });
    const latencyMs = Date.now() - turnStart;
    const sessionId = await persistChatTurnSafely({
      prismaClient,
      input,
      reply: blockedReply,
      tokens: ZERO_TOKENS,
      latencyMs,
      model: 'guardrail',
      retrievedChunks: [],
    });

    return {
      reply: blockedReply,
      sessionId,
      retrievedChunks: [],
      tokens: { ...ZERO_TOKENS },
      latencyMs,
      model: 'guardrail',
      trace: {
        intent: 'INJECTION_BLOCKED',
        detectedModels: [],
        activeModels: [],
        toolResults: [],
        modelUsed: 'guardrail',
        usedFallbackReply: true,
        fallbackReason: guardrail.blockReason,
        totalLatencyMs: latencyMs,
      },
    };
  }

  // 3. State / Memory
  const state = await memoryManager.getOrHydrateState(
    {
      sessionKey: input.sessionKey,
      channel: input.channel,
      sessionId: input.sessionId,
      clientHistory: input.clientHistory,
    },
    { prisma: prismaClient }
  );

  // 4. Intent Router
  const route = routeIntent({
    text: guardrail.sanitizedText,
    imageCount: guardrail.imageParts.length,
    activeModels: state.activeModels,
  });

  // 5. Bounded Tool Executor
  const toolExecutor = new ToolExecutor();
  const toolTimeoutMs = Math.min(8000, Math.max(1000, deadlineMs - Date.now() - 3000));
  const toolCalls = route.toolsToRun.map((toolName) => {
    if (toolName === 'lookup_catalog') {
      const modelsForCatalog =
        route.detectedModels.length > 0 ? route.detectedModels : state.activeModels;
      return {
        tool: 'lookup_catalog' as const,
        args: { models: modelsForCatalog, syncCatalog: config.syncCatalog },
        timeoutMs: toolTimeoutMs,
        run: () =>
          lookupCatalog(
            { models: modelsForCatalog, syncCatalog: config.syncCatalog },
            { prisma: prismaClient }
          ),
      };
    }

    if (toolName === 'search_rag') {
      return {
        tool: 'search_rag' as const,
        args: {
          query: route.ragQuery,
          primaryModel: route.primaryModel,
          limit: input.channel === 'PLAYGROUND' ? 4 : 3,
        },
        timeoutMs: toolTimeoutMs,
        run: () =>
          searchKnowledgeRag(
            {
              query: route.ragQuery,
              primaryModel: route.primaryModel,
              limit: input.channel === 'PLAYGROUND' ? 4 : 3,
              vectorThreshold: 0.35,
            },
            { searchFn: deps?.searchRagFn }
          ),
      };
    }

    return {
      tool: 'match_faq' as const,
      args: { query: guardrail.sanitizedText, primaryModel: route.primaryModel },
      timeoutMs: toolTimeoutMs,
      run: async () =>
        matchRelevantFaqs({
          query: guardrail.sanitizedText,
          primaryModel: route.primaryModel,
          faqs: config.faqs,
        }),
    };
  });

  const toolResults: ToolResult[] =
    toolCalls.length > 0 ? await toolExecutor.executeBatch(toolCalls) : [];

  let catalogText = '';
  let ragText = '';
  let retrievedChunks: any[] = [];
  let faqText = '';

  for (const res of toolResults) {
    if (!res.ok || !res.data) continue;
    if (res.tool === 'lookup_catalog') {
      catalogText = res.data.catalogText || '';
    } else if (res.tool === 'search_rag') {
      ragText = res.data.ragText || '';
      retrievedChunks = Array.isArray(res.data.chunks) ? res.data.chunks : [];
    } else if (res.tool === 'match_faq') {
      faqText = res.data.faqText || '';
    }
  }

  // 6. Prompt & Contents Assembly (KHÔNG commit state trước khi gọi LLM)
  const systemInstruction = buildSystemInstruction({
    config,
    turnCount: state.turnCount,
    intent: route.intent,
    primaryModel: route.primaryModel,
    catalogText,
    ragText,
    faqText,
  });

  const currentUserParts: GeminiPart[] = [];
  if (guardrail.sanitizedText) {
    currentUserParts.push({ text: guardrail.sanitizedText });
  }
  currentUserParts.push(...guardrail.imageParts);
  if (currentUserParts.length === 0) {
    currentUserParts.push({ text: 'Xin chào Truliva!' });
  }

  const contents = memoryManager.buildContentsForTurn(state.turns, currentUserParts);

  // 7. LLM Call + Output Fallback
  const llmRes = await generateAgentReply(
    {
      systemInstruction,
      contents,
      turnBudgetMs,
      deadlineMs,
    },
    {
      httpPost: deps?.httpPost,
      sleepFn: deps?.sleepFn,
    }
  );

  let finalReply = '';
  let usedFallbackReply = false;
  let fallbackReason: string | undefined;

  if (llmRes.ok && llmRes.replyText) {
    const sanitized = sanitizeAgentOutput(llmRes.replyText, state.turnCount);
    if (sanitized) {
      finalReply = sanitized;
      memoryManager.commitCompletedTurn(
        input.sessionKey,
        input.channel,
        currentUserParts,
        finalReply,
        route.detectedModels,
        route.intent
      );
    } else {
      usedFallbackReply = true;
      fallbackReason = 'EMPTY_AFTER_SANITIZE';
      finalReply = buildFallbackReply({
        intent: route.intent,
        reason: fallbackReason,
        hotline: config.hotline,
      });
    }
  } else {
    usedFallbackReply = true;
    fallbackReason = llmRes.errorCode || 'LLM_FAILED';
    finalReply = buildFallbackReply({
      intent: route.intent,
      reason: fallbackReason,
      hotline: config.hotline,
    });
  }

  const totalLatencyMs = Date.now() - turnStart;

  // 8. Safe Session & Token Persistence
  const sessionId = await persistChatTurnSafely({
    prismaClient,
    input,
    reply: finalReply,
    tokens: llmRes.usage,
    latencyMs: llmRes.latencyMs || totalLatencyMs,
    model: llmRes.modelUsed,
    retrievedChunks,
  });

  const traceToolResults = toolResults.map(({ data: _data, ...meta }) => meta);

  return {
    reply: finalReply,
    sessionId,
    retrievedChunks,
    tokens: llmRes.usage,
    latencyMs: llmRes.latencyMs || totalLatencyMs,
    model: llmRes.modelUsed,
    trace: {
      intent: route.intent,
      detectedModels: route.detectedModels,
      activeModels: memoryManager.getSnapshot(input.sessionKey)?.activeModels || state.activeModels,
      toolResults: traceToolResults,
      modelUsed: llmRes.modelUsed,
      usedFallbackReply,
      fallbackReason,
      totalLatencyMs,
    },
  };
}

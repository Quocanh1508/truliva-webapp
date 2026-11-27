import axios from 'axios';
import logger from '../../utils/logger';
import { GeminiTurn, TokenUsage } from './types';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_TURN_BUDGET_MS = 30000;

const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
]);

export interface GeminiClientResult {
  ok: boolean;
  replyText?: string;
  modelUsed: string;
  usage: TokenUsage;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface GeminiClientDeps {
  httpPost?: typeof axios.post;
  sleepFn?: (ms: number) => Promise<void>;
}

const ZERO_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: any): boolean {
  const status = err?.response?.status;
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const code = String(err?.code || '').toUpperCase();
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    return true;
  }
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('timeout') || msg.includes('network error');
}

async function invokeSingleModel(params: {
  model: string;
  apiKey: string;
  systemInstruction: string;
  contents: GeminiTurn[];
  timeoutMs: number;
  httpPost: typeof axios.post;
}): Promise<{
  ok: boolean;
  replyText?: string;
  usage: TokenUsage;
  errorCode?: string;
  errorMessage?: string;
  transient?: boolean;
}> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model
  )}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  try {
    const res = await params.httpPost(
      url,
      {
        system_instruction: {
          parts: [{ text: params.systemInstruction }],
        },
        contents: params.contents,
      },
      { timeout: params.timeoutMs }
    );

    const candidate = res.data?.candidates?.[0];
    const finishReason = String(candidate?.finishReason || '');
    const rawUsage = res.data?.usageMetadata || {};
    const usage: TokenUsage = {
      promptTokens: Number(rawUsage.promptTokenCount || 0),
      completionTokens: Number(rawUsage.candidatesTokenCount || 0),
      totalTokens: Number(rawUsage.totalTokenCount || 0),
    };

    if (BLOCKED_FINISH_REASONS.has(finishReason)) {
      return {
        ok: false,
        usage,
        errorCode: finishReason,
        errorMessage: `Gemini blocked response with finishReason=${finishReason}`,
        transient: false,
      };
    }

    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const replyText = parts
      .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim();

    if (!replyText) {
      return {
        ok: false,
        usage,
        errorCode: finishReason || 'EMPTY_REPLY',
        errorMessage: 'Gemini returned empty reply',
        transient: false,
      };
    }

    return {
      ok: true,
      replyText,
      usage,
    };
  } catch (err: any) {
    const status = err?.response?.status;
    const errorMessage = err?.response?.data?.error?.message || err?.message || 'Gemini request failed';
    return {
      ok: false,
      usage: { ...ZERO_USAGE },
      errorCode: status ? `HTTP_${status}` : String(err?.code || 'GEMINI_ERROR'),
      errorMessage,
      transient: isTransientError(err),
    };
  }
}

/**
 * Gọi Gemini API động theo biến môi trường (GEMINI_API_KEY, GEMINI_MODEL, GEMINI_FALLBACK_MODEL),
 * có retry 429/503 trong ngân sách thời gian turnBudgetMs (mặc định 30s).
 */
export async function generateAgentReply(
  params: {
    systemInstruction: string;
    contents: GeminiTurn[];
    turnBudgetMs?: number;
    deadlineMs?: number;
  },
  deps?: GeminiClientDeps
): Promise<GeminiClientResult> {
  const start = Date.now();
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const primaryModel = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const fallbackModel = (process.env.GEMINI_FALLBACK_MODEL || '').trim();

  const deadline = params.deadlineMs ?? start + (params.turnBudgetMs ?? DEFAULT_TURN_BUDGET_MS);

  if (!apiKey) {
    logger.error('GEMINI_API_KEY is missing when calling generateAgentReply');
    return {
      ok: false,
      modelUsed: primaryModel,
      usage: { ...ZERO_USAGE },
      latencyMs: Date.now() - start,
      errorCode: 'MISSING_API_KEY',
      errorMessage: 'GEMINI_API_KEY chưa được cấu hình',
    };
  }

  const httpPost = deps?.httpPost || axios.post;
  const sleepFn = deps?.sleepFn || defaultSleep;

  const remainingBeforeFirst = deadline - Date.now();
  if (remainingBeforeFirst <= 250) {
    return {
      ok: false,
      modelUsed: primaryModel,
      usage: { ...ZERO_USAGE },
      latencyMs: Date.now() - start,
      errorCode: 'BUDGET_EXHAUSTED',
      errorMessage: 'Hết ngân sách thời gian xử lý trước khi gọi Gemini',
    };
  }

  // Attempt 1: Primary Model
  const timeout1 = Math.max(200, Math.min(25000, remainingBeforeFirst - 50));
  let attemptResult = await invokeSingleModel({
    model: primaryModel,
    apiKey,
    systemInstruction: params.systemInstruction,
    contents: params.contents,
    timeoutMs: timeout1,
    httpPost,
  });

  if (attemptResult.ok && attemptResult.replyText) {
    return {
      ok: true,
      replyText: attemptResult.replyText,
      modelUsed: primaryModel,
      usage: attemptResult.usage,
      latencyMs: Date.now() - start,
    };
  }

  // Attempt 2: Retry Primary Model on transient errors (429 / 503 / timeout) if budget permits
  const remainingBeforeRetry = deadline - Date.now();
  if (attemptResult.transient && remainingBeforeRetry > 1200) {
    const jitterMs = 500 + Math.floor(Math.random() * 250);
    const sleepMs = Math.min(jitterMs, remainingBeforeRetry - 800);
    if (sleepMs > 0) {
      await sleepFn(sleepMs);
    }

    const remainingAfterSleep = deadline - Date.now();
    if (remainingAfterSleep > 250) {
      const timeout2 = Math.max(200, Math.min(25000, remainingAfterSleep - 50));
      attemptResult = await invokeSingleModel({
        model: primaryModel,
        apiKey,
        systemInstruction: params.systemInstruction,
        contents: params.contents,
        timeoutMs: timeout2,
        httpPost,
      });

      if (attemptResult.ok && attemptResult.replyText) {
        return {
          ok: true,
          replyText: attemptResult.replyText,
          modelUsed: primaryModel,
          usage: attemptResult.usage,
          latencyMs: Date.now() - start,
        };
      }
    }
  }

  // Attempt 3: Fallback Model (GEMINI_FALLBACK_MODEL) if configured and budget permits
  const remainingBeforeFallback = deadline - Date.now();
  if (fallbackModel && fallbackModel !== primaryModel && remainingBeforeFallback > 1200) {
    logger.warn('Primary Gemini model failed, switching to fallback model', {
      primaryModel,
      fallbackModel,
      errorCode: attemptResult.errorCode,
    });

    const timeoutFb = Math.max(200, Math.min(25000, remainingBeforeFallback - 100));
    const fbResult = await invokeSingleModel({
      model: fallbackModel,
      apiKey,
      systemInstruction: params.systemInstruction,
      contents: params.contents,
      timeoutMs: timeoutFb,
      httpPost,
    });

    if (fbResult.ok && fbResult.replyText) {
      return {
        ok: true,
        replyText: fbResult.replyText,
        modelUsed: fallbackModel,
        usage: fbResult.usage,
        latencyMs: Date.now() - start,
      };
    }

    return {
      ok: false,
      modelUsed: fallbackModel,
      usage: fbResult.usage,
      latencyMs: Date.now() - start,
      errorCode: fbResult.errorCode || attemptResult.errorCode,
      errorMessage: fbResult.errorMessage || attemptResult.errorMessage,
    };
  }

  return {
    ok: false,
    modelUsed: primaryModel,
    usage: attemptResult.usage,
    latencyMs: Date.now() - start,
    errorCode: attemptResult.errorCode,
    errorMessage: attemptResult.errorMessage,
  };
}

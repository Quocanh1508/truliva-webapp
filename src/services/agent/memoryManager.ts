import defaultPrisma from '../../config/database';
import logger from '../../utils/logger';
import {
  AgentChannel,
  AgentIntent,
  ClientHistoryEntry,
  ConversationState,
  GeminiPart,
  GeminiTurn,
} from './types';

export const MAX_STORED_TURNS = 6; // 3 cặp user + model gần nhất
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 giờ
export const MAX_SESSIONS_IN_RAM = 1000;

const MODEL_CODE_REGEX = /\b(?:UR|CR-ZX|CR|UX|W|YDZ|QY\/F)\s*-?\s*[0-9]{3,6}[A-Z0-9-]*\b/gi;

/**
 * Trích xuất mã model sản phẩm Truliva theo thứ tự xuất hiện (mã mới nhất ở cuối).
 */
export function extractModelCodes(text: string): string[] {
  if (!text) return [];
  const matches = text.match(MODEL_CODE_REGEX) || [];
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const raw of matches) {
    const normalized = raw.replace(/\s+/g, '').trim().toUpperCase();
    if (normalized.length >= 4 && !seen.has(normalized)) {
      seen.add(normalized);
      ordered.push(normalized);
    }
  }

  return ordered;
}

function cloneParts(parts: GeminiPart[]): GeminiPart[] {
  const cloned: GeminiPart[] = [];
  for (const p of parts || []) {
    if (!p) continue;
    if (typeof p.text === 'string' && p.text.trim().length > 0) {
      cloned.push({ text: p.text });
    } else if (p.inline_data && p.inline_data.data) {
      cloned.push({
        inline_data: {
          mime_type: p.inline_data.mime_type,
          data: p.inline_data.data,
        },
      });
    }
  }
  return cloned;
}

/**
 * Chuẩn hóa mảng turns sao cho luôn bắt đầu bằng 'user' và luân phiên chặt chẽ user <-> model.
 */
export function normalizeGeminiTurns(rawTurns: GeminiTurn[]): GeminiTurn[] {
  const merged: GeminiTurn[] = [];

  for (const turn of rawTurns || []) {
    if (!turn || (turn.role !== 'user' && turn.role !== 'model')) continue;
    const parts = cloneParts(turn.parts);
    if (parts.length === 0) continue;

    // Bỏ qua lượt model mồ côi ở đầu lịch sử
    if (merged.length === 0 && turn.role === 'model') {
      continue;
    }

    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.parts.push(...parts);
    } else {
      merged.push({ role: turn.role, parts });
    }
  }

  return merged;
}

/**
 * Loại bỏ chuỗi Base64 ảnh khỏi các lượt lịch sử cũ để tránh phình RAM và token.
 */
export function stripInlineMediaFromParts(parts: GeminiPart[]): GeminiPart[] {
  const textParts: GeminiPart[] = [];
  let hasImage = false;

  for (const p of parts || []) {
    if (p?.inline_data) {
      hasImage = true;
    } else if (typeof p?.text === 'string' && p.text.trim().length > 0) {
      textParts.push({ text: p.text });
    }
  }

  if (hasImage) {
    if (textParts.length === 0) {
      textParts.push({ text: '[Khách đã gửi hình ảnh sản phẩm]' });
    } else {
      textParts[textParts.length - 1] = {
        text: `${textParts[textParts.length - 1].text} [Kèm hình ảnh]`,
      };
    }
  }

  return textParts;
}

export function stripInlineMediaFromHistory(turns: GeminiTurn[]): GeminiTurn[] {
  return (turns || []).map((t) => ({
    role: t.role,
    parts: stripInlineMediaFromParts(t.parts),
  }));
}

function mergeActiveModels(existing: string[], detected: string[]): string[] {
  const combined = [...existing];
  for (const m of detected) {
    const idx = combined.indexOf(m);
    if (idx !== -1) {
      combined.splice(idx, 1);
    }
    combined.push(m);
  }
  return combined.slice(-3);
}

function buildPairedHistory(turns: GeminiTurn[]): GeminiTurn[] {
  const normalized = normalizeGeminiTurns(turns);
  // Đảm bảo lịch sử luôn kết thúc bằng 'model' để khi nối user turn mới không tạo [user, user]
  if (normalized.length > 0 && normalized[normalized.length - 1].role === 'user') {
    normalized.pop();
  }
  const sliced = normalized.slice(-MAX_STORED_TURNS);
  return normalizeGeminiTurns(sliced);
}

export interface MemoryDeps {
  prisma?: typeof defaultPrisma;
}

export class MemoryManager {
  private sessions = new Map<string, ConversationState>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(startCleanupTimer = true) {
    if (startCleanupTimer) {
      this.cleanupTimer = setInterval(() => {
        this.evictExpired();
      }, 30 * 60 * 1000);
      this.cleanupTimer.unref();
    }
  }

  public evictExpired(now = Date.now()): number {
    let removed = 0;
    for (const [key, state] of this.sessions.entries()) {
      if (now - state.lastActive > SESSION_TTL_MS) {
        this.sessions.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  public getSnapshot(sessionKey: string): ConversationState | undefined {
    return this.sessions.get(sessionKey);
  }

  public getSessionCount(): number {
    return this.sessions.size;
  }

  public clear(): void {
    this.sessions.clear();
  }

  private touchSession(state: ConversationState): void {
    // Re-insert to maintain LRU order
    if (this.sessions.has(state.sessionKey)) {
      this.sessions.delete(state.sessionKey);
    }
    this.sessions.set(state.sessionKey, state);

    while (this.sessions.size > MAX_SESSIONS_IN_RAM) {
      const oldestKey = this.sessions.keys().next().value;
      if (!oldestKey) break;
      this.sessions.delete(oldestKey);
    }
  }

  private convertClientHistory(clientHistory: ClientHistoryEntry[]): ConversationState['turns'] {
    const raw: GeminiTurn[] = [];
    for (const entry of clientHistory.slice(-MAX_STORED_TURNS)) {
      const text = typeof entry?.text === 'string' ? entry.text.trim() : '';
      if (!text) continue;
      const isModel =
        entry.role === 'model' ||
        entry.role === 'assistant' ||
        entry.sender === 'ai' ||
        entry.sender === 'bot' ||
        entry.sender === 'model';
      raw.push({
        role: isModel ? 'model' : 'user',
        parts: [{ text }],
      });
    }
    return buildPairedHistory(raw);
  }

  /**
   * Lấy state hội thoại từ RAM hoặc khôi phục từ DB (nếu cold-start) / clientHistory.
   */
  public async getOrHydrateState(
    params: {
      sessionKey: string;
      channel: AgentChannel;
      sessionId?: string;
      clientHistory?: ClientHistoryEntry[];
    },
    deps?: MemoryDeps
  ): Promise<ConversationState> {
    const now = Date.now();

    if (params.channel === 'PLAYGROUND' && Array.isArray(params.clientHistory)) {
      const turns = this.convertClientHistory(params.clientHistory);
      const historyText = turns
        .flatMap((t) => t.parts.map((p) => p.text || ''))
        .join(' ');
      const activeModels = extractModelCodes(historyText);
      const existing = this.sessions.get(params.sessionKey);
      const state: ConversationState = {
        sessionKey: params.sessionKey,
        channel: params.channel,
        lastActive: now,
        turnCount: Math.max(existing?.turnCount || 0, Math.floor(turns.length / 2)),
        activeModels,
        lastIntent: existing?.lastIntent,
        turns,
        hydratedFromDb: false,
      };
      this.touchSession(state);
      return state;
    }

    const cached = this.sessions.get(params.sessionKey);
    if (cached && now - cached.lastActive <= SESSION_TTL_MS) {
      cached.lastActive = now;
      cached.turns = buildPairedHistory(cached.turns);
      this.touchSession(cached);
      return cached;
    }

    // Cold-start hydration from DB for stateful channels
    let hydratedTurns: GeminiTurn[] = [];
    let hydratedFromDb = false;
    const prismaClient = deps?.prisma || defaultPrisma;

    try {
      const dbSession = params.sessionId
        ? await prismaClient.aiChatSession.findUnique({
            where: { id: params.sessionId },
            include: {
              messages: {
                orderBy: { createdAt: 'desc' },
                take: MAX_STORED_TURNS,
              },
            },
          })
        : await prismaClient.aiChatSession.findFirst({
            where: { sessionCode: params.sessionKey, isActive: true },
            include: {
              messages: {
                orderBy: { createdAt: 'desc' },
                take: MAX_STORED_TURNS,
              },
            },
          });

      if (dbSession && Array.isArray(dbSession.messages) && dbSession.messages.length > 0) {
        const chronological = [...dbSession.messages].reverse();
        const rawTurns: GeminiTurn[] = chronological.map((m: any) => ({
          role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
          parts: [{ text: String(m.content || '') }],
        }));
        hydratedTurns = buildPairedHistory(rawTurns);
        hydratedFromDb = true;
      }
    } catch (err: any) {
      logger.warn('Failed to hydrate conversation state from DB, starting fresh', {
        sessionKey: params.sessionKey,
        error: err?.message,
      });
    }

    const historyText = hydratedTurns
      .flatMap((t) => t.parts.map((p) => p.text || ''))
      .join(' ');

    const freshState: ConversationState = {
      sessionKey: params.sessionKey,
      channel: params.channel,
      lastActive: now,
      turnCount: Math.floor(hydratedTurns.length / 2),
      activeModels: extractModelCodes(historyText),
      turns: hydratedTurns,
      hydratedFromDb,
    };
    this.touchSession(freshState);
    return freshState;
  }

  /**
   * Tạo bản sao contents gửi lên Gemini mà KHÔNG thay đổi state trong RAM.
   */
  public buildContentsForTurn(historyTurns: GeminiTurn[], currentUserParts: GeminiPart[]): GeminiTurn[] {
    const safeHistory = buildPairedHistory(historyTurns);
    const safeCurrent = cloneParts(currentUserParts);
    if (safeCurrent.length === 0) {
      safeCurrent.push({ text: 'Xin chào Truliva!' });
    }
    return [...safeHistory, { role: 'user', parts: safeCurrent }];
  }

  /**
   * Chỉ commit cặp (user, model) vào memory khi đã có phản hồi hợp lệ (chống Poisoned Session).
   */
  public commitCompletedTurn(
    sessionKey: string,
    channel: AgentChannel,
    userParts: GeminiPart[],
    modelReply: string,
    detectedModels: string[],
    intent: AgentIntent
  ): ConversationState {
    const now = Date.now();
    const current = this.sessions.get(sessionKey) || {
      sessionKey,
      channel,
      lastActive: now,
      turnCount: 0,
      activeModels: [],
      turns: [],
      hydratedFromDb: false,
    };

    const strippedUserParts = stripInlineMediaFromParts(userParts);
    const nextTurns = buildPairedHistory([
      ...stripInlineMediaFromHistory(current.turns),
      { role: 'user', parts: strippedUserParts },
      { role: 'model', parts: [{ text: modelReply }] },
    ]);

    const updated: ConversationState = {
      ...current,
      channel,
      lastActive: now,
      turnCount: current.turnCount + 1,
      activeModels: mergeActiveModels(current.activeModels, detectedModels),
      lastIntent: intent,
      turns: nextTurns,
    };

    this.touchSession(updated);
    return updated;
  }
}

export const defaultMemoryManager = new MemoryManager(true);

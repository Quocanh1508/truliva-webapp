import logger from '../../utils/logger';
import { ToolName, ToolResult } from './types';

export const DEFAULT_TOOL_TIMEOUT_MS = 8000;
export const MAX_TOOL_ITERATIONS = 2;

export interface ToolCallSpec<T = any> {
  tool: ToolName;
  args: Record<string, any>;
  timeoutMs?: number;
  run: () => Promise<T>;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
}

/**
 * Điều phối thực thi công cụ có timeout riêng, khử trùng lặp và chặn trần số vòng lặp.
 * Không bao giờ throw lỗi ra ngoài làm sập luồng hội thoại.
 */
export class ToolExecutor {
  private seenCalls = new Set<string>();
  private iterationCount = 0;
  private maxIterations: number;

  constructor(maxIterations = MAX_TOOL_ITERATIONS) {
    this.maxIterations = maxIterations;
  }

  public getIterationCount(): number {
    return this.iterationCount;
  }

  public async executeBatch(calls: ToolCallSpec[]): Promise<ToolResult[]> {
    if (!Array.isArray(calls) || calls.length === 0) {
      return [];
    }

    if (this.iterationCount >= this.maxIterations) {
      logger.warn('ToolExecutor reached MAX_TOOL_ITERATIONS, skipping batch', {
        iterationCount: this.iterationCount,
        maxIterations: this.maxIterations,
      });
      return calls.map((c) => ({
        tool: c.tool,
        ok: false,
        data: null,
        errorCode: 'MAX_ITERATIONS_EXCEEDED',
        errorMessage: `Đã vượt quá giới hạn ${this.maxIterations} vòng gọi công cụ`,
        latencyMs: 0,
      }));
    }

    this.iterationCount += 1;

    return Promise.all(calls.map((spec) => this.executeSingle(spec)));
  }

  private async executeSingle<T>(spec: ToolCallSpec<T>): Promise<ToolResult<T | null>> {
    const start = Date.now();
    const dedupeKey = `${spec.tool}:${stableJson(spec.args)}`;

    if (this.seenCalls.has(dedupeKey)) {
      return {
        tool: spec.tool,
        ok: true,
        data: null,
        latencyMs: 0,
        skippedAsDuplicate: true,
      };
    }

    this.seenCalls.add(dedupeKey);
    const timeoutMs = Math.max(100, spec.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS);
    let timer: NodeJS.Timeout | undefined;

    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const err: any = new Error(`Tool ${spec.tool} timed out after ${timeoutMs}ms`);
          err.code = 'TOOL_TIMEOUT';
          reject(err);
        }, timeoutMs);
      });

      const data = await Promise.race([spec.run(), timeoutPromise]);
      return {
        tool: spec.tool,
        ok: true,
        data,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      const errorCode = err?.code === 'TOOL_TIMEOUT' ? 'TOOL_TIMEOUT' : 'TOOL_ERROR';
      logger.warn('Agent tool execution isolated error', {
        tool: spec.tool,
        errorCode,
        error: err?.message || String(err),
      });
      return {
        tool: spec.tool,
        ok: false,
        data: null,
        errorCode,
        errorMessage: err?.message || String(err),
        latencyMs: Date.now() - start,
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}

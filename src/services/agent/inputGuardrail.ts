import axios from 'axios';
import logger from '../../utils/logger';
import { GeminiPart, GuardrailResult } from './types';

export const MAX_INPUT_CHARS = 2000;
export const MAX_IMAGES_PER_TURN = 3;
export const IMAGE_FETCH_TIMEOUT_MS = 8000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const DEFAULT_TRUSTED_IMAGE_SUFFIXES = ['fbcdn.net', 'fbsbx.com'];

const PROMPT_INJECTION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions?|prompts?|rules?)/i,
    reason: 'system_override_en',
  },
  {
    pattern: /disregard\s+(all\s+)?(previous|prior|system)\s+(instructions?|prompts?|rules?)/i,
    reason: 'system_disregard_en',
  },
  {
    pattern: /(reveal|show|print|output|repeat|dump)\s+(your\s+|the\s+)?(system\s+prompt|system\s+instruction|hidden\s+prompt|developer\s+prompt)/i,
    reason: 'prompt_extraction_en',
  },
  {
    pattern: /(in\s+ra|hiển\s+thị|tiết\s+lộ|cho\s+xem|đọc\s+nguyên\s+văn)\s+(toàn\s+bộ\s+)?(system\s+prompt|system\s+instruction|câu\s+lệnh\s+hệ\s+thống|hướng\s+dẫn\s+hệ\s+thống)/i,
    reason: 'prompt_extraction_vi',
  },
  {
    pattern: /(bạn\s+hãy\s+|hãy\s+)?quên\s+(hết|toàn\s+bộ|tất\s+cả)\s+(các\s+)?(hướng\s+dẫn|quy\s+tắc|nhiệm\s+vụ|vai\s+trò)\s*(trước\s+đó|hệ\s+thống|ban\s+đầu)/i,
    reason: 'system_override_vi',
  },
  {
    pattern: /<\s*\/?\s*system_instruction\s*>/i,
    reason: 'xml_tag_injection',
  },
  {
    pattern: /\[\s*SYSTEM\s+OVERRIDE\s*\]/i,
    reason: 'marker_override',
  },
];

/**
 * Phát hiện các mẫu trích xuất system prompt hoặc ghi đè vai trò hệ thống rõ ràng.
 */
export function detectPromptInjection(text: string): { blocked: boolean; reason?: string } {
  const normalized = (text || '').trim();
  if (!normalized) {
    return { blocked: false };
  }

  for (const { pattern, reason } of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return { blocked: true, reason };
    }
  }

  return { blocked: false };
}

function isIpLiteralOrLocalhost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }
  // IPv4 literal
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return true;
  }
  // IPv6 literal (contains colon)
  if (host.includes(':')) {
    return true;
  }
  return false;
}

function getTrustedHostSuffixes(extraHosts?: string[]): string[] {
  const envHosts = (process.env.AI_TRUSTED_IMAGE_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const custom = (extraHosts || []).map((h) => h.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set([...DEFAULT_TRUSTED_IMAGE_SUFFIXES, ...envHosts, ...custom]));
}

/**
 * Kiểm tra URL ảnh có thuộc HTTPS và domain tin cậy của Meta CDN / cấu hình sẵn (chống SSRF).
 */
export function isTrustedImageUrl(rawUrl: string, extraHosts?: string[]): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') {
    return false;
  }
  if (parsed.username || parsed.password) {
    return false;
  }

  const hostname = (parsed.hostname || '').toLowerCase();
  if (!hostname || isIpLiteralOrLocalhost(hostname)) {
    return false;
  }

  const trustedSuffixes = getTrustedHostSuffixes(extraHosts);
  return trustedSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
}

export interface ImageFetchDeps {
  httpGet?: typeof axios.get;
  extraTrustedHosts?: string[];
}

function resolveRedirectTarget(opts: any): string {
  if (opts?.href && typeof opts.href === 'string') {
    return opts.href;
  }
  const protocol = opts?.protocol || '';
  const hostname = opts?.hostname || opts?.host || '';
  const path = opts?.path || '/';
  return `${protocol}//${hostname}${path}`;
}

/**
 * Tải tối đa MAX_IMAGES_PER_TURN ảnh song song với kiểm tra SSRF cho cả redirect.
 */
export async function fetchSafeImages(
  imageUrls: string[],
  deps?: ImageFetchDeps
): Promise<{ imageParts: GeminiPart[]; droppedCount: number }> {
  const validList = Array.isArray(imageUrls)
    ? imageUrls.filter((u) => typeof u === 'string' && u.trim().length > 0)
    : [];

  if (validList.length === 0) {
    return { imageParts: [], droppedCount: 0 };
  }

  const capped = validList.slice(0, MAX_IMAGES_PER_TURN);
  let droppedCount = Math.max(0, validList.length - MAX_IMAGES_PER_TURN);
  const httpGet = deps?.httpGet || axios.get;

  const results = await Promise.allSettled(
    capped.map(async (rawUrl): Promise<GeminiPart | null> => {
      if (!isTrustedImageUrl(rawUrl, deps?.extraTrustedHosts)) {
        logger.warn('Blocked untrusted attachment URL in input guardrail', { imageUrl: rawUrl });
        return null;
      }

      try {
        const response = await httpGet(rawUrl, {
          responseType: 'arraybuffer',
          timeout: IMAGE_FETCH_TIMEOUT_MS,
          maxContentLength: MAX_IMAGE_BYTES,
          maxRedirects: 3,
          beforeRedirect: (opts: any) => {
            const target = resolveRedirectTarget(opts);
            if (!isTrustedImageUrl(target, deps?.extraTrustedHosts)) {
              throw new Error(`Redirect to untrusted host blocked: ${target}`);
            }
          },
        });

        const rawContentType = response.headers?.['content-type'];
        const contentType = typeof rawContentType === 'string' ? rawContentType : '';
        if (!contentType.toLowerCase().startsWith('image/')) {
          return null;
        }

        const base64Data = Buffer.from(response.data).toString('base64');
        if (!base64Data) {
          return null;
        }

        return {
          inline_data: {
            mime_type: contentType.split(';')[0].trim(),
            data: base64Data,
          },
        };
      } catch (err: any) {
        logger.warn('Failed to fetch safe image attachment', {
          imageUrl: rawUrl,
          error: err?.message || String(err),
        });
        return null;
      }
    })
  );

  const imageParts: GeminiPart[] = [];
  for (const res of results) {
    if (res.status === 'fulfilled' && res.value) {
      imageParts.push(res.value);
    } else {
      droppedCount += 1;
    }
  }

  return { imageParts, droppedCount };
}

/**
 * Chuẩn hóa text, kiểm tra prompt injection và tải ảnh an toàn.
 */
export async function runInputGuardrail(
  input: { text: string; imageUrls?: string[] },
  deps?: ImageFetchDeps
): Promise<GuardrailResult> {
  const cleanedRaw = (input.text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim();

  const truncated = cleanedRaw.length > MAX_INPUT_CHARS;
  const sanitizedText = truncated ? cleanedRaw.slice(0, MAX_INPUT_CHARS).trim() : cleanedRaw;

  const injectionCheck = detectPromptInjection(sanitizedText);
  if (injectionCheck.blocked) {
    return {
      blocked: true,
      blockReason: injectionCheck.reason,
      sanitizedText,
      truncated,
      imageParts: [],
      droppedImagesCount: Array.isArray(input.imageUrls) ? input.imageUrls.length : 0,
    };
  }

  const { imageParts, droppedCount } = await fetchSafeImages(input.imageUrls || [], deps);

  return {
    blocked: false,
    sanitizedText,
    truncated,
    imageParts,
    droppedImagesCount: droppedCount,
  };
}

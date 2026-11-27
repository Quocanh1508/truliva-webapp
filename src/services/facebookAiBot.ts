import axios from 'axios';
import logger from '../utils/logger';
import { runAgentTurn } from './agent/agentOrchestrator';

function getFbPageAccessToken(): string {
  return (process.env.FB_PAGE_ACCESS_TOKEN || '').trim();
}

/**
 * Gửi hiệu ứng "đang soạn tin nhắn..." (typing_on) qua Facebook Graph API
 */
export async function sendFacebookTypingIndicator(recipientId: string): Promise<boolean> {
  const token = getFbPageAccessToken();
  if (!token) {
    return false;
  }

  try {
    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`;
    await axios.post(
      url,
      {
        recipient: { id: recipientId },
        sender_action: 'typing_on',
      },
      { timeout: 5000 }
    );
    return true;
  } catch (error: any) {
    logger.warn('Failed to send typing_on to Facebook', { recipientId, error: error.message });
    return false;
  }
}

/**
 * Gửi tin nhắn trả lời lại khách hàng qua Facebook Graph API
 */
export async function sendFacebookReply(recipientId: string, messageText: string): Promise<boolean> {
  const token = getFbPageAccessToken();
  if (!token) {
    logger.warn('FB_PAGE_ACCESS_TOKEN is missing, skipping Facebook reply', { recipientId });
    return false;
  }

  try {
    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`;
    const response = await axios.post(
      url,
      {
        recipient: { id: recipientId },
        message: { text: messageText },
      },
      { timeout: 10000 }
    );

    logger.info('Sent Facebook reply successfully', {
      recipientId,
      messageId: response.data?.message_id,
    });
    return true;
  } catch (error: any) {
    logger.error('Failed to send Facebook reply', {
      recipientId,
      error: error.response?.data || error.message,
    });
    return false;
  }
}

// ── KHÓA TUẦN TỰ THEO TỪNG NGƯỜI GỬI (PER-SENDER MUTEX) ──
const senderLocks = new Map<string, Promise<void>>();

export function getActiveSenderLockCount(): number {
  return senderLocks.size;
}

/**
 * Bảo đảm mọi tác vụ AI của cùng 1 senderId chạy tuần tự, giải phóng khóa trong finally
 * và dọn sạch entry khỏi Map khi hàng đợi rỗng để tránh deadlock hoặc rò rỉ RAM.
 */
export function enqueueSenderTask(senderId: string, task: () => Promise<void>): Promise<void> {
  const previous = senderLocks.get(senderId) || Promise.resolve();

  const current = previous
    .catch(() => {})
    .then(() => task())
    .finally(() => {
      if (senderLocks.get(senderId) === current) {
        senderLocks.delete(senderId);
      }
    });

  senderLocks.set(senderId, current);
  return current;
}

// ── BỘ ĐỆM GOM CỤM TIN NHẮN (MESSAGE DEBOUNCE AGGREGATOR - 5 GIÂY) ──
interface PendingBufferItem {
  texts: string[];
  imageUrls: string[];
  firstReceivedAt: number;
  timer: NodeJS.Timeout;
}

const pendingBuffers: Map<string, PendingBufferItem> = new Map();
const DEBOUNCE_DELAY_MS = 5000;
const MAX_BUFFER_WAIT_MS = 8000;

function dispatchSenderTurn(senderId: string, combinedText: string, combinedImages: string[]): void {
  enqueueSenderTask(senderId, () =>
    processFacebookMessageWithAI(senderId, combinedText, combinedImages)
  ).catch((err) => {
    logger.error('Failed to process queued Facebook message with AI', {
      senderId,
      error: err?.message || String(err),
    });
  });
}

/**
 * Đưa tin nhắn / hình ảnh của khách vào hàng đợi gom tin nhắn 5 giây và chạy qua Per-Sender Mutex.
 */
export function enqueueFacebookMessage(
  senderId: string,
  text: string,
  imageUrls: string[] = [],
  immediate: boolean = false
): void {
  sendFacebookTypingIndicator(senderId).catch(() => {});

  const cleanText = text?.trim() || '';

  if (immediate) {
    const existing = pendingBuffers.get(senderId);
    let combinedTexts: string[] = [];
    let combinedImages: string[] = [];

    if (existing) {
      clearTimeout(existing.timer);
      pendingBuffers.delete(senderId);
      combinedTexts = [...existing.texts];
      combinedImages = [...existing.imageUrls];
    }

    if (cleanText && !combinedTexts.includes(cleanText)) {
      combinedTexts.push(cleanText);
    }
    for (const url of imageUrls) {
      if (url && !combinedImages.includes(url)) {
        combinedImages.push(url);
      }
    }

    dispatchSenderTurn(senderId, combinedTexts.join('\n'), combinedImages);
    return;
  }

  const now = Date.now();
  const existing = pendingBuffers.get(senderId);

  if (existing) {
    if (cleanText && !existing.texts.includes(cleanText)) {
      existing.texts.push(cleanText);
    }
    for (const url of imageUrls) {
      if (url && !existing.imageUrls.includes(url)) {
        existing.imageUrls.push(url);
      }
    }
    clearTimeout(existing.timer);

    if (now - existing.firstReceivedAt >= MAX_BUFFER_WAIT_MS) {
      pendingBuffers.delete(senderId);
      const combinedText = existing.texts.join('\n');
      const combinedImages = existing.imageUrls;
      logger.info('Flushing Facebook message buffer (Max wait reached)', {
        senderId,
        textCount: existing.texts.length,
        imageCount: combinedImages.length,
      });
      dispatchSenderTurn(senderId, combinedText, combinedImages);
      return;
    }

    existing.timer = setTimeout(() => {
      pendingBuffers.delete(senderId);
      const combinedText = existing.texts.join('\n');
      const combinedImages = existing.imageUrls;
      logger.info('Flushing Facebook message buffer (Debounce timer elapsed)', {
        senderId,
        textCount: existing.texts.length,
        imageCount: combinedImages.length,
      });
      dispatchSenderTurn(senderId, combinedText, combinedImages);
    }, DEBOUNCE_DELAY_MS);
  } else {
    const item: PendingBufferItem = {
      texts: cleanText ? [cleanText] : [],
      imageUrls: imageUrls.filter(Boolean),
      firstReceivedAt: now,
      timer: setTimeout(() => {
        pendingBuffers.delete(senderId);
        const combinedText = item.texts.join('\n');
        const combinedImages = item.imageUrls;
        logger.info('Flushing Facebook message buffer (Initial timer elapsed)', {
          senderId,
          textCount: item.texts.length,
          imageCount: combinedImages.length,
        });
        dispatchSenderTurn(senderId, combinedText, combinedImages);
      }, DEBOUNCE_DELAY_MS),
    };
    pendingBuffers.set(senderId, item);
  }
}

/**
 * Xử lý tin nhắn và hình ảnh của khách bằng Agent 5 tầng thống nhất.
 */
export async function processFacebookMessageWithAI(
  senderId: string,
  userText: string,
  imageUrls: string[] = []
): Promise<void> {
  try {
    const result = await runAgentTurn({
      channel: 'FACEBOOK',
      sessionKey: `FB_${senderId}`,
      userName: `Khách FB (${senderId.slice(-4)})`,
      message: userText || '',
      imageUrls,
    });

    if (result.skippedDisabled || !result.reply) {
      return;
    }

    await sendFacebookReply(senderId, result.reply);
  } catch (error: any) {
    logger.error('Error processing message with Agent Orchestrator', {
      senderId,
      error: error?.response?.data || error?.message || String(error),
    });
    await sendFacebookReply(
      senderId,
      'Dạ Truliva đã ghi nhận thông tin từ anh/chị rồi ạ. Chuyên viên Truliva sẽ kiểm tra và phản hồi lại anh/chị ngay nhé!'
    );
  }
}

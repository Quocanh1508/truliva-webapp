import axios from 'axios';
import prisma from '../config/database';
import logger from '../utils/logger';
import { searchHybridRAG } from './ragService';

// Cấu hình biến môi trường
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-3.5-flash-lite';

// Bộ nhớ đệm hội thoại theo senderId (lưu tối đa 8 tin nhắn gần nhất mỗi người)
interface ChatMessagePart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

interface ChatTurn {
  role: 'user' | 'model';
  parts: ChatMessagePart[];
}

const userConversationHistory: Map<string, { lastActive: number; turns: ChatTurn[] }> = new Map();

// Dọn dẹp cache sau 2 giờ không hoạt động
setInterval(() => {
  const now = Date.now();
  for (const [senderId, session] of userConversationHistory.entries()) {
    if (now - session.lastActive > 2 * 60 * 60 * 1000) {
      userConversationHistory.delete(senderId);
    }
  }
}, 30 * 60 * 1000);

const SYSTEM_INSTRUCTION_FALLBACK = `Bạn là Trợ lý ảo CSKH chính thức của Truliva (Pure Vita) - Thương hiệu máy lọc nước & giải pháp nước sạch gia đình.

NGUYÊN TẮC TRẢ LỜI QUAN TRỌNG NHẤT:
1. TRẢ LỜI NGẮN GỌN, TRỰC DIỆN, ĐÚNG TRỌNG TÂM: Tuyệt đối không lan man, không viết văn dài dòng, không hỏi ngược khách dồn dập. Đi thẳng vào câu trả lời trong 3-5 dòng.
2. XƯNG HÔ: "Dạ Truliva xin chào...", gọi khách là "anh/chị" hoặc "bạn". Giọng điệu lịch sự, chuyên nghiệp, rõ ràng.
3. CHÍNH SÁCH BẢO HÀNH CHUẨN XÁC THEO TỪNG MODEL:
   - Dòng máy Delica UR5840: Bảo hành chính hãng 24 THÁNG (2 năm).
   - Tất cả các dòng máy lọc nước khác (UR5676, UR5640, CR5240, UR3140, W6412, UR61096H, CR-ZX5170, UX5010...): Bảo hành chính hãng 12 THÁNG (1 năm).
   - Lõi lọc tiêu hao: Không thuộc phạm vi bảo hành máy, có chu kỳ thay định kỳ (Lõi 1: 3-6 tháng, Lõi 2: 6-9 tháng, Lõi 3: 9-12 tháng, RO: 24-36 tháng).
4. QUY TRÌNH HƯỚNG DẪN KÍCH HOẠT BẢO HÀNH ĐIỆN TỬ:
   - Hướng dẫn khách truy cập: https://trulivavietnam.com/warranty-activate hoặc mở Zalo Mini App "Truliva" (hoặc quét mã QR trên tem máy).
   - Nhập số Serial in trên tem máy (15-20 ký tự).
   - Điền Tên + Số điện thoại nhận tin nhắn Zalo xác nhận là xong ngay.
5. THÔNG TIN LIÊN HỆ CHÍNH HÃNG:
   - Hotline CSKH: 1900 638 463 (08:00 - 18:00 hàng ngày)
   - Trụ sở: 65 Đường 42-AP, Phường An Phú, TP. Thủ Đức, TP. Hồ Chí Minh
   - Website: https://trulivavietnam.com`;

let cachedInstruction = '';
let lastInstructionFetch = 0;

/**
 * Lấy prompt và tri thức động từ Database Truliva
 */
async function getDynamicSystemInstruction(): Promise<{ instruction: string; isEnabled: boolean }> {
  const now = Date.now();
  if (cachedInstruction && now - lastInstructionFetch < 60 * 1000) {
    return { instruction: cachedInstruction, isEnabled: true };
  }

  try {
    const config = await prisma.aiBotConfig.findUnique({ where: { id: 'default' } });
    if (config && !config.isEnabled) {
      return { instruction: '', isEnabled: false };
    }

    const systemPrompt = config?.systemPrompt || SYSTEM_INSTRUCTION_FALLBACK;
    const knowledgeText = config?.knowledgeText || '';
    const faqs = (config?.faqs as any[]) || [];

    let faqContext = '';
    if (Array.isArray(faqs) && faqs.length > 0) {
      faqContext = '\n\nCÂU HỎI THƯỜNG GẶP (FAQ CHUẨN):\n' +
        faqs.map(f => `Hỏi: ${f.question}\nĐáp: ${f.answer}`).join('\n\n');
    }

    let catalogContext = '';
    if (config?.syncCatalog) {
      const [products, combos] = await Promise.all([
        prisma.product.findMany({
          where: { isActive: true },
          select: { name: true, sku: true, sellingPrice: true },
          take: 20
        }),
        prisma.productCombo.findMany({
          where: { isActive: true },
          select: { displayName: true, comboKey: true },
          take: 15
        })
      ]);

      catalogContext = '\n\nDANH MỤC SẢN PHẨM & COMBO THỰC TẾ TRONG HỆ THỐNG TRULIVA:\n' +
        '1. Sản phẩm/Linh kiện:\n' +
        products.map(p => `- ${p.name} (SKU: ${p.sku}) | Giá niêm yết: ${p.sellingPrice?.toLocaleString('vi-VN')} đ`).join('\n') +
        '\n2. Các gói Combo phổ biến:\n' +
        combos.map(c => `- ${c.displayName} (${c.comboKey})`).join('\n');
    }

    const full = `${systemPrompt}\n\nTHÔNG TIN LIÊN HỆ:\n- Hotline: ${config?.hotline || '1900 638 463'}\n- Giờ làm việc: ${config?.workingHours || '08:00 - 18:00'}\n- Địa chỉ: ${config?.address || '65 Đường 42-AP, Phường An Phú, TP. Thủ Đức, TP. HCM'}\n\n${knowledgeText}${faqContext}${catalogContext}`;
    
    cachedInstruction = full;
    lastInstructionFetch = now;
    return { instruction: full, isEnabled: true };
  } catch (error: any) {
    logger.warn('Failed to load dynamic AI config, using fallback', { error: error.message });
    return { instruction: SYSTEM_INSTRUCTION_FALLBACK, isEnabled: true };
  }
}

/**
 * Tải ảnh từ URL của Facebook và chuyển thành base64
 */
async function fetchImageAsBase64(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });
    const rawContentType = response.headers['content-type'];
    const contentType = typeof rawContentType === 'string' ? rawContentType : 'image/jpeg';
    const base64Data = Buffer.from(response.data).toString('base64');
    return {
      mimeType: contentType.split(';')[0].trim(),
      data: base64Data
    };
  } catch (error: any) {
    logger.error('Failed to fetch image attachment from Facebook', { error: error.message, imageUrl });
    return null;
  }
}

/**
 * Gửi tin nhắn trả lời lại khách hàng qua Facebook Graph API
 */
export async function sendFacebookReply(recipientId: string, messageText: string): Promise<boolean> {
  try {
    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${FB_PAGE_ACCESS_TOKEN}`;
    const response = await axios.post(url, {
      recipient: { id: recipientId },
      message: { text: messageText }
    }, { timeout: 10000 });

    logger.info('Sent Facebook reply successfully', {
      recipientId,
      messageId: response.data?.message_id
    });
    return true;
  } catch (error: any) {
    logger.error('Failed to send Facebook reply', {
      recipientId,
      error: error.response?.data || error.message
    });
    return false;
  }
}

/**
 * Xử lý tin nhắn và hình ảnh của khách bằng Gemini AI với tri thức động từ DB
 */
export async function processFacebookMessageWithAI(
  senderId: string,
  userText: string,
  imageUrls: string[] = []
): Promise<void> {
  try {
    // 0. Lấy System Instruction động từ DB
    const { instruction, isEnabled } = await getDynamicSystemInstruction();
    if (!isEnabled) {
      logger.info('AI Bot is disabled in admin settings, skipping reply', { senderId });
      return;
    }

    // 1. Lấy hoặc tạo lịch sử chat của user
    let session = userConversationHistory.get(senderId);
    if (!session) {
      session = { lastActive: Date.now(), turns: [] };
      userConversationHistory.set(senderId, session);
    }
    session.lastActive = Date.now();

    // 2. Chuẩn bị parts của user turn hiện tại
    const currentParts: ChatMessagePart[] = [];
    if (userText && userText.trim()) {
      currentParts.push({ text: userText.trim() });
    }

    // 3. Nếu có ảnh, tải và đưa vào parts
    for (const imgUrl of imageUrls) {
      const imgData = await fetchImageAsBase64(imgUrl);
      if (imgData) {
        currentParts.push({
          inline_data: {
            mime_type: imgData.mimeType,
            data: imgData.data
          }
        });
      }
    }

    if (currentParts.length === 0) {
      currentParts.push({ text: 'Xin chào Truliva!' });
    }

    // Đưa turn hiện tại vào lịch sử
    session.turns.push({
      role: 'user',
      parts: currentParts
    });

    // Giữ tối đa 6 turns gần nhất để không vượt quá token
    if (session.turns.length > 6) {
      session.turns = session.turns.slice(-6);
    }

    // 4. Tra cứu tài liệu nội bộ qua Hybrid RAG nếu có nội dung hỏi
    let ragInstruction = instruction;
    if (userText && userText.trim()) {
      try {
        const ragChunks = await searchHybridRAG(userText.trim(), 3);
        if (ragChunks && ragChunks.length > 0) {
          const ragInfo = '\n\nTÀI LIỆU CHÍNH HÃNG TRULIVA TRA CỨU ĐƯỢC (HYBRID RAG):\n' +
            ragChunks.map((c, idx) => `[Đoạn ${idx + 1} - ${c.sourceTitle || c.fileName} | Trang ${c.metadata?.pageNumber || 1}]:\n${c.content}`).join('\n\n');
          ragInstruction += ragInfo;
        }
      } catch (err: any) {
        logger.warn('Failed to retrieve RAG chunks for Facebook message', { error: err.message });
      }
    }

    // 5. Gọi Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    
    const requestBody = {
      system_instruction: {
        parts: [{ text: ragInstruction }]
      },
      contents: session.turns
    };

    const geminiRes = await axios.post(geminiUrl, requestBody, { timeout: 35000 });
    const replyText = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!replyText) {
      logger.warn('Empty reply from Gemini', { geminiRes: geminiRes.data });
      await sendFacebookReply(senderId, 'Dạ Truliva đã nhận được thông tin từ bạn rồi ạ. Chuyên viên kỹ thuật sẽ kiểm tra và phản hồi lại bạn ngay nhé!');
      return;
    }

    // Lưu câu trả lời của AI vào lịch sử
    session.turns.push({
      role: 'model',
      parts: [{ text: replyText }]
    });

    // 5. Gửi câu trả lời về Facebook Messenger
    await sendFacebookReply(senderId, replyText);

  } catch (error: any) {
    logger.error('Error processing message with Gemini AI', {
      senderId,
      error: error.response?.data || error.message
    });
    // Gửi phản hồi lịch sự dự phòng
    await sendFacebookReply(senderId, 'Dạ Truliva xin chào bạn! Hệ thống đang xử lý yêu cầu của bạn, bạn đợi Truliva trong giây lát nhé!');
  }
}

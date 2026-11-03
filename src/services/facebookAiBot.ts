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

const SYSTEM_INSTRUCTION_FALLBACK = `Bạn là Trợ lý AI CSKH chính thức của Truliva (Pure Vita) - Thương hiệu máy lọc nước & giải pháp nước sạch gia đình.

PHONG CÁCH VÀ NGUYÊN TẮC TƯ VẤN:
1. TỰ NHIÊN, NHÃ NHẶN VÀ LINH HOẠT:
   - Trò chuyện tự nhiên, chuyên nghiệp và ấm áp như một chuyên viên tư vấn khách hàng thực thụ.
   - QUY TẮC CHÀO HỎI: CHỈ gửi lời chào trang trọng ("Dạ Truliva xin chào anh/chị...") ở TIN NHẮN ĐẦU TIÊN của cuộc trò chuyện.
   - Ở các câu hỏi tiếp theo trong cùng hội thoại, TUYỆT ĐỐI KHÔNG lặp lại câu chào "Dạ Truliva xin chào". Hãy vào thẳng vấn đề một cách tự nhiên (ví dụ: "Dạ đối với model UR3626...", "Dạ vâng ạ, thông số kỹ thuật của máy gồm có...", "Dạ hiện tại giá máy là...").
   - Xưng hô: "Dạ em / Truliva", gọi khách là "anh/chị" hoặc "bạn".

2. KHÔNG LẠM DỤNG HOẶC ĐẨY KHÁCH SANG HOTLINE:
   - Khách hàng đang nhắn tin để được tư vấn trực tiếp tại đây. TUYỆT ĐỐI KHÔNG kết thúc câu trả lời bằng câu rập khuôn mời gọi hotline: "vui lòng liên hệ Hotline 1900 638 463...".
   - Chỉ cung cấp số Hotline khi:
     + Khách chủ động hỏi số điện thoại hỗ trợ hoặc thông tin liên hệ.
     + Khách có sự cố rò rỉ nước khẩn cấp hoặc yêu cầu kỹ thuật viên đến tận nhà khảo sát/lắp đặt gấp.
   - Luôn sẵn sàng giải đáp tại chỗ các thắc mắc về giá, tính năng, thông số kỹ thuật và cách sử dụng.

3. GHI NHỚ VÀ THEO SÁT NGỮ CẢNH HỘI THOẠI (MULTI-TURN CONTEXT):
   - Luôn chú ý câu hỏi trước đó của khách để hiểu đúng đối tượng đang nói tới.
   - Ví dụ: Khách vừa hỏi "cho xin giá máy UR3626", sau đó hỏi "thông số chi tiết máy là như nào" hoặc "máy này bảo hành bao lâu" -> Phải hiểu ngay "máy này" là model UR3626 vừa đề cập, KHÔNG ĐƯỢC hỏi lại "anh/chị muốn hỏi model nào".

4. PHÂN BIỆT RÕ RÀNG MÁY CHÍNH VÀ LINH KIỆN / PHỤ KIỆN / COMBO:
   - Khi khách hỏi "giá máy [Model]" (ví dụ: UR3626, UR5840, UR5676...):
     + Luôn ưu tiên báo giá của MÁY LỌC NƯỚC CHÍNH trước (ví dụ: Máy lọc nước Truliva UR3626 giá niêm yết 12.900.000 đ).
     + Nếu có combo hoặc phụ kiện liên quan (như Bộ vòi, Lõi lọc PCP, Lõi lọc RO), có thể giải thích thêm rõ ràng: "Ngoài ra, máy còn có phụ kiện thay thế như Bộ vòi (800.000 đ) hoặc lõi lọc thay thế...".
     + TUYỆT ĐỐI KHÔNG nhầm giá của linh kiện/phụ kiện (vòi, van, vỏ hộp) thành giá của cả chiếc máy lọc nước.

5. CHÍNH SÁCH BẢO HÀNH CHUẨN XÁC:
   - Dòng máy Delica UR5840: Bảo hành chính hãng 24 THÁNG (2 năm).
   - Tất cả các dòng máy lọc nước khác (UR3626, UR5676, UR5640, CR5240, UR3140, W6412, UR61096H, CR-ZX5170, UX5010...): Bảo hành chính hãng 12 THÁNG (1 năm).
   - Lõi lọc tiêuaho: Định kỳ thay thế (Lõi thô: 3-6 tháng, Lõi than: 6-9 tháng, Lõi RO: 24-36 tháng).

6. THÔNG TIN DOANH NGHIỆP TRULIVA:
   - Hotline hỗ trợ: 1900 638 463 (08:00 - 18:00)
   - Kích hoạt bảo hành điện tử: https://trulivavietnam.com/warranty-activate hoặc Zalo Mini App "Truliva"
   - Website chính thức: https://trulivavietnam.com`;

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
    let ragChunks: any[] = [];
    if (userText && userText.trim()) {
      try {
        ragChunks = await searchHybridRAG(userText.trim(), 3);
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

    // Lưu câu trả lời của AI vào lịch sử bộ nhớ tạm
    session.turns.push({
      role: 'model',
      parts: [{ text: replyText }]
    });

    // 5. Gửi câu trả lời về Facebook Messenger
    await sendFacebookReply(senderId, replyText);

    // 6. Ghi nhận phiên chat Facebook và lượng Tokens tiêu thụ vào CSDL
    try {
      let fbSession = await prisma.aiChatSession.findFirst({
        where: { sessionCode: `FB_${senderId}`, isActive: true }
      });

      if (!fbSession) {
        fbSession = await prisma.aiChatSession.create({
          data: {
            sessionCode: `FB_${senderId}`,
            title: `Khách Facebook: ${(userText || 'Tin nhắn mới').slice(0, 50)}`,
            channel: 'FACEBOOK',
            userName: `Khách FB (${senderId.slice(-4)})`,
            totalMessages: 0,
            totalTokens: 0,
            isActive: true
          }
        });
      }

      const usage = geminiRes.data?.usageMetadata || {};
      const promptTokens = usage.promptTokenCount || 0;
      const completionTokens = usage.candidatesTokenCount || 0;
      const totalTokens = usage.totalTokenCount || 0;

      await prisma.aiChatMessage.create({
        data: {
          sessionId: fbSession.id,
          role: 'user',
          content: userText || '[Hình ảnh]',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0
        }
      });

      await prisma.aiChatMessage.create({
        data: {
          sessionId: fbSession.id,
          role: 'assistant',
          content: replyText,
          promptTokens,
          completionTokens,
          totalTokens,
          model: GEMINI_MODEL,
          retrievedChunks: ragChunks && ragChunks.length > 0 ? ragChunks : undefined
        }
      });

      await prisma.aiChatSession.update({
        where: { id: fbSession.id },
        data: {
          totalMessages: { increment: 2 },
          totalTokens: { increment: totalTokens },
          updatedAt: new Date()
        }
      });
    } catch (dbErr: any) {
      logger.warn('Failed to record Facebook chat session tokens in DB', { error: dbErr.message });
    }

  } catch (error: any) {
    logger.error('Error processing message with Gemini AI', {
      senderId,
      error: error.response?.data || error.message
    });
    // Gửi phản hồi lịch sự dự phòng
    await sendFacebookReply(senderId, 'Dạ Truliva xin chào bạn! Hệ thống đang xử lý yêu cầu của bạn, bạn đợi Truliva trong giây lát nhé!');
  }
}

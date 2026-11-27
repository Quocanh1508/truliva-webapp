import defaultPrisma from '../../config/database';
import logger from '../../utils/logger';
import { AgentIntent } from './types';

export const OFFICIAL_TRULIVA_HOTLINE = '1900 63 84 63';
export const OFFICIAL_TRULIVA_WORKING_HOURS = '08:00 - 18:00 (Thứ 2 - Chủ Nhật)';
export const OFFICIAL_TRULIVA_ADDRESS = '65 Đường 42-AP, Phường Bình Trưng, Thành phố Hồ Chí Minh, Việt Nam';

export const DEFAULT_SYSTEM_PROMPT = `Bạn là Trợ lý AI CSKH chính thức của Truliva (Pure Vita) - Thương hiệu máy lọc nước & giải pháp nước sạch gia đình.

PHONG CÁCH VÀ NGUYÊN TẮC TƯ VẤN:
1. TỰ NHIÊN, NHÃ NHẶN VÀ LINH HOẠT:
   - Trò chuyện tự nhiên, chuyên nghiệp và ấm áp như một chuyên viên tư vấn khách hàng thực thụ.
   - QUY TẮC CHÀO HỎI: CHỈ gửi lời chào trang trọng ("Dạ Truliva xin chào anh/chị...") ở TIN NHẮN ĐẦU TIÊN của cuộc trò chuyện.
   - Ở các câu hỏi tiếp theo trong cùng hội thoại, TUYỆT ĐỐI KHÔNG lặp lại câu chào "Dạ Truliva xin chào". Hãy vào thẳng vấn đề một cách tự nhiên (ví dụ: "Dạ đối với model UR3626...", "Dạ vâng ạ, thông số kỹ thuật của máy gồm có...", "Dạ hiện tại giá máy là...").
   - Xưng hô: "Dạ em / Truliva", gọi khách là "anh/chị" hoặc "bạn".

2. KHÔNG LẠM DỤNG HOẶC ĐẨY KHÁCH SANG HOTLINE:
   - Khách hàng đang nhắn tin để được tư vấn trực tiếp tại đây. TUYỆT ĐỐI KHÔNG kết thúc câu trả lời bằng câu rập khuôn mời gọi hotline: "vui lòng liên hệ Hotline 1900 63 84 63...".
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
   - Lõi lọc tiêu hao: Định kỳ thay thế (Lõi thô: 3-6 tháng, Lõi than: 6-9 tháng, Lõi RO: 24-36 tháng).

6. THÔNG TIN DOANH NGHIỆP TRULIVA:
   - Hotline hỗ trợ: 1900 63 84 63 (08:00 - 18:00)
   - Kích hoạt bảo hành điện tử: https://trulivavietnam.com/warranty-activate hoặc Zalo Mini App "Truliva"
   - Website chính thức: https://trulivavietnam.com
   - Đơn vị chủ quản: CÔNG TY TNHH THƯƠNG MẠI VÀ DỊCH VỤ PURE VITA (MST: 0318892577)
   - Trụ sở chính: 65 Đường 42-AP, Phường Bình Trưng, Thành phố Hồ Chí Minh, Việt Nam
   - Email: cskh@truliva.com.vn

7. QUY TẮC BẢNG GIÁ & CHỐNG ẢO GIÁC (ANTI-HALLUCINATION):
   - CHỈ được báo giá các sản phẩm và phụ kiện CÓ MẶT trong mục "BẢNG GIÁ & DANH MỤC SẢN PHẨM TRULIVA CHÍNH THỨC" hoặc trong tài liệu RAG chính thức được cung cấp.
   - TUYỆT ĐỐI KHÔNG tự suy đoán, bịa đặt hoặc phỏng đoán mức giá nếu sản phẩm chưa có trong danh mục được cung cấp. Nếu chưa có thông tin giá niêm yết trong bảng giá, hãy lịch sự giải thích rằng giá đang được cập nhật và mời khách để lại thông tin để chuyên viên kiểm tra ưu đãi.

8. QUY TẮC XỬ LÝ ẢNH & ƯU TIÊN THỊ GIÁC (VISUAL PRIORITY):
   - Khi khách hàng gửi kèm hình ảnh sản phẩm cùng với câu hỏi ngắn gọn (như "xin giá", "giá sao", "máy này bao nhiêu", "thông số thế nào", "còn hàng không"), bạn PHẢI coi sản phẩm trong hình ảnh là đối tượng chính cần giải đáp.
   - Tuyệt đối không lấy nhầm các model đã đề cập trong các lượt chat cũ trước đó nếu khách vừa gửi một bức ảnh sản phẩm mới. Hãy đọc kỹ logo, model và thiết kế trên hình ảnh đính kèm (ví dụ: máy treo tường W6412-ECO, máy âm tủ, vòi lọc...) để tư vấn chính xác model trong ảnh.`;

export const DEFAULT_KNOWLEDGE = `# QUY ĐỊNH BẢO HÀNH & KÍCH HOẠT ĐIỆN TỬ TRULIVA

## 1. THỜI HẠN BẢO HÀNH THEO DÒNG MÁY:
- Model Delica UR5840: 24 THÁNG (2 năm) tính từ ngày kích hoạt hoặc ngày mua.
- Các model khác (UR5676, UR5640, CR5240, UR3140, W6412, UR61096H, CR-ZX5170, UX5010...): 12 THÁNG (1 năm).
- Phạm vi: Bảo hành toàn bộ phần điện, bơm, van điện từ và thân máy chính hãng.

## 2. QUY TRÌNH KÍCH HOẠT BẢO HÀNH ĐIỆN TỬ (3 BƯỚC):
- Bước 1: Vào link https://trulivavietnam.com/warranty-activate hoặc tìm Mini App "Truliva" trên Zalo (hoặc quét mã QR dán trên thân máy).
- Bước 2: Nhập số Serial trên tem máy (15-20 ký tự).
- Bước 3: Điền Họ tên, Số điện thoại và nhấn "Xác nhận kích hoạt".
- Kết quả: Hệ thống gửi tin nhắn ZNS xác nhận qua Zalo kèm Thẻ bảo hành điện tử và voucher ưu đãi.

## 3. THỜI GIAN THAY LÕI LỌC ĐỊNH KỲ:
- Lõi số 1 (PP 5 micron - Lọc thô): 3 - 6 tháng (tùy nguồn nước).
- Lõi số 2 (OCB/GAC - Than hoạt tính): 6 - 9 tháng.
- Lõi số 3 (PP 1 micron hoặc CTO): 9 - 12 tháng.
- Màng lọc RO (Trái tim của máy): 24 - 36 tháng.
- Lõi chức năng khoáng: 12 - 18 tháng.`;

export const DEFAULT_FAQS = [
  {
    category: 'Bảo hành',
    question: 'Thời gian bảo hành máy lọc nước Truliva là bao lâu?',
    answer: 'Dạ dòng máy Delica UR5840 được bảo hành chính hãng 24 tháng (2 năm). Các dòng máy lọc nước khác của Truliva (như UR5676, UR5640, CR5240, W6412...) được bảo hành chính hãng 12 tháng (1 năm) bạn nhé.',
  },
  {
    category: 'Kích hoạt',
    question: 'Làm sao để kích hoạt bảo hành điện tử Truliva?',
    answer: 'Dạ bạn chỉ cần làm 3 bước đơn giản:\n1. Truy cập https://trulivavietnam.com/warranty-activate hoặc mở Zalo Mini App Truliva.\n2. Nhập số Serial in trên thân máy (15-20 ký tự).\n3. Điền Tên và SĐT rồi bấm Xác nhận. Hệ thống sẽ gửi Thẻ bảo hành điện tử về Zalo cho bạn ngay ạ.',
  },
  {
    category: 'Bảo hành',
    question: 'Máy UR5840 bảo hành bao lâu?',
    answer: 'Dạ dòng máy Delica UR5840 có chính sách bảo hành đặc biệt là 24 tháng (2 năm) chính hãng tính từ ngày kích hoạt bạn nhé.',
  },
  {
    category: 'Liên hệ',
    question: 'Hotline bảo hành Truliva là số nào?',
    answer: 'Dạ Hotline CSKH & Kỹ thuật chính thức của Truliva là 1900 63 84 63, hỗ trợ từ 08:00 đến 18:00 tất cả các ngày trong tuần ạ.',
  },
];

export interface LoadedAgentConfig {
  isEnabled: boolean;
  syncCatalog: boolean;
  hotline: string;
  workingHours: string;
  address: string;
  systemPrompt: string;
  knowledgeText: string;
  faqs: Array<{ category?: string; question: string; answer: string }>;
}

const CONFIG_CACHE_TTL_MS = 60 * 1000;
let cachedConfig: LoadedAgentConfig | null = null;
let cachedAt = 0;

export function invalidateAgentConfigCache(): void {
  cachedConfig = null;
  cachedAt = 0;
}

export async function loadAgentConfig(deps?: { prisma?: typeof defaultPrisma }): Promise<LoadedAgentConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  const prismaClient = deps?.prisma || defaultPrisma;

  try {
    const config = await prismaClient.aiBotConfig.findUnique({ where: { id: 'default' } });
    const loaded: LoadedAgentConfig = {
      isEnabled: config ? Boolean(config.isEnabled) : true,
      syncCatalog: config?.syncCatalog ?? true,
      hotline: config?.hotline || OFFICIAL_TRULIVA_HOTLINE,
      workingHours: config?.workingHours || OFFICIAL_TRULIVA_WORKING_HOURS,
      address: config?.address || OFFICIAL_TRULIVA_ADDRESS,
      systemPrompt: config?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      knowledgeText: config?.knowledgeText ?? DEFAULT_KNOWLEDGE,
      faqs: Array.isArray(config?.faqs) ? (config.faqs as any[]) : DEFAULT_FAQS,
    };

    cachedConfig = loaded;
    cachedAt = now;
    return loaded;
  } catch (err: any) {
    logger.warn('Failed to load AI config from DB, using fallback defaults', { error: err?.message });
    return {
      isEnabled: true,
      syncCatalog: true,
      hotline: OFFICIAL_TRULIVA_HOTLINE,
      workingHours: OFFICIAL_TRULIVA_WORKING_HOURS,
      address: OFFICIAL_TRULIVA_ADDRESS,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      knowledgeText: DEFAULT_KNOWLEDGE,
      faqs: DEFAULT_FAQS,
    };
  }
}

export function buildSystemInstruction(params: {
  config: LoadedAgentConfig;
  turnCount: number;
  intent: AgentIntent;
  primaryModel?: string;
  catalogText?: string;
  ragText?: string;
  faqText?: string;
}): string {
  const { config, turnCount, intent, primaryModel, catalogText, ragText, faqText } = params;

  const sections: string[] = [
    config.systemPrompt,
    `\nTHÔNG TIN LIÊN HỆ:\n- Hotline: ${config.hotline}\n- Giờ làm việc: ${config.workingHours}\n- Địa chỉ: ${config.address}`,
  ];

  if (turnCount > 0) {
    sections.push(
      `\nNGỮ CẢNH LƯỢT HỘI THOẠI:\n- Đây là lượt hội thoại thứ ${turnCount + 1} trong cùng phiên chat. TUYỆT ĐỐI KHÔNG chào lại "Dạ Truliva xin chào...", hãy trả lời thẳng vào câu hỏi của khách.`
    );
  }

  if (primaryModel && intent !== 'VISUAL_INQUIRY') {
    sections.push(`\nMODEL ĐANG ĐƯỢC QUAN TÂM TRONG NGỮ CẢNH: ${primaryModel}`);
  }

  if (intent !== 'GREETING_CHITCHAT' && config.knowledgeText?.trim()) {
    sections.push(`\n${config.knowledgeText.trim()}`);
  }

  if (faqText?.trim()) {
    sections.push(faqText.trim());
  }

  if (catalogText?.trim()) {
    sections.push(catalogText.trim());
  }

  if (ragText?.trim()) {
    sections.push(ragText.trim());
  }

  return sections.join('\n');
}

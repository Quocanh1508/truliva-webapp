import { Router, Request, Response } from 'express';
import multer from 'multer';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import axios from 'axios';
import { ingestDocument, searchHybridRAG } from '../services/ragService';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB cho tài liệu kỹ thuật lớn
});

const DEFAULT_SYSTEM_PROMPT = `Bạn là Trợ lý AI CSKH chính thức của Truliva (Pure Vita) - Thương hiệu máy lọc nước & giải pháp nước sạch gia đình.

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
   - Lõi lọc tiêu hao: Định kỳ thay thế (Lõi thô: 3-6 tháng, Lõi than: 6-9 tháng, Lõi RO: 24-36 tháng).

6. THÔNG TIN DOANH NGHIỆP TRULIVA:
   - Hotline hỗ trợ: 1900 638 463 (08:00 - 18:00)
   - Kích hoạt bảo hành điện tử: https://trulivavietnam.com/warranty-activate hoặc Zalo Mini App "Truliva"
   - Website chính thức: https://trulivavietnam.com`;

const DEFAULT_KNOWLEDGE = `# QUY ĐỊNH BẢO HÀNH & KÍCH HOẠT ĐIỆN TỬ TRULIVA

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

const DEFAULT_FAQS = [
  {
    category: 'Bảo hành',
    question: 'Thời gian bảo hành máy lọc nước Truliva là bao lâu?',
    answer: 'Dạ dòng máy Delica UR5840 được bảo hành chính hãng 24 tháng (2 năm). Các dòng máy lọc nước khác của Truliva (như UR5676, UR5640, CR5240, W6412...) được bảo hành chính hãng 12 tháng (1 năm) bạn nhé.'
  },
  {
    category: 'Kích hoạt',
    question: 'Làm sao để kích hoạt bảo hành điện tử Truliva?',
    answer: 'Dạ bạn chỉ cần làm 3 bước đơn giản:\n1. Truy cập https://trulivavietnam.com/warranty-activate hoặc mở Zalo Mini App Truliva.\n2. Nhập số Serial in trên thân máy (15-20 ký tự).\n3. Điền Tên và SĐT rồi bấm Xác nhận. Hệ thống sẽ gửi Thẻ bảo hành điện tử về Zalo cho bạn ngay ạ.'
  },
  {
    category: 'Bảo hành',
    question: 'Máy UR5840 bảo hành bao lâu?',
    answer: 'Dạ dòng máy Delica UR5840 có chính sách bảo hành đặc biệt là 24 tháng (2 năm) chính hãng tính từ ngày kích hoạt bạn nhé.'
  },
  {
    category: 'Liên hệ',
    question: 'Hotline bảo hành Truliva là số nào?',
    answer: 'Dạ Hotline CSKH & Kỹ thuật chính thức của Truliva là 1900 638 463, hỗ trợ từ 08:00 đến 18:00 tất cả các ngày trong tuần ạ.'
  }
];

/**
 * GET /api/ai-assistant/config
 * Lấy cấu hình AI hiện tại
 */
router.get('/config', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    let config = await prisma.aiBotConfig.findUnique({
      where: { id: 'default' }
    });

    if (!config) {
      config = await prisma.aiBotConfig.create({
        data: {
          id: 'default',
          botName: 'Truliva Assistant',
          greeting: 'Dạ Truliva xin chào bạn! Truliva có thể hỗ trợ gì cho máy lọc nước gia đình bạn hôm nay ạ?',
          personaTone: 'Thân thiện, chu đáo, ân cần, xưng Truliva và gọi khách là bạn hoặc anh/chị',
          hotline: '1900 23 23 89',
          workingHours: '08:00 - 18:00 (Thứ 2 - Chủ Nhật)',
          address: 'Tòa nhà Truliva, Hệ thống chi nhánh toàn quốc',
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          knowledgeText: DEFAULT_KNOWLEDGE,
          faqs: DEFAULT_FAQS,
          syncCatalog: true,
          isEnabled: true
        }
      });
    }

    res.json({
      success: true,
      config
    });
  } catch (error: any) {
    logger.error('Failed to get AI config', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/ai-assistant/config
 * Cập nhật cấu hình AI
 */
router.put('/config', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      botName,
      greeting,
      personaTone,
      hotline,
      workingHours,
      address,
      systemPrompt,
      knowledgeText,
      faqs,
      syncCatalog,
      isEnabled
    } = req.body;

    const user = (req as any).user;

    const updated = await prisma.aiBotConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        botName: botName || 'Truliva Assistant',
        greeting: greeting || null,
        personaTone: personaTone || '',
        hotline: hotline || '1900 23 23 89',
        workingHours: workingHours || '08:00 - 18:00 (Thứ 2 - Chủ Nhật)',
        address: address || '',
        systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
        knowledgeText: knowledgeText || DEFAULT_KNOWLEDGE,
        faqs: Array.isArray(faqs) ? faqs : DEFAULT_FAQS,
        syncCatalog: typeof syncCatalog === 'boolean' ? syncCatalog : true,
        isEnabled: typeof isEnabled === 'boolean' ? isEnabled : true,
        updatedBy: user?.fullName || user?.id || 'Admin'
      },
      update: {
        botName,
        greeting,
        personaTone,
        hotline,
        workingHours,
        address,
        systemPrompt,
        knowledgeText,
        faqs: Array.isArray(faqs) ? faqs : undefined,
        syncCatalog: typeof syncCatalog === 'boolean' ? syncCatalog : true,
        isEnabled: typeof isEnabled === 'boolean' ? isEnabled : true,
        updatedBy: user?.fullName || user?.id || 'Admin'
      }
    });

    res.json({
      success: true,
      message: 'Cập nhật cấu hình Trợ lý AI thành công!',
      config: updated
    });
  } catch (error: any) {
    logger.error('Failed to update AI config', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/ai-assistant/catalog-summary
 * Xem tóm tắt danh mục sản phẩm & combo mà AI đang học từ DB
 */
router.get('/catalog-summary', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const [products, combos] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true },
        select: { id: true, name: true, sku: true, sellingPrice: true },
        orderBy: { name: 'asc' },
        take: 30
      }),
      prisma.productCombo.findMany({
        where: { isActive: true },
        select: { id: true, displayName: true, comboKey: true, keywords: true },
        orderBy: { sortOrder: 'asc' },
        take: 30
      })
    ]);

    res.json({
      success: true,
      totalActiveProducts: products.length,
      totalActiveCombos: combos.length,
      products,
      combos
    });
  } catch (error: any) {
    logger.error('Failed to fetch catalog summary for AI', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/ai-assistant/test-chat
 * Khung chat thử nghiệm (Playground) cho Admin/CSKH
 */
router.post('/test-chat', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, history } = req.body;
    if (!message || !message.trim()) {
      res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống' });
      return;
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
    const GEMINI_MODEL = 'gemini-3.5-flash-lite';

    // Lấy config hiện tại
    const config = await prisma.aiBotConfig.findUnique({ where: { id: 'default' } });
    const systemPrompt = config?.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const knowledgeText = config?.knowledgeText || DEFAULT_KNOWLEDGE;
    const faqs = (config?.faqs as any[]) || DEFAULT_FAQS;

    let faqContext = '';
    if (Array.isArray(faqs) && faqs.length > 0) {
      faqContext = '\n\nCÂU HỎI THƯỜNG GẶP (FAQ CHUẨN):\n' +
        faqs.map(f => `Hỏi: ${f.question}\nĐáp: ${f.answer}`).join('\n\n');
    }

    // 1. Phân tích ngữ cảnh: Tìm model được nhắc tới từ tin nhắn hiện tại hoặc lịch sử gần nhất
    const recentContextText = [
      ...(Array.isArray(history) ? history.slice(-3).map((h: any) => h.text || '') : []),
      message
    ].join(' ');

    const modelMatches = recentContextText.match(/\b(?:UR|CR|CR-ZX|W|UX|YDZ|QY\/F)?[0-9]{4,6}[A-Z]*\b/gi) || [];
    const detectedModels = Array.from(new Set(modelMatches.map(m => m.trim().toUpperCase()))).filter(m => m.length >= 3);
    const primaryModel = detectedModels[detectedModels.length - 1] || '';

    // 2. Tra cứu sản phẩm động dựa trên model hoặc danh mục tiêu biểu
    let catalogContext = '';
    if (config?.syncCatalog) {
      let products: any[] = [];
      if (detectedModels.length > 0) {
        const orConds = detectedModels.map(m => ({
          OR: [
            { name: { contains: m, mode: 'insensitive' as const } },
            { sku: { contains: m, mode: 'insensitive' as const } }
          ]
        }));
        products = await prisma.product.findMany({
          where: {
            isActive: true,
            OR: orConds.flatMap(c => c.OR)
          },
          select: { name: true, sku: true, sellingPrice: true, category: true },
          take: 25
        });
      }

      if (products.length === 0) {
        products = await prisma.product.findMany({
          where: {
            isActive: true,
            name: { startsWith: 'Máy lọc nước' }
          },
          select: { name: true, sku: true, sellingPrice: true, category: true },
          orderBy: { sellingPrice: 'desc' },
          take: 12
        });
      }

      // Đưa Máy lọc nước chính lên đầu, sau đó mới tới phụ kiện / lõi lọc
      products.sort((a, b) => {
        const aIsMain = a.name.startsWith('Máy lọc nước') ? 1 : 0;
        const bIsMain = b.name.startsWith('Máy lọc nước') ? 1 : 0;
        if (aIsMain !== bIsMain) return bIsMain - aIsMain;
        return (b.sellingPrice || 0) - (a.sellingPrice || 0);
      });

      const mainMachines = products.filter(p => p.name.startsWith('Máy lọc nước'));
      const accessories = products.filter(p => !p.name.startsWith('Máy lọc nước'));

      let catalogLines: string[] = [];
      if (mainMachines.length > 0) {
        catalogLines.push('1. Máy lọc nước chính hãng (Thiết bị chính):');
        mainMachines.forEach(p => {
          catalogLines.push(`- ${p.name} (SKU: ${p.sku}) | Giá niêm yết: ${p.sellingPrice ? p.sellingPrice.toLocaleString('vi-VN') + ' đ' : 'Liên hệ'}`);
        });
      }
      if (accessories.length > 0) {
        catalogLines.push('2. Phụ kiện / Linh kiện / Lõi lọc đi kèm:');
        accessories.slice(0, 10).forEach(p => {
          catalogLines.push(`- ${p.name} (SKU: ${p.sku}) | Giá niêm yết: ${p.sellingPrice ? p.sellingPrice.toLocaleString('vi-VN') + ' đ' : 'Liên hệ'}`);
        });
      }

      catalogContext = '\n\nBẢNG GIÁ & DANH MỤC SẢN PHẨM TRULIVA CHÍNH THỨC:\n' + catalogLines.join('\n');
    }

    // 3. Tra cứu Hybrid RAG (kèm model context nếu câu hỏi ngắn)
    let ragSearchQuery = message.trim();
    if (primaryModel && !ragSearchQuery.toUpperCase().includes(primaryModel)) {
      ragSearchQuery = `${primaryModel} ${ragSearchQuery}`;
    }

    let ragContext = '';
    let retrievedChunks: any[] = [];
    try {
      retrievedChunks = await searchHybridRAG(ragSearchQuery, 4, 0.35, primaryModel);
      if (retrievedChunks.length > 0) {
        ragContext = '\n\nTÀI LIỆU CHÍNH HÃNG TRULIVA TRA CỨU ĐƯỢC (HYBRID RAG):\n' +
          retrievedChunks.map((c, idx) => 
            `[Đoạn ${idx + 1} - Nguồn: ${c.sourceTitle || c.fileName} | Trang: ${c.metadata?.pageNumber || 1} | Khớp: ${(c.rrfScore * 100).toFixed(1)}%]:\n${c.content}`
          ).join('\n\n');
      }
    } catch (e: any) {
      logger.warn('Failed to retrieve RAG chunks for test chat', { error: e.message });
    }

    const fullSystemInstruction = `${systemPrompt}\n\nTHÔNG TIN LIÊN HỆ:\n- Hotline: ${config?.hotline || '1900 638 463'}\n- Giờ làm việc: ${config?.workingHours || '08:00 - 18:00'}\n- Địa chỉ: ${config?.address || 'TP.HCM'}\n\n${knowledgeText}${faqContext}${catalogContext}${ragContext}`;

    // 4. Chuẩn bị Multi-turn Contents cho Gemini
    const contents: any[] = [];
    if (Array.isArray(history) && history.length > 0) {
      for (const turn of history.slice(-6)) {
        const role = turn.role === 'model' || turn.sender === 'ai' || turn.sender === 'bot' || turn.sender === 'model' ? 'model' : 'user';
        const text = typeof turn.text === 'string' ? turn.text.trim() : '';
        if (text) {
          contents.push({
            role,
            parts: [{ text }]
          });
        }
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: message.trim() }]
    });

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const geminiRes = await axios.post(geminiUrl, {
      system_instruction: {
        parts: [{ text: fullSystemInstruction }]
      },
      contents
    }, { timeout: 35000 });

    const reply = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Không có phản hồi từ AI';

    res.json({
      success: true,
      reply,
      retrievedChunks
    });
  } catch (error: any) {
    logger.error('Failed to run AI test chat', { error: error.message });
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
  }
});

/**
 * GET /api/ai-assistant/documents
 * Danh sách tài liệu trong Thư viện Tri thức RAG
 */
router.get('/documents', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const documents: any = await prisma.$queryRawUnsafe(`
      SELECT 
        id, title, file_name AS "fileName", file_type AS "fileType",
        file_size AS "fileSize", total_chunks AS "totalChunks",
        status, uploaded_by AS "uploadedBy", is_active AS "isActive",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM document_sources
      WHERE is_active = true
      ORDER BY created_at DESC;
    `);

    res.json({
      success: true,
      documents: documents || []
    });
  } catch (error: any) {
    logger.error('Failed to fetch documents', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/ai-assistant/documents/upload
 * Tải lên tài liệu PDF / DOC / TXT và tự động chạy pipeline Ingestion (Chunking + Embeddings + RRF indexing)
 */
router.post(
  '/documents/upload',
  requireAuth,
  requireAdmin,
  (req: Request, res: Response, next: any) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            success: false,
            message: 'Dung lượng tệp vượt quá giới hạn cho phép (tối đa 100MB)'
          });
          return;
        }
        res.status(400).json({
          success: false,
          message: `Lỗi tải tệp lên: ${err.message}`
        });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'Vui lòng chọn tệp tài liệu PDF hoặc TXT' });
        return;
      }

      let fileName = req.file.originalname;
      try {
        const decoded = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        if (decoded && decoded.trim()) {
          fileName = decoded;
        }
      } catch (e) {
        // Giữ tên gốc nếu decode thất bại
      }

      const title = req.body.title || fileName.replace(/\.[^/.]+$/, '');
      const user = (req as any).user;
      const uploadedBy = user?.fullName || user?.id || 'Admin';

      const result = await ingestDocument(
        req.file.buffer,
        fileName,
        title,
        uploadedBy
      );

      const message = result.isOcr
        ? `Đã nhận dạng OCR (Gemini Vision) và nạp thành công tài liệu "${title}" với ${result.totalChunks} đoạn dữ liệu (${result.totalPages} trang)!`
        : `Đã nạp thành công tài liệu "${title}" với ${result.totalChunks} đoạn dữ liệu!`;

      res.json({
        success: true,
        message,
        result
      });
    } catch (error: any) {
      logger.error('Document upload and ingestion failed', { error: error.message });
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/**
 * POST /api/ai-assistant/documents/search-test
 * Kiểm tra kết quả truy vấn Hybrid RAG (Vector HNSW + BM25 Full-text + RRF)
 */
router.post('/documents/search-test', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.body;
    if (!query || !query.trim()) {
      res.status(400).json({ success: false, message: 'Từ khóa tìm kiếm không được rỗng' });
      return;
    }

    const chunks = await searchHybridRAG(query, 5);

    res.json({
      success: true,
      totalMatches: chunks.length,
      chunks
    });
  } catch (error: any) {
    logger.error('Failed to run RAG search test', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/ai-assistant/documents/:id
 * Vô hiệu hóa tài liệu (Soft-delete theo Rule 7)
 */
router.delete('/documents/:id', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await prisma.$executeRawUnsafe(`
      UPDATE document_sources 
      SET is_active = false, updated_at = NOW() 
      WHERE id = $1::uuid;
    `, id);

    res.json({
      success: true,
      message: 'Đã gỡ bỏ tài liệu khỏi Thư viện tri thức thành công'
    });
  } catch (error: any) {
    logger.error('Failed to soft-delete document', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

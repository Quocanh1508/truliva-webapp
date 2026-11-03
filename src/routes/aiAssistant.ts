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

const DEFAULT_SYSTEM_PROMPT = `Bạn là Trợ lý ảo CSKH chính thức của Truliva (Pure Vita) - Thương hiệu máy lọc nước & giải pháp nước sạch gia đình.

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
    const { message } = req.body;
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

    let catalogContext = '';
    if (config?.syncCatalog) {
      const [products, combos] = await Promise.all([
        prisma.product.findMany({
          where: { isActive: true },
          select: { name: true, sku: true, sellingPrice: true },
          take: 15
        }),
        prisma.productCombo.findMany({
          where: { isActive: true },
          select: { displayName: true, comboKey: true },
          take: 10
        })
      ]);

      catalogContext = '\n\nDANH MỤC SẢN PHẨM & COMBO THỰC TẾ TRONG HỆ THỐNG TRULIVA:\n' +
        '1. Sản phẩm/Linh kiện:\n' +
        products.map(p => `- ${p.name} (SKU: ${p.sku}) | Giá niêm yết: ${p.sellingPrice?.toLocaleString('vi-VN')} đ`).join('\n') +
        '\n2. Các gói Combo phổ biến:\n' +
        combos.map(c => `- ${c.displayName} (${c.comboKey})`).join('\n');
    }

    let ragContext = '';
    let retrievedChunks: any[] = [];
    try {
      retrievedChunks = await searchHybridRAG(message, 3);
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const geminiRes = await axios.post(geminiUrl, {
      system_instruction: {
        parts: [{ text: fullSystemInstruction }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: message }]
        }
      ]
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

      const title = req.body.title || req.file.originalname.replace(/\.[^/.]+$/, '');
      const user = (req as any).user;
      const uploadedBy = user?.fullName || user?.id || 'Admin';

      const result = await ingestDocument(
        req.file.buffer,
        req.file.originalname,
        title,
        uploadedBy
      );

      res.json({
        success: true,
        message: `Đã nạp thành công tài liệu "${title}" với ${result.totalChunks} đoạn dữ liệu!`,
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

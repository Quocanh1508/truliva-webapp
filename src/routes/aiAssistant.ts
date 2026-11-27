import { Router, Request, Response } from 'express';
import multer from 'multer';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import { ingestDocument, searchHybridRAG } from '../services/ragService';
import {
  DEFAULT_FAQS,
  DEFAULT_KNOWLEDGE,
  DEFAULT_SYSTEM_PROMPT,
  OFFICIAL_TRULIVA_ADDRESS,
  OFFICIAL_TRULIVA_HOTLINE,
  OFFICIAL_TRULIVA_WORKING_HOURS,
  invalidateAgentConfigCache,
} from '../services/agent/promptBuilder';
import { runAgentTurn } from '../services/agent/agentOrchestrator';
import { DEFAULT_GEMINI_MODEL } from '../services/agent/geminiClient';
import { syncShopPricesFromWebsite } from '../services/websitePriceSyncService';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB cho tài liệu kỹ thuật lớn
});

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
          hotline: OFFICIAL_TRULIVA_HOTLINE,
          workingHours: OFFICIAL_TRULIVA_WORKING_HOURS,
          address: OFFICIAL_TRULIVA_ADDRESS,
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
        hotline: hotline || OFFICIAL_TRULIVA_HOTLINE,
        workingHours: workingHours || OFFICIAL_TRULIVA_WORKING_HOURS,
        address: address || OFFICIAL_TRULIVA_ADDRESS,
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

    invalidateAgentConfigCache();

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
    const [products, combos, shopProducts] = await Promise.all([
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
      }),
      prisma.shopProduct.findMany({
        where: { isActive: true },
        select: { id: true, name: true, sku: true, price: true, originalPrice: true, warrantyMonths: true, updatedAt: true },
        orderBy: { sortOrder: 'asc' },
        take: 40
      })
    ]);

    res.json({
      success: true,
      totalActiveProducts: products.length,
      totalActiveCombos: combos.length,
      totalActiveShopProducts: shopProducts.length,
      products,
      combos,
      shopProducts
    });
  } catch (error: any) {
    logger.error('Failed to fetch catalog summary for AI', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/ai-assistant/sync-website-prices
 * Đồng bộ giá bán ưu đãi & giá niêm yết trực tiếp từ trulivavietnam.com vào ShopProduct
 */
router.post('/sync-website-prices', requireAuth, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const summary = await syncShopPricesFromWebsite();
    res.json({
      success: true,
      message: summary.updatedCount > 0
        ? `Đã đồng bộ cập nhật giá ${summary.updatedCount} sản phẩm từ website trulivavietnam.com!`
        : `Đã kiểm tra ${summary.totalChecked} sản phẩm, giá hiện tại đã khớp 100% với website trulivavietnam.com.`,
      summary
    });
  } catch (error: any) {
    logger.error('Failed to sync website prices for AI', { error: error.message });
    res.status(500).json({ success: false, message: error.message || 'Lỗi đồng bộ giá từ website' });
  }
});

/**
 * POST /api/ai-assistant/test-chat
 * Khung chat thử nghiệm (Playground) cho Admin/CSKH
 */
router.post('/test-chat', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, history, sessionId } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống' });
      return;
    }

    const user = (req as any).user;
    const userId = user?.id || null;
    const userName = user?.fullName || user?.username || 'Admin / Dev';
    const sessionKey = sessionId ? String(sessionId) : `PG_${userId || 'anon'}`;

    const result = await runAgentTurn({
      channel: 'PLAYGROUND',
      sessionKey,
      sessionId: sessionId ? String(sessionId) : undefined,
      userId,
      userName,
      message: message.trim(),
      clientHistory: Array.isArray(history) ? history : [],
    });

    res.json({
      success: true,
      reply: result.reply,
      sessionId: result.sessionId,
      retrievedChunks: Array.isArray(result.retrievedChunks) ? result.retrievedChunks : [],
      tokens: {
        promptTokens: Number(result.tokens?.promptTokens || 0),
        completionTokens: Number(result.tokens?.completionTokens || 0),
        totalTokens: Number(result.tokens?.totalTokens || 0),
      },
      latencyMs: Number(result.latencyMs || 0),
      model: result.model || DEFAULT_GEMINI_MODEL,
    });
  } catch (error: any) {
    logger.error('Failed to run AI test chat', { error: error.message });
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message });
  }
});

/**
 * GET /api/ai-assistant/sessions
 * Danh sách phiên chat và giám sát tokens (Dành riêng cho ADMIN và DEV)
 */
router.get('/sessions', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'ADMIN' && userRole !== 'DEV') {
      res.status(403).json({ success: false, message: 'Chức năng chỉ dành riêng cho Admin và Developer' });
      return;
    }

    const { channel, search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = { isActive: true };
    if (channel && channel !== 'ALL') {
      where.channel = String(channel).toUpperCase();
    }
    if (search && String(search).trim()) {
      const q = String(search).trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { userName: { contains: q, mode: 'insensitive' } }
      ];
    }

    const [sessions, totalCount, statsAgg, tokenAvgAgg] = await Promise.all([
      prisma.aiChatSession.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, createdAt: true, role: true, totalTokens: true }
          }
        }
      }),
      prisma.aiChatSession.count({ where }),
      prisma.aiChatSession.aggregate({
        where: { isActive: true },
        _count: { id: true },
        _sum: { totalMessages: true, totalTokens: true }
      }),
      prisma.aiChatMessage.aggregate({
        where: { role: 'assistant', totalTokens: { gt: 0 } },
        _avg: { latencyMs: true, totalTokens: true, promptTokens: true, completionTokens: true }
      })
    ]);

    res.json({
      success: true,
      sessions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      },
      stats: {
        totalSessions: statsAgg._count.id || 0,
        totalMessages: statsAgg._sum.totalMessages || 0,
        totalTokens: statsAgg._sum.totalTokens || 0,
        avgLatencyMs: Math.round(tokenAvgAgg._avg.latencyMs || 0),
        avgTokensPerTurn: Math.round(tokenAvgAgg._avg.totalTokens || 0),
        avgPromptTokens: Math.round(tokenAvgAgg._avg.promptTokens || 0),
        avgCompletionTokens: Math.round(tokenAvgAgg._avg.completionTokens || 0)
      }
    });
  } catch (error: any) {
    logger.error('Failed to get AI chat sessions', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/ai-assistant/sessions/:id
 * Chi tiết lịch sử tin nhắn và tokens của 1 phiên chat (ADMIN & DEV)
 */
router.get('/sessions/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'ADMIN' && userRole !== 'DEV') {
      res.status(403).json({ success: false, message: 'Chức năng chỉ dành riêng cho Admin và Developer' });
      return;
    }

    const id = req.params.id as string;
    const session = await prisma.aiChatSession.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!session) {
      res.status(404).json({ success: false, message: 'Không tìm thấy phiên chat này' });
      return;
    }

    res.json({
      success: true,
      session
    });
  } catch (error: any) {
    logger.error('Failed to get AI chat session detail', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/ai-assistant/sessions/:id
 * Xóa mềm phiên chat (Soft-delete: isActive = false)
 */
router.delete('/sessions/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'ADMIN' && userRole !== 'DEV') {
      res.status(403).json({ success: false, message: 'Chức năng chỉ dành riêng cho Admin và Developer' });
      return;
    }

    const id = req.params.id as string;
    await prisma.aiChatSession.update({
      where: { id },
      data: { isActive: false, updatedAt: new Date() }
    });

    res.json({
      success: true,
      message: 'Đã lưu trữ và ẩn phiên chat thành công'
    });
  } catch (error: any) {
    logger.error('Failed to soft delete AI chat session', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
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
      FROM rag.document_sources
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
      UPDATE rag.document_sources 
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

/**
 * POST /api/ai-assistant/trace-sources
 * Phân tích và truy vết nguồn gốc tri thức (Database, RAG Documents, FAQ, System Prompt) từ đoạn văn bản/câu trả lời
 */
router.post('/trace-sources', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      res.status(400).json({ success: false, message: 'Nội dung truy vết không được để trống' });
      return;
    }

    const cleanText = text.trim();

    // 1. Trích xuất Model codes & các con số giá tiền
    const rawModels = cleanText.match(/(?:UR|CR|UX|W)\d+[A-Z\d]*/gi) || [];
    const modelMatches: string[] = Array.from(new Set(rawModels));

    const rawNumbers = cleanText.match(/\d+[\d.,]*/g) || [];
    const cleanNumbers: number[] = Array.from(
      new Set(
        rawNumbers
          .map((n: string) => parseInt(n.replace(/[.,]/g, ''), 10))
          .filter((n: number) => !isNaN(n) && n > 1000)
      )
    );

    // 2. Truy vết Database Sản phẩm & Combo
    const productOrConditions: any[] = [];
    for (const m of modelMatches) {
      productOrConditions.push({ name: { contains: m, mode: 'insensitive' } });
      productOrConditions.push({ sku: { contains: m, mode: 'insensitive' } });
    }
    for (const p of cleanNumbers) {
      productOrConditions.push({ sellingPrice: p });
    }

    let matchedProducts: any[] = [];
    if (productOrConditions.length > 0) {
      matchedProducts = await prisma.product.findMany({
        where: { OR: productOrConditions },
        select: { id: true, name: true, sku: true, sellingPrice: true, isActive: true },
        take: 12
      });
    }

    // Truy vết Combos
    let matchedCombos: any[] = [];
    if (modelMatches.length > 0) {
      matchedCombos = await prisma.productCombo.findMany({
        where: {
          OR: modelMatches.map(m => ({ displayName: { contains: m, mode: 'insensitive' } }))
        },
        select: { id: true, displayName: true, comboKey: true, isActive: true },
        take: 6
      });
    }

    // 3. Truy vết Hybrid RAG Chunks từ tài liệu nội bộ
    let matchedRagChunks: any[] = [];
    try {
      matchedRagChunks = await searchHybridRAG(cleanText, 5);
    } catch (err: any) {
      logger.warn('Failed to search RAG chunks in trace-sources', { error: err.message });
    }

    // 4. Truy vết FAQ và System Prompt
    const config = await prisma.aiBotConfig.findUnique({ where: { id: 'default' } });
    const matchedFaqs: any[] = [];
    if (Array.isArray(config?.faqs)) {
      for (const faq of (config.faqs as any[])) {
        const matchesModel = modelMatches.some(m => 
          (faq.question && faq.question.toUpperCase().includes(m.toUpperCase())) ||
          (faq.answer && faq.answer.toUpperCase().includes(m.toUpperCase()))
        );
        const matchesKeyword = cleanText.toLowerCase().includes(faq.question.toLowerCase().slice(0, 20));
        if (matchesModel || matchesKeyword) {
          matchedFaqs.push(faq);
        }
      }
    }

    // Truy vết Prompt / Quy tắc bảo hành cốt lõi
    const matchedPromptRules: string[] = [];
    if (config?.systemPrompt) {
      const promptLines = config.systemPrompt.split('\n');
      for (const line of promptLines) {
        if (modelMatches.some(m => line.includes(m)) || (cleanNumbers.length > 0 && cleanNumbers.some(p => line.includes(p.toString())))) {
          if (line.trim().length > 10) matchedPromptRules.push(line.trim());
        }
      }
    }

    res.json({
      success: true,
      queryText: cleanText,
      extractedInfo: {
        models: modelMatches,
        prices: cleanNumbers
      },
      sources: {
        products: matchedProducts,
        combos: matchedCombos,
        ragChunks: matchedRagChunks,
        faqs: matchedFaqs,
        promptRules: matchedPromptRules
      }
    });
  } catch (error: any) {
    logger.error('Failed to trace sources', { error: error.message });
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;

import prisma from '../config/database';
import logger from '../utils/logger';
import axios from 'axios';
// Polyfill môi trường Node.js cho thư viện đọc PDF (pdfjs-dist)
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {};
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {};
}
if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {};
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMENSION = 768;

export interface DocumentChunkResult {
  id: string;
  documentId: string;
  chunkIndex: number;
  sectionTitle?: string;
  content: string;
  metadata?: any;
  vectorSimilarity: number;
  textScore: number;
  rrfScore: number;
  sourceTitle?: string;
  fileName?: string;
}

export interface IngestResult {
  documentId: string;
  title: string;
  fileName: string;
  totalChunks: number;
  totalPages: number;
  status: string;
  isOcr?: boolean;
}

/**
 * Trích xuất văn bản từ tệp PDF scan/hình ảnh bằng Gemini Vision (OCR)
 */
export async function extractTextWithGeminiVision(buffer: Buffer, fileName: string): Promise<{
  text: string;
  pages: Array<{ pageNumber: number; text: string }>;
  totalPages: number;
}> {
  if (!GEMINI_API_KEY) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trong hệ thống để thực hiện OCR');
  }

  logger.info('[OCR] Bắt đầu tải tệp lên Gemini File API để thực hiện Vision OCR...', {
    fileName,
    sizeMb: (buffer.length / (1024 * 1024)).toFixed(2)
  });

  let fileResourceName = '';
  try {
    // 1. Khởi tạo phiên Resumable Upload
    const initRes = await axios.post(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
      { file: { display_name: fileName } },
      {
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': buffer.length,
          'X-Goog-Upload-Header-Content-Type': 'application/pdf',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const uploadUrl = initRes.headers['x-goog-upload-url'];
    if (!uploadUrl) {
      throw new Error('Không nhận được upload URL từ Gemini File API');
    }

    // 2. Tải trực tiếp buffer lên upload URL
    const uploadRes = await axios.put(uploadUrl, buffer, {
      headers: {
        'Content-Length': buffer.length,
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      maxBodyLength: 150 * 1024 * 1024,
      maxContentLength: 150 * 1024 * 1024,
      timeout: 180000
    });

    const fileUri = uploadRes.data?.file?.uri;
    fileResourceName = uploadRes.data?.file?.name || '';
    if (!fileUri || !fileResourceName) {
      throw new Error('Gemini File API không trả về fileUri hợp lệ');
    }

    logger.info('[OCR] Tệp đã tải lên Gemini thành công, đang kiểm tra trạng thái xử lý...', {
      fileResourceName,
      fileUri
    });

    // 3. Chờ trạng thái tệp chuyển sang ACTIVE nếu cần
    let fileState = uploadRes.data?.file?.state;
    let pollCount = 0;
    while (fileState === 'PROCESSING' && pollCount < 25) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/${fileResourceName}?key=${GEMINI_API_KEY}`
      );
      fileState = pollRes.data?.state;
      pollCount++;
    }

    if (fileState === 'FAILED') {
      throw new Error('Gemini báo lỗi khi tiền xử lý tệp PDF.');
    }

    // 4. Gọi mô hình Gemini Vision để trích xuất văn bản (Thử gemini-3.5-flash trước, dự phòng gemini-3.5-flash-lite)
    const ocrPrompt = `Bạn là hệ thống OCR chuyên nghiệp nhận dạng tài liệu máy lọc nước Truliva.
Nhiệm vụ của bạn:
1. Đọc kỹ toàn bộ các trang trong tài liệu đính kèm (kể cả tài liệu scan/slide ảnh chụp).
2. Trích xuất đầy đủ toàn bộ văn bản, tên model sản phẩm (ví dụ: UR3626, UR5840, UR5676...), thông số kỹ thuật (kích thước, công suất lọc, điện áp, áp suất, khối lượng, tỷ lệ giảm TDS), giá bán niêm yết, các loại linh kiện (bộ vòi, van, lõi lọc PCP, màng RO...).
3. BẮT BUỘC định dạng rõ ràng từng trang theo mẫu sau:
--- TRANG 1 ---
[Toàn bộ nội dung chữ và thông số của trang 1]
--- TRANG 2 ---
[Toàn bộ nội dung chữ và thông số của trang 2]
...
(Đánh số liên tục đến hết tất cả các trang có trong tài liệu).

TUYỆT ĐỐI không tóm tắt sơ sài, hãy giữ nguyên các chi tiết số liệu kỹ thuật chính xác.`;

    let responseText = '';
    const modelsToTry = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];
    let lastError: any = null;

    for (const model of modelsToTry) {
      try {
        logger.info(`[OCR] Đang gọi mô hình ${model} để nhận dạng chữ từ hình ảnh...`);
        const genRes = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
          {
            contents: [
              {
                parts: [
                  { fileData: { mimeType: 'application/pdf', fileUri } },
                  { text: ocrPrompt }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192
            }
          },
          { timeout: 180000 }
        );

        responseText = genRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (responseText && responseText.trim().length > 30) {
          logger.info(`[OCR] Nhận dạng thành công với mô hình ${model} (${responseText.length} ký tự)!`);
          break;
        }
      } catch (err: any) {
        lastError = err;
        logger.warn(`[OCR] Thử mô hình ${model} không thành công, thử mô hình dự phòng tiếp theo...`, {
          error: err.response?.data?.error?.message || err.message
        });
      }
    }

    if (!responseText || responseText.trim().length <= 30) {
      throw new Error(`Gemini Vision OCR không thể đọc chữ từ tệp PDF này: ${lastError?.message || 'Không có phản hồi'}`);
    }

    // 5. Phân tách theo từng trang từ marker "--- TRANG \d+ ---"
    const pageRegex = /---\s*TRANG\s+(\d+)\s*---([\s\S]*?)(?=(?:---\s*TRANG\s+\d+\s*---|$))/gi;
    const pagesList: Array<{ pageNumber: number; text: string }> = [];
    let match;
    while ((match = pageRegex.exec(responseText)) !== null) {
      const pageNum = parseInt(match[1], 10);
      const content = match[2].trim();
      if (content) {
        pagesList.push({ pageNumber: pageNum, text: content });
      }
    }

    if (pagesList.length === 0) {
      pagesList.push({ pageNumber: 1, text: responseText.trim() });
    }

    return {
      text: responseText,
      pages: pagesList,
      totalPages: pagesList.length
    };
  } finally {
    // 6. Dọn dẹp tệp tạm trên Gemini File API
    if (fileResourceName) {
      try {
        await axios.delete(
          `https://generativelanguage.googleapis.com/v1beta/${fileResourceName}?key=${GEMINI_API_KEY}`
        );
        logger.info('[OCR] Đã dọn dẹp tệp tạm trên Gemini File API thành công', { fileResourceName });
      } catch (e: any) {
        logger.warn('[OCR] Không thể xóa tệp tạm trên Gemini File API', { fileResourceName, error: e.message });
      }
    }
  }
}

/**
 * Trích xuất văn bản từ file PDF theo từng trang (Tự động chuyển sang Gemini Vision OCR nếu là file scan/ảnh)
 */
export async function extractTextFromPdf(buffer: Buffer, fileName = 'document.pdf'): Promise<{
  text: string;
  pages: Array<{ pageNumber: number; text: string }>;
  totalPages: number;
  isOcr?: boolean;
}> {
  let isDigitalValid = false;
  let digitalPagesList: Array<{ pageNumber: number; text: string }> = [];
  let digitalText = '';
  let digitalTotal = 0;

  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new (PDFParse as any)({ data: new Uint8Array(buffer) });
    const result = await parser.getText();

    if (Array.isArray(result.pages) && result.pages.length > 0) {
      for (const p of result.pages) {
        if (p.text && p.text.trim()) {
          digitalPagesList.push({
            pageNumber: p.num || digitalPagesList.length + 1,
            text: p.text.trim()
          });
        }
      }
    }

    if (digitalPagesList.length === 0 && result.text && result.text.trim()) {
      digitalPagesList.push({
        pageNumber: 1,
        text: result.text.trim()
      });
    }

    const cleanText = (result.text || '').replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '').trim();
    if (cleanText.length >= 50) {
      isDigitalValid = true;
      digitalText = result.text || '';
      digitalTotal = result.total || digitalPagesList.length;
    }

    try {
      await parser.destroy();
    } catch (e) {
      // bỏ qua lỗi destroy nếu có
    }
  } catch (parseErr: any) {
    logger.warn('pdf-parse không đọc được text layer kỹ thuật số, chuẩn bị gọi Gemini Vision OCR', {
      error: parseErr.message
    });
  }

  if (isDigitalValid) {
    return {
      text: digitalText,
      pages: digitalPagesList,
      totalPages: digitalTotal,
      isOcr: false
    };
  }

  // Tệp PDF là dạng scan/hình ảnh: Kích hoạt Gemini Vision OCR
  logger.info('Tệp PDF không có lớp văn bản kỹ thuật số. Đang tự động kích hoạt Gemini Vision OCR...', {
    fileName
  });

  const ocrResult = await extractTextWithGeminiVision(buffer, fileName);
  return {
    text: ocrResult.text,
    pages: ocrResult.pages,
    totalPages: ocrResult.totalPages,
    isOcr: true
  };
}

/**
 * Chia nhỏ văn bản thành các chunks trượt (sliding window) có overlap
 */
export function chunkTextWithPages(
  pages: Array<{ pageNumber: number; text: string }>,
  chunkSize = 700,
  overlap = 120
): Array<{ content: string; chunkIndex: number; pageNumber: number; sectionTitle?: string }> {
  const chunks: Array<{ content: string; chunkIndex: number; pageNumber: number; sectionTitle?: string }> = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const pageText = page.text.replace(/\r\n/g, '\n').trim();
    if (!pageText) continue;

    // Tìm tiêu đề nếu dòng đầu tiên ngắn (< 80 ký tự)
    const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);
    const firstLine = lines.length > 0 && lines[0].length < 80 ? lines[0] : `Trang ${page.pageNumber}`;

    if (pageText.length <= chunkSize) {
      chunks.push({
        content: pageText,
        chunkIndex: chunkIndex++,
        pageNumber: page.pageNumber,
        sectionTitle: firstLine
      });
      continue;
    }

    let start = 0;
    while (start < pageText.length) {
      let end = start + chunkSize;
      if (end >= pageText.length) {
        end = pageText.length;
      } else {
        // Cố gắng ngắt ở dấu ngắt câu hoặc xuống dòng gần nhất
        const nextBreak = pageText.lastIndexOf('\n', end);
        const nextDot = pageText.lastIndexOf('. ', end);
        const breakPoint = Math.max(nextBreak, nextDot);

        if (breakPoint > start + Math.floor(chunkSize * 0.6)) {
          end = breakPoint + 1;
        }
      }

      const chunkSlice = pageText.slice(start, end).trim();
      if (chunkSlice.length > 30) {
        chunks.push({
          content: chunkSlice,
          chunkIndex: chunkIndex++,
          pageNumber: page.pageNumber,
          sectionTitle: firstLine
        });
      }

      if (end >= pageText.length) break;
      start = end - overlap;
    }
  }

  return chunks;
}

/**
 * Sinh vector embedding qua Gemini API theo batch
 */
export async function getBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;
  const batchSize = 25;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const requests = batch.map(text => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSION
    }));

    try {
      const res = await axios.post(url, { requests }, { timeout: 35000 });
      const embeddings = res.data?.embeddings || [];
      for (const item of embeddings) {
        allEmbeddings.push(item.values || []);
      }
    } catch (err: any) {
      logger.error('Gemini batch embed failed', {
        batchStart: i,
        error: err.response?.data || err.message
      });
      // Dự phòng: đẩy mảng rỗng nếu lỗi để không làm hỏng thứ tự
      for (let j = 0; j < batch.length; j++) {
        allEmbeddings.push([]);
      }
    }
  }

  return allEmbeddings;
}

/**
 * Sinh vector embedding cho 1 câu đơn lẻ (dành cho search query)
 */
export async function getSingleEmbedding(text: string): Promise<number[] | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  try {
    const res = await axios.post(url, {
      content: { parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSION
    }, { timeout: 10000 });

    return res.data?.embedding?.values || null;
  } catch (err: any) {
    logger.error('Gemini single embed failed', { error: err.response?.data || err.message });
    return null;
  }
}

/**
 * Nạp (Ingest) tài liệu PDF hoặc TXT vào CSDL PostgreSQL
 */
export async function ingestDocument(
  fileBuffer: Buffer,
  fileName: string,
  title: string,
  uploadedBy = 'Admin'
): Promise<IngestResult> {
  const isPdf = fileName.toLowerCase().endsWith('.pdf');
  const fileType = isPdf ? 'application/pdf' : 'text/plain';
  const fileSize = fileBuffer.length;

  // 1. Tạo bản ghi Document Source với status PROCESSING
  const docSource: any = await prisma.$queryRawUnsafe(`
    INSERT INTO document_sources (title, file_name, file_type, file_size, status, uploaded_by, is_active)
    VALUES ($1, $2, $3, $4, 'PROCESSING', $5, true)
    RETURNING id, title, file_name;
  `, title, fileName, fileType, fileSize, uploadedBy);

  const documentId = docSource[0]?.id;
  if (!documentId) {
    throw new Error('Không thể khởi tạo bản ghi tài liệu trong cơ sở dữ liệu');
  }

  try {
    let pages: Array<{ pageNumber: number; text: string }> = [];
    let totalPages = 1;
    let isOcr = false;

    if (isPdf) {
      const extracted = await extractTextFromPdf(fileBuffer, fileName);
      pages = extracted.pages;
      totalPages = extracted.totalPages;
      isOcr = !!extracted.isOcr;
    } else {
      const rawText = fileBuffer.toString('utf-8');
      pages = [{ pageNumber: 1, text: rawText }];
      totalPages = 1;
    }

    // 2. Chia Chunks
    const chunks = chunkTextWithPages(pages);
    logger.info('Document chunked successfully', {
      documentId,
      totalChunks: chunks.length,
      totalPages,
      isOcr
    });

    if (chunks.length === 0) {
      await prisma.$executeRawUnsafe(`
        UPDATE document_sources SET status = 'FAILED', total_chunks = 0, updated_at = NOW() WHERE id = $1;
      `, documentId);
      return {
        documentId,
        title,
        fileName,
        totalChunks: 0,
        totalPages,
        status: 'FAILED',
        isOcr
      };
    }

    // 3. Tính Embeddings theo batch
    const chunkTexts = chunks.map(c => c.content);
    const embeddings = await getBatchEmbeddings(chunkTexts);

    // 4. Lưu từng chunk vào database
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const emb = embeddings[i];
      const embStr = emb && emb.length > 0 ? `[${emb.join(',')}]` : null;
      const metadata = JSON.stringify({
        pageNumber: c.pageNumber,
        fileName,
        title,
        ocr: isOcr
      });

      if (embStr) {
        await prisma.$executeRawUnsafe(`
          INSERT INTO document_chunks (document_id, chunk_index, section_title, content, metadata, embedding)
          VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector);
        `, documentId, c.chunkIndex, c.sectionTitle || '', c.content, metadata, embStr);
      } else {
        await prisma.$executeRawUnsafe(`
          INSERT INTO document_chunks (document_id, chunk_index, section_title, content, metadata)
          VALUES ($1, $2, $3, $4, $5::jsonb);
        `, documentId, c.chunkIndex, c.sectionTitle || '', c.content, metadata);
      }
    }

    // 5. Cập nhật document_sources thành READY
    await prisma.$executeRawUnsafe(`
      UPDATE document_sources 
      SET status = 'READY', total_chunks = $1, updated_at = NOW() 
      WHERE id = $2;
    `, chunks.length, documentId);

    logger.info('Document ingested into pgvector successfully', {
      documentId,
      totalChunks: chunks.length
    });

    return {
      documentId,
      title,
      fileName,
      totalChunks: chunks.length,
      totalPages,
      status: 'READY',
      isOcr
    };
  } catch (error: any) {
    logger.error('Failed to ingest document', { documentId, error: error.message });
    await prisma.$executeRawUnsafe(`
      UPDATE document_sources SET status = 'FAILED', updated_at = NOW() WHERE id = $1;
    `, documentId);
    throw error;
  }
}

/**
 * Tìm kiếm Hybrid RAG kết hợp Vector HNSW và Full-text Search qua thuật toán RRF (Reciprocal Rank Fusion)
 */
export async function searchHybridRAG(
  query: string,
  limit = 4,
  vectorThreshold = 0.35,
  modelKeyword?: string
): Promise<DocumentChunkResult[]> {
  try {
    if (!query || !query.trim()) return [];

    const cleanQuery = query.trim();
    // Tự động phát hiện model nếu chưa truyền (ví dụ: UR3626, 3626, UR5840...)
    const kw = (modelKeyword || cleanQuery.match(/\b(?:UR|CR|CR-ZX|W|UX|YDZ|QY\/F)?[0-9]{4,6}[A-Z]*\b/i)?.[0] || '').trim();

    // Tạo embedding cho câu truy vấn
    const queryEmbedding = await getSingleEmbedding(cleanQuery);
    const embStr = queryEmbedding ? `[${queryEmbedding.join(',')}]` : null;

    if (!embStr) {
      // Nếu embedding lỗi, fallback sang full-text keyword search
      const keywordOnly: any = await prisma.$queryRawUnsafe(`
        SELECT 
          c.id, c.document_id AS "documentId", c.chunk_index AS "chunkIndex",
          c.section_title AS "sectionTitle", c.content, c.metadata,
          0.0 AS "vectorSimilarity",
          ts_rank_cd(c.tsv_content, plainto_tsquery('simple', $1)) AS "textScore",
          ts_rank_cd(c.tsv_content, plainto_tsquery('simple', $1)) AS "rrfScore",
          s.title AS "sourceTitle", s.file_name AS "fileName"
        FROM document_chunks c
        JOIN document_sources s ON s.id = c.document_id
        WHERE s.is_active = true
          AND (c.tsv_content @@ plainto_tsquery('simple', $1) OR ($2 <> '' AND c.content ILIKE ('%' || $2 || '%')))
        ORDER BY "textScore" DESC
        LIMIT $3;
      `, cleanQuery, kw, limit);

      return keywordOnly || [];
    }

    // Thuật toán Hybrid RRF (Reciprocal Rank Fusion)
    const rawResults: any = await prisma.$queryRawUnsafe(`
      WITH vector_matches AS (
        SELECT 
          c.id, c.document_id, c.chunk_index, c.section_title, c.content, c.metadata,
          (1 - (c.embedding <=> $1::vector)) AS vector_similarity,
          ROW_NUMBER() OVER (ORDER BY c.embedding <=> $1::vector) AS rank_vec
        FROM document_chunks c
        JOIN document_sources s ON s.id = c.document_id
        WHERE s.is_active = true AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1::vector
        LIMIT 25
      ),
      keyword_matches AS (
        SELECT 
          c.id, c.document_id, c.chunk_index, c.section_title, c.content, c.metadata,
          GREATEST(
            COALESCE(ts_rank_cd(c.tsv_content, plainto_tsquery('simple', $2)), 0.0),
            CASE WHEN $3 <> '' AND c.content ILIKE ('%' || $3 || '%') THEN 0.8 ELSE 0.0 END
          ) AS text_score,
          ROW_NUMBER() OVER (
            ORDER BY GREATEST(
              COALESCE(ts_rank_cd(c.tsv_content, plainto_tsquery('simple', $2)), 0.0),
              CASE WHEN $3 <> '' AND c.content ILIKE ('%' || $3 || '%') THEN 0.8 ELSE 0.0 END
            ) DESC
          ) AS rank_text
        FROM document_chunks c
        JOIN document_sources s ON s.id = c.document_id
        WHERE s.is_active = true 
          AND (c.tsv_content @@ plainto_tsquery('simple', $2) OR ($3 <> '' AND c.content ILIKE ('%' || $3 || '%')))
        ORDER BY text_score DESC
        LIMIT 25
      )
      SELECT 
        COALESCE(v.id, k.id) AS id,
        COALESCE(v.document_id, k.document_id) AS "documentId",
        COALESCE(v.chunk_index, k.chunk_index) AS "chunkIndex",
        COALESCE(v.section_title, k.section_title) AS "sectionTitle",
        COALESCE(v.content, k.content) AS content,
        COALESCE(v.metadata, k.metadata) AS metadata,
        COALESCE(v.vector_similarity, 0.0)::float AS "vectorSimilarity",
        COALESCE(k.text_score, 0.0)::float AS "textScore",
        (COALESCE(1.0 / (60 + v.rank_vec), 0.0) + COALESCE(1.0 / (60 + k.rank_text), 0.0))::float AS "rrfScore",
        s.title AS "sourceTitle",
        s.file_name AS "fileName"
      FROM vector_matches v
      FULL OUTER JOIN keyword_matches k ON v.id = k.id
      JOIN document_sources s ON s.id = COALESCE(v.document_id, k.document_id)
      WHERE s.is_active = true
      ORDER BY "rrfScore" DESC
      LIMIT $4;
    `, embStr, cleanQuery, kw, limit);

    return rawResults || [];
  } catch (error: any) {
    logger.error('Failed to perform Hybrid RAG search', { query, error: error.message });
    return [];
  }
}


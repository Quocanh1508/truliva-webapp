import prisma from '../config/database';
import logger from '../utils/logger';
import axios from 'axios';
import { PDFParse } from 'pdf-parse';

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
}

/**
 * Trích xuất văn bản từ file PDF theo từng trang
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<{
  text: string;
  pages: Array<{ pageNumber: number; text: string }>;
  totalPages: number;
}> {
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const pagesList: Array<{ pageNumber: number; text: string }> = [];

    if (Array.isArray(result.pages) && result.pages.length > 0) {
      for (const p of result.pages) {
        if (p.text && p.text.trim()) {
          pagesList.push({
            pageNumber: p.num || pagesList.length + 1,
            text: p.text.trim()
          });
        }
      }
    }

    // Nếu pages rỗng nhưng có result.text
    if (pagesList.length === 0 && result.text && result.text.trim()) {
      pagesList.push({
        pageNumber: 1,
        text: result.text.trim()
      });
    }

    try {
      await parser.destroy();
    } catch (e) {
      // bỏ qua lỗi destroy nếu có
    }

    return {
      text: result.text || '',
      pages: pagesList,
      totalPages: result.total || pagesList.length
    };
  } catch (error: any) {
    logger.error('Failed to parse PDF file', { error: error.message });
    throw new Error(`Không thể đọc nội dung PDF: ${error.message}`);
  }
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

    if (isPdf) {
      const extracted = await extractTextFromPdf(fileBuffer);
      pages = extracted.pages;
      totalPages = extracted.totalPages;
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
      totalPages
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
        status: 'FAILED'
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
        title
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
      status: 'READY'
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
  vectorThreshold = 0.35
): Promise<DocumentChunkResult[]> {
  try {
    if (!query || !query.trim()) return [];

    const cleanQuery = query.trim();
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
          AND c.tsv_content @@ plainto_tsquery('simple', $1)
        ORDER BY "textScore" DESC
        LIMIT $2;
      `, cleanQuery, limit);

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
          ts_rank_cd(c.tsv_content, plainto_tsquery('simple', $2)) AS text_score,
          ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.tsv_content, plainto_tsquery('simple', $2)) DESC) AS rank_text
        FROM document_chunks c
        JOIN document_sources s ON s.id = c.document_id
        WHERE s.is_active = true AND c.tsv_content @@ plainto_tsquery('simple', $2)
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
      LIMIT $3;
    `, embStr, cleanQuery, limit);

    return rawResults || [];
  } catch (error: any) {
    logger.error('Failed to perform Hybrid RAG search', { query, error: error.message });
    return [];
  }
}


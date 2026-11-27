import { DocumentChunkResult, searchHybridRAG } from '../../ragService';

export interface RagToolOutput {
  ragText: string;
  chunks: DocumentChunkResult[];
}

/**
 * Bọc Hybrid RAG search đảm bảo chuẩn format chunk (rrfScore, metadata) cho UI & LLM.
 */
export async function searchKnowledgeRag(
  params: {
    query: string;
    primaryModel?: string;
    limit?: number;
    vectorThreshold?: number;
  },
  deps?: { searchFn?: typeof searchHybridRAG }
): Promise<RagToolOutput> {
  const cleanQuery = (params.query || '').trim();
  if (!cleanQuery) {
    return { ragText: '', chunks: [] };
  }

  const searchFn = deps?.searchFn || searchHybridRAG;
  const rawChunks = await searchFn(
    cleanQuery,
    params.limit ?? 4,
    params.vectorThreshold ?? 0.35,
    params.primaryModel || undefined
  );

  const chunks: DocumentChunkResult[] = (Array.isArray(rawChunks) ? rawChunks : []).map((c: any) => ({
    ...c,
    vectorSimilarity: Number(c?.vectorSimilarity ?? 0),
    textScore: Number(c?.textScore ?? 0),
    rrfScore: Number(c?.rrfScore ?? 0),
    content: String(c?.content || ''),
    metadata: c?.metadata && typeof c.metadata === 'object' ? c.metadata : { pageNumber: 1 },
  }));

  if (chunks.length === 0) {
    return { ragText: '', chunks: [] };
  }

  const ragText =
    '\nTÀI LIỆU CHÍNH HÃNG TRULIVA TRA CỨU ĐƯỢC (HYBRID RAG):\n' +
    chunks
      .map(
        (c, idx) =>
          `[Đoạn ${idx + 1} - Nguồn: ${c.sourceTitle || c.fileName || 'Tài liệu nội bộ'} | Trang: ${
            c.metadata?.pageNumber || 1
          } | Khớp: ${(c.rrfScore * 100).toFixed(1)}%]:\n${c.content}`
      )
      .join('\n\n');

  return { ragText, chunks };
}

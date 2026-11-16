#!/usr/bin/env node
/**
 * Kiểm tra API RAG trực tiếp trên VPS (http://127.0.0.1:<PORT>/api/ai-assistant/...). Chỉ đọc, chạy được trên production.
 * Ký JWT ngắn hạn (5 phút) cho 1 ADMIN đang hoạt động, kiểm tra key JSON mà AiAssistantManage.tsx dùng,
 * và kiểm tra tìm kiếm hybrid thực sự có nhánh vector (vectorSimilarity > 0).
 *
 *   node scripts/verify_rag_api.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const BASE = `http://127.0.0.1:${PORT}/api/ai-assistant`;
let failures = 0;
const check = (cond, label) => { console.log(`${cond ? '✅' : '❌'} ${label}`); if (!cond) failures++; };

(async () => {
  const pool = new Pool({ connectionString: (process.env.DATABASE_URL || '').split('?')[0] });
  const db = (await pool.query('select current_database() d')).rows[0].d;
  console.log(`DB: ${db} · API: ${BASE}`);
  const admin = (await pool.query(`select id, role, "group" from users where role = 'ADMIN' and is_active = true limit 1`)).rows[0];
  const dbStats = (await pool.query(`select (select count(*) from rag.document_sources where is_active)::int docs,
     (select count(*) from rag.document_chunks c join rag.document_sources s on s.id=c.document_id where s.is_active)::int chunks,
     (select count(*) from rag.document_chunks c join rag.document_sources s on s.id=c.document_id where s.is_active and c.embedding is null)::int no_emb`)).rows[0];
  await pool.end();
  console.log('rag.*:', dbStats);
  check(dbStats.docs > 0 && dbStats.chunks > 0, 'schema rag có tài liệu và chunk');
  check(dbStats.no_emb === 0, 'mọi chunk đang dùng đều có embedding');

  const tok = jwt.sign({ id: admin.id, role: admin.role, group: admin.group }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const call = async (p, opts = {}) => {
    const r = await fetch(BASE + p, { ...opts, headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  const docs = await call('/documents');
  check(docs.status === 200 && docs.body.success && Array.isArray(docs.body.documents), 'GET /documents → 200, documents[]');
  const d0 = (docs.body.documents || [])[0] || {};
  check(['id', 'title', 'fileName', 'fileSize', 'totalChunks', 'status', 'uploadedBy', 'createdAt'].every((k) => k in d0),
    'documents[0] có đủ key frontend dùng');
  check((docs.body.documents || []).length === dbStats.docs, `số tài liệu API (${(docs.body.documents || []).length}) = DB (${dbStats.docs})`);

  const queries = [
    ['thông số kỹ thuật máy UR3626', null],
    ['chính sách đổi trả sản phẩm', 'Chính sách'],
    ['máy nóng lạnh treo tường W6412 có mấy chế độ nước', 'W6412'],
    ['bao hanh may loc nuoc bao lau', null],
  ];
  for (const [q, expectSrc] of queries) {
    const r = await call('/documents/search-test', { method: 'POST', body: JSON.stringify({ query: q }) });
    const chunks = r.body.chunks || [];
    const c0 = chunks[0] || {};
    const vec = chunks.filter((c) => c.vectorSimilarity > 0).length;
    console.log(`  "${q}" → ${chunks.length} chunk, ${vec} có vector; top: ${c0.sourceTitle} (rrf ${Number(c0.rrfScore).toFixed(4)}, vec ${Number(c0.vectorSimilarity).toFixed(3)})`);
    check(r.status === 200 && chunks.length > 0, `search-test "${q}" có kết quả`);
    check(['id', 'content', 'sourceTitle', 'fileName', 'sectionTitle', 'metadata', 'rrfScore', 'vectorSimilarity', 'textScore'].every((k) => k in c0),
      '  chunk có đủ key frontend dùng');
    check(vec > 0, '  nhánh vector hoạt động');
    if (expectSrc) check(chunks.some((c) => (c.sourceTitle || '').includes(expectSrc)), `  có nguồn chứa "${expectSrc}"`);
  }
  console.log(failures ? `\n❌ ${failures} kiểm tra thất bại` : '\n✅ Tất cả kiểm tra đạt');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('LỖI:', e.message); process.exit(1); });

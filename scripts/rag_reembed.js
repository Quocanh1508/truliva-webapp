#!/usr/bin/env node
/**
 * Sinh lại embedding cho các chunk RAG đang thiếu vector (rag.document_chunks.embedding IS NULL).
 *
 *   node scripts/rag_reembed.js            # dry-run: chỉ đếm
 *   node scripts/rag_reembed.js --apply    # gọi Gemini và ghi embedding
 *
 * Chạy trong thư mục dự án trên VPS. Nạp .env của CHÍNH thư mục đó trước (tránh bẫy DB production).
 * Dùng đúng cấu hình embedding của src/services/ragService.ts (gemini-embedding-001, 768 chiều).
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Pool } = require('pg');
const axios = require('axios');

const APPLY = process.argv.includes('--apply');
const MODEL = 'gemini-embedding-001';
const DIM = 768;
const BATCH = 20;
const KEY = process.env.GEMINI_API_KEY || '';
const url = (process.env.DATABASE_URL || '').split('?')[0];
if (!url) { console.error('Thiếu DATABASE_URL'); process.exit(1); }
const pool = new Pool({ connectionString: url });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(texts) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${KEY}`;
  const body = {
    requests: texts.map((text) => ({ model: `models/${MODEL}`, content: { parts: [{ text }] }, outputDimensionality: DIM })),
  };
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await axios.post(endpoint, body, { timeout: 60000 });
      const embs = (res.data && res.data.embeddings) || [];
      if (embs.length !== texts.length || embs.some((e) => !e.values || e.values.length !== DIM)) {
        throw new Error(`Gemini trả về ${embs.length}/${texts.length} embedding hợp lệ`);
      }
      return embs.map((e) => e.values);
    } catch (err) {
      const status = err.response && err.response.status;
      const msg = (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message;
      const wait = status === 429 ? 30000 * attempt : 3000 * attempt;
      console.warn(`  lỗi lần ${attempt} (HTTP ${status || '-'}): ${msg} → chờ ${wait / 1000}s`);
      if (attempt === 5) throw new Error(msg);
      await sleep(wait);
    }
  }
}

(async () => {
  const db = (await pool.query('select current_database() d')).rows[0].d;
  console.log(`DB=${db} cwd=${process.cwd()} mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  const summary = await pool.query(`
    select s.title, count(*)::int n from rag.document_chunks c join rag.document_sources s on s.id = c.document_id
    where c.embedding is null and s.is_active group by s.title order by n desc`);
  summary.rows.forEach((r) => console.log(`  ${String(r.n).padStart(4)}  ${r.title}`));
  const rows = (await pool.query(`
    select c.id, c.content from rag.document_chunks c join rag.document_sources s on s.id = c.document_id
    where c.embedding is null and s.is_active order by s.created_at, c.chunk_index`)).rows;
  console.log(`Tổng chunk thiếu embedding (tài liệu đang dùng): ${rows.length}`);
  if (!APPLY || rows.length === 0) { await pool.end(); return; }
  if (!KEY) { console.error('Thiếu GEMINI_API_KEY'); process.exit(1); }

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vectors = await embedBatch(batch.map((r) => r.content));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let j = 0; j < batch.length; j++) {
        await client.query('update rag.document_chunks set embedding = $1::vector where id = $2 and embedding is null',
          [`[${vectors[j].join(',')}]`, batch[j].id]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    done += batch.length;
    console.log(`  ✔ ${done}/${rows.length}`);
    await sleep(1500);
  }
  const left = (await pool.query('select count(*)::int n from rag.document_chunks where embedding is null')).rows[0].n;
  console.log(`Xong. Còn thiếu embedding (mọi tài liệu, kể cả đã gỡ): ${left}`);
  await pool.end();
})().catch(async (e) => { console.error('LỖI:', e.message); await pool.end(); process.exit(1); });

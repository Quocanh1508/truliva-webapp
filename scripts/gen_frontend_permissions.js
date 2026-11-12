#!/usr/bin/env node
/**
 * Sinh webapp/src/config/permissions.ts từ nguồn duy nhất src/config/permissions.ts
 *
 *   node scripts/gen_frontend_permissions.js          → ghi file
 *   node scripts/gen_frontend_permissions.js --check  → exit 1 nếu file frontend bị lệch
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../src/config/permissions.ts');
const DEST = path.resolve(__dirname, '../webapp/src/config/permissions.ts');

const HEADER =
  '// ⚠️ AUTO-GENERATED — KHÔNG SỬA TAY FILE NÀY.\n' +
  '// Nguồn: src/config/permissions.ts → chạy `npm run perm:gen` (tự chạy khi build/dev).\n\n';

const source = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
if (/^\s*import\s/m.test(source)) {
  console.error('❌ src/config/permissions.ts không được import thư viện nào (frontend dùng chung).');
  process.exit(1);
}
const expected = HEADER + source;
const current = fs.existsSync(DEST) ? fs.readFileSync(DEST, 'utf8').replace(/\r\n/g, '\n') : '';

if (process.argv.includes('--check')) {
  if (current !== expected) {
    console.error('❌ webapp/src/config/permissions.ts lệch với src/config/permissions.ts → chạy `npm run perm:gen`.');
    process.exit(1);
  }
  console.log('✅ Danh mục phân quyền frontend đồng bộ với backend.');
} else if (current !== expected) {
  fs.writeFileSync(DEST, expected, 'utf8');
  console.log('✅ Đã sinh lại webapp/src/config/permissions.ts');
} else {
  console.log('✅ webapp/src/config/permissions.ts đã cập nhật, không cần sinh lại.');
}

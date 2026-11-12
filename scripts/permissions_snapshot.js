#!/usr/bin/env node
/**
 * Truliva — Permission Snapshot & Verify (READ-ONLY)
 *
 * Script này CHỈ dùng lệnh SELECT. Không bao giờ ghi/xóa dữ liệu.
 *
 *   node scripts/permissions_snapshot.js backup [file]
 *       → Xuất toàn bộ role_permissions + user_permissions ra JSON
 *         (mặc định: backups/permissions_snapshot_backup.json)
 *
 *   node scripts/permissions_snapshot.js verify [file]
 *       → So sánh DB hiện tại với file backup. Báo cáo:
 *         - Bản ghi cũ bị THAY ĐỔI giá trị (phải = 0)
 *         - Bản ghi cũ bị MẤT (phải = 0)
 *         - Bản ghi MỚI được thêm (chỉ được phép là key mới)
 *         Exit code 1 nếu có bất kỳ thay đổi/mất mát nào.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DEFAULT_FILE = path.resolve(__dirname, '../backups/permissions_snapshot_backup.json');

async function readDb() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const rolePerms = (await client.query(
      `SELECT role::text AS role, "group", feature_key AS "featureKey", is_allowed AS "isAllowed",
              created_at AS "createdAt", updated_at AS "updatedAt"
         FROM role_permissions ORDER BY role, "group", feature_key`
    )).rows;
    const userPerms = (await client.query(
      `SELECT up.user_id AS "userId", u.username, u.full_name AS "fullName", u.role::text AS role, u."group" AS "group",
              up.feature_key AS "featureKey", up.is_allowed AS "isAllowed",
              up.created_at AS "createdAt", up.updated_at AS "updatedAt"
         FROM user_permissions up LEFT JOIN users u ON u.id = up.user_id
        ORDER BY u.username, up.feature_key`
    )).rows;
    return { rolePerms, userPerms };
  } finally {
    await client.end();
  }
}

function summarize({ rolePerms, userPerms }) {
  const roles = new Set(rolePerms.filter(p => !p.group).map(p => p.role));
  const groups = new Set(rolePerms.filter(p => p.group).map(p => `${p.role}::${p.group}`));
  const users = new Set(userPerms.map(p => p.userId));
  return {
    roleLevelRows: rolePerms.filter(p => !p.group).length,
    groupLevelRows: rolePerms.filter(p => p.group).length,
    userLevelRows: userPerms.length,
    distinctRoles: roles.size,
    distinctRoleGroups: groups.size,
    distinctUsers: users.size,
    roleList: [...roles],
    roleGroupList: [...groups],
    userList: [...new Set(userPerms.map(p => `${p.username} (${p.role}${p.group ? '/' + p.group : ''})`))]
  };
}

async function backup(file) {
  const data = await readDb();
  const snapshot = { createdAt: new Date().toISOString(), summary: summarize(data), ...data };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(`✅ Đã backup → ${file}`);
  console.log(JSON.stringify(snapshot.summary, null, 2));
}

async function verify(file) {
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  const now = await readDb();

  const rk = p => `${p.role}|${p.group || ''}|${p.featureKey}`;
  const uk = p => `${p.userId}|${p.featureKey}`;

  const check = (label, before, after, keyFn) => {
    const afterMap = new Map(after.map(p => [keyFn(p), p]));
    const beforeKeys = new Set(before.map(keyFn));
    const changed = [], missing = [];
    for (const b of before) {
      const a = afterMap.get(keyFn(b));
      if (!a) missing.push(keyFn(b));
      else if (a.isAllowed !== b.isAllowed) changed.push(`${keyFn(b)}: ${b.isAllowed} → ${a.isAllowed}`);
    }
    const added = after.filter(a => !beforeKeys.has(keyFn(a))).map(keyFn);
    console.log(`\n[${label}] trước=${before.length} sau=${after.length} | giữ nguyên=${before.length - changed.length - missing.length} | thay đổi=${changed.length} | mất=${missing.length} | thêm mới=${added.length}`);
    changed.forEach(c => console.log('  ❌ CHANGED', c));
    missing.forEach(m => console.log('  ❌ MISSING', m));
    if (added.length) {
      const byFeature = {};
      added.forEach(k => { const f = k.split('|').pop(); byFeature[f] = (byFeature[f] || 0) + 1; });
      Object.entries(byFeature).forEach(([f, n]) => console.log(`  ➕ ${f}: +${n} bản ghi`));
    }
    return { changed, missing, added };
  };

  console.log(`🔎 Đối chiếu DB với snapshot ${snap.createdAt}`);
  const r = check('Role + Group (role_permissions)', snap.rolePerms, now.rolePerms, rk);
  const u = check('User (user_permissions)', snap.userPerms, now.userPerms, uk);

  // Key mới chỉ được phép là key chưa từng tồn tại trong snapshot
  const oldKeys = new Set([...snap.rolePerms, ...snap.userPerms].map(p => p.featureKey));
  const illegalAdds = [...r.added, ...u.added].filter(k => oldKeys.has(k.split('|').pop()));
  if (illegalAdds.length) {
    console.log(`\n⚠️  ${illegalAdds.length} bản ghi mới thuộc key ĐÃ CÓ trong snapshot (không phải tính năng mới):`);
    illegalAdds.slice(0, 50).forEach(k => console.log('   ', k));
  }

  const bad = r.changed.length + r.missing.length + u.changed.length + u.missing.length;
  console.log(bad === 0
    ? '\n✅ KẾT LUẬN: 100% bản ghi phân quyền cũ được giữ nguyên (0 thay đổi, 0 mất mát).'
    : `\n❌ KẾT LUẬN: Có ${bad} bản ghi cũ bị thay đổi hoặc mất!`);
  process.exit(bad === 0 ? 0 : 1);
}

const [, , cmd = 'backup', fileArg] = process.argv;
const file = fileArg ? path.resolve(fileArg) : DEFAULT_FILE;
(cmd === 'verify' ? verify(file) : backup(file)).catch(err => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});

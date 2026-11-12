#!/usr/bin/env node
/**
 * Chạy 1 lần permissionSync (NON-DESTRUCTIVE) với DATABASE_URL hiện tại rồi in báo cáo.
 *   node scripts/vps_db_tunnel.js production -- node scripts/run_permission_sync.js
 */
require('ts-node/register/transpile-only');
const { syncPermissionCatalog } = require('../src/services/permissionSync');

syncPermissionCatalog()
  .then(report => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Sync lỗi:', err.message);
    process.exit(1);
  });

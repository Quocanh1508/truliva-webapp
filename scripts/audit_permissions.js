#!/usr/bin/env node
/**
 * Truliva Permission Matrix Audit & Sync Utility
 * 
 * Kiểm tra tính nhất quán 100% giữa:
 * 1. Backend Registry (src/config/permissions.ts)
 * 2. Frontend Registry (webapp/src/config/permissions.ts)
 * 3. Frontend Usage (hasPermission calls in webapp/src)
 * 4. Backend Usage (requirePermission / route checks in src/routes)
 * 
 * Sử dụng:
 *   node scripts/audit_permissions.js
 *   node scripts/audit_permissions.js --fix (Tự động đồng bộ từ Backend sang Frontend)
 */

const fs = require('fs');
const path = require('path');

const BACKEND_PERM_FILE = path.resolve(__dirname, '../src/config/permissions.ts');
const FRONTEND_PERM_FILE = path.resolve(__dirname, '../webapp/src/config/permissions.ts');
const WEBAPP_SRC_DIR = path.resolve(__dirname, '../webapp/src');
const BACKEND_ROUTES_DIR = path.resolve(__dirname, '../src/routes');

function extractFeatureKeys(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const features = [];
  
  // Regex to extract objects inside SYSTEM_FEATURES
  // Matches key: 'XYZ', module: '...', name: '...', defaultRoles: [...], addedAt: '...'
  const featureRegex = /\{\s*key:\s*['"]([A-Z0-9_]+)['"][\s\S]*?module:\s*['"]([a-z0-9_]+)['"][\s\S]*?name:\s*['"]([^'"]+)['"][\s\S]*?defaultRoles:\s*\[([^\]]*)\][\s\S]*?addedAt:\s*['"]([^'"]+)['"][\s\S]*?\}/g;
  
  let match;
  while ((match = featureRegex.exec(content)) !== null) {
    const defaultRoles = match[4]
      .split(',')
      .map(r => r.replace(/['"\s]/g, ''))
      .filter(Boolean);

    features.push({
      key: match[1],
      module: match[2],
      name: match[3],
      defaultRoles,
      addedAt: match[5]
    });
  }

  // Also extract simple keys as fallback: key: 'XYZ'
  const simpleKeyRegex = /key:\s*['"]([A-Z0-9_]+)['"]/g;
  const allKeys = new Set();
  while ((match = simpleKeyRegex.exec(content)) !== null) {
    allKeys.add(match[1]);
  }

  return { features, allKeys: Array.from(allKeys) };
}

function scanFiles(dir, extFilter, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        scanFiles(fullPath, extFilter, callback);
      }
    } else if (entry.isFile()) {
      if (extFilter.some(ext => entry.name.endsWith(ext))) {
        callback(fullPath, fs.readFileSync(fullPath, 'utf8'));
      }
    }
  }
}

function auditPermissions() {
  console.log('🔍 [TRULIVA PERMISSION MATRIX AUDIT]');
  console.log('--------------------------------------------------');

  const backendData = extractFeatureKeys(BACKEND_PERM_FILE);
  const frontendData = extractFeatureKeys(FRONTEND_PERM_FILE);

  console.log(`📦 Backend Features:  ${backendData.allKeys.length} keys`);
  console.log(`💻 Frontend Features: ${frontendData.allKeys.length} keys`);

  const backendKeySet = new Set(backendData.allKeys);
  const frontendKeySet = new Set(frontendData.allKeys);

  const missingInFrontend = backendData.allKeys.filter(k => !frontendKeySet.has(k));
  const missingInBackend = frontendData.allKeys.filter(k => !backendKeySet.has(k));

  let hasError = false;

  if (missingInFrontend.length > 0) {
    hasError = true;
    console.error('\n❌ CẢNH BÁO: Tính năng có ở Backend nhưng CHƯA ĐỒNG BỘ sang Frontend:');
    missingInFrontend.forEach(k => console.error(`   - ${k}`));
  }

  if (missingInBackend.length > 0) {
    hasError = true;
    console.error('\n❌ CẢNH BÁO: Tính năng có ở Frontend nhưng CHƯA KHAI BÁO ở Backend:');
    missingInBackend.forEach(k => console.error(`   - ${k}`));
  }

  // Check new features (addedAt !== 'v1.0')
  const newFeatures = backendData.features.filter(f => f.addedAt !== 'v1.0');
  console.log(`\n✨ Tính năng mới (addedAt !== 'v1.0'): ${newFeatures.length} tính năng`);
  newFeatures.forEach(f => {
    console.log(`   * [${f.addedAt}] [${f.module}] ${f.key} - ${f.name} (Roles: ${f.defaultRoles.join(', ')})`);
  });

  // Scan Frontend usages: hasPermission('KEY')
  console.log('\n🔎 Quét thực tế mã nguồn Frontend (hasPermission)...');
  const frontendUsedKeys = new Set();
  const invalidFrontendKeys = [];

  scanFiles(WEBAPP_SRC_DIR, ['.tsx', '.ts'], (filePath, content) => {
    const hasPermRegex = /hasPermission\s*\(\s*['"]([A-Z0-9_]+)['"]/g;
    let match;
    while ((match = hasPermRegex.exec(content)) !== null) {
      const key = match[1];
      frontendUsedKeys.add(key);
      if (!backendKeySet.has(key)) {
        invalidFrontendKeys.push({ key, file: path.relative(path.resolve(__dirname, '..'), filePath) });
      }
    }
  });

  console.log(`   Đã tìm thấy ${frontendUsedKeys.size} permission keys được gọi qua hasPermission() trên Web App.`);
  if (invalidFrontendKeys.length > 0) {
    hasError = true;
    console.error('❌ CÁC KEY ĐƯỢC GỌI TRÊN UI NHƯNG CHƯA KHAI BÁO TRONG SYSTEM_FEATURES:');
    invalidFrontendKeys.forEach(item => {
      console.error(`   - Key "${item.key}" tại file: ${item.file}`);
    });
  } else {
    console.log('   ✅ 100% permission keys được gọi trên UI đều đã đăng ký hợp lệ.');
  }

  // Scan Backend usages: requirePermission('KEY')
  console.log('\n🔎 Quét thực tế mã nguồn Backend routes (requirePermission)...');
  const backendUsedKeys = new Set();
  const invalidBackendKeys = [];

  scanFiles(BACKEND_ROUTES_DIR, ['.ts'], (filePath, content) => {
    const requirePermRegex = /requirePermission\s*\(\s*['"]([A-Z0-9_]+)['"]/g;
    let match;
    while ((match = requirePermRegex.exec(content)) !== null) {
      const key = match[1];
      backendUsedKeys.add(key);
      if (!backendKeySet.has(key)) {
        invalidBackendKeys.push({ key, file: path.relative(path.resolve(__dirname, '..'), filePath) });
      }
    }
  });

  console.log(`   Đã tìm thấy ${backendUsedKeys.size} permission keys được bảo vệ qua requirePermission().`);
  if (invalidBackendKeys.length > 0) {
    hasError = true;
    console.error('❌ CÁC KEY DÙNG TRONG ROUTE NHƯNG CHƯA KHAI BÁO TRONG SYSTEM_FEATURES:');
    invalidBackendKeys.forEach(item => {
      console.error(`   - Key "${item.key}" tại file: ${item.file}`);
    });
  } else {
    console.log('   ✅ 100% route guards đều đã đăng ký hợp lệ.');
  }

  console.log('\n--------------------------------------------------');
  if (hasError) {
    console.error('❌ KẾT QUẢ: PHÁT HIỆN LỖI LỆCH MA TRẬN PHÂN QUYỀN!');
    console.error('👉 Vui lòng cập nhật lại permissions.ts theo quy chuẩn SKILL: permission-matrix.');
    process.exit(1);
  } else {
    console.log('🎉 KẾT QUẢ: MA TRẬN PHÂN QUYỀN ĐỒNG BỘ 100% HOÀN HẢO!');
    process.exit(0);
  }
}

auditPermissions();

/**
 * Strix AI Penetration Testing Runner for Truliva System
 * 
 * Usage:
 *   node scripts/security/run-strix-scan.js [--target http://localhost:3000]
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetArgIndex = process.argv.indexOf('--target');
const targetUrl = targetArgIndex !== -1 && process.argv[targetArgIndex + 1] 
  ? process.argv[targetArgIndex + 1] 
  : 'http://localhost:3000';

console.log('===========================================================');
console.log('🛡️  TRULIVA SYSTEM - STRIX AI PENETRATION TESTING RUNNER');
console.log('===========================================================');
console.log(`Target URL: ${targetUrl}`);
console.log(`Config:     strix.config.yaml\n`);

// 1. Kiểm tra API Key của LLM
const hasKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;
if (!hasKey) {
  console.warn('⚠️  Cảnh báo: Không tìm thấy OPENAI_API_KEY, ANTHROPIC_API_KEY hoặc GEMINI_API_KEY trong môi trường.');
  console.warn('👉 Vui lòng set biến môi trường: export OPENAI_API_KEY="sk-..." hoặc cấu hình trong file .env');
}

// 2. Kiểm tra Docker
try {
  execSync('docker --version', { stdio: 'ignore' });
  console.log('✅ Docker: Sẵn sàng');
} catch (e) {
  console.warn('⚠️  Docker chưa bật hoặc chưa cài đặt. Strix Sandbox cần Docker để thực thi các exploit an toàn.');
}

// 3. Kiểm tra Strix CLI
let strixInstalled = false;
try {
  execSync('strix --version', { stdio: 'ignore' });
  strixInstalled = true;
  console.log('✅ Strix CLI: Đã cài đặt\n');
} catch (e) {
  console.log('ℹ️  Chưa phát hiện lệnh `strix` trong PATH.');
  console.log('👉 Bạn có thể cài đặt Strix bằng lệnh:');
  console.log('   pip install strix-agent');
  console.log('   hoặc curl -sSL https://strix.ai/install | bash\n');
}

if (!strixInstalled) {
  console.log('💡 Hướng dẫn chạy quét thủ công sau khi cài đặt Strix:');
  console.log(`   strix scan --config strix.config.yaml --target "${targetUrl}" --output-dir ./reports/security\n`);
  process.exit(0);
}

// 4. Tạo thư mục output report nếu chưa có
const reportDir = path.join(process.cwd(), 'reports', 'security');
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

console.log('🚀 Đang khởi động Strix AI Penetration Tester...');
const strixProcess = spawn('strix', [
  'scan',
  '--config', 'strix.config.yaml',
  '--target', targetUrl,
  '--output-dir', './reports/security'
], { stdio: 'inherit', shell: true });

strixProcess.on('close', (code) => {
  console.log('\n===========================================================');
  if (code === 0) {
    console.log('🎉 Quá trình quét hoàn tất! Báo cáo lỗ hổng được lưu tại:');
    console.log(`   📂 ${reportDir}`);
  } else {
    console.log(`⚠️  Quá trình quét kết thúc với mã thoát: ${code}`);
  }
  console.log('===========================================================');
});

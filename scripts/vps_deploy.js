#!/usr/bin/env node
/**
 * Công cụ deploy lên VPS qua SSH/SFTP (đọc thông tin đăng nhập từ .env — KHÔNG hardcode mật khẩu).
 * Dùng chung biến môi trường với scripts/vps_db_tunnel.js: VPS_HOST, VPS_USER, VPS_PORT, VPS_SSH_KEY_PATH | VPS_PASSWORD.
 *
 *   node scripts/vps_deploy.js pull <production|sandbox> <outDir> <file...>
 *       Tải bản đang chạy trên VPS về <outDir>/<file> để so sánh (VPS KHÔNG đồng bộ git!).
 *
 *   node scripts/vps_deploy.js push <production|sandbox> <file...>
 *       Backup bản trên VPS vào <remoteDir>/backups/deploy_<timestamp>/<file> rồi upload bản local.
 *       Dạng "<localPath>=<remoteRel>" để upload 1 file local khác vào đường dẫn <remoteRel>.
 *
 *   node scripts/vps_deploy.js exec <production|sandbox> -- <lệnh shell>
 *       Chạy lệnh trong thư mục dự án trên VPS, in stdout/stderr, trả về đúng exit code.
 *
 * Thư mục: production = /var/www/truliva, sandbox = /var/www/truliva-sandbox.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const ROOT = path.resolve(__dirname, '..');
const [action, envArg, ...rest] = process.argv.slice(2);
const target = (envArg || '').toLowerCase();
if (!['pull', 'push', 'exec'].includes(action) || !['production', 'sandbox'].includes(target)) {
  console.error('Usage:\n  vps_deploy.js pull <production|sandbox> <outDir> <file...>\n  vps_deploy.js push <production|sandbox> <file...>\n  vps_deploy.js exec <production|sandbox> -- <cmd>');
  process.exit(1);
}
const remoteDir = target === 'sandbox' ? '/var/www/truliva-sandbox' : '/var/www/truliva';

const host = process.env.VPS_HOST || process.env.VPS_SSH_HOST;
const user = process.env.VPS_USER || process.env.VPS_SSH_USER;
const keyPath = process.env.VPS_SSH_KEY_PATH;
const password = process.env.VPS_PASSWORD || process.env.VPS_SSH_PASSWORD;
if (!host || !user || (!keyPath && !password)) {
  console.error('❌ Thiếu VPS_HOST / VPS_USER / VPS_SSH_KEY_PATH|VPS_PASSWORD trong .env');
  process.exit(1);
}

function toPosix(p) { return p.replace(/\\/g, '/'); }
function q(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }

function execRemote(conn, cmd, { echo = true } = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d; if (echo) process.stdout.write(d); });
      stream.stderr.on('data', d => { if (echo) process.stderr.write(d); });
      stream.on('close', code => resolve({ code: code ?? 0, out }));
    });
  });
}

function sftpOf(conn) {
  return new Promise((resolve, reject) => conn.sftp((e, s) => (e ? reject(e) : resolve(s))));
}

async function run(conn) {
  if (action === 'exec') {
    const sep = rest.indexOf('--');
    const cmd = (sep >= 0 ? rest.slice(sep + 1) : rest).join(' ');
    if (!cmd) throw new Error('Thiếu lệnh sau --');
    const { code } = await execRemote(conn, `cd ${q(remoteDir)} && ${cmd}`);
    return code;
  }

  const sftp = await sftpOf(conn);

  if (action === 'pull') {
    const [outDir, ...files] = rest;
    if (!outDir || !files.length) throw new Error('Thiếu <outDir> hoặc danh sách file');
    for (const f of files) {
      const rel = toPosix(f);
      const local = path.resolve(outDir, rel);
      fs.mkdirSync(path.dirname(local), { recursive: true });
      await new Promise(res => sftp.fastGet(`${remoteDir}/${rel}`, local, e => {
        console.log(e ? `⚠️  ${rel}: không có trên VPS (${e.message})` : `⬇️  ${rel}`);
        res();
      }));
    }
    return 0;
  }

  // push
  if (!rest.length) throw new Error('Thiếu danh sách file');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const backupDir = `${remoteDir}/backups/deploy_${stamp}`;
  for (const f of rest) {
    // Hỗ trợ "localPath=remoteRel" khi file upload khác file trong repo (VD: bản vá trên nền file đang chạy ở VPS)
    const eq = f.indexOf('=');
    const rel = toPosix(eq > 0 ? f.slice(eq + 1) : f);
    const local = eq > 0 ? path.resolve(f.slice(0, eq)) : path.resolve(ROOT, rel);
    if (!fs.existsSync(local)) throw new Error(`Không tìm thấy file local: ${rel}`);
    const remote = `${remoteDir}/${rel}`;
    const backup = `${backupDir}/${rel}`;
    await execRemote(conn,
      `mkdir -p ${q(path.posix.dirname(remote))} ${q(path.posix.dirname(backup))} && ` +
      `if [ -f ${q(remote)} ]; then cp -p ${q(remote)} ${q(backup)}; fi`, { echo: false });
    await new Promise((res, rej) => sftp.fastPut(local, remote, e => (e ? rej(e) : res())));
    console.log(`⬆️  ${rel}`);
  }
  console.log(`🗂  Backup bản cũ: ${backupDir}`);
  return 0;
}

const conn = new Client();
conn.on('ready', async () => {
  let code = 1;
  try { code = await run(conn); }
  catch (e) { console.error('❌', e.message); }
  conn.end();
  process.exit(code);
}).on('error', e => { console.error('❌ SSH lỗi:', e.message); process.exit(1); })
  .connect({
    host,
    port: Number(process.env.VPS_PORT || process.env.VPS_SSH_PORT || 22),
    username: user,
    ...(keyPath ? { privateKey: fs.readFileSync(keyPath) } : { password }),
  });

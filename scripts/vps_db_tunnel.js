#!/usr/bin/env node
/**
 * Mở SSH tunnel tới PostgreSQL trên VPS rồi chạy 1 lệnh con với DATABASE_URL trỏ qua tunnel.
 *
 *   node scripts/vps_db_tunnel.js [production|sandbox] -- <command...>
 *   VD: node scripts/vps_db_tunnel.js production -- node scripts/permissions_snapshot.js backup
 *
 * - Đọc DATABASE_URL từ file .env trên VPS (không in ra màn hình).
 * - Lệnh con nhận DATABASE_URL = postgresql://...@127.0.0.1:<localPort>/<db>.
 */
require('dotenv').config();
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const { Client } = require('ssh2');

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const target = ((sep > 0 ? argv[0] : 'production') || 'production').toLowerCase();
const cmd = sep >= 0 ? argv.slice(sep + 1) : [];
if (!cmd.length) {
  console.error('Usage: node scripts/vps_db_tunnel.js [production|sandbox] -- <command...>');
  process.exit(1);
}
const remoteDir = target === 'sandbox' ? '/var/www/truliva-sandbox' : '/var/www/truliva';

const vpsHost = process.env.VPS_HOST || process.env.VPS_SSH_HOST;
const vpsUser = process.env.VPS_USER || process.env.VPS_SSH_USER;
const vpsKeyPath = process.env.VPS_SSH_KEY_PATH;
const vpsPassword = process.env.VPS_PASSWORD || process.env.VPS_SSH_PASSWORD;
if (!vpsHost || !vpsUser || (!vpsKeyPath && !vpsPassword)) {
  console.error('❌ Thiếu VPS_HOST / VPS_USER / VPS_SSH_KEY_PATH|VPS_PASSWORD trong .env');
  process.exit(1);
}

const conn = new Client();
conn.on('ready', () => {
  conn.exec(`grep -E '^DATABASE_URL=' ${remoteDir}/.env | head -1`, (err, stream) => {
    if (err) { console.error(err.message); process.exit(1); }
    let out = '';
    stream.on('data', d => { out += d.toString(); });
    stream.on('close', () => {
      const raw = out.trim().replace(/^DATABASE_URL=/, '').replace(/^["']|["']$/g, '');
      let url;
      try { url = new URL(raw); } catch { console.error('❌ Không đọc được DATABASE_URL trên VPS'); process.exit(1); }
      const remoteHost = url.hostname || '127.0.0.1';
      const remotePort = Number(url.port || 5432);

      const server = net.createServer(sock => {
        conn.forwardOut('127.0.0.1', 0, remoteHost, remotePort, (e, fwd) => {
          if (e) { sock.destroy(); return; }
          sock.pipe(fwd).pipe(sock);
          sock.on('error', () => fwd.destroy());
          fwd.on('error', () => sock.destroy());
        });
      });
      server.listen(0, '127.0.0.1', () => {
        const localPort = server.address().port;
        url.hostname = '127.0.0.1';
        url.port = String(localPort);
        console.log(`🔐 Tunnel tới DB ${target} sẵn sàng (local :${localPort})`);
        const child = spawn(cmd[0], cmd.slice(1), {
          stdio: 'inherit',
          shell: process.platform === 'win32',
          env: { ...process.env, DATABASE_URL: url.toString() }
        });
        child.on('exit', code => { server.close(); conn.end(); process.exit(code ?? 0); });
      });
    });
  });
}).on('error', e => { console.error('❌ SSH lỗi:', e.message); process.exit(1); })
  .connect({
    host: vpsHost,
    port: Number(process.env.VPS_PORT || process.env.VPS_SSH_PORT || 22),
    username: vpsUser,
    ...(vpsKeyPath ? { privateKey: fs.readFileSync(vpsKeyPath) } : { password: vpsPassword })
  });

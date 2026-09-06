const { Client } = require('ssh2');
const net = require('net');
const { exec } = require('child_process');

const envTarget = (process.argv[2] || 'production').toLowerCase();
const isSandbox = envTarget === 'sandbox';
const remoteDir = isSandbox ? '/var/www/truliva-sandbox' : '/var/www/truliva';
const dbName = isSandbox ? 'truliva_sandbox (Sandbox)' : 'truliva_db (Production)';

const sshConfig = {
  host: '221.132.21.42',
  port: 22,
  username: 'root',
  password: 'c3qwbwf2BU0PkTxW8wKM'
};

console.log('====================================================');
console.log(`🚀 Khởi động Prisma Studio cho DB: ${dbName}`);
console.log(`📂 Remote Path: ${remoteDir}`);
console.log('====================================================');

const conn = new Client();
let studioStream = null;
let tunnelServer = null;
let browserOpened = false;

conn.on('ready', () => {
  console.log('✓ Đã kết nối SSH VPS thành công.');

  // Dọn dẹp process cũ trên VPS nếu có
  conn.exec('fuser -k 5555/tcp 2>/dev/null || true', () => {
    // Khởi chạy Prisma Studio trên Linux VPS
    conn.exec(`cd ${remoteDir} && npx prisma studio --port 5555 --browser none`, (err, stream) => {
      if (err) {
        console.error('❌ Lỗi chạy Prisma Studio:', err);
        conn.end();
        process.exit(1);
      }

      studioStream = stream;

      stream.on('data', (data) => {
        const text = data.toString();
        if (text.includes('Prisma Studio is running') || text.includes('http://localhost:5555')) {
          startLocalTunnel();
        }
      });

      stream.stderr.on('data', (data) => {
        const text = data.toString();
        if (!text.includes('tip:')) {
          process.stderr.write(text);
        }
      });

      stream.on('close', () => {
        console.log('\nPrisma Studio trên VPS đã dừng.');
        cleanup();
      });
    });
  });
}).on('error', (err) => {
  console.error('❌ Kết nối SSH VPS thất bại:', err.message);
  process.exit(1);
}).connect(sshConfig);

function startLocalTunnel() {
  if (tunnelServer) return;

  tunnelServer = net.createServer((sock) => {
    // Bắt lỗi socket từ browser đóng sớm (keep-alive, favicon, v.v.)
    sock.on('error', () => {
      sock.destroy();
    });

    // Tái sử dụng SSH connection có sẵn (không mở kết nối SSH mới)
    conn.forwardOut(
      sock.remoteAddress || '127.0.0.1',
      sock.remotePort || 0,
      '127.0.0.1',
      5555,
      (err, fwdStream) => {
        if (err) {
          sock.destroy();
          return;
        }

        fwdStream.on('error', () => {
          sock.destroy();
        });

        sock.on('error', () => {
          fwdStream.destroy();
        });

        sock.on('close', () => {
          fwdStream.destroy();
        });

        fwdStream.on('close', () => {
          sock.destroy();
        });

        sock.pipe(fwdStream);
        fwdStream.pipe(sock);
      }
    );
  });

  tunnelServer.listen(5555, '127.0.0.1', () => {
    console.log('\n====================================================');
    console.log(`✅ PRISMA STUDIO (${dbName}) ĐÃ SẴN SÀNG!`);
    console.log('👉 Truy cập trình duyệt: http://localhost:5555');
    console.log('   (Dữ liệu trực tiếp từ PostgreSQL VPS)');
    console.log('👉 Nhấn Ctrl + C để tắt.');
    console.log('====================================================\n');

    if (!browserOpened) {
      browserOpened = true;
      // Tự động mở trình duyệt
      const startCmd = process.platform === 'win32' ? 'start http://localhost:5555' : 'xdg-open http://localhost:5555';
      exec(startCmd, (e) => {
        // bỏ qua lỗi nếu không mở được tự động
      });
    }
  });

  tunnelServer.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.warn('⚠️ Cổng 5555 ở máy của bạn đang bị chiếm bởi terminal khác.');
      console.log('👉 Hãy đóng terminal đang chạy "npx prisma studio" cũ rồi thử lại.');
    } else {
      console.error('Tunnel error:', e);
    }
  });
}

function cleanup() {
  if (tunnelServer) {
    tunnelServer.close();
    tunnelServer = null;
  }
  conn.exec('fuser -k 5555/tcp 2>/dev/null || true', () => {
    conn.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  console.log('\nĐang dừng Prisma Studio và dọn dẹp...');
  cleanup();
});

process.on('SIGTERM', () => {
  cleanup();
});

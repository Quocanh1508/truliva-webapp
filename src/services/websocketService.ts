import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/authSession';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWebSocketServer(server: Server) {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host || 'localhost';
    const url = new URL(request.url || '', `http://${host}`);
    const pathname = url.pathname;

    if (pathname === '/ws') {
      isStaffSession(request).then((ok) => {
        if (!ok) {
          socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          return;
        }
        wss?.handleUpgrade(request, socket, head, (ws) => {
          wss?.emit('connection', ws, request);
        });
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    logger.info('New WebSocket connection established');
    clients.add(ws);

    ws.on('close', () => {
      logger.info('WebSocket connection closed');
      clients.delete(ws);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket client error', err);
      clients.delete(ws);
    });
  });
}

// Upgrade request không đi qua Express nên tự đọc cookie, rồi chạy đúng requireAuth (token hết hạn/thu hồi, token khách Zalo, user bị khoá).
function isStaffSession(request: IncomingMessage): Promise<boolean> {
  const match = /(?:^|;\s*)session_token=([^;]+)/.exec(request.headers.cookie || '');
  const req: any = request;
  req.cookies = match ? { session_token: decodeURIComponent(match[1]) } : {};
  return new Promise((resolve) => {
    const res: any = { status: () => res, json: () => resolve(false) };
    requireAuth(req, res, () => resolve(true)).catch(() => resolve(false));
  });
}

export function broadcastEvent(type: string, data: any) {
  const message = JSON.stringify({ type, data });
  let activeClients = 0;
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      activeClients++;
    } else {
      clients.delete(client);
    }
  });
  logger.info(`Broadcasted event ${type} to ${activeClients} active client(s)`);
}

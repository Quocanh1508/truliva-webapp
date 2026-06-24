import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import logger from '../utils/logger';

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWebSocketServer(server: Server) {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host || 'localhost';
    const url = new URL(request.url || '', `http://${host}`);
    const pathname = url.pathname;

    if (pathname === '/ws') {
      wss?.handleUpgrade(request, socket, head, (ws) => {
        wss?.emit('connection', ws, request);
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

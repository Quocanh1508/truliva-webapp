import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import logger from '../utils/logger';
import { verifyPancakeToken } from '../middleware/auth';
import { validateWebhookPayload } from '../middleware/validatePayload';
import { routeEvent } from '../services/eventRouter';
import { processFacebookMessageWithAI, enqueueFacebookMessage } from '../services/facebookAiBot';

const router = Router();

/**
 * GET /webhooks/pancake
 * Phục vụ kiểm tra kết nối (health check / url verification) từ Pancake POS.
 */
router.get(
  '/pancake',
  verifyPancakeToken,
  (req: Request, res: Response): void => {
    res.status(200).json({
      status: 'active',
      message: 'Pancake Webhook Endpoint is active and ready to receive events',
      timestamp: new Date().toISOString()
    });
  }
);

/**
 * POST /webhooks/pancake
 * 
 * Endpoint chính nhận dữ liệu từ Pancake (Step 2).
 * Flow:
 *   1. Xác thực token (Step 4)
 *   2. Validate payload (Step 4)
 *   3. Kiểm tra trùng lặp via event_id (Step 5)
 *   4. Lưu raw data vào database (Step 3)
 *   5. Trả 200 OK ngay lập tức
 */
router.post(
  '/pancake',
  verifyPancakeToken,
  validateWebhookPayload,
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();
    const requestId = uuidv4();

    try {
      const body = req.body;

      // ── Lấy event_type từ nhiều format có thể có ──
      const eventType: string = body.event_type || body.eventType || body.type || 'unknown';

      // ── Lấy event_id để chống gửi lặp (Step 5) ──
      const externalEventId: string | null = body.event_id || body.eventId || body.id || null;

      // ── Kiểm tra trùng lặp nếu có event_id ──
      if (externalEventId) {
        const existing = await prisma.webhookRawEvent.findFirst({
          where: { externalEventId: String(externalEventId) },
        });

        if (existing) {
          const duration = Date.now() - startTime;
          logger.info('Duplicate webhook event skipped', {
            requestId,
            externalEventId,
            eventType,
            duration: `${duration}ms`,
          });
          res.status(200).json({
            status: 'already_received',
            message: 'Event already processed',
            eventId: externalEventId,
          });
          return;
        }
      }

      // ── Lưu raw data vào database (Step 3) ──
      const record = await prisma.webhookRawEvent.create({
        data: {
          externalEventId: externalEventId ? String(externalEventId) : null,
          source: 'pancake',
          eventType,
          payload: body,
          status: 'PENDING',
          processingTimeMs: Date.now() - startTime,
        },
      });

      const duration = Date.now() - startTime;

      // ── Log thành công (Step 6) ──
      logger.info('Webhook received and stored', {
        requestId,
        recordId: record.id,
        externalEventId,
        eventType,
        duration: `${duration}ms`,
      });

      // ── Xử lý nghiệp vụ bất đồng bộ (Phase 2) ──
      // Fire-and-forget: không block response, Pancake nhận 200 ngay
      routeEvent(record.id, eventType, body);

      // ── Trả về 200 ngay lập tức ──
      res.status(200).json({
        status: 'received',
        recordId: record.id,
        eventType,
      });

    } catch (error: any) {
      const duration = Date.now() - startTime;

      // ── Xử lý lỗi unique constraint (race condition cho duplicate) ──
      if (error.code === 'P2002') {
        logger.info('Duplicate webhook event (race condition)', {
          requestId,
          duration: `${duration}ms`,
        });
        res.status(200).json({
          status: 'already_received',
          message: 'Event already processed (concurrent)',
        });
        return;
      }

      // ── Log lỗi (Step 6) ──
      logger.error('Failed to process webhook', {
        requestId,
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
        payload: JSON.stringify(req.body).substring(0, 500), // Giới hạn log payload
      });

      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        requestId,
      });
    }
  }
);
import { syncProducts } from '../scripts/syncProducts';

router.get('/sync-products', async (req: Request, res: Response): Promise<void> => {
  try {
    syncProducts().catch(err => logger.error('Sync failed', err));
    res.status(200).json({ message: 'Sync process started in the background.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/test-notes', async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await prisma.webhookRawEvent.findMany({
      where: { source: 'pancake' },
      orderBy: { receivedAt: 'desc' },
      take: 10
    });

    const testerEvent = events.find(e => {
      const p: any = e.payload;
      return p.bill_full_name === 'Tester' || (p.shipping_address && p.shipping_address.full_name === 'Tester');
    });

    if (testerEvent) {
      res.json(testerEvent.payload);
    } else {
      res.json({ message: 'Not found' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/test-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await prisma.webhookRawEvent.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 5
    });

    res.json(events.map(e => ({
      eventType: e.eventType,
      source: e.source,
      receivedAt: e.receivedAt,
      payload_system_id: (e.payload as any)?.system_id,
      payload_status_name: (e.payload as any)?.status_name
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/check-nga', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findFirst({
      where: { fullName: { contains: 'Phạm Thị Nga' } }
    });
    if (!user) {
      res.json({ error: 'Nga not found' });
      return;
    }

    const creatorName = user.pancakeAccountName || '';
    
    const createdManualLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'Order',
        action: 'created_manual',
        userId: user.id
      },
      select: { entityId: true }
    });
    const createdManualOrderIds = createdManualLogs.map(log => log.entityId);

    const specificOrders = await prisma.order.findMany({
      where: { pancakeOrderId: { in: [-38, -37, -36, -30, -29, -45] } },
      select: {
        id: true,
        pancakeOrderId: true,
        billFullName: true,
        adminStatus: true,
        rawData: true,
        serviceReports: {
          select: { id: true, customerName: true, approvalStatus: true }
        }
      }
    });

    res.json({
      user: {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        group: user.group,
        pancakeAccountName: user.pancakeAccountName
      },
      createdManualOrderIds,
      specificOrders
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Facebook Messenger Webhooks ──

/**
 * GET /webhooks/facebook
 * Xác thực Webhook với Meta Developer Portal
 */
router.get('/facebook', (req: Request, res: Response): void => {
  const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'truliva_fb_token_2026';

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
    logger.info('Facebook Webhook verification successful');
    res.status(200).send(challenge);
    return;
  }

  logger.warn('Facebook Webhook verification failed', { mode, token });
  res.sendStatus(403);
});

/**
 * POST /webhooks/facebook
 * Nhận tin nhắn và sự kiện từ Facebook Messenger
 */
router.post('/facebook', (req: Request, res: Response): void => {
  const body = req.body;

  // Trả về 200 OK ngay lập tức để Meta không gửi lại (retry)
  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');

    // Xử lý các entry và tin nhắn
    if (Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (Array.isArray(entry.messaging)) {
          for (const event of entry.messaging) {
            const senderId = event.sender?.id;

            // Bỏ qua tin nhắn do chính Trang gửi đi (is_echo) để tránh lặp vô tận
            if (event.message && event.message.is_echo) {
              continue;
            }

            if (event.message && senderId) {
              const text = event.message.text || '';
              const imageUrls: string[] = [];

              if (Array.isArray(event.message.attachments)) {
                for (const att of event.message.attachments) {
                  if (att.type === 'image' && att.payload?.url) {
                    imageUrls.push(att.payload.url);
                  }
                }
              }

              logger.info('Processing incoming Facebook message with AI', {
                senderId,
                hasText: !!text,
                imageCount: imageUrls.length
              });

              // Đưa vào bộ đệm gom tin nhắn 5 giây (Debounce buffer)
              enqueueFacebookMessage(senderId, text, imageUrls);
            } else if (event.postback && senderId) {
              const payload = event.postback.title || event.postback.payload || 'Bắt đầu';
              // Postback xử lý tức thì (immediate = true)
              enqueueFacebookMessage(senderId, payload, [], true);
            }
          }
        }
      }
    }
  } else {
    res.sendStatus(404);
  }
});

export default router;

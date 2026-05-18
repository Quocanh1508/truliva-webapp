import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/database';
import logger from '../utils/logger';
import { verifyPancakeToken } from '../middleware/auth';
import { validateWebhookPayload } from '../middleware/validatePayload';
import { routeEvent } from '../services/eventRouter';

const router = Router();

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

export default router;

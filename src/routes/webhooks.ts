import { Router, Request, Response } from 'express';
import crypto from 'crypto';
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

      // ── Khoá chống gửi lặp ──
      // Pancake không gửi event_id. Không dùng body.id: đó là mã đơn/khách, nên mọi lần cập nhật sau lần đầu bị coi là trùng.
      // Băm nguyên body: Pancake gửi lại đúng sự kiện thì trùng khoá, mỗi lần cập nhật thật có nội dung khác.
      const externalEventId: string = String(body.event_id || body.eventId || crypto.createHash('sha1').update(JSON.stringify(body)).digest('hex'));

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
import { authenticate, authorize, blockInProduction } from '../middleware/authSession';

router.get(['/sync-products', '/test-sync'], authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  try {
    syncProducts().catch(err => logger.error('Sync failed', err));
    res.status(200).json({ message: 'Sync process started in the background.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get(['/test-notes', '/logs'], blockInProduction, authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
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

router.get('/test-status', blockInProduction, authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
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

router.get('/check-nga', blockInProduction, authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
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
  const FB_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (FB_VERIFY_TOKEN && mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
    logger.info('Facebook Webhook verification successful');
    res.status(200).send(challenge);
    return;
  }

  logger.warn('Facebook Webhook verification failed', { mode, hasVerifyToken: !!FB_VERIFY_TOKEN });
  res.sendStatus(403);
});

/** Meta ký raw body bằng App Secret: header `X-Hub-Signature-256: sha256=<hex HMAC-SHA256>`. */
export function isValidFacebookSignature(rawBody: Buffer | undefined, header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(header.slice('sha256='.length).toLowerCase());
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/**
 * POST /webhooks/facebook
 * Nhận tin nhắn và sự kiện từ Facebook Messenger
 */
router.post('/facebook', (req: Request, res: Response): void => {
  const body = req.body;

  // Không có chữ ký hợp lệ = không phải Meta gửi (thiếu FB_APP_SECRET thì từ chối tất cả)
  if (!isValidFacebookSignature((req as any).rawBody, req.get('x-hub-signature-256'), process.env.FB_APP_SECRET)) {
    logger.warn('Rejected Facebook webhook: invalid signature', {
      ip: req.ip,
      hasSignature: !!req.get('x-hub-signature-256'),
      hasAppSecret: !!process.env.FB_APP_SECRET,
    });
    res.sendStatus(403);
    return;
  }

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

// ── Zalo Mini App Webhooks (NĐ 13/2023/NĐ-CP: user.revoke.consent) ──

/**
 * Xác thực chữ ký X-ZEvent-Signature từ Zalo Mini App Platform.
 * Thuật toán chuẩn Zalo: sắp xếp key A-Z, nối liền value (object/array -> JSON.stringify),
 * tính SHA-256 của `${content}${apiKey}` và so sánh timing-safe.
 */
export function verifyZaloMiniAppSignature(
  data: Record<string, any> | null | undefined,
  signatureHeader: string | undefined,
  candidateKeys: string[]
): boolean {
  if (!data || typeof data !== 'object' || !signatureHeader || candidateKeys.length === 0) {
    return false;
  }

  const keys = Object.keys(data).sort();
  let content = '';
  for (const k of keys) {
    const val = data[k];
    if (val !== null && typeof val === 'object') {
      content += JSON.stringify(val);
    } else if (val !== undefined) {
      content += String(val);
    }
  }

  const receivedBuf = Buffer.from(signatureHeader.trim().toLowerCase());
  for (const key of candidateKeys) {
    const expectedHex = crypto.createHash('sha256').update(`${content}${key}`).digest('hex');
    const expectedBuf = Buffer.from(expectedHex);
    if (expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
      return true;
    }
  }
  return false;
}

/**
 * GET /api/webhooks/zalo-miniapp (và /webhooks/zalo-miniapp)
 * Health-check / kiểm tra kết nối từ Zalo Mini App Center
 */
router.get('/zalo-miniapp', (_req: Request, res: Response): void => {
  res.status(200).json({
    error: 0,
    status: 'active',
    message: 'Truliva Zalo Mini App Webhook Endpoint is ready',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/webhooks/zalo-miniapp (và /webhooks/zalo-miniapp)
 * Tiếp nhận sự kiện từ Zalo Mini App Platform (vd: user.revoke.consent - rút lại đồng ý & yêu cầu xóa dữ liệu).
 * Tuân thủ Zero Hard-Delete Policy: chỉ ẩn danh hóa / vô hiệu hóa mềm và ghi AuditLog.
 */
router.post('/zalo-miniapp', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const eventName = String(body.event || body.event_name || 'ping');
  const signatureHeader = (req.get('x-zevent-signature') || req.get('X-ZEvent-Signature') || '').trim();

  const dedicatedApiKeys = Array.from(new Set([
    process.env.ZALO_MINI_APP_WEBHOOK_KEY,
    process.env.ZALO_API_KEY
  ].map(k => (k || '').trim()).filter(Boolean)));

  const allCandidateKeys = Array.from(new Set([
    ...dedicatedApiKeys,
    process.env.ZALO_MINI_APP_SECRET,
    ...(process.env.ZALO_MINI_APP_SECRET_FALLBACKS || '').split(',')
  ].map(k => (k || '').trim()).filter(Boolean)));

  const signatureVerified = verifyZaloMiniAppSignature(body, signatureHeader, allCandidateKeys);

  // Nếu đã cấu hình ZALO_MINI_APP_WEBHOOK_KEY / ZALO_API_KEY riêng và sự kiện có chữ ký sai -> từ chối
  if (dedicatedApiKeys.length > 0 && signatureHeader && !signatureVerified) {
    logger.warn('Rejected Zalo Mini App webhook: invalid X-ZEvent-Signature', {
      event: eventName,
      ip: req.ip
    });
    res.status(401).json({ error: -1, message: 'Invalid signature' });
    return;
  }

  try {
    // Lưu raw event vào bảng webhookRawEvent để kiểm toán & truy vết
    const externalEventId = `zma_${eventName}_${body.userId || 'anon'}_${body.timestamp || Date.now()}`;
    await prisma.webhookRawEvent.create({
      data: {
        externalEventId,
        source: 'zalo_miniapp',
        eventType: eventName,
        payload: {
          ...body,
          _meta: {
            hasSignature: Boolean(signatureHeader),
            signatureVerified
          }
        },
        status: 'PROCESSED',
        processingTimeMs: Date.now() - startTime
      }
    }).catch((err: any) => {
      // Bỏ qua trùng eventId nếu Zalo gửi lại (retry)
      if (err?.code !== 'P2002') {
        logger.warn('Could not persist Zalo Mini App webhookRawEvent', { error: err?.message });
      }
    });

    // Xử lý sự kiện người dùng rút lại đồng ý & yêu cầu xóa dữ liệu cá nhân (NĐ 13/2023/NĐ-CP)
    if (eventName === 'user.revoke.consent' || eventName === 'user_revoke_consent') {
      const zaloUserId = body.userId ? String(body.userId).trim() : '';

      logger.info('Received Zalo Mini App user.revoke.consent event', {
        appId: body.appId,
        zaloUserId,
        timestamp: body.timestamp,
        signatureVerified
      });

      // Chỉ thực hiện ẩn danh hóa mềm tài khoản khách hàng khi chữ ký đã được xác thực hợp lệ
      if (zaloUserId && signatureVerified) {
        const matchedUsers = await prisma.user.findMany({
          where: {
            username: `zalo_${zaloUserId}`,
            group: 'CUSTOMER'
          },
          select: { id: true, username: true, fullName: true }
        });

        for (const u of matchedUsers) {
          await prisma.user.update({
            where: { id: u.id },
            data: {
              isActive: false,
              avatar: null,
              fullName: 'Người dùng đã rút đồng ý',
              tokenVersion: { increment: 1 }
            }
          });

          await prisma.auditLog.create({
            data: {
              entityType: 'User',
              entityId: u.id,
              action: 'zalo_revoke_consent',
              userId: u.id,
              userName: u.fullName || 'Zalo Mini App User',
              changes: {
                appId: body.appId || null,
                zaloUserId,
                timestamp: body.timestamp || Date.now(),
                reason: 'Zalo Mini App user.revoke.consent webhook (soft-anonymized)'
              }
            }
          }).catch(() => {});
        }
      }
    }

    // Luôn trả 200 OK chuẩn cho Zalo Mini App Platform (bao gồm request test khi bấm "Thiết lập")
    res.status(200).json({
      error: 0,
      message: 'ok',
      event: eventName
    });
  } catch (error: any) {
    logger.error('Failed to process Zalo Mini App webhook', {
      event: eventName,
      error: error.message
    });
    res.status(500).json({ error: -1, message: 'Internal server error' });
  }
});

export default router;

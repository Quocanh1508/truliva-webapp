import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import admin from 'firebase-admin';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { requireAuth, requireDev } from '../middleware/authSession';

const router = Router();

/**
 * GET /api/dev/system-health
 * Kiểm tra trạng thái kết nối Database, Pancake API, Firebase FCM
 */
router.get('/system-health', requireAuth, requireDev, async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Check Database connection
    let dbStatus = 'healthy';
    let dbError: string | null = null;
    let dbPingMs = 0;
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbPingMs = Date.now() - start;
    } catch (err: any) {
      dbStatus = 'error';
      dbError = err.message || 'Lỗi kết nối cơ sở dữ liệu';
    }

    // 2. Check Pancake POS API connection
    let pancakeStatus = 'healthy';
    let pancakeError: string | null = null;
    let pancakePingMs = 0;
    const apiKey = process.env.PANCAKE_API_KEY;
    const shopId = '1635300067'; // Truliva shop id

    if (!apiKey) {
      pancakeStatus = 'warning';
      pancakeError = 'Thiếu PANCAKE_API_KEY trong cấu hình .env';
    } else {
      try {
        const start = Date.now();
        // Call a lightweight endpoint to check connectivity
        const response = await axios.get(`https://pos.pages.fm/api/v1/shops/${shopId}/warehouses`, {
          params: { api_key: apiKey },
          timeout: 4000
        });
        pancakePingMs = Date.now() - start;
        if (!response.data || !response.data.success) {
          pancakeStatus = 'warning';
          pancakeError = 'Pancake API phản hồi thành công nhưng trả về success = false';
        }
      } catch (err: any) {
        pancakeStatus = 'error';
        pancakeError = err.response?.data?.message || err.message || 'Không thể kết nối đến Pancake API (Timeout/Error)';
      }
    }

    // 3. Check Firebase Admin SDK
    let fcmStatus = 'healthy';
    let fcmError: string | null = null;
    const hasJson = fs.existsSync(path.join(process.cwd(), 'firebase-service-account.json'));
    const hasEnv = !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

    if (!hasJson && !hasEnv) {
      fcmStatus = 'warning';
      fcmError = 'Thiếu tệp tin firebase-service-account.json hoặc biến môi trường Firebase';
    } else {
      const isInit = admin.apps.length > 0;
      if (!isInit) {
        fcmStatus = 'error';
        fcmError = 'Firebase Admin SDK chưa được khởi tạo thành công';
      }
    }

    // 4. Server details
    const serverMemory = process.memoryUsage();
    const serverUptime = process.uptime();

    // 5. Fetch recent webhook events
    const recentWebhooks = await prisma.webhookRawEvent.findMany({
      take: 10,
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        eventType: true,
        status: true,
        receivedAt: true,
        errorLog: true,
        processingTimeMs: true
      }
    });

    // 6. Fetch recent Audit Logs
    const recentAuditLogs = await prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        entityType: true,
        action: true,
        userName: true,
        createdAt: true
      }
    });

    res.json({
      health: {
        server: { 
          status: 'healthy', 
          memory: Math.round(serverMemory.rss / 1024 / 1024), 
          uptime: Math.round(serverUptime) 
        },
        database: { status: dbStatus, pingMs: dbPingMs, error: dbError },
        pancake: { status: pancakeStatus, pingMs: pancakePingMs, error: pancakeError, shopId },
        firebase: { status: fcmStatus, error: fcmError, provider: hasJson ? 'Service Account File' : 'Environment Variables' }
      },
      webhooks: recentWebhooks,
      auditLogs: recentAuditLogs
    });
  } catch (error: any) {
    logger.error('Dev health check failed', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra sức khỏe thiết bị' });
  }
});

router.get('/check-nga', async (req: Request, res: Response) => {
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

export default router;

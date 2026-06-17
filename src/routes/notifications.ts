import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/authSession';
import { sendPushNotification } from '../services/notificationService';
import { sendWebPushNotification } from '../services/webPushService';

const router = Router();

// Tất cả endpoints trong này đều yêu cầu đăng nhập
router.use(requireAuth);

/**
 * GET /api/notifications
 * Lấy danh sách thông báo của KTV hiện tại
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { page = '1', limit = '50' } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNumber,
      }),
      prisma.notification.count({
        where: { userId },
      }),
    ]);

    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    res.json({
      notifications,
      unreadCount,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error: any) {
    logger.error('Fetch notifications error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi tải danh sách thông báo' });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Đánh dấu tất cả thông báo của KTV hiện tại là đã đọc
 */
router.patch('/read-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.json({ success: true, message: 'Đã đánh dấu đọc tất cả thông báo' });
  } catch (error: any) {
    logger.error('Mark all notifications read error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi cập nhật thông báo' });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Đánh dấu một thông báo cụ thể là đã đọc
 */
router.patch('/:id/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Không tìm thấy thông báo' });
      return;
    }

    if (notification.userId !== userId) {
      res.status(403).json({ error: 'Không có quyền truy cập thông báo này' });
      return;
    }

    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Mark notification read error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi cập nhật thông báo' });
  }
});

/**
 * POST /api/notifications/register-token
 * Lưu mã Push Token của thiết bị KTV
 */
router.post('/register-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    const userId = req.user!.id;

    if (!token) {
      res.status(400).json({ error: 'Thiếu Push Token' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { pushToken: token },
    });

    logger.info('Registered push token successfully', { userId });
    res.json({ success: true, message: 'Đăng ký Push Token thành công' });
  } catch (error: any) {
    logger.error('Register push token error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi đăng ký Push Token' });
  }
});

/**
 * GET /api/notifications/vapid-public-key
 * Trả về VAPID Public Key cho Frontend đăng ký Web Push
 */
router.get('/vapid-public-key', async (req: Request, res: Response): Promise<void> => {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      res.status(500).json({ error: 'Chưa cấu hình VAPID Public Key trên Server' });
      return;
    }
    res.json({ publicKey });
  } catch (error: any) {
    logger.error('Get VAPID public key error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy VAPID Public Key' });
  }
});

/**
 * POST /api/notifications/subscribe
 * Lưu đối tượng PushSubscription của trình duyệt Web KTV
 */
router.post('/subscribe', async (req: Request, res: Response): Promise<void> => {
  try {
    const subscription = req.body;
    const userId = req.user!.id;

    if (!subscription || !subscription.endpoint) {
      res.status(400).json({ error: 'Thiếu thông tin đăng ký PushSubscription' });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { webPushSubscription: subscription as any },
    });

    logger.info('Registered web push subscription successfully', { userId });
    res.json({ success: true, message: 'Đăng ký nhận thông báo đẩy Web thành công' });
  } catch (error: any) {
    logger.error('Register web push subscription error', { error: error.message });
    res.status(500).json({ error: 'Lỗi đăng ký nhận thông báo đẩy Web' });
  }
});

/**
 * POST /api/notifications/broadcast
 * Gửi thông báo hệ thống đến các vai trò (roles) được chọn
 * Chỉ dành cho Admin hoặc Dev
 */
router.post('/broadcast', async (req: Request, res: Response): Promise<void> => {
  try {
    const userRole = req.user!.role;
    if (userRole !== 'DEV' && userRole !== 'ADMIN') {
      res.status(403).json({ error: 'Không có quyền thực hiện chức năng này' });
      return;
    }

    const { title, content, targetRoles } = req.body;

    if (!title || !content || !targetRoles || !Array.isArray(targetRoles) || targetRoles.length === 0) {
      res.status(400).json({ error: 'Thiếu thông tin tiêu đề, nội dung hoặc vai trò nhận thông báo' });
      return;
    }

    // Lấy danh sách người dùng thuộc các vai trò được chọn
    const users = await prisma.user.findMany({
      where: {
        role: { in: targetRoles as any },
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        pushToken: true,
        webPushSubscription: true,
      },
    });

    if (users.length === 0) {
      res.json({ success: true, message: 'Không tìm thấy người dùng nào phù hợp', count: 0 });
      return;
    }

    // Tạo thông báo trong Database cho tất cả người dùng được chọn
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        title,
        content,
      })),
    });

    // Gửi thông báo đẩy ngầm (FCM & Web Push)
    let pushCount = 0;
    let webPushCount = 0;

    // Để không làm nghẽn request, ta gửi bất đồng bộ trong background
    users.forEach((u) => {
      if (u.pushToken) {
        sendPushNotification(u.id, title, content, { type: 'SYSTEM_ANNOUNCEMENT' })
          .then((sent) => { if (sent) pushCount++; })
          .catch((err) => logger.error(`Error sending push to ${u.id}`, { error: err.message }));
      }
      if (u.webPushSubscription) {
        sendWebPushNotification(u.id, title, content, { type: 'SYSTEM_ANNOUNCEMENT' })
          .then((sent) => { if (sent) webPushCount++; })
          .catch((err) => logger.error(`Error sending web push to ${u.id}`, { error: err.message }));
      }
    });

    logger.info('System notification broadcast successfully', {
      by: req.user!.id,
      targetRoles,
      userCount: users.length,
    });

    res.json({
      success: true,
      message: `Đã gửi thông báo đến ${users.length} tài khoản thành công.`,
      count: users.length,
    });
  } catch (error: any) {
    logger.error('Broadcast notification error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi gửi thông báo hệ thống' });
  }
});

export default router;

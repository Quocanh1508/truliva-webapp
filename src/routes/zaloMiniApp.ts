import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/authSession';
import { authenticateZaloMiniAppUser } from '../services/zaloMiniAppService';
import { activateSerialWarranty } from '../services/warrantyService';

const router = Router();

/**
 * POST /api/zalo-miniapp/auth
 * Đăng nhập 1-Click bằng Zalo Phone Token từ Zalo Mini App SDK
 */
router.post('/auth', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phoneToken, userAccessToken, zaloProfile } = req.body;

    if (!phoneToken) {
      res.status(400).json({ error: 'Thiếu mã phoneToken từ Zalo Mini App SDK' });
      return;
    }

    const authResult = await authenticateZaloMiniAppUser(phoneToken, userAccessToken, zaloProfile);

    // Thiết lập cookie session_token
    res.cookie('session_token', authResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 90 * 24 * 60 * 60 * 1000 // 90 ngày
    });

    res.json({
      success: true,
      token: authResult.token,
      user: authResult.user,
      isNewUser: authResult.isNewUser
    });
  } catch (error: any) {
    logger.error('Zalo Mini App Auth endpoint error', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi đăng nhập Zalo Mini App' });
  }
});

/**
 * GET /api/zalo-miniapp/profile
 * Lấy thông tin cá nhân & vai trò hiện tại của tài khoản Zalo Mini App
 */
router.get('/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        fullName: true,
        phoneNumber: true,
        role: true,
        group: true,
        techStationId: true,
        techStation: {
          select: { id: true, name: true }
        }
      }
    });

    res.json({
      success: true,
      user: fullUser
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/zalo-miniapp/my-serials
 * Lấy danh sách máy lọc nước / Serial của Khách Hàng theo Số Điện Thoại Zalo
 */
router.get('/my-serials', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const phone = req.user?.phoneNumber;
    if (!phone) {
      res.json({ success: true, serials: [] });
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const searchPhone = cleanPhone.startsWith('0') ? cleanPhone.substring(1) : cleanPhone;

    const serials = await prisma.serial.findMany({
      where: {
        customerPhone: {
          contains: searchPhone
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      serials
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/zalo-miniapp/ktv-orders
 * Lấy danh sách ca dịch vụ được giao cho KTV từ Zalo Mini App
 */
router.get('/ktv-orders', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }

    const orders = await prisma.order.findMany({
      where: {
        assignedKtvId: userId,
        statusName: {
          notIn: ['cancelled', 'completed']
        }
      },
      include: {
        items: true,
        assignedKtv: {
          select: { id: true, fullName: true, phoneNumber: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      orders
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

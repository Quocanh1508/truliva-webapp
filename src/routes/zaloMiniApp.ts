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
    const standardPhone = cleanPhone.startsWith('84') ? '0' + cleanPhone.substring(2) : cleanPhone;
    const phoneVariants = Array.from(new Set([
      standardPhone,
      standardPhone.startsWith('0') ? '84' + standardPhone.substring(1) : standardPhone,
      standardPhone.startsWith('0') ? standardPhone.substring(1) : standardPhone
    ]));

    const serials = await prisma.serial.findMany({
      where: {
        customerPhone: {
          in: phoneVariants
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
    const user = req.user;
    if (!user?.id) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }

    // Kiểm tra quyền RBAC: Chỉ KTV hoặc ADMIN mới được lấy danh sách ca giao việc
    if (user.role !== 'KTV' && user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Chỉ Kỹ thuật viên mới có quyền xem danh sách ca dịch vụ được gán' });
      return;
    }

    const orders = await prisma.order.findMany({
      where: {
        assignedKtvId: user.id,
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

/**
 * GET /api/zalo-miniapp/vouchers
 * Lấy danh sách ưu đãi & voucher của khách hàng
 */
router.get('/vouchers', async (_req: Request, res: Response): Promise<void> => {
  try {
    const vouchers = [
      {
        id: 'v-50k',
        code: 'THAYLOI50K',
        title: 'Voucher 50.000đ Thay Lõi Lọc',
        description: 'Áp dụng cho dịch vụ thay bộ 3 lõi lọc thô số 1, 2, 3 Truliva chính hãng tận nhà.',
        discountAmount: 50000,
        minOrderAmount: 150000,
        expiryDate: '30/09/2026',
        badge: 'ƯU ĐÃI THÀNH VIÊN',
        badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200'
      },
      {
        id: 'v-100k',
        code: 'BAODUONG100K',
        title: 'Voucher 100.000đ Bảo Dưỡng Toàn Diện',
        description: 'Áp dụng cho gói vệ sinh bình áp, đo kiểm chỉ số TDS và bảo dưỡng tổng thể máy lọc nước.',
        discountAmount: 100000,
        minOrderAmount: 300000,
        expiryDate: '31/10/2026',
        badge: 'HOT NHẤT THÁNG',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
      },
      {
        id: 'v-free-tds',
        code: 'MIENPHITDS',
        title: 'Miễn Phí Đo TDS & Khám Nước Tận Nhà',
        description: 'Kỹ thuật viên Truliva kiểm tra đo TDS nước đầu vào/đầu ra và tư vấn bảo vệ nguồn nước miễn phí 100%.',
        discountAmount: 0,
        minOrderAmount: 0,
        expiryDate: '31/12/2026',
        badge: 'QUÀ TẶNG 1-CLICK',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      }
    ];

    res.json({
      success: true,
      vouchers
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/zalo-miniapp/service-history
 * Lấy lịch sử bảo trì, thay lõi và sửa chữa của khách hàng
 */
router.get('/service-history', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const phone = req.user?.phoneNumber;
    if (!phone) {
      res.json({ success: true, history: [] });
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const standardPhone = cleanPhone.startsWith('84') ? '0' + cleanPhone.substring(2) : cleanPhone;
    const phoneVariants = Array.from(new Set([
      standardPhone,
      standardPhone.startsWith('0') ? '84' + standardPhone.substring(1) : standardPhone,
      standardPhone.startsWith('0') ? standardPhone.substring(1) : standardPhone
    ]));

    // Tìm các serial liên kết
    const serials = await prisma.serial.findMany({
      where: { customerPhone: { in: phoneVariants } },
      select: { serialNumber: true }
    });
    const serialNumbers = serials.map(s => s.serialNumber);

    const reports = await prisma.serviceReport.findMany({
      where: {
        OR: [
          { customerPhone: { in: phoneVariants } },
          ...(serialNumbers.length > 0 ? [{ serialNumber: { in: serialNumbers } }] : [])
        ]
      },
      include: {
        ktvUser: {
          select: { fullName: true, phoneNumber: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      history: reports
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/zalo-miniapp/articles
 * Lấy danh sách bài viết truyền thông công khai từ Zalo OA cho Mini App
 */
router.get('/articles', async (_req: Request, res: Response): Promise<void> => {
  try {
    const { getZaloOaArticles } = await import('../services/zaloService');
    const articles = await getZaloOaArticles();
    res.json({
      success: true,
      articles
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  E-Commerce & Khung Pháp Lý TMĐT Zalo Mini App
// ══════════════════════════════════════════════════════════════════════════
import {
  getShopProducts,
  getShopProductDetail,
  getLegalDocuments,
  getLegalDocumentByType,
  createShopOrder,
  getMyShopOrders,
  getShopOrderDetail
} from '../controllers/shopController';

router.get('/shop/products', getShopProducts);
router.get('/shop/products/:slugOrId', getShopProductDetail);
router.get('/shop/legal-docs', getLegalDocuments);
router.get('/shop/legal-docs/:type', getLegalDocumentByType);
router.post('/shop/orders', createShopOrder);
router.get('/shop/my-orders', getMyShopOrders);
router.get('/shop/orders/:orderCodeOrId', getShopOrderDetail);

export default router;


import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, optionalAuth } from '../middleware/authSession';
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
        avatar: true,
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
 * POST /api/zalo-miniapp/profile/sync
 * Đồng bộ tên thật & avatar từ Zalo Mini App SDK lên tài khoản Truliva
 */
router.post('/profile/sync', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }

    const { name, avatar } = req.body;
    const updateData: any = {};
    if (name && typeof name === 'string' && name.trim()) {
      updateData.fullName = name.trim();
    }
    if (avatar && typeof avatar === 'string' && avatar.trim()) {
      updateData.avatar = avatar.trim();
    }

    if (Object.keys(updateData).length === 0) {
      res.json({ success: true, message: 'Không có dữ liệu mới cần cập nhật' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        fullName: true,
        phoneNumber: true,
        avatar: true,
        role: true,
        group: true
      }
    });

    res.json({
      success: true,
      user: updated
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

    // 1. Lấy danh sách Serial đã kích hoạt / đăng ký trực tiếp
    const serials = await prisma.serial.findMany({
      where: {
        customerPhone: {
          in: phoneVariants
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const existingSerialNumbers = new Set(serials.map(s => s.serialNumber));

    // 2. Tự động nạp thêm các thiết bị từ Đơn hàng Dịch vụ Hoàn thành đã phân công KTV
    // Tiêu chí lọc:
    // - Đã phân công KTV: assignedKtvId != null
    // - Trạng thái hoàn thành: adminStatus in ['hoàn thành', 'completed'] hoặc statusName in ['completed', 'delivered', 'received_money']
    // - Loại trừ giao hàng đơn tự tạo: NOT (workType in ['Giao hàng', 'giao_hang'] AND pancakeOrderId < 0)
    // - Không lấy đơn ecom: NOT (orderSource in ['zalo_shop', 'ecom', 'Ecom', 'Zalo Shop'])
    // - Khớp SĐT người nhận: billPhoneNumber in phoneVariants hoặc customer.phoneNumber in phoneVariants
    const eligibleOrders = await prisma.order.findMany({
      where: {
        assignedKtvId: { not: null },
        OR: [
          { billPhoneNumber: { in: phoneVariants } },
          { customer: { phoneNumber: { in: phoneVariants } } }
        ],
        AND: [
          {
            OR: [
              { adminStatus: { in: ['hoàn thành', 'completed', 'Hoàn thành', 'Đã hoàn thành'] } },
              { statusName: { in: ['completed', 'delivered', 'received_money', 'hoàn thành'] } }
            ]
          },
          {
            NOT: {
              AND: [
                { workType: { in: ['Giao hàng', 'giao_hang'] } },
                { pancakeOrderId: { lt: 0 } }
              ]
            }
          },
          {
            NOT: {
              orderSource: { in: ['zalo_shop', 'ecom', 'Ecom', 'Zalo Shop'] }
            }
          }
        ]
      },
      include: {
        items: true,
        serials: true,
        serviceReports: {
          select: { id: true, serialNumber: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const allSerials: any[] = [...serials];

    for (const order of eligibleOrders) {
      // a. Serial gắn trực tiếp với Order
      for (const s of order.serials) {
        if (!existingSerialNumbers.has(s.serialNumber)) {
          existingSerialNumbers.add(s.serialNumber);
          allSerials.push(s);
        }
      }

      // b. Serial trong ServiceReport
      for (const rep of order.serviceReports) {
        if (rep.serialNumber && !existingSerialNumbers.has(rep.serialNumber)) {
          existingSerialNumbers.add(rep.serialNumber);
          const dbSerial = await prisma.serial.findUnique({
            where: { serialNumber: rep.serialNumber }
          });
          if (dbSerial) {
            allSerials.push(dbSerial);
          } else {
            const modelName = order.items[0]?.productName || 'Máy lọc nước Truliva';
            allSerials.push({
              id: `order-rep-${rep.id}`,
              serialNumber: rep.serialNumber,
              model: modelName,
              productLine: order.workType || 'Máy lọc nước Truliva',
              status: 'Đã kích hoạt',
              activationDate: order.updatedAt || order.createdAt,
              warrantyExpiryDate: new Date(new Date(order.updatedAt || order.createdAt).getTime() + 2 * 365 * 24 * 60 * 60 * 1000),
              customerPhone: phone,
              customerName: order.billFullName || null,
              createdAt: order.createdAt,
              updatedAt: order.updatedAt,
              orderId: order.id
            });
          }
        }
      }

      // c. Đơn có sản phẩm máy lọc nước nhưng chưa có serial lưu riêng
      const purifierItem = order.items.find(i => 
        (i.productName && (i.productName.toLowerCase().includes('máy lọc nước') || i.productName.toLowerCase().includes('máy nước nóng'))) ||
        (order.workType && (order.workType.includes('Lắp đặt') || order.workType.includes('Giao hàng và Lắp đặt')))
      );

      if (purifierItem && !order.serials.length && !order.serviceReports.some(r => r.serialNumber)) {
        const fallbackSerial = `TL-${order.pancakeOrderId || order.id.slice(0, 8).toUpperCase()}`;
        if (!existingSerialNumbers.has(fallbackSerial)) {
          existingSerialNumbers.add(fallbackSerial);
          allSerials.push({
            id: `order-${order.id}`,
            serialNumber: fallbackSerial,
            model: purifierItem.productName || 'Máy lọc nước Truliva',
            productLine: order.workType || 'Máy lọc nước Truliva',
            status: 'Đang hoạt động',
            activationDate: order.updatedAt || order.createdAt,
            warrantyExpiryDate: new Date(new Date(order.updatedAt || order.createdAt).getTime() + 2 * 365 * 24 * 60 * 60 * 1000),
            customerPhone: phone,
            customerName: order.billFullName || null,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            orderId: order.id
          });
        }
      }
    }

    const serialNumbers = allSerials.map(s => s.serialNumber);

    // Lấy thông tin IoT Devices tương ứng theo số Serial
    const iotDevices = await prisma.iotDevice.findMany({
      where: {
        serialNumber: {
          in: serialNumbers
        }
      },
      include: {
        telemetryData: {
          orderBy: { recordedAt: 'desc' },
          take: 1
        }
      }
    });

    const iotMap = new Map<string, any>();
    for (const dev of iotDevices) {
      const tel = dev.telemetryData[0];
      const raw = (typeof tel?.rawPayload === 'object' && tel?.rawPayload !== null) ? (tel.rawPayload as any) : {};
      const config = (typeof dev.configJson === 'object' && dev.configJson !== null) ? (dev.configJson as any) : {};

      iotMap.set(dev.serialNumber, {
        deviceId: dev.id,
        isOnline: dev.isOnline,
        firmwareVersion: dev.firmwareVersion || raw.fw || null,
        lastSeenAt: dev.lastSeenAt,
        isMuted: config.isMuted ?? false,
        telemetry: tel ? {
          tdsOut: tel.tdsOut != null ? Number(tel.tdsOut) : (raw.tdsOut != null ? Number(raw.tdsOut) : null),
          tdsIn: tel.tdsIn != null ? Number(tel.tdsIn) : (raw.tdsIn != null ? Number(raw.tdsIn) : null),
          waterFlowLpm: tel.waterFlowLpm,
          totalLiters: tel.totalLiters,
          errorCode: tel.errorCode,
          recordedAt: tel.recordedAt,
          // 3 Lõi lọc Truliva
          ppc: raw.ppc != null ? Number(raw.ppc) : null,
          ppcBars: raw.ppc_bars != null ? Number(raw.ppc_bars) : 4,
          ppcReplace: raw.ppc_replace === true,
          ro: raw.ro != null ? Number(raw.ro) : null,
          roBars: raw.ro_bars != null ? Number(raw.ro_bars) : 4,
          roReplace: raw.ro_replace === true,
          cto: raw.cto != null ? Number(raw.cto) : null,
          ctoBars: raw.cto_bars != null ? Number(raw.cto_bars) : 4,
          ctoReplace: raw.cto_replace === true,
          // Phần cứng / Mạng
          rssi: raw.rssi != null ? Number(raw.rssi) : null,
          uartOk: raw.uart_ok !== undefined ? raw.uart_ok : true,
          uptime: raw.uptime != null ? Number(raw.uptime) : null,
          ip: raw.ip || null
        } : null
      });
    }

    const enhancedSerials = allSerials.map(s => {
      const iot = iotMap.get(s.serialNumber) || null;
      return {
        ...s,
        iot
      };
    });

    res.json({
      success: true,
      serials: enhancedSerials
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

    // 1. Lấy báo cáo dịch vụ từ KTV (ServiceReport)
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

    const reportedOrderIds = new Set(reports.map(r => r.orderId).filter(Boolean));

    // 2. Tự động nạp thêm các Đơn hàng Dịch vụ Hoàn thành đã phân công KTV
    // Tiêu chí:
    // - Đã phân công KTV: assignedKtvId != null
    // - Trạng thái hoàn thành: adminStatus in ['hoàn thành', 'completed'] hoặc statusName in ['completed', 'delivered', 'received_money']
    // - Loại trừ giao hàng đơn tự tạo: NOT (workType in ['Giao hàng', 'giao_hang'] AND pancakeOrderId < 0)
    // - Không lấy đơn ecom: NOT (orderSource in ['zalo_shop', 'ecom', 'Ecom', 'Zalo Shop'])
    // - Khớp SĐT: billPhoneNumber in phoneVariants hoặc customer.phoneNumber in phoneVariants
    const completedOrders = await prisma.order.findMany({
      where: {
        assignedKtvId: { not: null },
        OR: [
          { billPhoneNumber: { in: phoneVariants } },
          { customer: { phoneNumber: { in: phoneVariants } } }
        ],
        AND: [
          {
            OR: [
              { adminStatus: { in: ['hoàn thành', 'completed', 'Hoàn thành', 'Đã hoàn thành'] } },
              { statusName: { in: ['completed', 'delivered', 'received_money', 'hoàn thành'] } }
            ]
          },
          {
            NOT: {
              AND: [
                { workType: { in: ['Giao hàng', 'giao_hang'] } },
                { pancakeOrderId: { lt: 0 } }
              ]
            }
          },
          {
            NOT: {
              orderSource: { in: ['zalo_shop', 'ecom', 'Ecom', 'Zalo Shop'] }
            }
          }
        ]
      },
      include: {
        assignedKtv: {
          select: { fullName: true, phoneNumber: true }
        },
        items: {
          select: { productName: true, quantity: true, sku: true }
        },
        serials: {
          select: { serialNumber: true, model: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 3. Ghép danh sách lịch sử dịch vụ không trùng lặp
    const historyList: any[] = [...reports];

    for (const ord of completedOrders) {
      if (reportedOrderIds.has(ord.id)) continue;

      const itemNames = ord.items.map(i => `${i.productName || 'Sản phẩm'} (x${i.quantity || 1})`).join(', ');
      historyList.push({
        id: `ord-${ord.id}`,
        workType: ord.workType || 'Dịch vụ KTV',
        serviceType: ord.serviceType || ord.workType || 'Bảo dưỡng / Lắp đặt máy',
        createdAt: ord.updatedAt || ord.createdAt,
        serialNumber: ord.serials[0]?.serialNumber || null,
        tdsIn: null,
        tdsOut: null,
        ktvUser: ord.assignedKtv ? {
          fullName: ord.assignedKtv.fullName,
          phoneNumber: ord.assignedKtv.phoneNumber
        } : null,
        notes: itemNames ? `Sản phẩm / Hạng mục: ${itemNames}` : (ord.note || 'Ca dịch vụ kỹ thuật hoàn thành')
      });
    }

    // Sắp xếp theo ngày giảm dần
    historyList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      success: true,
      history: historyList
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/zalo-miniapp/articles
 * Lấy danh sách bài viết truyền thông công khai từ Zalo OA cho Mini App (hỗ trợ tối đa 50 bài)
 */
router.get('/articles', async (req: Request, res: Response): Promise<void> => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 60));
    const { getZaloOaArticles } = await import('../services/zaloService');
    const articles = await getZaloOaArticles(offset, limit);
    res.json({
      success: true,
      count: articles.length,
      articles
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/zalo-miniapp/articles/:id
 * Lấy chi tiết nội dung bài viết từ Zalo OA cho Mini App
 */
router.get('/articles/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'Thiếu ID bài viết' });
      return;
    }
    const articleId = String(id);
    const { getZaloOaArticleDetail } = await import('../services/zaloService');
    const article = await getZaloOaArticleDetail(articleId);
    if (!article) {
      res.status(404).json({ success: false, error: 'Không tìm thấy bài viết' });
      return;
    }
    res.json({
      success: true,
      article
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
  getShopOrderDetail,
  handlePaymentWebhook,
  switchOrderToCod,
  confirmShopOrderPayment
} from '../controllers/shopController';

router.get('/shop/products', getShopProducts);
router.get('/shop/products/:slugOrId', getShopProductDetail);
router.get('/shop/legal-docs', getLegalDocuments);
router.get('/shop/legal-docs/:type', getLegalDocumentByType);
router.post('/shop/orders', optionalAuth, createShopOrder);
router.get('/shop/my-orders', optionalAuth, getMyShopOrders);
router.get('/shop/orders/:orderCodeOrId', getShopOrderDetail);
router.post('/shop/orders/:orderCodeOrId/switch-to-cod', switchOrderToCod);
router.post('/shop/orders/:orderCodeOrId/confirm-payment', confirmShopOrderPayment);
router.post('/shop/payment/webhook', handlePaymentWebhook);

export default router;


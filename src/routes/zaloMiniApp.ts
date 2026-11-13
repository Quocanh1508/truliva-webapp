import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireCustomerAuth, optionalCustomerAuth } from '../middleware/authSession';
import { authenticateZaloMiniAppUser } from '../services/zaloMiniAppService';
import { activateSerialWarranty } from '../services/warrantyService';
import { getPurifierConfig } from '../config/waterPurifiers';
import { buildPhoneVariants, getRedeemedPoints } from '../services/shopPricing';

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

    // Thiết lập cookie zalo_session_token tách biệt với session_token nội bộ
    res.cookie('zalo_session_token', authResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000 // 14 ngày
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
export { buildPhoneVariants };

/**
 * Tính điểm tích lũy khách hàng từ các đơn hàng Truliva App
 * - Đơn <= 5.000.000đ: 10% giá trị đơn (làm tròn lên)
 * - Đơn > 5.000.000đ: 5% giá trị đơn (làm tròn lên)
 * - Quy đổi: 1 điểm = 1.000 VNĐ (tương tự cơ chế Shopee Xu)
 */
export async function calculateCustomerLoyalty(phoneNumber: string | null | undefined, userId?: string | null) {
  if (!phoneNumber) {
    return {
      points: 0,
      rewardPoints: 0,
      pointValueVnd: 0,
      tier: 'BRONZE',
      rankLabel: 'Thành viên Đồng',
      completedOrdersCount: 0,
      totalSpent: 0,
      orders: []
    };
  }

  const phoneVariants = buildPhoneVariants(phoneNumber);

  const completedOrders = await prisma.order.findMany({
    where: {
      OR: [
        { billPhoneNumber: { in: phoneVariants } },
        { customer: { phoneNumber: { in: phoneVariants } } }
      ],
      adminStatus: {
        notIn: ['hủy đơn', 'đã hoàn']
      },
      AND: [
        {
          OR: [
            { adminStatus: { in: ['hoàn thành', 'completed', 'Hoàn thành', 'Đã hoàn thành'] } },
            { statusName: { in: ['completed', 'delivered', 'received_money', 'hoàn thành'] } }
          ]
        }
      ]
    },
    select: {
      id: true,
      pancakeOrderId: true,
      totalPrice: true,
      moneyToCollect: true,
      adminStatus: true,
      statusName: true,
      createdAt: true,
      updatedAt: true,
      items: {
        select: {
          productName: true,
          quantity: true,
          price: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  let totalPoints = 0;
  let totalSpent = 0;
  const historyOrders: any[] = [];

  for (const ord of completedOrders) {
    const amount = Number(ord.totalPrice ?? ord.moneyToCollect ?? 0);
    if (amount <= 0) continue;

    totalSpent += amount;
    // Cơ chế tích điểm: <= 5tr lấy 10% (làm tròn lên), > 5tr lấy 5% (làm tròn lên)
    const ratePercent = amount <= 5000000 ? 10 : 5;
    const rate = ratePercent / 100;
    const rawPoint = (amount * rate) / 1000;
    const pointsEarned = Math.ceil(rawPoint);

    totalPoints += pointsEarned;
    historyOrders.push({
      orderId: ord.id,
      pancakeOrderId: ord.pancakeOrderId,
      orderCode: ord.pancakeOrderId ? `#${ord.pancakeOrderId}` : `#${ord.id.slice(0, 8).toUpperCase()}`,
      orderAmount: amount,
      ratePercent,
      pointsEarned,
      pointValueVnd: pointsEarned * 1000,
      createdAt: ord.updatedAt || ord.createdAt,
      itemsSummary: ord.items.map((i: any) => i.productName).filter(Boolean).join(', ') || 'Đơn hàng hoàn thành'
    });
  }

  // Điểm khả dụng = điểm tích lũy - điểm đã dùng trừ tiền trên các đơn Shop chưa hủy
  const redeemedPoints = await getRedeemedPoints(phoneVariants, userId);
  const availablePoints = Math.max(0, totalPoints - redeemedPoints);

  // Xác định hạng thành viên theo tổng điểm tích lũy (không giảm khi tiêu điểm)
  let tier = 'BRONZE';
  let rankLabel = 'Thành viên Đồng';
  if (totalPoints >= 1000) {
    tier = 'DIAMOND';
    rankLabel = 'Thành viên Kim Cương';
  } else if (totalPoints >= 500) {
    tier = 'GOLD';
    rankLabel = 'Thành viên Vàng';
  } else if (totalPoints >= 200) {
    tier = 'SILVER';
    rankLabel = 'Thành viên Bạc';
  }

  return {
    points: availablePoints,
    rewardPoints: availablePoints,
    pointValueVnd: availablePoints * 1000,
    earnedPoints: totalPoints,
    redeemedPoints,
    tier,
    rankLabel,
    completedOrdersCount: historyOrders.length,
    totalSpent,
    orders: historyOrders
  };
}

router.get('/profile', requireCustomerAuth, async (req: Request, res: Response): Promise<void> => {
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

    const loyalty = await calculateCustomerLoyalty(fullUser?.phoneNumber || (user as any).phone, user.id);

    res.json({
      success: true,
      user: {
        ...fullUser,
        rewardPoints: loyalty.points,
        points: loyalty.points,
        pointValueVnd: loyalty.pointValueVnd,
        membershipTier: loyalty.tier,
        rankLabel: loyalty.rankLabel,
        loyaltySummary: loyalty
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/zalo-miniapp/loyalty
 * Lấy chi tiết lịch sử tích điểm và danh sách đơn hàng đã tích lũy từ Truliva App
 */
router.get('/loyalty', requireCustomerAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phoneNumber: true }
    });

    const loyalty = await calculateCustomerLoyalty(fullUser?.phoneNumber || (user as any).phone, user.id);
    res.json({
      success: true,
      ...loyalty
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/zalo-miniapp/profile/sync
 * Đồng bộ tên thật & avatar từ Zalo Mini App SDK lên tài khoản Truliva
 */
router.post('/profile/sync', requireCustomerAuth, async (req: Request, res: Response): Promise<void> => {
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
router.get('/my-serials', requireCustomerAuth, async (req: Request, res: Response): Promise<void> => {
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
          // Thông số lõi lọc nước Truliva (hỗ trợ cả chuẩn PPC/PGP 3 lõi và PCB 2 lõi)
          ppc: raw.ppc != null ? Number(raw.ppc) : (raw.pcb != null ? Number(raw.pcb) : null),
          ppcBars: raw.ppc_bars != null ? Number(raw.ppc_bars) : (raw.pcb_bars != null ? Number(raw.pcb_bars) : null),
          ppcReplace: raw.ppc_replace === true || raw.pcb_replace === true,
          pcb: raw.pcb != null ? Number(raw.pcb) : (raw.ppc != null ? Number(raw.ppc) : null),
          pcbBars: raw.pcb_bars != null ? Number(raw.pcb_bars) : (raw.ppc_bars != null ? Number(raw.ppc_bars) : null),
          pcbReplace: raw.pcb_replace === true || raw.ppc_replace === true,
          ro: raw.ro != null ? Number(raw.ro) : null,
          roBars: raw.ro_bars != null ? Number(raw.ro_bars) : null,
          roReplace: raw.ro_replace === true,
          cto: raw.cto != null ? Number(raw.cto) : null,
          ctoBars: raw.cto_bars != null ? Number(raw.cto_bars) : null,
          ctoReplace: raw.cto_replace === true,
          // Phần cứng / Mạng
          rssi: raw.rssi != null ? Number(raw.rssi) : null,
          uartOk: raw.uart_ok !== undefined ? raw.uart_ok : true,
          uptime: raw.uptime != null ? Number(raw.uptime) : null,
          ip: raw.ip || '192.168.1.135',
          ssid: raw.ssid || config.ssid || 'Truliva_Smart_WiFi',
          mac: raw.mac || config.mac || `TL-${dev.id.slice(0, 6).toUpperCase()}`,
          band: '2.4 GHz (802.11 b/g/n)'
        } : null
      });
    }

    const enhancedSerials = allSerials.map(s => {
      const iot = iotMap.get(s.serialNumber) || null;
      const modelConfig = getPurifierConfig(s.model || s.productLine || s.serialNumber);
      return {
        ...s,
        iot,
        modelConfig
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
 * Helper chuẩn hóa trạng thái ca kỹ thuật từ Truliva App
 */
function mapServiceStatus(adminStatus?: string | null, statusName?: string | null, approvalStatus?: string | null): { label: string; code: 'completed' | 'in_progress' | 'pending' | 'rescheduled' | 'cancelled' } {
  const s = (adminStatus || statusName || approvalStatus || '').toLowerCase().trim();

  if (s.includes('hoàn thành') || s.includes('completed') || s.includes('delivered') || s.includes('approved') || s.includes('received_money')) {
    return { label: 'Hoàn thành', code: 'completed' };
  }
  if (s.includes('hủy') || s.includes('cancel') || s.includes('rejected') || s.includes('từ chối')) {
    return { label: 'Hủy đơn', code: 'cancelled' };
  }
  if (s.includes('hẹn lại') || s.includes('reschedule')) {
    return { label: 'Hẹn lại', code: 'rescheduled' };
  }
  if (s.includes('đang') || s.includes('processing') || s.includes('phân công') || s.includes('assigned') || s.includes('shipping') || s.includes('confirmed')) {
    return { label: 'Đang thực hiện', code: 'in_progress' };
  }
  return { label: 'Chờ xử lý', code: 'pending' };
}

/**
 * Helper chuẩn hóa loại công việc
 */
function formatWorkType(workType?: string | null): string {
  if (!workType) return 'Bảo trì & Thay lõi';
  const w = workType.toLowerCase().trim();
  if (w === 'lap_dat' || w === 'lắp đặt') return 'Lắp đặt';
  if (w === 'giao_hang' || w === 'giao hàng') return 'Giao hàng';
  if (w.includes('giao') && w.includes('lắp')) return 'Giao hàng & Lắp đặt';
  if (w === 'sua_chua' || w === 'sửa chữa') return 'Sửa chữa';
  if (w === 'thay_loi' || w.includes('thay lõi') || w.includes('thay loc')) return 'Thay lõi lọc';
  if (w === 'bao_hanh' || w === 'bảo hành') return 'Bảo hành';
  if (w === 'bao_tri' || w === 'bảo trì' || w === 'bảo dưỡng') return 'Bảo trì & Bảo dưỡng';
  return workType;
}

/**
 * Helper tạo đối tượng ServiceHistoryItem chuẩn 7 trường cho Zalo Mini App
 */
function mapToServiceHistoryItem(params: {
  id: string;
  adminStatus?: string | null;
  statusName?: string | null;
  approvalStatus?: string | null;
  updatedAt?: Date | string | null;
  completedAt?: Date | string | null;
  scheduledAt?: Date | string | null;
  createdAt: Date | string;
  productName?: string | null;
  serial?: string | null;
  jobType?: string | null;
  serviceType?: string | null;
  technicianName?: string | null;
}) {
  const { label: status, code: statusCode } = mapServiceStatus(
    params.adminStatus,
    params.statusName,
    params.approvalStatus
  );

  const formattedJobType = formatWorkType(params.jobType);

  // Loại dịch vụ: null nếu rỗng hoặc generic như 'Công việc đã bao gồm dịch vụ' hoặc trùng jobType
  let cleanServiceType: string | null = null;
  if (params.serviceType && params.serviceType.trim()) {
    const st = params.serviceType.trim();
    const stLower = st.toLowerCase();
    if (
      stLower !== 'công việc đã bao gồm dịch vụ' &&
      stLower !== formattedJobType.toLowerCase() &&
      !stLower.includes('đã bao gồm')
    ) {
      cleanServiceType = st;
    }
  }

  const effectiveUpdatedAt = params.updatedAt ? new Date(params.updatedAt).toISOString() : new Date(params.createdAt).toISOString();
  const effectiveScheduledAt = params.scheduledAt ? new Date(params.scheduledAt).toISOString() : null;
  const isCompleted = statusCode === 'completed';
  const effectiveCompletedAt = params.completedAt
    ? new Date(params.completedAt).toISOString()
    : (isCompleted ? effectiveUpdatedAt : null);

  const cleanSerial = params.serial && params.serial !== 'XXXXX' ? params.serial.trim() : null;
  const cleanProductName = params.productName ? params.productName.trim() : 'Máy lọc nước Truliva';

  return {
    id: params.id,
    status, // 1. Trạng thái ca hiện tại: 'Chờ xử lý', 'Đang thực hiện', 'Hoàn thành', 'Hẹn lại', 'Hủy đơn'
    statusCode,
    updatedAt: effectiveUpdatedAt, // 2. Thời gian cập nhật theo trạng thái thực tế
    completedAt: effectiveCompletedAt,
    scheduledAt: effectiveScheduledAt,
    createdAt: new Date(params.createdAt).toISOString(),
    productName: cleanProductName, // 3. Tên sản phẩm
    modelName: cleanProductName,
    serial: cleanSerial, // 4. Mã Serial máy
    serialNumber: cleanSerial,
    jobType: formattedJobType, // 5. Loại công việc
    workType: formattedJobType,
    serviceType: cleanServiceType, // 6. Loại dịch vụ (null nếu rỗng)
    technicianName: params.technicianName ? params.technicianName.trim() : null, // 7. Tên KTV phụ trách (KHÔNG có SĐT)
    ktvUser: params.technicianName ? { fullName: params.technicianName.trim() } : null
  };
}

/**
 * GET /api/zalo-miniapp/service-history
 * Lấy danh sách lịch sử bảo trì, thay lõi và ca kỹ thuật realtime từ Truliva App
 */
router.get('/service-history', requireCustomerAuth, async (req: Request, res: Response): Promise<void> => {
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

    // Tìm các serial liên kết với khách hàng
    const serials = await prisma.serial.findMany({
      where: { customerPhone: { in: phoneVariants } },
      select: { serialNumber: true, model: true }
    });
    const serialNumbers = serials.map(s => s.serialNumber);
    const serialModelMap = new Map<string, string>();
    serials.forEach(s => {
      if (s.serialNumber && s.model) serialModelMap.set(s.serialNumber, s.model);
    });

    // 1. Lấy báo cáo dịch vụ từ KTV (ServiceReport) kèm đơn hàng liên kết
    const reports = await prisma.serviceReport.findMany({
      where: {
        OR: [
          { customerPhone: { in: phoneVariants } },
          ...(serialNumbers.length > 0 ? [{ serialNumber: { in: serialNumbers } }] : [])
        ]
      },
      include: {
        ktvUser: {
          select: { fullName: true }
        },
        order: {
          select: {
            id: true,
            adminStatus: true,
            statusName: true,
            workType: true,
            serviceType: true,
            appointmentTime: true,
            updatedAt: true,
            createdAt: true,
            items: { select: { productName: true } },
            serials: { select: { serialNumber: true, model: true } },
            assignedKtv: { select: { fullName: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 2. Lấy các ca dịch vụ kỹ thuật / Đơn hàng KTV từ Truliva App
    const serviceOrders = await prisma.order.findMany({
      where: {
        OR: [
          { billPhoneNumber: { in: phoneVariants } },
          { customer: { phoneNumber: { in: phoneVariants } } },
          ...(serialNumbers.length > 0 ? [{ serials: { some: { serialNumber: { in: serialNumbers } } } }] : [])
        ],
        AND: [
          {
            OR: [
              { assignedKtvId: { not: null } },
              { workType: { not: null } },
              { serviceType: { not: null } },
              { hotlineTickets: { some: {} } }
            ]
          },
          {
            NOT: {
              AND: [
                { orderSource: { in: ['zalo_shop', 'ecom', 'Ecom', 'Zalo Shop'] } },
                { assignedKtvId: null }
              ]
            }
          },
          {
            adminStatus: { not: 'đã ẩn' }
          }
        ]
      },
      include: {
        assignedKtv: {
          select: { fullName: true }
        },
        items: {
          select: { productName: true, quantity: true, sku: true }
        },
        serials: {
          select: { serialNumber: true, model: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // 3. Lấy yêu cầu hỗ trợ kỹ thuật từ HotlineTicket (nếu có)
    const tickets = await prisma.hotlineTicket.findMany({
      where: {
        OR: [
          { customerPhone: { in: phoneVariants } },
          ...(phoneVariants.map(pv => ({ secondaryPhones: { contains: pv } }))),
          ...(serialNumbers.length > 0 ? [{ serialNumber: { in: serialNumbers } }] : [])
        ]
      },
      include: {
        handlerUser: {
          select: { fullName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const historyList: any[] = [];
    const reportedOrderIds = new Set<string>();
    const seenOrderIds = new Set<string>();

    // Ghép 1: ServiceReports đã nghiệm thu hoặc đã nộp
    for (const rep of reports) {
      if (rep.orderId) {
        reportedOrderIds.add(rep.orderId);
      }

      const matchedSerial = rep.serialNumber && rep.serialNumber !== 'XXXXX'
        ? rep.serialNumber
        : (rep.order?.serials?.[0]?.serialNumber || null);

      const prodName = (rep.products && rep.products.length > 0 && rep.products[0])
        ? rep.products[0]
        : (rep.order?.items?.[0]?.productName || (matchedSerial ? serialModelMap.get(matchedSerial) : null) || 'Máy lọc nước Truliva');

      const adminStat = rep.order?.adminStatus || rep.order?.statusName;

      historyList.push(mapToServiceHistoryItem({
        id: `rep-${rep.id}`,
        adminStatus: adminStat,
        approvalStatus: rep.approvalStatus,
        updatedAt: rep.updatedAt,
        completedAt: rep.createdAt,
        scheduledAt: rep.order?.appointmentTime,
        createdAt: rep.createdAt,
        productName: prodName,
        serial: matchedSerial,
        jobType: rep.workType || rep.order?.workType,
        serviceType: rep.serviceType || rep.order?.serviceType,
        technicianName: rep.ktvUser?.fullName || rep.order?.assignedKtv?.fullName || null
      }));
    }

    // Ghép 2: Đơn dịch vụ KTV chưa có ServiceReport (Đang thực hiện, Chờ xử lý, Đã phân công, Hẹn lại...)
    for (const ord of serviceOrders) {
      if (reportedOrderIds.has(ord.id)) continue;
      seenOrderIds.add(ord.id);

      const matchedSerial = ord.serials?.[0]?.serialNumber || null;
      const prodName = ord.items?.[0]?.productName
        || ord.serials?.[0]?.model
        || (matchedSerial ? serialModelMap.get(matchedSerial) : null)
        || 'Máy lọc nước Truliva';

      historyList.push(mapToServiceHistoryItem({
        id: `ord-${ord.id}`,
        adminStatus: ord.adminStatus,
        statusName: ord.statusName,
        updatedAt: ord.updatedAt,
        scheduledAt: ord.appointmentTime,
        createdAt: ord.createdAt,
        productName: prodName,
        serial: matchedSerial,
        jobType: ord.workType || 'Bảo trì & Dịch vụ KTV',
        serviceType: ord.serviceType,
        technicianName: ord.assignedKtv?.fullName || null
      }));
    }

    // Ghép 3: Phiếu HotlineTicket chưa chuyển thành đơn hoặc đang xử lý
    for (const ticket of tickets) {
      if (ticket.convertedOrderId && (reportedOrderIds.has(ticket.convertedOrderId) || seenOrderIds.has(ticket.convertedOrderId))) {
        continue;
      }

      historyList.push(mapToServiceHistoryItem({
        id: `hl-${ticket.id}`,
        adminStatus: ticket.status,
        updatedAt: ticket.updatedAt,
        createdAt: ticket.createdAt,
        productName: ticket.productName || 'Máy lọc nước Truliva',
        serial: ticket.serialNumber || null,
        jobType: ticket.serviceRequestType || 'Hỗ trợ kỹ thuật',
        serviceType: ticket.phase3ServiceType || null,
        technicianName: ticket.handlerUser?.fullName || null
      }));
    }

    // Sắp xếp theo ngày cập nhật mới nhất lên đầu (Realtime LIFO)
    historyList.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

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
// Mọi thao tác trên đơn hàng đều bắt buộc đăng nhập Mini App và chỉ được truy cập đơn của chính mình
router.post('/shop/orders', requireCustomerAuth, createShopOrder);
router.get('/shop/my-orders', requireCustomerAuth, getMyShopOrders);
router.get('/shop/orders/:orderCodeOrId', requireCustomerAuth, getShopOrderDetail);
router.post('/shop/orders/:orderCodeOrId/switch-to-cod', requireCustomerAuth, switchOrderToCod);
// confirm-payment: Sandbox → chủ đơn (optionalCustomerAuth); Production → kiểm tra ADMIN nội bộ bên trong controller
router.post('/shop/orders/:orderCodeOrId/confirm-payment', optionalCustomerAuth, confirmShopOrderPayment);
router.post('/shop/payment/webhook', handlePaymentWebhook);

export default router;


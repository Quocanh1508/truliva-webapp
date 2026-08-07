import { Request, Response } from 'express';
import prisma from '../config/database';

// ═══════════════════════════════════════════════════
//  HOTLINE TICKET STATUSES
// ═══════════════════════════════════════════════════
const HOTLINE_STATUSES = [
  'CHỜ XÁC THỰC',          // Vừa tạo từ Phase 2, chưa qua Phase 3
  'CHƯA THỰC HIỆN',        // Đã xác thực nhưng chưa bắt đầu xử lý
  'ĐANG CHỜ NHÓM 2 PHẢN HỒI', // Trả về Phase 2 để sửa thông tin
  'KHÁCH HẸN GỌI LẠI SAU', // Khách yêu cầu gọi lại sau
  'CHƯA LIÊN HỆ ĐƯỢC KHÁCH', // Không liên lạc được
  'ĐÃ CHUYỂN YÊU CẦU',    // Đã đẩy sang Ca dịch vụ
  'ĐÃ HOÀN THÀNH',         // Hoàn tất xử lý
  'ĐÃ HỦY'                 // Hủy phiếu
];

// ═══════════════════════════════════════════════════
//  PHASE 1: Tìm kiếm lịch sử khách hàng
// ═══════════════════════════════════════════════════

/**
 * GET /api/hotlines/search-customer?phone=...&serial=...
 * Tra cứu nhanh KH theo SĐT hoặc Serial, auto-fill thông tin
 */
export async function searchCustomerHistory(req: Request, res: Response) {
  try {
    const { phone, serial } = req.query;
    const results: any = { customers: [], orders: [], serials: [] };

    if (phone && String(phone).trim().length >= 4) {
      const phoneStr = String(phone).trim();

      // Tìm trong bảng Customer
      const customers = await prisma.customer.findMany({
        where: {
          OR: [
            { phoneNumber: { contains: phoneStr } },
            { fullName: { contains: phoneStr, mode: 'insensitive' } }
          ]
        },
        take: 10,
        orderBy: { updatedAt: 'desc' }
      });
      results.customers = customers;

      // Tìm trong bảng Order (billPhoneNumber)
      const orders = await prisma.order.findMany({
        where: { billPhoneNumber: { contains: phoneStr } },
        select: {
          id: true,
          pancakeOrderId: true,
          billFullName: true,
          billPhoneNumber: true,
          shippingAddress: true,
          workType: true,
          adminStatus: true,
          items: { select: { productName: true } },
          createdAt: true
        },
        take: 10,
        orderBy: { createdAt: 'desc' }
      });
      results.orders = orders;
    }

    if (serial && String(serial).trim().length >= 3) {
      const serialStr = String(serial).trim();
      const serials = await prisma.serial.findMany({
        where: {
          OR: [
            { serialNumber: { contains: serialStr, mode: 'insensitive' } },
            { model: { contains: serialStr, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          serialNumber: true,
          model: true,
          productLine: true,
          ownerName: true,
          ownerPhone: true,
          ownerAddress: true,
          ownerProvince: true,
          warrantyStatus: true,
          warrantyExpiry: true
        },
        take: 10,
        orderBy: { createdAt: 'desc' }
      });
      results.serials = serials;
    }

    return res.json(results);
  } catch (error: any) {
    console.error('[searchCustomerHistory] Error:', error);
    return res.status(500).json({ error: 'Lỗi tra cứu khách hàng', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  GET /api/hotlines - Danh sách Yêu cầu Hotline
// ═══════════════════════════════════════════════════

/**
 * Lấy danh sách phiếu Hotline kèm đếm badge 8 trạng thái
 */
export async function getHotlineTickets(req: Request, res: Response) {
  try {
    const { status, search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit))));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: any = {};
    if (status && String(status) !== 'ALL') {
      where.status = String(status);
    }
    if (search && String(search).trim()) {
      const s = String(search).trim();
      where.OR = [
        { ticketCode: { contains: s, mode: 'insensitive' } },
        { customerName: { contains: s, mode: 'insensitive' } },
        { customerPhone: { contains: s } },
        { address: { contains: s, mode: 'insensitive' } },
        { serialNumber: { contains: s, mode: 'insensitive' } },
        { customerSupportDetail: { contains: s, mode: 'insensitive' } }
      ];
    }

    // Parallel: fetch tickets + count + status badges
    const [tickets, totalCount, statusCounts] = await Promise.all([
      prisma.hotlineTicket.findMany({
        where,
        include: {
          createdBy: { select: { id: true, fullName: true, email: true, role: true } },
          handlerUser: { select: { id: true, fullName: true, email: true, role: true } },
          convertedOrder: { select: { id: true, pancakeOrderId: true, billFullName: true, adminStatus: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.hotlineTicket.count({ where }),
      prisma.hotlineTicket.groupBy({
        by: ['status'],
        _count: { status: true }
      })
    ]);

    // Build badge counts map
    const badgeCounts: Record<string, number> = {};
    let totalAll = 0;
    for (const sc of statusCounts) {
      badgeCounts[sc.status] = sc._count.status;
      totalAll += sc._count.status;
    }
    badgeCounts['TỔNG YÊU CẦU'] = totalAll;

    return res.json({
      tickets,
      totalCount,
      badgeCounts,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum)
    });
  } catch (error: any) {
    console.error('[getHotlineTickets] Error:', error);
    return res.status(500).json({ error: 'Lỗi lấy danh sách yêu cầu hotline', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  POST /api/hotlines - Tạo phiếu Yêu cầu Hotline (Phase 2)
// ═══════════════════════════════════════════════════

/**
 * Sinh mã ticketCode tự động: HL + YYYYMMDDHHmm + 4 số thứ tự
 */
async function generateTicketCode(): Promise<string> {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const prefix = `HL${dateStr}`;

  // Đếm số phiếu đã tạo trong ngày
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const countToday = await prisma.hotlineTicket.count({
    where: {
      createdAt: { gte: startOfDay, lt: endOfDay }
    }
  });

  return `${prefix}${pad(countToday + 1, 4)}`;
}

export async function createHotlineTicket(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    // Chặn KTV và DEV
    if (user.role === 'KTV' || user.role === 'DEV') {
      return res.status(403).json({ error: 'Vai trò của bạn không được phép tạo yêu cầu Hotline' });
    }

    const {
      customerName, customerPhone, secondaryPhones, email, dateOfBirth,
      provinceName, address, source, channel, productName, serialNumber,
      serviceRequestType, customerSupportDetail, attachmentUrls,
      targetTeam, handlerUserId
    } = req.body;

    // Validate required fields
    if (!customerName || !customerPhone || !provinceName || !source || !productName || !serviceRequestType || !customerSupportDetail || !targetTeam) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ các trường bắt buộc (*)' });
    }

    const ticketCode = await generateTicketCode();

    const ticket = await prisma.hotlineTicket.create({
      data: {
        ticketCode,
        customerName,
        customerPhone,
        secondaryPhones: secondaryPhones || null,
        email: email || null,
        dateOfBirth: dateOfBirth || null,
        provinceName,
        address: address || null,
        source,
        channel: channel || null,
        productName,
        serialNumber: serialNumber || null,
        serviceRequestType,
        customerSupportDetail,
        attachmentUrls: attachmentUrls || [],
        createdById: user.id,
        targetTeam,
        handlerUserId: handlerUserId || null,
        status: 'CHỜ XÁC THỰC'
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        handlerUser: { select: { id: true, fullName: true, email: true, role: true } }
      }
    });

    return res.status(201).json(ticket);
  } catch (error: any) {
    console.error('[createHotlineTicket] Error:', error);
    return res.status(500).json({ error: 'Lỗi tạo yêu cầu hotline', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  GET /api/hotlines/:id - Chi tiết phiếu
// ═══════════════════════════════════════════════════

export async function getHotlineTicketById(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const ticket = await prisma.hotlineTicket.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        handlerUser: { select: { id: true, fullName: true, email: true, role: true } },
        convertedOrder: { select: { id: true, pancakeOrderId: true, billFullName: true, adminStatus: true } },
        notesHistory: { orderBy: { createdAt: 'desc' } },
        feedbackHistory: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!ticket) return res.status(404).json({ error: 'Không tìm thấy phiếu yêu cầu hotline' });
    return res.json(ticket);
  } catch (error: any) {
    console.error('[getHotlineTicketById] Error:', error);
    return res.status(500).json({ error: 'Lỗi lấy chi tiết phiếu', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  PUT /api/hotlines/:id - Cập nhật phiếu (Phase 2 sửa lại)
// ═══════════════════════════════════════════════════

export async function updateHotlineTicket(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const id = req.params.id as string;
    const existing = await prisma.hotlineTicket.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy phiếu' });

    const {
      customerName, customerPhone, secondaryPhones, email, dateOfBirth,
      provinceName, address, source, channel, productName, serialNumber,
      serviceRequestType, customerSupportDetail, attachmentUrls,
      targetTeam, handlerUserId
    } = req.body;

    const ticket = await prisma.hotlineTicket.update({
      where: { id },
      data: {
        ...(customerName && { customerName }),
        ...(customerPhone && { customerPhone }),
        ...(secondaryPhones !== undefined && { secondaryPhones }),
        ...(email !== undefined && { email }),
        ...(dateOfBirth !== undefined && { dateOfBirth }),
        ...(provinceName && { provinceName }),
        ...(address !== undefined && { address }),
        ...(source && { source }),
        ...(channel !== undefined && { channel }),
        ...(productName && { productName }),
        ...(serialNumber !== undefined && { serialNumber }),
        ...(serviceRequestType && { serviceRequestType }),
        ...(customerSupportDetail && { customerSupportDetail }),
        ...(attachmentUrls && { attachmentUrls }),
        ...(targetTeam && { targetTeam }),
        ...(handlerUserId !== undefined && { handlerUserId: handlerUserId || null }),
        // Nếu Phase 2 gửi lại sau khi bị trả về → chuyển lại trạng thái CHỜ XÁC THỰC
        ...(existing.status === 'ĐANG CHỜ NHÓM 2 PHẢN HỒI' && { status: 'CHỜ XÁC THỰC' })
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        handlerUser: { select: { id: true, fullName: true, email: true, role: true } }
      }
    });

    return res.json(ticket);
  } catch (error: any) {
    console.error('[updateHotlineTicket] Error:', error);
    return res.status(500).json({ error: 'Lỗi cập nhật phiếu', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  POST /api/hotlines/:id/assign - Phân bổ phiếu
// ═══════════════════════════════════════════════════

export async function assignHotlineTicket(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    // Chỉ HOTLINE, ADMIN, COORDINATOR
    if (!['HOTLINE', 'ADMIN', 'COORDINATOR'].includes(user.role)) {
      return res.status(403).json({ error: 'Bạn không có quyền phân bổ yêu cầu hotline' });
    }

    const id = req.params.id as string;
    const { targetTeam, handlerUserId } = req.body;

    if (!targetTeam) return res.status(400).json({ error: 'Vui lòng chọn Team nhận yêu cầu' });

    const existing = await prisma.hotlineTicket.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy phiếu' });

    // Lấy thông tin handler user nếu có
    let handlerName = '';
    if (handlerUserId) {
      const handler = await prisma.user.findUnique({ where: { id: handlerUserId }, select: { fullName: true, email: true } });
      handlerName = handler ? `${handler.fullName} (${handler.email || ''})` : '';
    }

    const [ticket] = await prisma.$transaction([
      prisma.hotlineTicket.update({
        where: { id },
        data: { targetTeam, handlerUserId: handlerUserId || null },
        include: {
          createdBy: { select: { id: true, fullName: true, email: true, role: true } },
          handlerUser: { select: { id: true, fullName: true, email: true, role: true } }
        }
      }),
      prisma.hotlineTicketFeedbackHistory.create({
        data: {
          ticketId: id,
          userId: user.id,
          userName: user.fullName,
          action: 'ASSIGN',
          feedback: `Phân bổ cho team "${targetTeam}"${handlerName ? ` - Người nhận: ${handlerName}` : ''}`
        }
      })
    ]);

    return res.json(ticket);
  } catch (error: any) {
    console.error('[assignHotlineTicket] Error:', error);
    return res.status(500).json({ error: 'Lỗi phân bổ phiếu', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  POST /api/hotlines/:id/convert-to-order - Đẩy sang Ca dịch vụ
// ═══════════════════════════════════════════════════

export async function convertToServiceOrder(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    if (!['HOTLINE', 'ADMIN', 'COORDINATOR'].includes(user.role)) {
      return res.status(403).json({ error: 'Bạn không có quyền chuyển yêu cầu thành ca dịch vụ' });
    }

    const id = req.params.id as string;
    const existing = await prisma.hotlineTicket.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy phiếu' });
    if (existing.status === 'ĐÃ CHUYỂN YÊU CẦU') {
      return res.status(400).json({ error: 'Phiếu này đã được chuyển thành ca dịch vụ trước đó' });
    }

    // Sinh pancakeOrderId giả (negative) cho đơn thủ công từ hotline
    const lastOrder = await prisma.order.findFirst({ orderBy: { pancakeOrderId: 'asc' }, select: { pancakeOrderId: true } });
    const newPancakeId = lastOrder && lastOrder.pancakeOrderId < 0 ? lastOrder.pancakeOrderId - 1 : -1;

    // Parse address/province từ phiếu hotline
    const addressParts: any = {};
    if (existing.address) {
      addressParts.full_address = existing.address;
    }
    if (existing.provinceName) {
      addressParts.province = existing.provinceName;
    }

    // Tạo Ca dịch vụ mới
    const [order, ticket] = await prisma.$transaction([
      prisma.order.create({
        data: {
          pancakeOrderId: newPancakeId,
          billFullName: existing.customerName,
          billPhoneNumber: existing.customerPhone,
          shippingAddress: addressParts,
          note: `[Từ Hotline ${existing.ticketCode}] ${existing.customerSupportDetail}`,
          adminStatus: 'chờ xử lý',
          workType: existing.serviceRequestType || null,
          rawData: { source: 'hotline', hotlineTicketId: existing.id, hotlineTicketCode: existing.ticketCode }
        }
      }),
      prisma.hotlineTicket.update({
        where: { id },
        data: {
          status: 'ĐÃ CHUYỂN YÊU CẦU',
          convertedOrderId: undefined // will be set below
        }
      }),
      prisma.hotlineTicketFeedbackHistory.create({
        data: {
          ticketId: id,
          userId: user.id,
          userName: user.fullName,
          action: 'CONVERT_ORDER',
          feedback: `Đã chuyển thành ca dịch vụ mới`
        }
      })
    ]);

    // Link convertedOrderId
    await prisma.hotlineTicket.update({
      where: { id },
      data: { convertedOrderId: order.id }
    });

    return res.json({ ticket: { ...ticket, convertedOrderId: order.id }, order });
  } catch (error: any) {
    console.error('[convertToServiceOrder] Error:', error);
    return res.status(500).json({ error: 'Lỗi chuyển yêu cầu thành ca dịch vụ', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  POST /api/hotlines/:id/verify - Phase 3 Verify & Xử lý
// ═══════════════════════════════════════════════════

export async function verifyHotlineTicketPhase3(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    // Chỉ HOTLINE, ADMIN, COORDINATOR
    if (!['HOTLINE', 'ADMIN', 'COORDINATOR'].includes(user.role)) {
      return res.status(403).json({ error: 'Bạn không có quyền xử lý Phase 3' });
    }

    const id = req.params.id as string;
    const {
      action,           // VERIFY_APPROVE, REJECT_TO_PHASE2, CANCEL
      status,           // Nếu muốn đổi trạng thái cụ thể
      phase3RequestType,
      phase3ServiceType,
      sparePartName,
      consultationNote,
      feedback          // Nội dung phản hồi bước 3
    } = req.body;

    const existing = await prisma.hotlineTicket.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy phiếu' });

    const updateData: any = {
      contactTime: new Date(),
      ...(phase3RequestType && { phase3RequestType }),
      ...(phase3ServiceType && { phase3ServiceType }),
      ...(sparePartName !== undefined && { sparePartName }),
      ...(feedback && { phase3Feedback: feedback }),
      ...(action && { phase3Action: action })
    };

    // Lưu ghi chú tư vấn nếu có
    if (consultationNote) {
      updateData.consultationNote = consultationNote;
      await prisma.hotlineTicketNoteHistory.create({
        data: {
          ticketId: id,
          userId: user.id,
          userName: user.fullName,
          note: consultationNote
        }
      });
    }

    // Xử lý theo hành động
    switch (action) {
      case 'VERIFY_APPROVE':
        updateData.status = status || 'CHƯA THỰC HIỆN';
        break;
      case 'REJECT_TO_PHASE2':
        updateData.status = 'ĐANG CHỜ NHÓM 2 PHẢN HỒI';
        break;
      case 'CANCEL':
        updateData.status = 'ĐÃ HỦY';
        break;
      default:
        // Cho phép đổi trạng thái trực tiếp
        if (status && HOTLINE_STATUSES.includes(status)) {
          updateData.status = status;
        }
        break;
    }

    const [ticket] = await prisma.$transaction([
      prisma.hotlineTicket.update({
        where: { id },
        data: updateData,
        include: {
          createdBy: { select: { id: true, fullName: true, email: true, role: true } },
          handlerUser: { select: { id: true, fullName: true, email: true, role: true } },
          convertedOrder: { select: { id: true, pancakeOrderId: true, billFullName: true, adminStatus: true } }
        }
      }),
      prisma.hotlineTicketFeedbackHistory.create({
        data: {
          ticketId: id,
          userId: user.id,
          userName: user.fullName,
          action: action || 'STATUS_CHANGE',
          feedback: feedback || `Đổi trạng thái sang "${updateData.status || existing.status}"`
        }
      })
    ]);

    return res.json(ticket);
  } catch (error: any) {
    console.error('[verifyHotlineTicketPhase3] Error:', error);
    return res.status(500).json({ error: 'Lỗi xử lý Phase 3', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  DELETE /api/hotlines/:id - Xóa phiếu
// ═══════════════════════════════════════════════════

export async function deleteHotlineTicket(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!['ADMIN', 'DEV'].includes(user.role)) {
      return res.status(403).json({ error: 'Chỉ Admin/Dev được phép xóa phiếu' });
    }

    const id = req.params.id as string;
    await prisma.hotlineTicket.delete({ where: { id } });
    return res.json({ success: true, message: 'Đã xóa phiếu yêu cầu hotline' });
  } catch (error: any) {
    console.error('[deleteHotlineTicket] Error:', error);
    return res.status(500).json({ error: 'Lỗi xóa phiếu', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  GET /api/hotlines/handlers - Lấy DS User có role HOTLINE/ADMIN/COORDINATOR cho dropdown phân bổ
// ═══════════════════════════════════════════════════

export async function getHotlineHandlers(req: Request, res: Response) {
  try {
    const { team } = req.query;
    const where: any = { isActive: true };

    if (team) {
      // Map team name to role
      const teamRoleMap: Record<string, string> = {
        'Hotline': 'HOTLINE',
        'Coordinator': 'COORDINATOR',
        'Admin': 'ADMIN'
      };
      const role = teamRoleMap[String(team)] || String(team);
      where.role = role;
    } else {
      where.role = { in: ['HOTLINE', 'ADMIN', 'COORDINATOR'] };
    }

    const users = await prisma.user.findMany({
      where,
      select: { id: true, fullName: true, email: true, role: true, phoneNumber: true },
      orderBy: { fullName: 'asc' }
    });

    return res.json(users);
  } catch (error: any) {
    console.error('[getHotlineHandlers] Error:', error);
    return res.status(500).json({ error: 'Lỗi lấy danh sách người xử lý', details: error.message });
  }
}

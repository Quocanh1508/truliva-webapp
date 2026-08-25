import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import prisma from '../config/database';
import { broadcastEvent } from '../services/websocketService';

// ═══════════════════════════════════════════════════
//  HOTLINE TICKET STATUSES
// ═══════════════════════════════════════════════════
const HOTLINE_STATUSES = [
  'Chưa thực hiện',
  'Chưa liên hệ được khách',
  'Khách hẹn gọi lại sau',
  'Đang chờ nhóm 2 phản hồi',
  'Đã chuyển yêu cầu',
  'Đã hoàn thành',
  'Đã hủy',
  'Chờ xác thực'
];

// ═══════════════════════════════════════════════════
//  PHASE 1: Tìm kiếm lịch sử khách hàng
// ═══════════════════════════════════════════════════

/**
 * GET /api/hotlines/search-customer?q=... (hoặc phone=..., serial=...)
 * Tra cứu toàn bộ lịch sử KH theo Tên, Số điện thoại (chính/phụ) hoặc ID Sản phẩm / Serial
 */
export async function searchCustomerHistory(req: Request, res: Response) {
  try {
    const queryParam = (req.query.q || req.query.query || req.query.search || req.query.phone || req.query.serial || '').toString().trim();
    
    if (!queryParam || queryParam.length < 2) {
      return res.json({
        query: queryParam,
        customers: [],
        serials: [],
        orders: [],
        serviceOrders: [],
        hotlineTickets: []
      });
    }

    // 1. Tìm các SĐT & Serial liên quan từ tất cả các bảng
    const [dbCustomers, dbOrders, dbSerials, dbHotlineTickets] = await Promise.all([
      prisma.customer.findMany({
        where: {
          OR: [
            { phoneNumber: { contains: queryParam } },
            { fullName: { contains: queryParam, mode: 'insensitive' } }
          ]
        },
        take: 15
      }),
      prisma.order.findMany({
        where: {
          OR: [
            { billPhoneNumber: { contains: queryParam } },
            { billFullName: { contains: queryParam, mode: 'insensitive' } },
            { items: { some: { productName: { contains: queryParam, mode: 'insensitive' } } } }
          ]
        },
        select: { billPhoneNumber: true },
        take: 20
      }),
      prisma.serial.findMany({
        where: {
          OR: [
            { serialNumber: { contains: queryParam, mode: 'insensitive' } },
            { model: { contains: queryParam, mode: 'insensitive' } },
            { customerName: { contains: queryParam, mode: 'insensitive' } },
            { customerPhone: { contains: queryParam } }
          ]
        },
        select: { customerPhone: true, serialNumber: true },
        take: 20
      }),
      prisma.hotlineTicket.findMany({
        where: {
          OR: [
            { ticketCode: { contains: queryParam, mode: 'insensitive' } },
            { customerPhone: { contains: queryParam } },
            { secondaryPhones: { contains: queryParam } },
            { customerName: { contains: queryParam, mode: 'insensitive' } },
            { serialNumber: { contains: queryParam, mode: 'insensitive' } },
            { productName: { contains: queryParam, mode: 'insensitive' } }
          ]
        },
        select: { customerPhone: true, serialNumber: true },
        take: 20
      })
    ]);

    // Gom tập hợp SĐT & Serial tìm thấy
    const phoneSet = new Set<string>();
    const serialSet = new Set<string>();

    if (queryParam.length >= 3) {
      if (/^\d+$/.test(queryParam)) phoneSet.add(queryParam);
      serialSet.add(queryParam);
    }

    dbCustomers.forEach(c => {
      if (c.phoneNumber) phoneSet.add(c.phoneNumber.trim());
    });
    dbOrders.forEach(o => o.billPhoneNumber && phoneSet.add(o.billPhoneNumber.trim()));
    dbSerials.forEach(s => {
      if (s.customerPhone) phoneSet.add(s.customerPhone.trim());
      if (s.serialNumber) serialSet.add(s.serialNumber.trim());
    });
    dbHotlineTickets.forEach(h => {
      if (h.customerPhone) phoneSet.add(h.customerPhone.trim());
      if (h.serialNumber) serialSet.add(h.serialNumber.trim());
    });

    const matchedPhones = Array.from(phoneSet).filter(p => p.length >= 4);
    const matchedSerials = Array.from(serialSet).filter(s => s.length >= 3);

    // 2. Truy vấn chi tiết cả 4 nhóm thông tin
    const [finalCustomers, finalSerials, finalOrders, finalHotlineTickets] = await Promise.all([
      // A. Thông tin Khách hàng
      prisma.customer.findMany({
        where: {
          OR: [
            { phoneNumber: { in: matchedPhones.length > 0 ? matchedPhones : undefined } },
            { fullName: { contains: queryParam, mode: 'insensitive' } }
          ]
        },
        take: 10,
        orderBy: { updatedAt: 'desc' }
      }),

      // B. Danh sách Thiết bị / Serial
      prisma.serial.findMany({
        where: {
          OR: [
            { customerPhone: { in: matchedPhones.length > 0 ? matchedPhones : undefined } },
            { serialNumber: { in: matchedSerials.length > 0 ? matchedSerials : undefined } },
            { customerName: { contains: queryParam, mode: 'insensitive' } },
            { model: { contains: queryParam, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          serialNumber: true,
          model: true,
          productLine: true,
          customerName: true,
          customerPhone: true,
          address: true,
          province: true,
          status: true,
          activationDate: true,
          warrantyExpiryDate: true,
          customerConfirmationDate: true,
          activatedBy: true,
          createdAt: true
        },
        take: 20,
        orderBy: { createdAt: 'desc' }
      }),

      // C. Đơn yêu cầu dịch vụ (Service Orders / Báo cáo kĩ thuật)
      prisma.order.findMany({
        where: {
          OR: [
            { billPhoneNumber: { in: matchedPhones.length > 0 ? matchedPhones : undefined } },
            { billFullName: { contains: queryParam, mode: 'insensitive' } },
            { items: { some: { productName: { contains: queryParam, mode: 'insensitive' } } } }
          ]
        },
        select: {
          id: true,
          pancakeOrderId: true,
          billFullName: true,
          billPhoneNumber: true,
          shippingAddress: true,
          workType: true,
          adminStatus: true,
          assignedKtv: { select: { fullName: true } },
          createdAt: true,
          items: { select: { productName: true, quantity: true } },
          serviceReports: {
            select: {
              id: true,
              serviceType: true,
              serialNumber: true,
              notes: true,
              createdAt: true
            },
            take: 1
          }
        },
        take: 20,
        orderBy: { createdAt: 'desc' }
      }),

      // D. Yêu cầu Hotline (Hotline Tickets)
      prisma.hotlineTicket.findMany({
        where: {
          OR: [
            { customerPhone: { in: matchedPhones.length > 0 ? matchedPhones : undefined } },
            { secondaryPhones: { contains: queryParam } },
            { serialNumber: { in: matchedSerials.length > 0 ? matchedSerials : undefined } },
            { customerName: { contains: queryParam, mode: 'insensitive' } },
            { ticketCode: { contains: queryParam, mode: 'insensitive' } },
            { productName: { contains: queryParam, mode: 'insensitive' } }
          ]
        },
        select: {
          id: true,
          ticketCode: true,
          customerName: true,
          customerPhone: true,
          secondaryPhones: true,
          provinceName: true,
          address: true,
          productName: true,
          serialNumber: true,
          serviceRequestType: true,
          customerSupportDetail: true,
          status: true,
          source: true,
          targetTeam: true,
          requestTime: true,
          createdAt: true,
          handlerUser: { select: { id: true, fullName: true, role: true } }
        },
        take: 20,
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return res.json({
      query: queryParam,
      customers: finalCustomers,
      serials: finalSerials,
      orders: finalOrders,
      serviceOrders: finalOrders,
      hotlineTickets: finalHotlineTickets
    });
  } catch (error: any) {
    console.error('[searchCustomerHistory] Error:', error);
    return res.status(500).json({ error: 'Lỗi tra cứu lịch sử khách hàng', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  GET /api/hotlines/filter-options - Danh sách tùy chọn Bộ lọc
// ═══════════════════════════════════════════════════

export async function getHotlineFilterOptions(req: Request, res: Response) {
  try {
    const [
      dbStatuses,
      dbServiceRequestTypes,
      dbProductNames,
      dbPhase3RequestTypes,
      dbPhase3ServiceTypes,
      dbTargetTeams,
      creators,
      handlers,
      products
    ] = await Promise.all([
      prisma.hotlineTicket.findMany({ select: { status: true }, distinct: ['status'] }),
      prisma.hotlineTicket.findMany({ select: { serviceRequestType: true }, distinct: ['serviceRequestType'] }),
      prisma.hotlineTicket.findMany({ select: { productName: true }, distinct: ['productName'] }),
      prisma.hotlineTicket.findMany({ where: { phase3RequestType: { not: null } }, select: { phase3RequestType: true }, distinct: ['phase3RequestType'] }),
      prisma.hotlineTicket.findMany({ where: { phase3ServiceType: { not: null } }, select: { phase3ServiceType: true }, distinct: ['phase3ServiceType'] }),
      prisma.hotlineTicket.findMany({ select: { targetTeam: true }, distinct: ['targetTeam'] }),
      prisma.user.findMany({
        where: { hotlineTicketsCreated: { some: {} } },
        select: { id: true, fullName: true, email: true, role: true },
        orderBy: { fullName: 'asc' }
      }),
      prisma.user.findMany({
        where: {
          OR: [
            { hotlineTicketsHandled: { some: {} } },
            { role: { in: ['HOTLINE', 'ADMIN', 'COORDINATOR', 'DEV', 'STAFF', 'KTV'] } }
          ]
        },
        select: { id: true, fullName: true, email: true, role: true },
        orderBy: { fullName: 'asc' }
      }),
      prisma.product.findMany({
        where: { isActive: true },
        select: { name: true }
      })
    ]);

    // Standard preset lists merged with DB distinct values
    const standardStatuses = [
      'Chưa thực hiện',
      'Chưa liên hệ được khách',
      'Khách hẹn gọi lại sau',
      'Đang chờ nhóm 2 phản hồi',
      'Đã chuyển yêu cầu',
      'Đã hoàn thành',
      'Đã hủy',
      'Chờ xác thực'
    ];

    const normalizeStatus = (s: string) => {
      if (!s) return '';
      const lower = s.toLowerCase().trim();
      if (lower === 'chưa thực hiện') return 'Chưa thực hiện';
      if (lower === 'chưa liên hệ được khách') return 'Chưa liên hệ được khách';
      if (lower === 'khách hẹn gọi lại sau') return 'Khách hẹn gọi lại sau';
      if (lower === 'đang chờ nhóm 2 phản hồi') return 'Đang chờ nhóm 2 phản hồi';
      if (lower === 'đã chuyển yêu cầu') return 'Đã chuyển yêu cầu';
      if (lower === 'đã hoàn thành') return 'Đã hoàn thành';
      if (lower === 'đã hủy') return 'Đã hủy';
      if (lower === 'chờ xác thực') return 'Chờ xác thực';
      return s;
    };

    const statuses = Array.from(new Set([
      ...standardStatuses,
      ...dbStatuses.map(s => normalizeStatus(s.status)).filter(Boolean)
    ]));

    const standardServiceRequests = [
      'Bảo Hành - Bảo Trì',
      'Hướng dẫn sử dụng',
      'Lắp đặt',
      'Thay lõi lọc',
      'Tra cứu thông tin',
      'Tư vấn kỹ thuật',
      'Tư vấn sản phẩm',
      'Khác'
    ];
    const serviceRequestTypes = Array.from(new Set([...standardServiceRequests, ...dbServiceRequestTypes.map(s => s.serviceRequestType).filter(Boolean)]));

    const productNames = Array.from(new Set([
      ...products.map(p => p.name),
      ...dbProductNames.map(p => (p.productName || '').replace(/^PROD:\s*/i, '')).filter(Boolean)
    ]));

    const standardPhase3Requests = ['Bảo hành', 'Sửa chữa', 'Lắp đặt', 'Giao hàng', 'Thay lõi lọc', 'Hướng dẫn và Tư vấn'];
    const phase3RequestTypes = Array.from(new Set([...standardPhase3Requests, ...dbPhase3RequestTypes.map(p => p.phase3RequestType!).filter(Boolean)]));

    const phase3ServiceTypes = Array.from(new Set(dbPhase3ServiceTypes.map(p => p.phase3ServiceType!).filter(Boolean)));

    const standardTeams = ['Hotline', 'Coordinator', 'Admin'];
    const targetTeams = Array.from(new Set([...standardTeams, ...dbTargetTeams.map(t => t.targetTeam).filter(Boolean)]));

    return res.json({
      statuses,
      serviceRequestTypes,
      productNames,
      phase3RequestTypes,
      phase3ServiceTypes,
      targetTeams,
      creators,
      handlers
    });
  } catch (error: any) {
    console.error('[getHotlineFilterOptions] Error:', error);
    return res.status(500).json({ error: 'Lỗi lấy tùy chọn bộ lọc hotline', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  GET /api/hotlines - Danh sách Yêu cầu Hotline
// ═══════════════════════════════════════════════════

/**
 * Lấy danh sách phiếu Hotline kèm đếm badge và bộ lọc đầy đủ 10 tiêu chí
 */
export async function getHotlineTickets(req: Request, res: Response) {
  try {
    const { 
      status, 
      statuses,
      serviceRequestTypes,
      productNames,
      phase3RequestTypes,
      phase3ServiceTypes,
      targetTeams,
      creatorIds,
      handlerUserIds,
      requestStartDate,
      requestEndDate,
      handledStartDate,
      handledEndDate,
      search, 
      page = '1', 
      limit = '20',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page)));
    const limitNum = Math.min(100, Math.max(1, parseInt(String(limit))));
    const skip = (pageNum - 1) * limitNum;

    // Build where conditions
    const conditions: any[] = [];

    // 1. Trạng thái (status / statuses)
    const statusList = statuses 
      ? (typeof statuses === 'string' ? statuses.split(',') : (Array.isArray(statuses) ? statuses as string[] : []))
      : (status && String(status) !== 'ALL' ? [String(status)] : []);
    
    if (statusList.length > 0) {
      conditions.push({ status: { in: statusList } });
    }

    // 2. Yêu cầu dịch vụ (serviceRequestTypes)
    if (serviceRequestTypes) {
      const list = typeof serviceRequestTypes === 'string' ? serviceRequestTypes.split(',') : (Array.isArray(serviceRequestTypes) ? serviceRequestTypes as string[] : []);
      if (list.length > 0) {
        conditions.push({ serviceRequestType: { in: list } });
      }
    }

    // 3. Sản phẩm (productNames)
    if (productNames) {
      const list = typeof productNames === 'string' ? productNames.split(',') : (Array.isArray(productNames) ? productNames as string[] : []);
      if (list.length > 0) {
        const orProds: any[] = list.map(p => ({
          productName: { contains: p, mode: 'insensitive' }
        }));
        conditions.push({ OR: orProds });
      }
    }

    // 4. Loại yêu cầu (phase3RequestTypes)
    if (phase3RequestTypes) {
      const list = typeof phase3RequestTypes === 'string' ? phase3RequestTypes.split(',') : (Array.isArray(phase3RequestTypes) ? phase3RequestTypes as string[] : []);
      if (list.length > 0) {
        conditions.push({ phase3RequestType: { in: list } });
      }
    }

    // 5. Loại dịch vụ (phase3ServiceTypes)
    if (phase3ServiceTypes) {
      const list = typeof phase3ServiceTypes === 'string' ? phase3ServiceTypes.split(',') : (Array.isArray(phase3ServiceTypes) ? phase3ServiceTypes as string[] : []);
      if (list.length > 0) {
        conditions.push({ phase3ServiceType: { in: list } });
      }
    }

    // 6. Người gửi yêu cầu (creatorIds)
    if (creatorIds) {
      const list = typeof creatorIds === 'string' ? creatorIds.split(',') : (Array.isArray(creatorIds) ? creatorIds as string[] : []);
      if (list.length > 0) {
        conditions.push({ createdById: { in: list } });
      }
    }

    // 7. Thời gian gửi yêu cầu (requestStartDate, requestEndDate)
    if (requestStartDate || requestEndDate) {
      const dateCond: any = {};
      if (requestStartDate) {
        const d = new Date(String(requestStartDate));
        d.setHours(0, 0, 0, 0);
        dateCond.gte = d;
      }
      if (requestEndDate) {
        const d = new Date(String(requestEndDate));
        d.setHours(23, 59, 59, 999);
        dateCond.lte = d;
      }
      conditions.push({
        OR: [
          { requestTime: dateCond },
          { createdAt: dateCond }
        ]
      });
    }

    // 8. Team xử lý yêu cầu (targetTeams)
    if (targetTeams) {
      const list = typeof targetTeams === 'string' ? targetTeams.split(',') : (Array.isArray(targetTeams) ? targetTeams as string[] : []);
      if (list.length > 0) {
        conditions.push({ targetTeam: { in: list } });
      }
    }

    // 9. Người xử lý yêu cầu (handlerUserIds)
    if (handlerUserIds) {
      const list = typeof handlerUserIds === 'string' ? handlerUserIds.split(',') : (Array.isArray(handlerUserIds) ? handlerUserIds as string[] : []);
      if (list.length > 0) {
        const hasUnassigned = list.includes('null') || list.includes('unassigned');
        const actualIds = list.filter(id => id && id !== 'null' && id !== 'unassigned');
        if (hasUnassigned && actualIds.length > 0) {
          conditions.push({
            OR: [
              { handlerUserId: { in: actualIds } },
              { handlerUserId: null }
            ]
          });
        } else if (hasUnassigned) {
          conditions.push({ handlerUserId: null });
        } else {
          conditions.push({ handlerUserId: { in: actualIds } });
        }
      }
    }

    // 10. Thời gian xử lý yêu cầu (handledStartDate, handledEndDate)
    // Tức thời điểm chuyển trạng thái "Đã chuyển yêu cầu" hoặc thời điểm Lưu lại của các trạng thái khác (updatedAt / contactTime)
    if (handledStartDate || handledEndDate) {
      const dateCond: any = {};
      if (handledStartDate) {
        const d = new Date(String(handledStartDate));
        d.setHours(0, 0, 0, 0);
        dateCond.gte = d;
      }
      if (handledEndDate) {
        const d = new Date(String(handledEndDate));
        d.setHours(23, 59, 59, 999);
        dateCond.lte = d;
      }
      conditions.push({
        OR: [
          { contactTime: dateCond },
          { updatedAt: dateCond }
        ]
      });
    }

    // Search keyword
    if (search && String(search).trim()) {
      const s = String(search).trim();
      conditions.push({
        OR: [
          { ticketCode: { contains: s, mode: 'insensitive' } },
          { customerName: { contains: s, mode: 'insensitive' } },
          { customerPhone: { contains: s } },
          { secondaryPhones: { contains: s } },
          { address: { contains: s, mode: 'insensitive' } },
          { serialNumber: { contains: s, mode: 'insensitive' } },
          { customerSupportDetail: { contains: s, mode: 'insensitive' } },
          { consultationNote: { contains: s, mode: 'insensitive' } },
          { productName: { contains: s, mode: 'insensitive' } }
        ]
      });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    // Parallel: fetch tickets + count + status badges
    const [tickets, totalCount, statusCounts] = await Promise.all([
      prisma.hotlineTicket.findMany({
        where,
        include: {
          createdBy: { select: { id: true, fullName: true, email: true, role: true } },
          handlerUser: { select: { id: true, fullName: true, email: true, role: true } },
          convertedOrder: { select: { id: true, pancakeOrderId: true, billFullName: true, adminStatus: true } }
        },
        orderBy: { [String(sortBy)]: String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc' },
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

  const lastTicket = await prisma.hotlineTicket.findFirst({
    where: { ticketCode: { startsWith: prefix } },
    orderBy: { ticketCode: 'desc' },
    select: { ticketCode: true }
  });

  let seq = 1;
  if (lastTicket && lastTicket.ticketCode) {
    const lastSeq = parseInt(lastTicket.ticketCode.slice(-4));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${pad(seq, 4)}`;
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
        productName: (productName || '').replace(/^PROD:\s*/i, '').trim(),
        serialNumber: serialNumber || null,
        serviceRequestType,
        customerSupportDetail,
        attachmentUrls: attachmentUrls || [],
        createdById: user.id,
        targetTeam,
        // Mặc định: Người xử lý yêu cầu là người được nhóm 2 chọn, được phân bổ hoặc mặc định là người điền thông tin
        handlerUserId: handlerUserId || user.id,
        status: 'Chưa thực hiện'
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        handlerUser: { select: { id: true, fullName: true, email: true, role: true } }
      }
    });

    broadcastEvent('HOTLINE_TICKET_CREATED', ticket);
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
        ...(productName && { productName: productName.replace(/^PROD:\s*/i, '').trim() }),
        ...(serialNumber !== undefined && { serialNumber }),
        ...(serviceRequestType && { serviceRequestType }),
        ...(customerSupportDetail && { customerSupportDetail }),
        ...(attachmentUrls && { attachmentUrls }),
        ...(targetTeam && { targetTeam }),
        ...(handlerUserId !== undefined && { handlerUserId: handlerUserId || null }),
        // Nếu Phase 2 gửi lại sau khi bị trả về → chuyển lại trạng thái Chưa thực hiện
        ...(existing.status === 'ĐANG CHỜ NHÓM 2 PHẢN HỒI' && { status: 'Chưa thực hiện' })
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        handlerUser: { select: { id: true, fullName: true, email: true, role: true } }
      }
    });

    broadcastEvent('HOTLINE_TICKET_UPDATED', ticket);
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

    broadcastEvent('HOTLINE_TICKET_UPDATED', ticket);
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
    if (existing.status.toLowerCase() === 'đã chuyển yêu cầu') {
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

    // Tìm hoặc tự tạo hồ sơ Khách hàng tương ứng với SĐT
    let customerId: string | null = null;
    if (existing.customerPhone) {
      const cleanPhone = existing.customerPhone.trim();
      const foundCust = await prisma.customer.findFirst({
        where: { phoneNumber: cleanPhone }
      });
      if (foundCust) {
        customerId = foundCust.id;
      } else {
        const newCust = await prisma.customer.create({
          data: {
            fullName: existing.customerName || 'Khách hàng Hotline',
            phoneNumber: cleanPhone,
            address: existing.address || null,
            provinceName: existing.provinceName || null
          }
        });
        customerId = newCust.id;
      }
    }

    // Tạo Ca dịch vụ mới
    const [order, ticket] = await prisma.$transaction([
      prisma.order.create({
        data: {
          pancakeOrderId: newPancakeId,
          customerId,
          billFullName: existing.customerName,
          billPhoneNumber: existing.customerPhone,
          shippingAddress: addressParts,
          note: existing.consultationNote || existing.customerSupportDetail || null,
          adminStatus: 'chờ xử lý',
          workType: existing.serviceRequestType || null,
          pancakeCreatedAt: new Date(),
          rawData: { source: 'hotline', hotlineTicketId: existing.id, hotlineTicketCode: existing.ticketCode }
        }
      }),
      prisma.hotlineTicket.update({
        where: { id },
        data: {
          status: 'Đã chuyển yêu cầu',
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
      ...(action && { phase3Action: action }),
      // Lưu thông tin người xử lý ở nhóm 3 nếu phiếu chưa có người xử lý
      ...(!existing.handlerUserId && { handlerUserId: user.id })
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

    broadcastEvent('HOTLINE_TICKET_UPDATED', ticket);
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
    broadcastEvent('HOTLINE_TICKET_DELETED', { id });
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

    if (team && String(team) !== 'ALL') {
      const t = String(team).trim();
      const teamRoleMap: Record<string, any> = {
        'Hotline': {
          OR: [
            { role: 'HOTLINE' },
            { group: { contains: 'Hotline', mode: 'insensitive' } }
          ]
        },
        'Coordinator': {
          OR: [
            { role: 'COORDINATOR' },
            { group: { contains: 'Coordinator', mode: 'insensitive' } },
            { group: { contains: 'Điều phối', mode: 'insensitive' } }
          ]
        },
        'Admin': {
          OR: [
            { role: 'ADMIN' },
            { group: { contains: 'Admin', mode: 'insensitive' } }
          ]
        },
        'Kỹ thuật': {
          OR: [
            { role: 'KTV' },
            { group: { contains: 'Kỹ thuật', mode: 'insensitive' } }
          ]
        },
        'KTV': { role: 'KTV' },
        'Saler': { role: { in: ['SALER', 'SALE_SUPERVISOR'] } },
        'Sales': { role: { in: ['SALER', 'SALE_SUPERVISOR'] } }
      };

      const teamCondition = teamRoleMap[t];
      if (teamCondition) {
        Object.assign(where, teamCondition);
      } else {
        where.OR = [
          { role: { in: ['HOTLINE', 'ADMIN', 'COORDINATOR', 'STAFF', 'KTV', 'SALER', 'SALE_SUPERVISOR'] } },
          { group: { contains: t, mode: 'insensitive' } }
        ];
      }
    } else {
      where.role = { in: ['HOTLINE', 'ADMIN', 'COORDINATOR', 'STAFF', 'KTV', 'SALER', 'SALE_SUPERVISOR'] };
    }

    let users = await prisma.user.findMany({
      where,
      select: { id: true, fullName: true, email: true, role: true, phoneNumber: true, group: true },
      orderBy: { fullName: 'asc' }
    });

    // Fallback: Nếu team cụ thể chưa có thành viên nào trong DB, lấy Admin/Coordinator để không bị rỗng
    if (users.length === 0 && team && String(team) !== 'ALL') {
      users = await prisma.user.findMany({
        where: { isActive: true, role: { in: ['HOTLINE', 'ADMIN', 'COORDINATOR'] } },
        select: { id: true, fullName: true, email: true, role: true, phoneNumber: true, group: true },
        orderBy: { fullName: 'asc' }
      });
    }

    return res.json(users);
  } catch (error: any) {
    console.error('[getHotlineHandlers] Error:', error);
    return res.status(500).json({ error: 'Lỗi lấy danh sách người xử lý', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  POST /api/hotlines/public/create-support - Tạo ticket Hỗ trợ kỹ thuật Public từ Webapp
// ═══════════════════════════════════════════════════

export async function createPublicTechSupportTicket(req: Request, res: Response) {
  try {
    const {
      customerName, customerPhone, secondaryPhones, email,
      provinceName, address, productName, serialNumber,
      serviceRequestType, customerSupportDetail, attachmentUrls
    } = req.body;

    if (!customerName || !customerPhone || !provinceName || !address || !productName || !serviceRequestType || !customerSupportDetail) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ các trường bắt buộc (*)' });
    }

    // Tìm admin user làm người tạo mặc định cho ticket public từ Webapp
    const systemUser = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true }
    });

    if (!systemUser) {
      return res.status(500).json({ error: 'Hệ thống chưa thiết lập tài khoản Admin' });
    }

    // Sinh mã ticket HL YYYYMMDD XXXX
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `HL${todayStr}`;
    
    const lastTicket = await prisma.hotlineTicket.findFirst({
      where: { ticketCode: { startsWith: prefix } },
      orderBy: { ticketCode: 'desc' },
      select: { ticketCode: true }
    });

    let seq = 1;
    if (lastTicket && lastTicket.ticketCode) {
      const lastSeq = parseInt(lastTicket.ticketCode.slice(-4));
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const ticketCode = `${prefix}${seq.toString().padStart(4, '0')}`;

    const ticket = await prisma.hotlineTicket.create({
      data: {
        ticketCode,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        secondaryPhones: secondaryPhones ? secondaryPhones.trim() : null,
        email: email ? email.trim() : null,
        provinceName,
        address: address.trim(),
        source: 'Webapp (Hỗ trợ kỹ thuật)',
        channel: 'Webapp',
        productName: (productName || '').replace(/^PROD:\s*/i, '').trim(),
        serialNumber: serialNumber ? serialNumber.trim() : null,
        serviceRequestType,
        customerSupportDetail: customerSupportDetail.trim(),
        attachmentUrls: attachmentUrls || [],
        status: 'Chưa thực hiện',
        createdById: systemUser.id,
        targetTeam: 'Hotline'
      }
    });

    broadcastEvent('HOTLINE_TICKET_CREATED', ticket);

    return res.status(201).json({
      success: true,
      message: 'Gửi yêu cầu hỗ trợ kỹ thuật thành công. Bộ phận Hotline/Kỹ thuật sẽ liên hệ lại với bạn trong thời gian sớm nhất!',
      ticketCode: ticket.ticketCode
    });
  } catch (error: any) {
    console.error('[createPublicTechSupportTicket] Error:', error);
    return res.status(500).json({ error: 'Lỗi tạo yêu cầu hỗ trợ kỹ thuật', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  GET /api/hotlines/public/devices - Cây danh mục Sản phẩm/Thiết bị Public (Không gồm lõi lọc/linh kiện)
// ═══════════════════════════════════════════════════

export async function getPublicSupportDevices(req: Request, res: Response) {
  try {
    const allProducts = await prisma.product.findMany({
      select: { name: true, category: true, sku: true },
      orderBy: { name: 'asc' }
    });

    const EXCLUDE_PREFIXES = [
      '(N)', 'Biến áp', 'Bơm', 'Bộ GKK', 'Bộ dụng cụ', 'Bộ gia nhiệt', 'Bộ vòi',
      'Bộ lọc Casa', 'Bộ lọc Classic', 'Bộ lọc Excella', 'Bộ lọc nước',
      'Chảo', 'Cảm biến', 'Cụm van', 'Gói dịch vụ', 'Khay', 'Mạch', 'Nắp',
      'Nồi', 'Túi', 'Vali', 'Van', 'Vỏ', 'Đầu vòi', 'Ống', 'Bình', 'Combo', 'Giải pháp',
      'Vòi sen', 'Máy xay', 'Bếp điện', 'Truliva Trial'
    ];

    const filteredProducts = allProducts.filter(p => {
      const nameStr = (p.name || '').trim();
      const nameLower = nameStr.toLowerCase();
      const catLower = (p.category || '').toLowerCase();

      if (catLower.includes('lõi') || catLower.includes('loi') || catLower.includes('spare') || catLower.includes('phụ kiện') || catLower.includes('phu kien')) return false;
      if (nameLower.includes('lõi lọc') || nameLower.includes('loi loc') || nameLower.includes('thay lõi') || nameLower.includes('cto') || nameLower.includes('pp 5m')) return false;

      for (const prefix of EXCLUDE_PREFIXES) {
        if (nameStr.startsWith(prefix)) return false;
      }
      return true;
    });

    const DEVICE_CATEGORIES = [
      'Device',
      'Water CT Device',
      'Water UTS Device',
      'Water WM Device',
      'Air CT Device',
      'Prefilter',
      'Thiết bị khác'
    ];

    const productsList = filteredProducts.map(p => ({
      name: p.name.trim(),
      category: p.category || 'Device',
      sku: p.sku || ''
    }));

    // Thêm tùy chọn "Thiết bị khác"
    productsList.push({
      name: 'Thiết bị khác',
      category: 'Thiết bị khác',
      sku: 'OTHER'
    });

    return res.json({
      categories: DEVICE_CATEGORIES,
      products: productsList
    });
  } catch (error: any) {
    console.error('[getPublicSupportDevices] Error:', error);
    return res.status(500).json({ error: 'Lỗi lấy danh sách thiết bị', details: error.message });
  }
}

// ═══════════════════════════════════════════════════
//  GET /api/hotlines/export - Xuất Excel Danh Sách Hotline
// ═══════════════════════════════════════════════════

/**
 * Xuất file Excel danh sách phiếu Hotline theo bộ lọc hiện tại
 */
export async function exportHotlineTickets(req: Request, res: Response): Promise<void> {
  try {
    const { 
      status, 
      statuses,
      serviceRequestTypes,
      productNames,
      phase3RequestTypes,
      phase3ServiceTypes,
      targetTeams,
      creatorIds,
      handlerUserIds,
      requestStartDate,
      requestEndDate,
      handledStartDate,
      handledEndDate,
      search, 
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const conditions: any[] = [];

    // 1. Trạng thái
    const statusList = statuses 
      ? (typeof statuses === 'string' ? statuses.split(',') : (Array.isArray(statuses) ? statuses as string[] : []))
      : (status && String(status) !== 'ALL' ? [String(status)] : []);
    
    if (statusList.length > 0) {
      conditions.push({ status: { in: statusList } });
    }

    // 2. Yêu cầu dịch vụ
    if (serviceRequestTypes) {
      const list = typeof serviceRequestTypes === 'string' ? serviceRequestTypes.split(',') : (Array.isArray(serviceRequestTypes) ? serviceRequestTypes as string[] : []);
      if (list.length > 0) {
        conditions.push({ serviceRequestType: { in: list } });
      }
    }

    // 3. Sản phẩm
    if (productNames) {
      const list = typeof productNames === 'string' ? productNames.split(',') : (Array.isArray(productNames) ? productNames as string[] : []);
      if (list.length > 0) {
        const orProds: any[] = list.map(p => ({
          productName: { contains: p, mode: 'insensitive' }
        }));
        conditions.push({ OR: orProds });
      }
    }

    // 4. Loại yêu cầu
    if (phase3RequestTypes) {
      const list = typeof phase3RequestTypes === 'string' ? phase3RequestTypes.split(',') : (Array.isArray(phase3RequestTypes) ? phase3RequestTypes as string[] : []);
      if (list.length > 0) {
        conditions.push({ phase3RequestType: { in: list } });
      }
    }

    // 5. Loại dịch vụ
    if (phase3ServiceTypes) {
      const list = typeof phase3ServiceTypes === 'string' ? phase3ServiceTypes.split(',') : (Array.isArray(phase3ServiceTypes) ? phase3ServiceTypes as string[] : []);
      if (list.length > 0) {
        conditions.push({ phase3ServiceType: { in: list } });
      }
    }

    // 6. Người gửi yêu cầu
    if (creatorIds) {
      const list = typeof creatorIds === 'string' ? creatorIds.split(',') : (Array.isArray(creatorIds) ? creatorIds as string[] : []);
      if (list.length > 0) {
        conditions.push({ createdById: { in: list } });
      }
    }

    // 7. Thời gian gửi yêu cầu
    if (requestStartDate || requestEndDate) {
      const dateCond: any = {};
      if (requestStartDate) {
        const d = new Date(String(requestStartDate));
        d.setHours(0, 0, 0, 0);
        dateCond.gte = d;
      }
      if (requestEndDate) {
        const d = new Date(String(requestEndDate));
        d.setHours(23, 59, 59, 999);
        dateCond.lte = d;
      }
      conditions.push({
        OR: [
          { requestTime: dateCond },
          { createdAt: dateCond }
        ]
      });
    }

    // 8. Team xử lý yêu cầu
    if (targetTeams) {
      const list = typeof targetTeams === 'string' ? targetTeams.split(',') : (Array.isArray(targetTeams) ? targetTeams as string[] : []);
      if (list.length > 0) {
        conditions.push({ targetTeam: { in: list } });
      }
    }

    // 9. Người xử lý yêu cầu
    if (handlerUserIds) {
      const list = typeof handlerUserIds === 'string' ? handlerUserIds.split(',') : (Array.isArray(handlerUserIds) ? handlerUserIds as string[] : []);
      if (list.length > 0) {
        const hasUnassigned = list.includes('null') || list.includes('unassigned');
        const actualIds = list.filter(id => id && id !== 'null' && id !== 'unassigned');
        if (hasUnassigned && actualIds.length > 0) {
          conditions.push({
            OR: [
              { handlerUserId: { in: actualIds } },
              { handlerUserId: null }
            ]
          });
        } else if (hasUnassigned) {
          conditions.push({ handlerUserId: null });
        } else {
          conditions.push({ handlerUserId: { in: actualIds } });
        }
      }
    }

    // 10. Thời gian xử lý yêu cầu
    if (handledStartDate || handledEndDate) {
      const dateCond: any = {};
      if (handledStartDate) {
        const d = new Date(String(handledStartDate));
        d.setHours(0, 0, 0, 0);
        dateCond.gte = d;
      }
      if (handledEndDate) {
        const d = new Date(String(handledEndDate));
        d.setHours(23, 59, 59, 999);
        dateCond.lte = d;
      }
      conditions.push({
        OR: [
          { contactTime: dateCond },
          { updatedAt: dateCond }
        ]
      });
    }

    // Tìm kiếm text
    if (search && String(search).trim()) {
      const s = String(search).trim();
      conditions.push({
        OR: [
          { ticketCode: { contains: s, mode: 'insensitive' } },
          { customerName: { contains: s, mode: 'insensitive' } },
          { customerPhone: { contains: s } },
          { secondaryPhones: { contains: s } },
          { address: { contains: s, mode: 'insensitive' } },
          { serialNumber: { contains: s, mode: 'insensitive' } },
          { customerSupportDetail: { contains: s, mode: 'insensitive' } },
          { consultationNote: { contains: s, mode: 'insensitive' } },
          { productName: { contains: s, mode: 'insensitive' } }
        ]
      });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const tickets = await prisma.hotlineTicket.findMany({
      where,
      include: {
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        handlerUser: { select: { id: true, fullName: true, email: true, role: true } },
        convertedOrder: { select: { id: true, pancakeOrderId: true, billFullName: true, adminStatus: true } }
      },
      orderBy: { [String(sortBy)]: String(sortOrder).toLowerCase() === 'asc' ? 'asc' : 'desc' }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Danh sách Hotline');

    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Mã Ticket', key: 'ticketCode', width: 18 },
      { header: 'Khách hàng', key: 'customerName', width: 25 },
      { header: 'Số điện thoại', key: 'customerPhone', width: 16 },
      { header: 'SĐT phụ', key: 'secondaryPhones', width: 16 },
      { header: 'Tỉnh / Thành phố', key: 'provinceName', width: 20 },
      { header: 'Địa chỉ cụ thể', key: 'address', width: 35 },
      { header: 'Sản phẩm', key: 'productName', width: 30 },
      { header: 'Số Serial', key: 'serialNumber', width: 20 },
      { header: 'Yêu cầu dịch vụ', key: 'serviceRequestType', width: 22 },
      { header: 'Loại yêu cầu (P3)', key: 'phase3RequestType', width: 20 },
      { header: 'Loại dịch vụ (P3)', key: 'phase3ServiceType', width: 20 },
      { header: 'Linh kiện (P3)', key: 'sparePartName', width: 25 },
      { header: 'Nội dung KH yêu cầu', key: 'customerSupportDetail', width: 40 },
      { header: 'Ghi chú tư vấn (P2)', key: 'consultationNote', width: 35 },
      { header: 'Phản hồi P3', key: 'phase3Feedback', width: 35 },
      { header: 'Trạng thái', key: 'status', width: 20 },
      { header: 'Nguồn tiếp nhận', key: 'source', width: 20 },
      { header: 'Team xử lý', key: 'targetTeam', width: 18 },
      { header: 'Người xử lý', key: 'handlerUser', width: 22 },
      { header: 'Người tạo', key: 'createdBy', width: 22 },
      { header: 'Mã đơn chuyển đổi', key: 'convertedOrder', width: 20 },
      { header: 'Thời gian tạo', key: 'createdAt', width: 22 },
      { header: 'Thời gian liên hệ/xử lý', key: 'contactTime', width: 22 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B3A6B' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 28;

    const formatDateTime = (dateVal: any) => {
      if (!dateVal) return '';
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    tickets.forEach((t, idx) => {
      const row = worksheet.addRow({
        stt: idx + 1,
        ticketCode: t.ticketCode || '',
        customerName: t.customerName || '',
        customerPhone: t.customerPhone || '',
        secondaryPhones: t.secondaryPhones || '',
        provinceName: t.provinceName || '',
        address: t.address || '',
        productName: (t.productName || '').replace(/^PROD:\s*/i, ''),
        serialNumber: t.serialNumber || '',
        serviceRequestType: t.serviceRequestType || '',
        phase3RequestType: t.phase3RequestType || '',
        phase3ServiceType: t.phase3ServiceType || '',
        sparePartName: t.sparePartName || '',
        customerSupportDetail: t.customerSupportDetail || '',
        consultationNote: t.consultationNote || '',
        phase3Feedback: t.phase3Feedback || '',
        status: t.status || '',
        source: t.source || '',
        targetTeam: t.targetTeam || '',
        handlerUser: t.handlerUser?.fullName || '',
        createdBy: t.createdBy?.fullName || '',
        convertedOrder: t.convertedOrder?.pancakeOrderId ? `#${t.convertedOrder.pancakeOrderId}` : '',
        createdAt: formatDateTime(t.createdAt),
        contactTime: formatDateTime(t.contactTime || t.updatedAt),
      });

      row.getCell('stt').alignment = { horizontal: 'center' };
      row.getCell('ticketCode').alignment = { horizontal: 'center' };
      row.getCell('customerPhone').alignment = { horizontal: 'center' };
      row.getCell('status').alignment = { horizontal: 'center' };
      row.getCell('createdAt').alignment = { horizontal: 'center' };
      row.getCell('contactTime').alignment = { horizontal: 'center' };
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + encodeURIComponent(`Danh_sach_Yeu_cau_Hotline_${new Date().toISOString().slice(0,10)}.xlsx`)
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('[exportHotlineTickets] Error:', error);
    res.status(500).json({ error: 'Lỗi xuất file Excel yêu cầu Hotline', details: error.message });
  }
}



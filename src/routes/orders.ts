import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import { Prisma } from '@prisma/client';
import { syncOrderStatusToPancake, processOrderEvent } from '../services/orderProcessor';
import { syncRecentOrders } from '../services/orderSyncScheduler';
import { sendPushNotification } from '../services/notificationService';
import { sendWebPushNotification } from '../services/webPushService';
import { syncOrderInventoryState } from '../services/inventoryService';
import { broadcastEvent } from '../services/websocketService';
import ExcelJS from 'exceljs';
import axios from 'axios';

const router = Router();

// Helper to build IAM filter for orders
async function buildOrderFilter(user: any): Promise<Prisma.OrderWhereInput | null> {
  if (!user) return { id: 'none' };
  const { role, group, pancakeAccountName } = user;

  // ADMIN, DEV, COORDINATOR, HOTLINE, and STAFF in Service group see all orders
  if (
    role === 'ADMIN' ||
    role === 'DEV' ||
    role === 'COORDINATOR' ||
    role === 'HOTLINE' ||
    (role === 'STAFF' && group === 'Service')
  ) {
    return null;
  }

  // KTV: see only assigned and not completed/cancelled
  if (role === 'KTV') {
    return {
      assignedKtvId: user.id,
      OR: [
        { adminStatus: { notIn: ['hoàn thành', 'hủy đơn'] } },
        { adminStatus: null }
      ]
    };
  }

  // SALER or STAFF (e.g., Marketing group)
  if (role === 'SALER' || role === 'STAFF') {
    const creatorName = pancakeAccountName || '';
    const orConditions: Prisma.OrderWhereInput[] = [];
    // Cho phép xem đơn tự tạo bởi chính mình trên Truliva
    orConditions.push(
      { rawData: { path: ['creator', 'id'], equals: user.id } }
    );

    if (creatorName) {
      orConditions.push(
        { rawData: { path: ['creator', 'name'], equals: creatorName } },
        { rawData: { path: ['assigning_seller', 'name'], equals: creatorName } },
        { rawData: { path: ['assigning_care', 'name'], equals: creatorName } }
      );
    }

    // Lấy danh sách các đơn hàng thủ công do chính người dùng này tạo ra
    const createdManualLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'Order',
        action: 'created_manual',
        userId: user.id
      },
      select: {
        entityId: true
      }
    });
    const createdManualOrderIds = createdManualLogs.map(log => log.entityId);
    if (createdManualOrderIds.length > 0) {
      orConditions.push({
        id: { in: createdManualOrderIds }
      });
    }

    // eCom group sees shopee/lazada orders
    if (group && group.toLowerCase() === 'ecom') {
      orConditions.push(
        { orderSource: { contains: 'shopee', mode: 'insensitive' } },
        { orderSource: { contains: 'lazada', mode: 'insensitive' } },
        { orderSource: { contains: 'tiktok', mode: 'insensitive' } },
        { orderSource: { contains: 'tiki', mode: 'insensitive' } }
      );
    }

    if (orConditions.length === 0) {
      return { id: 'none' };
    }
    return { OR: orConditions };
  }

  // SALE_SUPERVISOR
  if (role === 'SALE_SUPERVISOR') {
    if (!group) return { id: 'none' };

    // Get all users in the same group
    const groupUsers = await prisma.user.findMany({
      where: { group: group, isActive: true },
      select: { id: true, pancakeAccountName: true }
    });
    const pancakeNames = groupUsers
      .map(u => u.pancakeAccountName?.trim())
      .filter(Boolean) as string[];

    const orConditions: Prisma.OrderWhereInput[] = [];
    if (pancakeNames.length > 0) {
      pancakeNames.forEach(name => {
        orConditions.push(
          { rawData: { path: ['creator', 'name'], equals: name } },
          { rawData: { path: ['assigning_seller', 'name'], equals: name } },
          { rawData: { path: ['assigning_care', 'name'], equals: name } }
        );
      });
    }

    // Lấy các đơn hàng thủ công do bất kỳ ai trong nhóm/group tạo
    const groupUserIds = groupUsers.map(u => u.id);
    const createdManualLogs = await prisma.auditLog.findMany({
      where: {
        entityType: 'Order',
        action: 'created_manual',
        userId: { in: groupUserIds }
      },
      select: {
        entityId: true
      }
    });
    const createdManualOrderIds = createdManualLogs.map(log => log.entityId);
    if (createdManualOrderIds.length > 0) {
      orConditions.push({
        id: { in: createdManualOrderIds }
      });
    }

    // eCom group sees shopee/lazada orders
    if (group.toLowerCase() === 'ecom') {
      orConditions.push(
        { orderSource: { contains: 'shopee', mode: 'insensitive' } },
        { orderSource: { contains: 'lazada', mode: 'insensitive' } },
        { orderSource: { contains: 'tiktok', mode: 'insensitive' } },
        { orderSource: { contains: 'tiki', mode: 'insensitive' } }
      );
    }

    if (orConditions.length === 0) {
      return { id: 'none' };
    }
    return { OR: orConditions };
  }

  return { id: 'none' };
}

/**
 * GET /api/orders
 * Lấy danh sách đơn hàng với hỗ trợ phân trang và bộ lọc/sắp xếp
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      page = '1', 
      limit = '50',
      sortBy = 'createdAt', // appointmentTime, createdAt, updatedAt
      sortOrder = 'desc',   // asc, desc
      status,               // custom adminStatus
      search,               // search theo tên, sdt, mã đơn
      startDate,
      endDate,
      adminStatuses,
      assignedKtvIds,
      workTypes,
      mainStationIds,
      customerName,
      customerPhone,
      pancakeOrderId,
      serviceTypes,
      productCategories,
      productNames,
      techStationIds,
      provinces,
      dateType
    } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    // Xây dựng điều kiện tìm kiếm
    const where: Prisma.OrderWhereInput = {};
    const conditions: Prisma.OrderWhereInput[] = [];

    // ── NGHIỆP VỤ: Lọc đơn hàng hiển thị ──────────────────────────────────────
    // Pancake POS gán statusCode = 0 cho các đơn hàng ở trạng thái NHÁP (chưa xác nhận).
    // Các đơn nháp này không nên hiển thị trong hệ thống vì chưa được Admin duyệt.
    //
    // Đơn hàng thủ công (tạo từ trang Admin trong Truliva, không qua Pancake POS)
    // được gán pancakeOrderId âm (< 0) để phân biệt. Các đơn này luôn được hiển thị
    // dù statusCode = 0 vì chúng không phải đơn nháp của Pancake.
    // ─────────────────────────────────────────────────────────────────────────────
    conditions.push({
      OR: [
        { statusCode: { not: 0 } },  // Đơn đã xác nhận từ Pancake POS
        { statusCode: null },          // Đơn không có statusCode (edge case cũ)
        { pancakeOrderId: { lt: 0 } } // Đơn thủ công (luôn hiện, bất kể statusCode)
      ]
    });
    
    const iamFilter = await buildOrderFilter(req.user);
    if (iamFilter) {
      conditions.push(iamFilter);
    }

    if (pancakeOrderId) {
      const parsedId = parseInt(pancakeOrderId as string, 10);
      if (!isNaN(parsedId)) {
        conditions.push({ pancakeOrderId: parsedId });
      }
    }

    if (customerName) {
      conditions.push({ billFullName: { contains: customerName as string, mode: 'insensitive' } });
    }

    if (customerPhone) {
      conditions.push({ billPhoneNumber: { contains: customerPhone as string } });
    }

    if (adminStatuses) {
      const statusesList = typeof adminStatuses === 'string' ? adminStatuses.split(',') : (Array.isArray(adminStatuses) ? adminStatuses as string[] : []);
      if (statusesList.length > 0) {
        // ── NGHIỆP VỤ: Ánh xạ trạng thái "chờ xử lý" ───────────────────────────
        // Khi một đơn hàng mới đồng bộ vào từ Pancake POS, cột adminStatus trong
        // Database được để NULL (chưa Admin gán trạng thái gì).
        // Về mặt UI và nghiệp vụ, NULL được hiểu là "chờ xử lý".
        // Do đó, khi user lọc theo "chờ xử lý", phải truy vấn cả hai:
        //   - adminStatus = 'chờ xử lý' (đơn thủ công đã set rõ)
        //   - adminStatus = null         (đơn từ Pancake mới vào, chưa được xử lý)
        // ─────────────────────────────────────────────────────────────────────────
        const hasPending = statusesList.includes('chờ xử lý');
        if (hasPending) {
          conditions.push({
            OR: [
              { adminStatus: { in: statusesList } },
              { adminStatus: null }
            ]
          });
        } else {
          conditions.push({ adminStatus: { in: statusesList } });
        }
      }
    } else if (status) {
      if (status === 'chờ xử lý') {
        // Xem giải thích trên: null trong DB = "chờ xử lý" trong UI
        conditions.push({
          OR: [
            { adminStatus: 'chờ xử lý' },
            { adminStatus: null }
          ]
        });
      } else {
        conditions.push({ adminStatus: status as string });
      }
    }

    if (assignedKtvIds) {
      const ktvIdsList = typeof assignedKtvIds === 'string' ? assignedKtvIds.split(',') : (Array.isArray(assignedKtvIds) ? assignedKtvIds as string[] : []);
      if (ktvIdsList.length > 0) {
        const hasNullKtv = ktvIdsList.includes('null') || ktvIdsList.includes('');
        const actualKtvIds = ktvIdsList.filter(id => id && id !== 'null');
        
        if (hasNullKtv && actualKtvIds.length > 0) {
          conditions.push({
            OR: [
              { assignedKtvId: { in: actualKtvIds } },
              { assignedKtvId: null }
            ]
          });
        } else if (hasNullKtv) {
          conditions.push({ assignedKtvId: null });
        } else {
          conditions.push({ assignedKtvId: { in: actualKtvIds } });
        }
      }
    }

    if (workTypes) {
      const workTypesList = typeof workTypes === 'string' ? workTypes.split(',') : (Array.isArray(workTypes) ? workTypes as string[] : []);
      if (workTypesList.length > 0) {
        const hasNullWorkType = workTypesList.includes('null') || workTypesList.includes('');
        const actualWorkTypes = workTypesList.filter(w => w && w !== 'null');
        
        if (hasNullWorkType && actualWorkTypes.length > 0) {
          conditions.push({
            OR: [
              { workType: { in: actualWorkTypes } },
              { workType: null }
            ]
          });
        } else if (hasNullWorkType) {
          conditions.push({ workType: null });
        } else {
          conditions.push({ workType: { in: actualWorkTypes } });
        }
      }
    }

    if (mainStationIds) {
      const mainStationIdsList = typeof mainStationIds === 'string' ? mainStationIds.split(',') : (Array.isArray(mainStationIds) ? mainStationIds as string[] : []);
      if (mainStationIdsList.length > 0) {
        const hasNullStation = mainStationIdsList.includes('null') || mainStationIdsList.includes('');
        const actualStationIds = mainStationIdsList.filter(id => id && id !== 'null');
        
        if (hasNullStation && actualStationIds.length > 0) {
          conditions.push({
            OR: [
              { mainStationId: { in: actualStationIds } },
              { mainStationId: null }
            ]
          });
        } else if (hasNullStation) {
          conditions.push({ mainStationId: null });
        } else {
          conditions.push({ mainStationId: { in: actualStationIds } });
        }
      }
    }

    if (startDate || endDate) {
      const dateCond: any = {};
      if (startDate) {
        dateCond.gte = new Date(startDate as string);
      }
      if (endDate) {
        dateCond.lte = new Date(endDate as string);
      }
      
      const type = (dateType as string) || 'createdAt';
      if (type === 'appointmentTime') {
        conditions.push({ appointmentTime: dateCond });
      } else if (type === 'completedAt') {
        conditions.push({ 
          adminStatus: 'hoàn thành',
          updatedAt: dateCond 
        });
      } else if (type === 'updatedAt') {
        conditions.push({ pancakeUpdatedAt: dateCond });
      } else {
        conditions.push({ pancakeCreatedAt: dateCond });
      }
    }

    if (serviceTypes) {
      const list = typeof serviceTypes === 'string' ? serviceTypes.split(',') : (Array.isArray(serviceTypes) ? serviceTypes as string[] : []);
      if (list.length > 0) {
        conditions.push({ serviceType: { in: list } });
      }
    }

    if (techStationIds) {
      const list = typeof techStationIds === 'string' ? techStationIds.split(',') : (Array.isArray(techStationIds) ? techStationIds as string[] : []);
      if (list.length > 0) {
        conditions.push({ techStationId: { in: list } });
      }
    }

    if (provinces) {
      const list = typeof provinces === 'string' ? provinces.split(',') : (Array.isArray(provinces) ? provinces as string[] : []);
      if (list.length > 0) {
        const orConds: Prisma.OrderWhereInput[] = list.map(prov => ({
          OR: [
            { customer: { provinceName: { contains: prov, mode: 'insensitive' } } },
            { shippingAddress: { path: ['province'], equals: prov } },
            { shippingAddress: { path: ['city'], equals: prov } },
            { shippingAddress: { path: ['province_name'], equals: prov } }
          ]
        }));
        conditions.push({ OR: orConds });
      }
    }

    if (productCategories) {
      const list = typeof productCategories === 'string' ? productCategories.split(',') : (Array.isArray(productCategories) ? productCategories as string[] : []);
      if (list.length > 0) {
        const matchedProducts = await prisma.product.findMany({
          where: { category: { in: list } },
          select: { sku: true, name: true }
        });
        const skus = matchedProducts.map(p => p.sku).filter(Boolean) as string[];
        const names = matchedProducts.map(p => p.name).filter(Boolean) as string[];
        
        conditions.push({
          items: {
            some: {
              OR: [
                { sku: { in: skus } },
                { productName: { in: names } }
              ]
            }
          }
        });
      }
    }

    if (productNames) {
      const list = typeof productNames === 'string' ? productNames.split(',') : (Array.isArray(productNames) ? productNames as string[] : []);
      if (list.length > 0) {
        conditions.push({
          items: {
            some: {
              productName: { in: list }
            }
          }
        });
      }
    }

    if (search) {
      const searchStr = String(search).trim();
      const searchOR: Prisma.OrderWhereInput[] = [
        { billFullName: { contains: searchStr, mode: 'insensitive' } },
        { billPhoneNumber: { contains: searchStr } },
        { note: { contains: searchStr, mode: 'insensitive' } },
        {
          shippingAddress: {
            path: ['full_address'],
            string_contains: searchStr
          }
        },
        {
          customer: {
            fullAddress: { contains: searchStr, mode: 'insensitive' }
          }
        },
        {
          rawData: {
            path: ['id'],
            equals: searchStr
          }
        },
        {
          serviceReports: {
            some: {
              serialNumber: { contains: searchStr, mode: 'insensitive' }
            }
          }
        }
      ];
      const pancakeId = parseInt(searchStr.replace(/^#/, ''), 10);
      const manualMatch = searchStr.match(/^m(\d+)$/i);
      const finalPancakeId = manualMatch ? -parseInt(manualMatch[1], 10) : pancakeId;
      
      const MAX_INT32 = 2147483647;
      const MIN_INT32 = -2147483648;
      if (!isNaN(finalPancakeId) && finalPancakeId <= MAX_INT32 && finalPancakeId >= MIN_INT32) {
        searchOR.push({ pancakeOrderId: finalPancakeId });
      }
      conditions.push({ OR: searchOR });
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }

    // Xây dựng điều kiện sắp xếp
    const orderBy: Prisma.OrderOrderByWithRelationInput = {};
    const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    if (sortBy === 'appointmentTime') {
      orderBy.appointmentTime = orderDirection;
    } else if (sortBy === 'updatedAt') {
      orderBy.updatedAt = orderDirection;
    } else {
      orderBy.pancakeCreatedAt = orderDirection;
    }

    // Build statsWhere ignoring adminStatus filter to show counts of all statuses matching other active filters
    const statsConditions = conditions.filter(cond => !('adminStatus' in cond));
    const statsWhere: Prisma.OrderWhereInput = statsConditions.length > 0 ? { AND: statsConditions } : {};

    const isKtv = req.user?.role === 'KTV';
    const findManyOptions: any = {
      where,
      orderBy,
      skip,
      take: limitNumber,
    };

    if (isKtv) {
      findManyOptions.select = {
        id: true,
        pancakeOrderId: true,
        customerId: true,
        statusCode: true,
        statusName: true,
        totalPrice: true,
        shippingFee: true,
        totalDiscount: true,
        totalQuantity: true,
        moneyToCollect: true,
        orderSource: true,
        orderSourceId: true,
        orderLink: true,
        checkoutLink: true,
        shippingAddress: true,
        warehouseInfo: true,
        billFullName: true,
        billPhoneNumber: true,
        note: true,
        partnerFee: true,
        feeMarketplace: true,
        pancakeCreatedAt: true,
        pancakeUpdatedAt: true,
        appointmentTime: true,
        adminStatus: true,
        assignedKtvId: true,
        workType: true,
        serviceType: true,
        mainStationId: true,
        techStationId: true,
        rescheduleReason: true,
        cancelReason: true,
        ktvCalledAt: true,
        warehouseId: true,
        pancakeSyncStatus: true,
        promoCode: true,
        rawData: true,
        createdAt: true,
        updatedAt: true,
        items: {
          select: {
            id: true,
            orderId: true,
            productName: true,
            sku: true,
            quantity: true,
            price: true,
            discount: true,
            variationInfo: true,
            createdAt: true,
          }
        },
        serials: {
          select: {
            id: true,
            serialNumber: true,
            status: true,
            activationDate: true,
            warrantyExpiryDate: true,
            customerConfirmationDate: true,
          }
        },
        customer: {
          select: {
            fullName: true,
            phoneNumber: true,
            fullAddress: true,
            provinceName: true,
            districtName: true,
          }
        },
        mainStation: {
          select: {
            name: true,
          }
        },
        techStation: {
          select: {
            name: true,
          }
        },
        assignedKtv: {
          select: {
            id: true,
            fullName: true,
            techStation: {
              select: {
                name: true,
                mainStation: {
                  select: {
                    name: true,
                  }
                }
              }
            }
          }
        },
        serviceReports: {
          select: {
            id: true,
            serialNumber: true,
            products: true,
            spareParts: true,
            workType: true,
            approvalStatus: true
          }
        }
      };
    } else {
      findManyOptions.include = {
        items: {
          select: {
            id: true,
            orderId: true,
            productName: true,
            sku: true,
            quantity: true,
            price: true,
            discount: true,
            variationInfo: true,
            createdAt: true,
          }
        },
        serials: {
          select: {
            id: true,
            serialNumber: true,
            status: true,
            activationDate: true,
            warrantyExpiryDate: true,
            customerConfirmationDate: true,
          }
        },
        customer: {
          select: {
            fullName: true,
            phoneNumber: true,
            fullAddress: true,
            provinceName: true,
            districtName: true,
          }
        },
        mainStation: {
          select: {
            name: true,
          }
        },
        techStation: {
          select: {
            name: true,
          }
        },
        assignedKtv: {
          select: {
            id: true,
            fullName: true,
            techStation: {
              select: {
                name: true,
                mainStation: {
                  select: {
                    name: true,
                  }
                }
              }
            }
          }
        },
        serviceReports: {
          select: {
            id: true,
            serialNumber: true,
            products: true,
            spareParts: true,
            workType: true,
            approvalStatus: true
          }
        }
      };
    }

    const [orders, total, statsResult] = await Promise.all([
      prisma.order.findMany(findManyOptions),
      prisma.order.count({ where }),
      prisma.order.groupBy({
        by: ['adminStatus'],
        where: statsWhere,
        _count: true
      })
    ]);

    let totalStatsCount = 0;
    let pendingCount = 0;
    let assignedCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let returnExchangeCount = 0;

    const returnExchangeStatuses = ['đang hoàn', 'đã hoàn', 'đang đổi', 'đã đổi', 'hoàn một phần'];

    statsResult.forEach(item => {
      const count = item._count;
      totalStatsCount += count;
      if (item.adminStatus === 'chờ xử lý' || !item.adminStatus) {
        pendingCount += count;
      } else if (item.adminStatus === 'đang thực hiện') {
        assignedCount += count;
      } else if (item.adminStatus === 'hoàn thành') {
        completedCount += count;
      } else if (item.adminStatus === 'hủy đơn') {
        cancelledCount += count;
      } else if (returnExchangeStatuses.includes(item.adminStatus || '')) {
        returnExchangeCount += count;
      } else {
        pendingCount += count;
      }
    });

    res.json({
      orders,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber)
      },
      stats: {
        total: totalStatsCount,
        pending: pendingCount,
        assigned: assignedCount,
        completed: completedCount,
        cancelled: cancelledCount,
        returnExchange: returnExchangeCount
      }
    });
  } catch (error: any) {
    logger.error('Get orders error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách đơn hàng' });
  }
});

/**
 * POST /api/orders
 * Tạo đơn hàng/dịch vụ thủ công (Cho phép các vai trò văn phòng có quyền điều chỉnh)
 */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    const group = req.user?.group;

    // Chặn các vai trò không có quyền điều chỉnh (KTV và STAFF Service)
    if (role === 'KTV' || (role === 'STAFF' && group === 'Service')) {
      res.status(403).json({ error: 'Bạn không có quyền tạo đơn hàng/ca dịch vụ.' });
      return;
    }

    const {
      customerName,
      customerPhone,
      address,
      province,
      workType,
      serviceType,
      appointmentTime,
      items,
      moneyToCollect,
      note,
      promoCode
    } = req.body;

    if (!customerName || !customerPhone) {
      res.status(400).json({ error: 'Tên khách hàng và số điện thoại là bắt buộc' });
      return;
    }

    // 1. Tìm hoặc tạo Customer
    let customerId: string;
    const cleanPhone = customerPhone.trim();
    const existingCustomer = await prisma.customer.findFirst({
      where: { phoneNumber: cleanPhone }
    });

    if (existingCustomer) {
      customerId = existingCustomer.id;
      // Cập nhật thông tin địa chỉ, tỉnh thành nếu chưa có hoặc có thay đổi
      const updateData: any = {};
      if (address && !existingCustomer.address) {
        updateData.address = address;
        updateData.fullAddress = address;
      }
      if (province && !existingCustomer.provinceName) {
        updateData.provinceName = province;
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.customer.update({
          where: { id: customerId },
          data: updateData
        });
      }
    } else {
      const newCustomer = await prisma.customer.create({
        data: {
          fullName: customerName.trim(),
          phoneNumber: cleanPhone,
          address: address || null,
          fullAddress: address || null,
          provinceName: province || null
        }
      });
      customerId = newCustomer.id;
    }

    // ── NGHIỆP VỤ: Hệ thống ID cho đơn hàng thủ công ───────────────────────────
    // Đơn hàng từ Pancake POS luôn có pancakeOrderId là số DƯƠNG (1, 2, 3, ...).
    // Đơn hàng thủ công (tạo từ Admin trong Truliva) được gán ID ÂM (-1, -2, -3, ...
    // để đảm bảo không bao giờ bị trùng với ID của Pancake POS.
    //
    // Quy tắc tự tăng: Tìm đơn thủ công có ID âm NHỎ NHẤT hiện tại (ví dụ: -5),
    // rồi lấy giá trị = ID_nhỏ_nhất - 1 (tức là -6) cho đơn mới tiếp theo.
    //
    // Trên UI, các ID âm này được format hiển thị bằng helper formatOrderId():
    //   -1 → "M1", -2 → "M2", ... (tiền tố "M" = Manual)
    // ─────────────────────────────────────────────────────────────────────────────
    const minOrder = await prisma.order.findFirst({
      where: { pancakeOrderId: { lt: 0 } },
      orderBy: { pancakeOrderId: 'asc' }, // 'asc' → số âm nhỏ nhất lên đầu
      select: { pancakeOrderId: true }
    });

    let nextManualId = -1; // ID mặc định cho đơn thủ công đầu tiên
    if (minOrder && minOrder.pancakeOrderId < 0) {
      nextManualId = minOrder.pancakeOrderId - 1; // Tiếp tục giảm dần: -1, -2, -3...
    }

    // 3. Tạo Order
    const apptDate = appointmentTime ? new Date(appointmentTime) : null;
    const totalQty = Array.isArray(items) ? items.reduce((acc: number, curr: any) => acc + (Number(curr.quantity) || 1), 0) : 0;
    const finalTotalPrice = Array.isArray(items) ? items.reduce((acc: number, curr: any) => acc + ((Number(curr.price) || 0) * (Number(curr.quantity) || 1)), 0) : 0;

    const order = await prisma.order.create({
      data: {
        pancakeOrderId: nextManualId,
        customerId,
        statusCode: 0,
        statusName: 'submitted',
        adminStatus: 'chờ xử lý',
        totalPrice: finalTotalPrice,
        totalQuantity: totalQty,
        moneyToCollect: moneyToCollect ? Number(moneyToCollect) : 0,
        workType: workType || null,
        serviceType: serviceType || null,
        appointmentTime: apptDate,
        note: note || null,
        shippingAddress: address ? { full_address: address } : undefined,
        billFullName: customerName,
        billPhoneNumber: cleanPhone,
        pancakeCreatedAt: new Date(),
        promoCode: promoCode || null,
        rawData: {
          creator: {
            id: req.user!.id,
            name: req.user!.fullName,
            role: req.user!.role
          }
        }
      }
    });

    // 4. Tạo OrderItem
    if (Array.isArray(items) && items.length > 0) {
      const itemsData = items.map((it: any) => ({
        orderId: order.id,
        productName: it.productName,
        sku: it.sku || null,
        quantity: it.quantity ? Number(it.quantity) : 1,
        price: it.price ? Number(it.price) : 0
      }));

      await prisma.orderItem.createMany({
        data: itemsData
      });
    }

    // 5. Ghi Audit Log
    await prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: order.id,
        action: 'created_manual',
        changes: [{ field: 'pancakeOrderId', from: null, to: nextManualId }],
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    // Tích hợp đồng bộ tồn kho cục bộ
    try {
      const createdOrderItems = await prisma.orderItem.findMany({
        where: { orderId: order.id }
      });
      await syncOrderInventoryState(order.id, null, {
        adminStatus: order.adminStatus,
        warehouseId: order.warehouseId,
        items: createdOrderItems.map(item => ({
          productName: item.productName || '',
          quantity: item.quantity || 1
        }))
      });
    } catch (invErr: any) {
      logger.error('Lỗi khấu trừ kho khi tạo đơn thủ công', { orderId: order.id, error: invErr.message });
    }

    logger.info('Manual order created by admin', { orderId: order.id, pancakeOrderId: nextManualId, creator: req.user?.fullName });
    broadcastEvent('ORDER_UPDATED', { orderId: order.id, pancakeOrderId: nextManualId });
    res.json({ success: true, orderId: order.id, pancakeOrderId: nextManualId });

  } catch (error: any) {
    logger.error('Create manual order error', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi tạo đơn hàng thủ công' });
  }
});

/**
 * GET /api/orders/export
 * Xuất Excel danh sách đơn hàng theo bộ lọc (Admin only)
 */
router.get('/export', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    const group = req.user?.group;
    const isAllowed = 
      role === 'ADMIN' ||
      role === 'DEV' ||
      role === 'COORDINATOR' ||
      (role === 'STAFF' && group === 'Service');

    if (!isAllowed) {
      res.status(403).json({ error: 'Bạn không có quyền xuất file Excel' });
      return;
    }
    const { 
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      search,
      startDate,
      endDate,
      adminStatuses,
      assignedKtvIds,
      workTypes,
      mainStationIds,
      customerName,
      customerPhone,
      pancakeOrderId,
      serviceTypes,
      productCategories,
      productNames,
      techStationIds,
      provinces,
      dateType
    } = req.query;

    const conditions: Prisma.OrderWhereInput[] = [];

    // Chỉ hiển thị các đơn hàng đã được xác nhận bên POS (ẩn các đơn nháp status = 0, luôn hiện đơn thủ công)
    conditions.push({
      OR: [
        { statusCode: { not: 0 } },
        { statusCode: null },
        { pancakeOrderId: { lt: 0 } }
      ]
    });

    if (pancakeOrderId) {
      const parsedId = parseInt(pancakeOrderId as string, 10);
      if (!isNaN(parsedId)) {
        conditions.push({ pancakeOrderId: parsedId });
      }
    }

    if (customerName) {
      conditions.push({ billFullName: { contains: customerName as string, mode: 'insensitive' } });
    }

    if (customerPhone) {
      conditions.push({ billPhoneNumber: { contains: customerPhone as string } });
    }

    if (adminStatuses) {
      const statusesList = typeof adminStatuses === 'string' ? adminStatuses.split(',') : (Array.isArray(adminStatuses) ? adminStatuses as string[] : []);
      if (statusesList.length > 0) {
        const hasPending = statusesList.includes('chờ xử lý');
        if (hasPending) {
          conditions.push({
            OR: [
              { adminStatus: { in: statusesList } },
              { adminStatus: null }
            ]
          });
        } else {
          conditions.push({ adminStatus: { in: statusesList } });
        }
      }
    } else if (status) {
      if (status === 'chờ xử lý') {
        conditions.push({
          OR: [
            { adminStatus: 'chờ xử lý' },
            { adminStatus: null }
          ]
        });
      } else {
        conditions.push({ adminStatus: status as string });
      }
    }

    if (assignedKtvIds) {
      const ktvIdsList = typeof assignedKtvIds === 'string' ? assignedKtvIds.split(',') : (Array.isArray(assignedKtvIds) ? assignedKtvIds as string[] : []);
      if (ktvIdsList.length > 0) {
        const hasNullKtv = ktvIdsList.includes('null') || ktvIdsList.includes('');
        const actualKtvIds = ktvIdsList.filter(id => id && id !== 'null');
        
        if (hasNullKtv && actualKtvIds.length > 0) {
          conditions.push({
            OR: [
              { assignedKtvId: { in: actualKtvIds } },
              { assignedKtvId: null }
            ]
          });
        } else if (hasNullKtv) {
          conditions.push({ assignedKtvId: null });
        } else {
          conditions.push({ assignedKtvId: { in: actualKtvIds } });
        }
      }
    }

    if (workTypes) {
      const workTypesList = typeof workTypes === 'string' ? workTypes.split(',') : (Array.isArray(workTypes) ? workTypes as string[] : []);
      if (workTypesList.length > 0) {
        const hasNullWorkType = workTypesList.includes('null') || workTypesList.includes('');
        const actualWorkTypes = workTypesList.filter(w => w && w !== 'null');
        
        if (hasNullWorkType && actualWorkTypes.length > 0) {
          conditions.push({
            OR: [
              { workType: { in: actualWorkTypes } },
              { workType: null }
            ]
          });
        } else if (hasNullWorkType) {
          conditions.push({ workType: null });
        } else {
          conditions.push({ workType: { in: actualWorkTypes } });
        }
      }
    }

    if (mainStationIds) {
      const mainStationIdsList = typeof mainStationIds === 'string' ? mainStationIds.split(',') : (Array.isArray(mainStationIds) ? mainStationIds as string[] : []);
      if (mainStationIdsList.length > 0) {
        const hasNullStation = mainStationIdsList.includes('null') || mainStationIdsList.includes('');
        const actualStationIds = mainStationIdsList.filter(id => id && id !== 'null');
        
        if (hasNullStation && actualStationIds.length > 0) {
          conditions.push({
            OR: [
              { mainStationId: { in: actualStationIds } },
              { mainStationId: null }
            ]
          });
        } else if (hasNullStation) {
          conditions.push({ mainStationId: null });
        } else {
          conditions.push({ mainStationId: { in: actualStationIds } });
        }
      }
    }

    if (startDate || endDate) {
      const dateCond: any = {};
      if (startDate) {
        dateCond.gte = new Date(startDate as string);
      }
      if (endDate) {
        dateCond.lte = new Date(endDate as string);
      }
      
      const type = (dateType as string) || 'createdAt';
      if (type === 'appointmentTime') {
        conditions.push({ appointmentTime: dateCond });
      } else if (type === 'completedAt') {
        conditions.push({ 
          adminStatus: 'hoàn thành',
          updatedAt: dateCond 
        });
      } else if (type === 'updatedAt') {
        conditions.push({ pancakeUpdatedAt: dateCond });
      } else {
        conditions.push({ pancakeCreatedAt: dateCond });
      }
    }

    if (serviceTypes) {
      const list = typeof serviceTypes === 'string' ? serviceTypes.split(',') : (Array.isArray(serviceTypes) ? serviceTypes as string[] : []);
      if (list.length > 0) {
        conditions.push({ serviceType: { in: list } });
      }
    }

    if (techStationIds) {
      const list = typeof techStationIds === 'string' ? techStationIds.split(',') : (Array.isArray(techStationIds) ? techStationIds as string[] : []);
      if (list.length > 0) {
        conditions.push({ techStationId: { in: list } });
      }
    }

    if (provinces) {
      const list = typeof provinces === 'string' ? provinces.split(',') : (Array.isArray(provinces) ? provinces as string[] : []);
      if (list.length > 0) {
        const orConds: Prisma.OrderWhereInput[] = list.map(prov => ({
          OR: [
            { customer: { provinceName: { contains: prov, mode: 'insensitive' } } },
            { shippingAddress: { path: ['province'], equals: prov } },
            { shippingAddress: { path: ['city'], equals: prov } },
            { shippingAddress: { path: ['province_name'], equals: prov } }
          ]
        }));
        conditions.push({ OR: orConds });
      }
    }

    if (productCategories) {
      const list = typeof productCategories === 'string' ? productCategories.split(',') : (Array.isArray(productCategories) ? productCategories as string[] : []);
      if (list.length > 0) {
        const matchedProducts = await prisma.product.findMany({
          where: { category: { in: list } },
          select: { sku: true, name: true }
        });
        const skus = matchedProducts.map(p => p.sku).filter(Boolean) as string[];
        const names = matchedProducts.map(p => p.name).filter(Boolean) as string[];
        
        conditions.push({
          items: {
            some: {
              OR: [
                { sku: { in: skus } },
                { productName: { in: names } }
              ]
            }
          }
        });
      }
    }

    if (productNames) {
      const list = typeof productNames === 'string' ? productNames.split(',') : (Array.isArray(productNames) ? productNames as string[] : []);
      if (list.length > 0) {
        conditions.push({
          items: {
            some: {
              productName: { in: list }
            }
          }
        });
      }
    }

    if (search) {
      const searchStr = String(search).trim();
      const searchOR: Prisma.OrderWhereInput[] = [
        { billFullName: { contains: searchStr, mode: 'insensitive' } },
        { billPhoneNumber: { contains: searchStr } },
        { note: { contains: searchStr, mode: 'insensitive' } },
        {
          shippingAddress: {
            path: ['full_address'],
            string_contains: searchStr
          }
        },
        {
          customer: {
            fullAddress: { contains: searchStr, mode: 'insensitive' }
          }
        },
        {
          rawData: {
            path: ['id'],
            equals: searchStr
          }
        }
      ];
      const pancakeId = parseInt(searchStr, 10);
      if (!isNaN(pancakeId)) {
        searchOR.push({ pancakeOrderId: pancakeId });
      }
      conditions.push({ OR: searchOR });
    }

    const where: Prisma.OrderWhereInput = {};
    if (conditions.length > 0) {
      where.AND = conditions;
    }

    const orderBy: Prisma.OrderOrderByWithRelationInput = {};
    const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    
    if (sortBy === 'appointmentTime') {
      orderBy.appointmentTime = orderDirection;
    } else if (sortBy === 'updatedAt') {
      orderBy.updatedAt = orderDirection;
    } else {
      orderBy.pancakeCreatedAt = orderDirection;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy,
      select: {
        pancakeOrderId: true,
        billFullName: true,
        billPhoneNumber: true,
        adminStatus: true,
        workType: true,
        serviceType: true,
        moneyToCollect: true,
        appointmentTime: true,
        createdAt: true,
        updatedAt: true,
        note: true,
        rescheduleReason: true,
        cancelReason: true,
        shippingAddress: true,
        items: {
          select: {
            productName: true
          }
        },
        customer: {
          select: {
            fullName: true,
            phoneNumber: true,
            fullAddress: true,
            provinceName: true,
            districtName: true,
          }
        },
        mainStation: {
          select: {
            name: true,
          }
        },
        techStation: {
          select: {
            name: true,
          }
        },
        assignedKtv: {
          select: {
            fullName: true,
          }
        }
      }
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Danh sách Đơn hàng');

    sheet.columns = [
      { header: 'Mã đơn Pancake', key: 'pancakeOrderId', width: 18 },
      { header: 'Họ tên khách hàng', key: 'customerName', width: 25 },
      { header: 'Số điện thoại', key: 'customerPhone', width: 18 },
      { header: 'Địa chỉ chi tiết', key: 'address', width: 35 },
      { header: 'Trạng thái xử lý', key: 'adminStatus', width: 18 },
      { header: 'Loại công việc', key: 'workType', width: 22 },
      { header: 'Loại dịch vụ chi tiết', key: 'serviceType', width: 25 },
      { header: 'Danh sách sản phẩm', key: 'products', width: 35 },
      { header: 'Tiền cần thu (COD)', key: 'moneyToCollect', width: 20 },
      { header: 'Trạm chính', key: 'mainStation', width: 20 },
      { header: 'Trạm kỹ thuật', key: 'techStation', width: 20 },
      { header: 'Kỹ thuật viên gán', key: 'ktv', width: 22 },
      { header: 'Thời gian hẹn khách', key: 'appointmentTime', width: 22 },
      { header: 'Ngày tạo hệ thống', key: 'createdAt', width: 22 },
      { header: 'Ngày cập nhật cuối', key: 'updatedAt', width: 22 },
      { header: 'Ghi chú', key: 'note', width: 30 },
      { header: 'Lý do hẹn lại', key: 'rescheduleReason', width: 25 },
      { header: 'Lý do hủy đơn', key: 'cancelReason', width: 25 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };

    orders.forEach((o: any) => {
      const customerName = o.billFullName || o.customer?.fullName || 'Khách lẻ';
      const phone = o.billPhoneNumber || o.customer?.phoneNumber || '';
      const address = o.shippingAddress?.full_address || o.customer?.fullAddress || '';
      const productsList = o.items.map((i: any) => i.productName).join(', ');

      sheet.addRow({
        pancakeOrderId: o.pancakeOrderId < 0 ? `M${Math.abs(o.pancakeOrderId)}` : o.pancakeOrderId,
        customerName,
        customerPhone: phone,
        address,
        adminStatus: o.adminStatus || 'chờ xử lý',
        workType: o.workType || '',
        serviceType: o.serviceType || '',
        products: productsList,
        moneyToCollect: o.moneyToCollect ?? 0,
        mainStation: o.mainStation?.name || '',
        techStation: o.techStation?.name || '',
        ktv: o.assignedKtv?.fullName || '',
        appointmentTime: o.appointmentTime ? new Date(o.appointmentTime).toLocaleString('vi-VN') : '',
        createdAt: o.pancakeCreatedAt ? new Date(o.pancakeCreatedAt).toLocaleString('vi-VN') : new Date(o.createdAt).toLocaleString('vi-VN'),
        updatedAt: o.updatedAt ? new Date(o.updatedAt).toLocaleString('vi-VN') : '',
        note: o.note || '',
        rescheduleReason: o.rescheduleReason || '',
        cancelReason: o.cancelReason || '',
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=danh_sach_don_hang_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Export orders error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xuất file Excel' });
  }
});

/**
 * GET /api/orders/filters-data
 * Lấy danh sách các dữ liệu phục vụ bộ lọc
 */
router.get('/filters-data', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const [products, stations, customers] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true },
        select: { name: true, category: true }
      }),
      prisma.techStation.findMany({
        where: { isActive: true },
        select: { id: true, name: true }
      }),
      prisma.customer.findMany({
        where: { provinceName: { not: null } },
        select: { provinceName: true },
        distinct: ['provinceName']
      })
    ]);

    const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
    const productNames = Array.from(new Set(products.map(p => p.name).filter(Boolean))) as string[];
    const provinces = Array.from(new Set(customers.map(c => c.provinceName).filter(Boolean))) as string[];

    res.json({
      categories,
      productNames,
      products: products.map(p => ({ name: p.name, category: p.category })),
      techStations: stations,
      provinces
    });
  } catch (error: any) {
    logger.error('Get filters data error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu bộ lọc' });
  }
});

/**
 * GET /api/orders/customers/search
 * Tìm kiếm khách hàng theo số điện thoại để gợi ý auto-fill
 */
router.get('/customers/search', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.query;
    if (!phone || typeof phone !== 'string') {
      res.json([]);
      return;
    }
    const cleanPhone = phone.trim();
    if (cleanPhone.length < 3) {
      res.json([]);
      return;
    }
    const customers = await prisma.customer.findMany({
      where: {
        phoneNumber: {
          contains: cleanPhone,
        }
      },
      take: 10,
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        address: true,
        fullAddress: true,
        provinceName: true,
        districtName: true,
        communeName: true,
        provinceId: true,
        districtId: true,
        communeId: true,
      }
    });
    res.json(customers);
  } catch (error: any) {
    logger.error('Search customers error', { error: error.message });
    res.status(500).json({ error: 'Lỗi tìm kiếm thông tin khách hàng' });
  }
});

/**
 * GET /api/orders/:id
 * Lấy chi tiết một đơn hàng
 */
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const order = await prisma.order.findUnique({
      where: { id: id as string },
      include: {
        items: true,
        customer: true,
        assignedKtv: {
          select: {
            id: true,
            fullName: true
          }
        },
        mainStation: true,
        techStation: true,
        serials: true
      }
    });

    if (!order) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }

    res.json(order);
  } catch (error: any) {
    logger.error('Get order detail error', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Lỗi lấy chi tiết đơn hàng' });
  }
});

/**
 * GET /api/orders/:id/audit
 * Lấy lịch sử thay đổi của 1 đơn hàng
 */
router.get('/:id/audit', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'Order', entityId: req.params.id as string },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json(logs);
  } catch (error: any) {
    logger.error('Get audit log error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy lịch sử' });
  }
});

/**
 * POST /api/orders/:id/call-customer
 * KTV nhấn nút "Gọi khách hàng" → ghi nhận mốc thời gian
 * Chỉ KTV được phân công đơn mới có quyền gọi
 */
router.post('/:id/call-customer', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    // Tìm đơn hàng
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }

    // Chỉ KTV được phân công mới được gọi
    if (req.user?.role === 'KTV' && order.assignedKtvId !== req.user.id) {
      res.status(403).json({ error: 'Bạn không được phân công đơn hàng này' });
      return;
    }

    // Cập nhật thời gian gọi khách (luôn update theo lần nhấn cuối)
    const now = new Date();
    const updated = await prisma.order.update({
      where: { id },
      data: { ktvCalledAt: now },
    });

    logger.info('KTV called customer', { orderId: id, ktvId: req.user?.id, calledAt: now.toISOString() });
    res.json({ ktvCalledAt: updated.ktvCalledAt });
  } catch (error: any) {
    logger.error('Call customer error', { error: error.message });
    res.status(500).json({ error: 'Lỗi ghi nhận gọi khách' });
  }
});

/**
 * POST /api/orders/:id/reschedule
 * KTV yêu cầu hẹn lại lịch làm việc với khách hàng:
 * - Cập nhật appointmentTime mới
 * - Cập nhật lý do hẹn lại rescheduleReason
 * - Trạng thái chuyển về "chờ xử lý"
 * - Thu hồi phân bổ assignedKtvId = null (trả ca về cho Admin)
 * - Tạo Audit Log ghi nhận hành động hẹn lại
 */
router.post('/:id/reschedule', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { appointmentTime, rescheduleReason } = req.body;

    if (!appointmentTime || !rescheduleReason) {
      res.status(400).json({ error: 'Thiếu thời gian hẹn mới hoặc lý do hẹn lại' });
      return;
    }

    // Tìm đơn hàng
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }

    // Chỉ KTV được phân công đơn mới được hẹn lại
    if (req.user?.role === 'KTV' && order.assignedKtvId !== req.user.id) {
      res.status(403).json({ error: 'Bạn không được phân công đơn hàng này' });
      return;
    }

    const newApptTime = new Date(appointmentTime);

    // Cập nhật đơn hàng
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: {
        appointmentTime: newApptTime,
        rescheduleReason: rescheduleReason,
        adminStatus: 'chờ xử lý',
        assignedKtvId: null,
      },
    });

    // Ghi nhận Audit Log
    const changes = [
      { field: 'appointmentTime', from: order.appointmentTime, to: newApptTime },
      { field: 'rescheduleReason', from: order.rescheduleReason, to: rescheduleReason },
      { field: 'adminStatus', from: order.adminStatus, to: 'chờ xử lý' },
      { field: 'assignedKtvId', from: order.assignedKtvId, to: null },
    ];

    await prisma.auditLog.create({
      data: {
        entityType: 'Order',
        entityId: id,
        action: 'rescheduled',
        changes,
        userId: req.user!.id,
        userName: req.user!.fullName,
      },
    });

    logger.info('Order rescheduled by KTV', { orderId: id, ktvId: req.user?.id, newTime: newApptTime, reason: rescheduleReason });
    res.json({ success: true, message: 'Đã hẹn lại lịch và trả đơn hàng về Admin xử lý.', order: updatedOrder });
  } catch (error: any) {
    logger.error('Reschedule order error', { error: error.message });
    res.status(500).json({ error: 'Lỗi ghi nhận hẹn lại lịch làm việc' });
  }
});


/**
 * PATCH /api/orders/:id
 * Cập nhật đơn hàng (trạng thái, phân công, loại CV, trạm, hủy/khôi phục...)
 */
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    const group = req.user?.group;

    // Check permission to modify orders
    if (role === 'KTV' || (role === 'STAFF' && group === 'Service')) {
      res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa đơn hàng' });
      return;
    }

    const id = req.params.id as string;
    const {
      adminStatus, appointmentTime, assignedKtvId,
      workType, serviceType, mainStationId, techStationId,
      rescheduleReason, cancelReason, note, warehouseId,
      items, customerName, customerPhone, address, province, moneyToCollect,
      promoCode
    } = req.body;

    // Lấy order hiện tại để so sánh cho audit và đồng bộ kho
    const oldOrder = await prisma.order.findUnique({
      where: { id },
      include: { items: true }
    });
    if (!oldOrder) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
    }

    // Kiểm tra phân quyền chỉnh sửa cho đơn hàng tự tạo (manual order)
    const isManualOrder = oldOrder.pancakeOrderId < 0;
    if (isManualOrder) {
      const hasPrivilegedRole = role === 'ADMIN' || role === 'DEV' || role === 'COORDINATOR';
      if (!hasPrivilegedRole) {
        const creationLog = await prisma.auditLog.findFirst({
          where: {
            entityType: 'Order',
            entityId: id,
            action: 'created_manual'
          },
          select: {
            userId: true
          }
        });
        const isCreator = creationLog && creationLog.userId === req.user?.id;
        if (!isCreator) {
          res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa đơn hàng tự tạo này' });
          return;
        }
      }
    }

    // Check IAM permission: user can only modify orders they can see
    const iamFilter = await buildOrderFilter(req.user);
    if (iamFilter) {
      const accessibleOrder = await prisma.order.findFirst({
        where: { id, ...iamFilter }
      });
      if (!accessibleOrder) {
        res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa đơn hàng này' });
        return;
      }
    }

    const updateData: any = {};
    const changes: any[] = [];

    if (warehouseId !== undefined && warehouseId !== oldOrder.warehouseId) {
      const apiKey = process.env.PANCAKE_API_KEY;
      const shopId = '1635300067';
      if (!apiKey) {
        res.status(500).json({ error: 'Thiếu cấu hình PANCAKE_API_KEY trên máy chủ.' });
        return;
      }

      // Xác định xem đơn hàng thuộc diện không trừ kho hay không (Lắp đặt hoặc không có sản phẩm ban đầu)
      const isInstallation = (workType || oldOrder.workType) === 'Lắp đặt';
      let originallyHasProducts = false;
      if (oldOrder.rawData) {
        try {
          const raw = typeof oldOrder.rawData === 'string' ? JSON.parse(oldOrder.rawData) : oldOrder.rawData;
          const itemsList = raw.items || raw.order_items || [];
          originallyHasProducts = Array.isArray(itemsList) && itemsList.length > 0;
        } catch (e) {
          originallyHasProducts = false;
        }
      }

      const isManualOrder = oldOrder.pancakeOrderId < 0;
      const shouldSyncWarehouseToPancake = !isInstallation && originallyHasProducts && !isManualOrder;

      try {
        let warehouseName = 'Kho hàng';
        try {
          const whResponse = await axios.get(`https://pos.pages.fm/api/v1/shops/${shopId}/warehouses`, {
            params: { api_key: apiKey },
            timeout: 5000
          });
          const whs = whResponse.data?.data || whResponse.data?.warehouses || [];
          const matchedWh = whs.find((w: any) => String(w.id) === String(warehouseId));
          if (matchedWh) {
            warehouseName = matchedWh.name;
          }
        } catch (whErr) {
          logger.warn('Failed to fetch warehouse name from Pancake POS API, using default name', whErr);
        }

        if (shouldSyncWarehouseToPancake && warehouseId) {
          logger.info('Syncing warehouse change to Pancake POS', { pancakeOrderId: oldOrder.pancakeOrderId, warehouseId });
          const updateResponse = await axios.patch(
            `https://pos.pages.fm/api/v1/shops/${shopId}/orders/${oldOrder.pancakeOrderId}`,
            {
              warehouse_id: warehouseId
            },
            {
              params: { api_key: apiKey },
              headers: { 'Content-Type': 'application/json' },
              timeout: 10000
            }
          );

          if (!updateResponse.data || !updateResponse.data.success) {
            throw new Error(updateResponse.data?.message || 'Yêu cầu đổi kho thất bại trên Pancake POS');
          }
        } else {
          logger.info('Bypassed syncing warehouse change to Pancake POS (not deducting inventory)', {
            pancakeOrderId: oldOrder.pancakeOrderId,
            warehouseId,
            reason: isInstallation ? 'Installation order' : (isManualOrder ? 'Manual order' : 'No original products')
          });
        }

        updateData.warehouseId = warehouseId;
        updateData.warehouseInfo = { id: warehouseId, name: warehouseName };
        updateData.pancakeSyncStatus = 'SUCCESS';

        changes.push({ field: 'warehouseId', from: oldOrder.warehouseId, to: warehouseId });
        changes.push({ field: 'warehouseInfo', from: oldOrder.warehouseInfo, to: updateData.warehouseInfo });
      } catch (err: any) {
        logger.error('Failed to sync warehouse update to Pancake POS API', { error: err.message });
        const errorMsg = err.response?.data?.message || err.message || 'Lỗi không xác định từ Pancake POS';
        res.status(400).json({ error: `Không thể đồng bộ thay đổi kho xuất hàng sang Pancake: ${errorMsg}` });
        return;
      }
    }

    if (adminStatus !== undefined && adminStatus !== oldOrder.adminStatus) {
      try {
        await syncOrderStatusToPancake(oldOrder.pancakeOrderId, adminStatus);
        updateData.pancakeSyncStatus = 'SUCCESS';
      } catch (err: any) {
        logger.warn('Failed to sync status update to Pancake POS API (non-blocking)', { 
          pancakeOrderId: oldOrder.pancakeOrderId,
          error: err.message,
          response: err.response?.data
        });
        
        updateData.pancakeSyncStatus = 'FAILED';
        
        const errorMsg = err.response?.data?.message || err.response?.data?.errors?.order || err.message || 'Lỗi không xác định từ Pancake POS';
        const isTransitionError = err.response?.status === 422;
        
        if (isTransitionError) {
          (req as any).pancakeSyncWarning = `Đơn hàng trên Pancake POS đang ở trạng thái đã Hủy hoặc đã Hoàn thành, do đó API Pancake không cho phép tự động khôi phục ngược về 'Đã xác nhận'. Trạng thái trên Truliva vẫn được cập nhật thành công.`;
        } else {
          (req as any).pancakeSyncWarning = `Đã cập nhật trạng thái trên Truliva, nhưng không thể đồng bộ sang Pancake POS: ${errorMsg}.`;
        }
      }
    }

    // Helper ghi nhận thay đổi
    const track = (field: string, newVal: any) => {
      const oldVal = (oldOrder as any)[field];
      if (newVal !== undefined && newVal !== oldVal) {
        updateData[field] = newVal;
        changes.push({ field, from: oldVal, to: newVal });
      }
    };

    track('adminStatus', adminStatus);
    track('workType', workType);
    track('serviceType', serviceType);
    track('mainStationId', mainStationId || null);
    track('techStationId', techStationId || null);
    track('rescheduleReason', rescheduleReason);
    track('cancelReason', cancelReason);
    track('note', note);
    track('promoCode', promoCode || null);

    if (assignedKtvId !== undefined) {
      const val = assignedKtvId || null;
      track('assignedKtvId', val);
    }

    if (appointmentTime !== undefined) {
      const val = appointmentTime ? new Date(appointmentTime) : null;
      updateData.appointmentTime = val;
      if (String(val) !== String(oldOrder.appointmentTime)) {
        changes.push({ field: 'appointmentTime', from: oldOrder.appointmentTime, to: val });
      }
    }

    // Support modifying customer info for manual orders (pancakeOrderId < 0)
    if (oldOrder.pancakeOrderId < 0) {
      if (customerPhone !== undefined || customerName !== undefined) {
        const phoneToUse = customerPhone !== undefined ? customerPhone.trim() : oldOrder.billPhoneNumber;
        const nameToUse = customerName !== undefined ? customerName.trim() : oldOrder.billFullName;
        
        let customerId = oldOrder.customerId;
        if (phoneToUse) {
          const existingCustomer = await prisma.customer.findFirst({
            where: { phoneNumber: phoneToUse }
          });
          if (existingCustomer) {
            customerId = existingCustomer.id;
            const customerUpdate: any = {};
            if (address && !existingCustomer.address) {
              customerUpdate.address = address;
              customerUpdate.fullAddress = address;
            }
            if (province && !existingCustomer.provinceName) {
              customerUpdate.provinceName = province;
            }
            if (Object.keys(customerUpdate).length > 0) {
              await prisma.customer.update({
                where: { id: customerId },
                data: customerUpdate
              });
            }
          } else {
            const newCustomer = await prisma.customer.create({
              data: {
                fullName: nameToUse || 'Khách hàng',
                phoneNumber: phoneToUse,
                address: address || null,
                fullAddress: address || null,
                provinceName: province || null
              }
            });
            customerId = newCustomer.id;
          }
        }
        
        if (customerId !== oldOrder.customerId) {
          updateData.customerId = customerId;
          changes.push({ field: 'customerId', from: oldOrder.customerId, to: customerId });
        }
        if (customerName !== undefined && customerName.trim() !== oldOrder.billFullName) {
          updateData.billFullName = customerName.trim();
          changes.push({ field: 'billFullName', from: oldOrder.billFullName, to: updateData.billFullName });
        }
        if (customerPhone !== undefined && phoneToUse !== oldOrder.billPhoneNumber) {
          updateData.billPhoneNumber = phoneToUse;
          changes.push({ field: 'billPhoneNumber', from: oldOrder.billPhoneNumber, to: updateData.billPhoneNumber });
        }
      }

      if (address !== undefined || province !== undefined) {
        const currentAddr = oldOrder.shippingAddress as any;
        const newAddr = {
          full_address: address !== undefined ? address : (currentAddr?.full_address || ''),
          province_name: province !== undefined ? province : (currentAddr?.province_name || ''),
          district_name: currentAddr?.district_name || ''
        };
        updateData.shippingAddress = newAddr;
        changes.push({ field: 'shippingAddress', from: oldOrder.shippingAddress, to: newAddr });
      }

      if (moneyToCollect !== undefined) {
        const val = Number(moneyToCollect) || 0;
        if (val !== oldOrder.moneyToCollect) {
          updateData.moneyToCollect = val;
          changes.push({ field: 'moneyToCollect', from: oldOrder.moneyToCollect, to: val });
        }
      }
    }

    if (items !== undefined && Array.isArray(items)) {
      // Xóa các items cũ
      await prisma.orderItem.deleteMany({
        where: { orderId: id }
      });

      // Tạo các items mới
      if (items.length > 0) {
        const newItemsData = items.map((item: any) => {
          return {
            orderId: id,
            productName: item.productName || 'Sản phẩm',
            sku: item.sku || null,
            quantity: Number(item.quantity) || 1,
            price: Number(item.price) || 0,
            discount: Number(item.discount) || 0
          };
        });

        await prisma.orderItem.createMany({
          data: newItemsData
        });
      }

      // Cập nhật totalQuantity
      const totalQuantity = items.reduce((acc: number, curr: any) => acc + (Number(curr.quantity) || 1), 0);
      updateData.totalQuantity = totalQuantity;
      changes.push({ field: 'items', from: oldOrder.totalQuantity, to: totalQuantity });

      // Cập nhật totalPrice cho đơn thủ công
      if (oldOrder.pancakeOrderId < 0) {
        const totalPrice = items.reduce((acc: number, curr: any) => acc + ((Number(curr.price) || 0) * (Number(curr.quantity) || 1)), 0);
        updateData.totalPrice = totalPrice;
        changes.push({ field: 'totalPrice', from: oldOrder.totalPrice, to: totalPrice });
      }
    }

    // Thực hiện cập nhật
    const order = await prisma.order.update({
      where: { id },
      data: updateData,
    });

    // Nếu chuyển sang hủy đơn, tự động xóa các báo cáo kỹ thuật liên quan
    if (adminStatus === 'hủy đơn') {
      const deletedReports = await prisma.serviceReport.deleteMany({
        where: { orderId: id }
      });
      if (deletedReports.count > 0) {
        logger.info(`Automatically deleted ${deletedReports.count} service reports for order cancelled by Admin`, { orderId: id });
      }
    }

    // Tích hợp đồng bộ tồn kho cục bộ
    try {
      const newOrderItems = await prisma.orderItem.findMany({
        where: { orderId: id }
      });
      await syncOrderInventoryState(id, {
        adminStatus: oldOrder.adminStatus,
        warehouseId: oldOrder.warehouseId,
        items: oldOrder.items.map(item => ({
          productName: item.productName || '',
          quantity: item.quantity || 1
        }))
      }, {
        adminStatus: order.adminStatus,
        warehouseId: order.warehouseId,
        items: newOrderItems.map(item => ({
          productName: item.productName || '',
          quantity: item.quantity || 1
        }))
      });
    } catch (invErr: any) {
      logger.error('Lỗi khấu trừ kho khi cập nhật đơn hàng', { orderId: id, error: invErr.message });
    }

    // Ghi audit log
    if (changes.length > 0) {
      // Xác định action
      let action = 'updated';
      if (adminStatus === 'hủy đơn') action = 'cancelled';
      if (assignedKtvId && !oldOrder.assignedKtvId) action = 'assigned';
      if (oldOrder.adminStatus === 'hủy đơn' && adminStatus && adminStatus !== 'hủy đơn') action = 'restored';

      await prisma.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: id,
          action,
          changes,
          userId: req.user!.id,
          userName: req.user!.fullName
        }
      });
    }

    // Gửi thông báo đẩy cho KTV nếu có gán KTV mới
    if (assignedKtvId && assignedKtvId !== oldOrder.assignedKtvId) {
      const customerName = order.billFullName || 'Khách hàng';
      const workTypeText = order.workType || 'công việc';
      const title = 'Dịch vụ mới được phân công';
      const displayOrderId = order.pancakeOrderId < 0 ? `M${Math.abs(order.pancakeOrderId)}` : `#${order.pancakeOrderId}`;
      const body = `Bạn vừa được phân công dịch vụ mới ${displayOrderId} (${workTypeText}) cho khách hàng ${customerName}`;

      // 1. Gửi qua FCM Native
      sendPushNotification(assignedKtvId, title, body, {
        type: 'ORDER_ASSIGNED',
        orderId: order.id,
        pancakeOrderId: order.pancakeOrderId < 0 ? `M${Math.abs(order.pancakeOrderId)}` : String(order.pancakeOrderId)
      }).catch(err => {
        logger.error('Failed to trigger push notification for KTV assignment', { error: err.message });
      });

      // 2. Gửi qua Web Push PWA
      sendWebPushNotification(assignedKtvId, title, body, {
        type: 'ORDER_ASSIGNED',
        orderId: order.id,
        pancakeOrderId: order.pancakeOrderId < 0 ? `M${Math.abs(order.pancakeOrderId)}` : String(order.pancakeOrderId)
      }).catch(err => {
        logger.error('Failed to trigger Web Push notification for KTV assignment', { error: err.message });
      });
    }

    logger.info('Order updated by admin', { orderId: id, by: req.user?.id, changes });
    broadcastEvent('ORDER_UPDATED', { orderId: order.id, pancakeOrderId: order.pancakeOrderId });
    res.json({ 
      order, 
      warning: (req as any).pancakeSyncWarning || null 
    });
  } catch (error: any) {
    logger.error('Update order error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật đơn hàng' });
  }
});

/**
 * POST /api/orders/:id/sync
 * Manually sync a single Pancake order by pulling its latest data from Pancake POS API
 */
router.post('/:id/sync', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    
    // Check permissions (Only ADMIN and DEV can sync single order)
    const role = req.user?.role;
    if (role !== 'ADMIN' && role !== 'DEV') {
      res.status(403).json({ error: 'Chỉ Admin mới có quyền đồng bộ đơn hàng từ Pancake.' });
      return;
    }

    const order = await prisma.order.findUnique({
      where: { id },
      select: { pancakeOrderId: true }
    });

    if (!order || !order.pancakeOrderId || order.pancakeOrderId <= 0) {
      res.status(400).json({ error: 'Đơn hàng không thuộc Pancake hoặc không tìm thấy' });
      return;
    }

    const apiKey = process.env.PANCAKE_API_KEY;
    const shopId = '1635300067'; // Default Shop ID

    if (!apiKey) {
      res.status(500).json({ error: 'Chưa cấu hình API Key cho Pancake POS' });
      return;
    }

    const response = await axios.get(`https://pos.pages.fm/api/v1/shops/${shopId}/orders/${order.pancakeOrderId}`, {
      params: { api_key: apiKey },
      timeout: 10000
    });

    if (response.data && response.data.success && response.data.data) {
      const orderPayload = response.data.data;
      // Re-use processOrderEvent to parse and update the order
      await processOrderEvent(null, orderPayload);
      
      const updatedOrder = await prisma.order.findUnique({
        where: { id },
        include: {
          assignedKtv: true,
          mainStation: true,
          techStation: true
        }
      });
      res.json({ success: true, message: 'Đồng bộ đơn hàng thành công', order: updatedOrder });
    } else {
      res.status(400).json({ error: 'Không thể lấy thông tin chi tiết đơn hàng từ Pancake POS API' });
    }
  } catch (error: any) {
    logger.error('Manual single order sync failed', { orderId: req.params.id, error: error.message });
    res.status(500).json({ error: 'Lỗi khi đồng bộ đơn hàng: ' + error.message });
  }
});

/**
 * POST /api/orders/sync
 * Đồng bộ thủ công 50 đơn hàng gần nhất từ Pancake POS
 */
router.post('/sync', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    const group = req.user?.group;

    // Chỉ cho phép các vai trò có quyền phân công (ngoại trừ KTV và STAFF thuộc nhóm Service)
    if (role === 'KTV' || (role === 'STAFF' && group === 'Service')) {
      res.status(403).json({ error: 'Bạn không có quyền đồng bộ đơn hàng từ Pancake.' });
      return;
    }

    logger.info('Manual orders sync initiated by user', { userId: req.user?.id, role });
    const count = await syncRecentOrders(50);
    res.json({ success: true, message: `Đồng bộ thành công ${count} đơn hàng gần đây từ Pancake.` });
  } catch (error: any) {
    logger.error('Manual orders sync failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi đồng bộ đơn hàng từ Pancake' });
  }
});

export default router;

import { Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { Prisma } from '@prisma/client';
import { syncOrderStatusToPancake, processOrderEvent } from '../services/orderProcessor';
import { syncRecentOrders } from '../services/orderSyncScheduler';
import { sendPushNotification } from '../services/notificationService';
import { sendWebPushNotification } from '../services/webPushService';
import { syncOrderInventoryState } from '../services/inventoryService';
import { broadcastEvent } from '../services/websocketService';
import { buildOrderFilter } from '../services/orderService';
import ExcelJS from 'exceljs';
import axios from 'axios';

export async function getOrders(req: Request, res: Response): Promise<void> {
  try {
    const { 
      page = '1', 
      limit = '50',
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
      dateType,
      creator,
      creators
    } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const where: Prisma.OrderWhereInput = {};
    const conditions: Prisma.OrderWhereInput[] = [];

    conditions.push({
      OR: [
        { statusCode: { not: 0 } },
        { statusCode: null },
        { pancakeOrderId: { lt: 0 } }
      ]
    });

    const userFilter = await buildOrderFilter(req.user);
    if (userFilter) {
      conditions.push(userFilter);
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
      const list = typeof assignedKtvIds === 'string' ? assignedKtvIds.split(',') : (Array.isArray(assignedKtvIds) ? assignedKtvIds as string[] : []);
      if (list.length > 0) {
        conditions.push({ assignedKtvId: { in: list } });
      }
    }

    if (workTypes) {
      const list = typeof workTypes === 'string' ? workTypes.split(',') : (Array.isArray(workTypes) ? workTypes as string[] : []);
      if (list.length > 0) {
        conditions.push({ workType: { in: list } });
      }
    }

    if (serviceTypes) {
      const list = typeof serviceTypes === 'string' ? serviceTypes.split(',') : (Array.isArray(serviceTypes) ? serviceTypes as string[] : []);
      if (list.length > 0) {
        conditions.push({ serviceType: { in: list } });
      }
    }

    if (mainStationIds) {
      const list = typeof mainStationIds === 'string' ? mainStationIds.split(',') : (Array.isArray(mainStationIds) ? mainStationIds as string[] : []);
      if (list.length > 0) {
        conditions.push({ mainStationId: { in: list } });
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
        conditions.push({
          OR: [
            {
              shippingAddress: {
                path: ['province_name'],
                string_contains: list[0]
              }
            },
            {
              customer: {
                provinceName: { in: list }
              }
            }
          ]
        });
      }
    }

    if (startDate || endDate) {
      const fieldToFilter = (dateType as string) || 'pancakeCreatedAt';
      const dateRangeFilter: any = {};
      if (startDate) dateRangeFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) dateRangeFilter.lte = new Date(`${endDate}T23:59:59.999Z`);

      if (fieldToFilter === 'appointmentTime') {
        conditions.push({ appointmentTime: dateRangeFilter });
      } else if (fieldToFilter === 'updatedAt') {
        conditions.push({ updatedAt: dateRangeFilter });
      } else if (fieldToFilter === 'createdAt') {
        conditions.push({ createdAt: dateRangeFilter });
      } else {
        conditions.push({ pancakeCreatedAt: dateRangeFilter });
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

    let creatorList: string[] = [];
    if (creators) {
      creatorList = typeof creators === 'string' ? creators.split(',') : (Array.isArray(creators) ? creators as string[] : []);
    } else if (creator) {
      creatorList = typeof creator === 'string' ? creator.split(',') : (Array.isArray(creator) ? creator as string[] : []);
    }

    if (creatorList.length > 0) {
      const creatorConditions = creatorList.map(creatorStr => {
        const str = creatorStr.trim();
        const variations = [
          str,
          str.toLowerCase(),
          str.toUpperCase(),
          str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        ];
        const uniqueVariations = Array.from(new Set(variations));
        
        return {
          OR: [
            ...uniqueVariations.map(val => ({
              rawData: {
                path: ['creator', 'name'],
                string_contains: val
              }
            })),
            ...(str.toLowerCase().includes('hệ thống') || str.toLowerCase().includes('he thong') ? [
              {
                OR: [
                  { orderSource: { contains: 'shopee', mode: 'insensitive' as const } },
                  { orderSource: { contains: 'lazada', mode: 'insensitive' as const } },
                  { orderSource: { contains: 'tiktok', mode: 'insensitive' as const } },
                  { orderSource: { contains: 'tiki', mode: 'insensitive' as const } }
                ]
              }
            ] : [])
          ]
        };
      });
      conditions.push({ OR: creatorConditions });
    }

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
            approvalStatus: true,
            createdAt: true,
            updatedAt: true
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
            approvalStatus: true,
            createdAt: true,
            updatedAt: true
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

    const reportSerialNumbers = new Set<string>();
    orders.forEach((order: any) => {
      (order.serviceReports || []).forEach((r: any) => {
        if (r.serialNumber) reportSerialNumbers.add(r.serialNumber);
      });
    });

    if (reportSerialNumbers.size > 0) {
      const serialRecords = await prisma.serial.findMany({
        where: { serialNumber: { in: Array.from(reportSerialNumbers) } },
        select: {
          serialNumber: true,
          status: true,
          activationDate: true,
          warrantyExpiryDate: true,
          customerConfirmationDate: true,
          model: true,
          productLine: true,
        }
      });
      const serialMap = new Map(serialRecords.map(s => [s.serialNumber, s]));

      orders.forEach((order: any) => {
        (order.serviceReports || []).forEach((r: any) => {
          if (r.serialNumber) {
            r.serialInfo = serialMap.get(r.serialNumber) || null;
          }
        });
      });
    }

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
}

export async function createManualOrder(req: Request, res: Response): Promise<void> {
  try {
    const role = req.user?.role;
    const group = req.user?.group;

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

    let customerId: string;
    const cleanPhone = customerPhone.trim();
    const existingCustomer = await prisma.customer.findFirst({
      where: { phoneNumber: cleanPhone }
    });

    if (existingCustomer) {
      customerId = existingCustomer.id;
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

    const minOrder = await prisma.order.findFirst({
      where: { pancakeOrderId: { lt: 0 } },
      orderBy: { pancakeOrderId: 'asc' },
      select: { pancakeOrderId: true }
    });

    let nextManualId = -1;
    if (minOrder && minOrder.pancakeOrderId < 0) {
      nextManualId = minOrder.pancakeOrderId - 1;
    }

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
}

export async function syncOrders(req: Request, res: Response): Promise<void> {
  try {
    const count = await syncRecentOrders();
    res.json({ success: true, count, message: `Đã đồng bộ thành công ${count} đơn hàng gần đây từ Pancake POS.` });
  } catch (error: any) {
    logger.error('Sync orders API error', { error: error.message });
    res.status(500).json({ error: 'Lỗi đồng bộ đơn hàng từ Pancake POS' });
  }
}

export async function getFilterOptions(req: Request, res: Response): Promise<void> {
  try {
    const iamFilter = await buildOrderFilter(req.user);
    const orderWhere: Prisma.OrderWhereInput = {
      ...(iamFilter || {}),
      OR: [
        { statusCode: { not: 0 } },
        { statusCode: null },
        { pancakeOrderId: { lt: 0 } }
      ]
    };

    const [
      workTypes,
      serviceTypes,
      mainStations,
      techStations,
      ktvs,
      productCategories,
      products,
      creatorsRaw
    ] = await Promise.all([
      prisma.order.findMany({ where: orderWhere, select: { workType: true }, distinct: ['workType'] }),
      prisma.order.findMany({ where: orderWhere, select: { serviceType: true }, distinct: ['serviceType'] }),
      prisma.mainStation.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.techStation.findMany({ where: { isActive: true }, select: { id: true, name: true, mainStationId: true }, orderBy: { name: 'asc' } }),
      prisma.user.findMany({
        where: { role: 'KTV', isActive: true },
        select: { id: true, fullName: true, techStationId: true },
        orderBy: { fullName: 'asc' }
      }),
      prisma.product.findMany({ select: { category: true }, distinct: ['category'] }),
      prisma.product.findMany({ select: { name: true, category: true }, orderBy: { name: 'asc' } }),
      prisma.order.findMany({
        where: {
          ...orderWhere,
          rawData: { path: ['creator', 'name'], not: Prisma.JsonNull }
        },
        select: { rawData: true },
        take: 5000
      })
    ]);

    const creatorNamesSet = new Set<string>();
    creatorsRaw.forEach((o: any) => {
      const cName = o.rawData?.creator?.name;
      if (cName && typeof cName === 'string' && cName.trim()) {
        creatorNamesSet.add(cName.trim());
      }
    });

    res.json({
      workTypes: workTypes.map(w => w.workType).filter(Boolean),
      serviceTypes: serviceTypes.map(s => s.serviceType).filter(Boolean),
      mainStations,
      techStations,
      ktvs,
      categories: productCategories.map(c => c.category).filter(Boolean),
      products: products.map(p => p.name).filter(Boolean),
      creators: Array.from(creatorNamesSet).sort((a, b) => a.localeCompare(b, 'vi'))
    });
  } catch (error: any) {
    logger.error('Get filter options error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh mục bộ lọc đơn hàng' });
  }
}

export async function getOrderById(req: Request, res: Response): Promise<void> {
  try {
    const orderId = req.params.id as string;
    const iamFilter = await buildOrderFilter(req.user);

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(iamFilter || {})
      },
      include: {
        items: true,
        serials: true,
        customer: true,
        mainStation: true,
        techStation: true,
        assignedKtv: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            techStation: {
              select: {
                name: true,
                mainStation: { select: { name: true } }
              }
            }
          }
        },
        serviceReports: {
          include: {
            ktvUser: { select: { fullName: true } }
          }
        }
      }
    });

    if (!order) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng hoặc bạn không có quyền xem' });
      return;
    }

    res.json({ order });
  } catch (error: any) {
    logger.error('Get order by ID error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy chi tiết đơn hàng' });
  }
}

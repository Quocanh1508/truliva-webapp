import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import { Prisma } from '@prisma/client';
import { syncRecentOrders } from '../services/orderSyncScheduler';
import { sendPushNotification } from '../services/notificationService';
import { sendWebPushNotification } from '../services/webPushService';
import ExcelJS from 'exceljs';
import axios from 'axios';

const router = Router();

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

    // Chỉ hiển thị các đơn hàng đã được xác nhận bên POS (ẩn các đơn nháp status = 0)
    conditions.push({
      OR: [
        { statusCode: { not: 0 } },
        { statusCode: null }
      ]
    });
    
    // Nếu user là KTV, chỉ lấy các đơn hàng được giao cho KTV đó và chưa hoàn thành / chưa hủy
    if (req.user?.role === 'KTV') {
      conditions.push({ assignedKtvId: req.user.id });
      conditions.push({
        OR: [
          { adminStatus: { notIn: ['hoàn thành', 'hủy đơn'] } },
          { adminStatus: null }
        ]
      });
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
      orderBy.createdAt = orderDirection;
    }

    // Build statsWhere ignoring adminStatus filter to show counts of all statuses matching other active filters
    const statsConditions = conditions.filter(cond => !('adminStatus' in cond));
    const statsWhere: Prisma.OrderWhereInput = statsConditions.length > 0 ? { AND: statsConditions } : {};

    const [orders, total, statsResult] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy,
        skip,
        take: limitNumber,
        include: {
          items: true,
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
              id: true
            }
          }
        }
      }),
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
        cancelled: cancelledCount
      }
    });
  } catch (error: any) {
    logger.error('Get orders error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách đơn hàng' });
  }
});

/**
 * GET /api/orders/export
 * Xuất Excel danh sách đơn hàng theo bộ lọc (Admin only)
 */
router.get('/export', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
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

    // Chỉ hiển thị các đơn hàng đã được xác nhận bên POS (ẩn các đơn nháp status = 0)
    conditions.push({
      OR: [
        { statusCode: { not: 0 } },
        { statusCode: null }
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
      orderBy.createdAt = orderDirection;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy,
      include: {
        items: true,
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
        pancakeOrderId: o.pancakeOrderId,
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
      techStations: stations,
      provinces
    });
  } catch (error: any) {
    logger.error('Get filters data error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu bộ lọc' });
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
router.patch('/:id', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const {
      adminStatus, appointmentTime, assignedKtvId,
      workType, serviceType, mainStationId, techStationId,
      rescheduleReason, cancelReason, note, warehouseId
    } = req.body;

    // Lấy order hiện tại để so sánh cho audit
    const oldOrder = await prisma.order.findUnique({ where: { id } });
    if (!oldOrder) {
      res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      return;
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

      try {
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

        // Fetch warehouses to get the name of new warehouse
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

    // Thực hiện cập nhật
    const order = await prisma.order.update({
      where: { id },
      data: updateData,
    });

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
      const title = 'Đơn hàng mới được phân công';
      const body = `Bạn vừa được gán đơn hàng mới #${order.pancakeOrderId} (${workTypeText}) từ khách hàng ${customerName}.`;

      // 1. Gửi qua FCM Native
      sendPushNotification(assignedKtvId, title, body, {
        type: 'ORDER_ASSIGNED',
        orderId: order.id,
        pancakeOrderId: String(order.pancakeOrderId)
      }).catch(err => {
        logger.error('Failed to trigger push notification for KTV assignment', { error: err.message });
      });

      // 2. Gửi qua Web Push PWA
      sendWebPushNotification(assignedKtvId, title, body, {
        type: 'ORDER_ASSIGNED',
        orderId: order.id,
        pancakeOrderId: String(order.pancakeOrderId)
      }).catch(err => {
        logger.error('Failed to trigger Web Push notification for KTV assignment', { error: err.message });
      });
    }

    logger.info('Order updated by admin', { orderId: id, by: req.user?.id, changes });
    res.json({ order });
  } catch (error: any) {
    logger.error('Update order error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật đơn hàng' });
  }
});

/**
 * POST /api/orders/sync
 * Đồng bộ thủ công 50 đơn hàng gần nhất từ Pancake POS
 */
router.post('/sync', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Manual orders sync initiated by admin', { userId: req.user?.id });
    const count = await syncRecentOrders(50);
    res.json({ success: true, message: `Đồng bộ thành công ${count} đơn hàng gần đây từ Pancake.` });
  } catch (error: any) {
    logger.error('Manual orders sync failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi đồng bộ đơn hàng từ Pancake' });
  }
});

export default router;

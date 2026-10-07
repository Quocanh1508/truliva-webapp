import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';
import { Prisma } from '@prisma/client';
import { syncOrderStatusToPancake, processOrderEvent } from '../services/orderProcessor';
import { syncRecentOrders, reconcileDraftOrders } from '../services/orderSyncScheduler';
import { sendPushNotification } from '../services/notificationService';
import { sendWebPushNotification } from '../services/webPushService';
import { syncOrderInventoryState } from '../services/inventoryService';
import { broadcastEvent } from '../services/websocketService';
import ExcelJS from 'exceljs';
import axios from 'axios';
import { isSandboxEnvironment, logSandboxBlockedAction } from '../utils/sandboxGuard';
import { PANCAKE_API_BASE } from '../config/pancake';
import pancakeCircuitBreaker from '../services/pancakeCircuitBreaker';

import { buildOrderFilter, getNextManualOrderId } from '../services/orderService';
import { normalizeProvince, getProvinceSearchVariants, PANCAKE_PROVINCES } from '../utils/provinces';

// ── Combo types & functions: Import & Re-export từ ComboService (Dynamic DB-driven) ──
import { 
  getComboComponents, 
  getComboMappingsForInventory,
  ComboComponent, 
  ComboDefinition 
} from '../services/comboService';
export { ComboComponent, ComboDefinition, getComboComponents, getComboMappingsForInventory };



/**
 * Enrich imageUrl cho order items:
 * 1. Ưu tiên 1: Lấy trực tiếp từ item.variationInfo?.images?.[0] hoặc item.rawData?.variation_info?.images?.[0]
 * 2. Ưu tiên 2: Lookup bảng Product theo SKU (lấy p.imageUrl hoặc p.rawData?.images?.[0])
 * 3. Ưu tiên 3: Lookup bảng Product theo tên sản phẩm
 */
export async function enrichOrderItemsWithImages(orders: any[]): Promise<void> {
  if (!orders || orders.length === 0) return;

  const skusToLookup = new Set<string>();
  const namesToLookup = new Set<string>();

  // Pass 1: Lấy ảnh trực tiếp từ item nếu có
  orders.forEach((order: any) => {
    (order.items || []).forEach((item: any) => {
      const varInfo = item.variationInfo as any;
      const raw = item.rawData as any;
      const directImg = 
        varInfo?.images?.[0] || 
        raw?.variation_info?.images?.[0] || 
        raw?.images?.[0] || 
        null;

      if (directImg) {
        item.imageUrl = directImg;
      } else {
        if (item.sku) skusToLookup.add(item.sku);
        if (item.productName) namesToLookup.add(item.productName.trim());
      }
    });
  });

  if (skusToLookup.size === 0 && namesToLookup.size === 0) {
    return;
  }

  const productConditions: Prisma.ProductWhereInput[] = [];
  if (skusToLookup.size > 0) {
    productConditions.push({ sku: { in: Array.from(skusToLookup) } });
  }
  if (namesToLookup.size > 0) {
    productConditions.push({ name: { in: Array.from(namesToLookup), mode: 'insensitive' } });
  }

  try {
    const productRecords = await prisma.product.findMany({
      where: { OR: productConditions },
      select: { sku: true, name: true, imageUrl: true, rawData: true }
    });

    const skuImageMap = new Map<string, string>();
    const nameImageMap = new Map<string, string>();

    productRecords.forEach(p => {
      const raw = p.rawData as any;
      const img = 
        p.imageUrl || 
        raw?.images?.[0] || 
        raw?.variation_info?.images?.[0] || 
        raw?.product?.images?.[0] || 
        null;

      if (img) {
        if (p.sku) skuImageMap.set(p.sku, img);
        if (p.name) nameImageMap.set(p.name.trim().toLowerCase(), img);
      }
    });

    // Pass 2: Gắn ảnh cho các item chưa có ảnh
    orders.forEach((order: any) => {
      (order.items || []).forEach((item: any) => {
        if (!item.imageUrl) {
          let foundImg: string | null = null;
          if (item.sku && skuImageMap.has(item.sku)) {
            foundImg = skuImageMap.get(item.sku) || null;
          }
          if (!foundImg && item.productName) {
            const normalizedName = item.productName.trim().toLowerCase();
            foundImg = nameImageMap.get(normalizedName) || null;
          }
          item.imageUrl = foundImg;
        }
      });
    });
  } catch (err: any) {
    logger.warn('Lỗi enrichOrderItemsWithImages', { error: err.message });
  }
}

/**
 * GET /api/orders
 * Lấy danh sách đơn hàng với hỗ trợ phân trang và bộ lọc/sắp xếp
 */
export async function getOrders(req: Request, res: Response): Promise<void> {
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
      dateType,
      creator,
      creators
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
    } else {
      // Mặc định: Loại trừ hoàn toàn các đơn có trạng thái "đã ẩn"
      conditions.push({
        OR: [
          { adminStatus: { not: 'đã ẩn' } },
          { adminStatus: null }
        ]
      });
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
              { serviceReports: { some: { ktvUserId: { in: actualKtvIds } } } },
              { assignedKtvId: null }
            ]
          });
        } else if (hasNullKtv) {
          conditions.push({
            AND: [
              { assignedKtvId: null },
              { serviceReports: { none: {} } }
            ]
          });
        } else {
          conditions.push({
            OR: [
              { assignedKtvId: { in: actualKtvIds } },
              { serviceReports: { some: { ktvUserId: { in: actualKtvIds } } } }
            ]
          });
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
              { assignedKtv: { techStation: { mainStationId: { in: actualStationIds } } } },
              { serviceReports: { some: { ktvUser: { techStation: { mainStationId: { in: actualStationIds } } } } } },
              { mainStationId: null }
            ]
          });
        } else if (hasNullStation) {
          conditions.push({ mainStationId: null });
        } else {
          conditions.push({
            OR: [
              { mainStationId: { in: actualStationIds } },
              { assignedKtv: { techStation: { mainStationId: { in: actualStationIds } } } },
              { serviceReports: { some: { ktvUser: { techStation: { mainStationId: { in: actualStationIds } } } } } }
            ]
          });
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
        conditions.push({ adminStatus: 'hoàn thành' });
        // Ngày hoàn thành = ngày tạo báo cáo nghiệm thu (serviceReport.createdAt)
        // Không dùng order.updatedAt/pancakeUpdatedAt vì chỉ là ngày cập nhật chung,
        // không chính xác là ngày hoàn thành dịch vụ thực tế.
        conditions.push({
          serviceReports: { some: { createdAt: dateCond } }
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
        conditions.push({
          OR: [
            { techStationId: { in: list } },
            { assignedKtv: { techStationId: { in: list } } },
            { serviceReports: { some: { ktvUser: { techStationId: { in: list } } } } }
          ]
        });
      }
    }

    if (provinces) {
      const list = typeof provinces === 'string' ? provinces.split(',') : (Array.isArray(provinces) ? provinces as string[] : []);
      if (list.length > 0) {
        const orConds: Prisma.OrderWhereInput[] = [];
        for (const prov of list) {
          const norm = normalizeProvince(prov) || prov.trim();
          const variants = getProvinceSearchVariants(norm);
          for (const v of variants) {
            orConds.push({
              OR: [
                { customer: { provinceName: { contains: v, mode: 'insensitive' } } },
                { shippingAddress: { path: ['province'], equals: v } },
                { shippingAddress: { path: ['city'], equals: v } },
                { shippingAddress: { path: ['province_name'], equals: v } }
              ]
            });
          }
        }
        if (orConds.length > 0) {
          conditions.push({ OR: orConds });
        }
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

    // Xây dựng điều kiện sắp xếp
    const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    const orderByList: Prisma.OrderOrderByWithRelationInput[] = [];
    
    if (sortBy === 'appointmentTime') {
      orderByList.push({ appointmentTime: orderDirection });
      orderByList.push({ createdAt: orderDirection });
    } else if (sortBy === 'updatedAt') {
      orderByList.push({ updatedAt: orderDirection });
      orderByList.push({ createdAt: orderDirection });
    } else if (sortBy === 'pancakeOrderId' || sortBy === 'id') {
      orderByList.push({ pancakeOrderId: orderDirection });
    } else {
      // Mặc định hoặc khi chọn 'createdAt': Sắp xếp theo ngày tạo (createdAt) mới nhất trước
      orderByList.push({ createdAt: orderDirection });
      orderByList.push({ pancakeOrderId: orderDirection });
    }

    // Build statsWhere ignoring adminStatus filter to show counts of all statuses matching other active filters
    // Tuyệt đối loại trừ các đơn "đã ẩn" khỏi mọi thống kê stats
    const statsConditions = conditions.filter(cond => !('adminStatus' in cond));
    statsConditions.push({
      OR: [
        { adminStatus: { not: 'đã ẩn' } },
        { adminStatus: null }
      ]
    });
    const statsWhere: Prisma.OrderWhereInput = statsConditions.length > 0 ? { AND: statsConditions } : {};

    const isKtv = req.user?.role === 'KTV';
    const findManyOptions: any = {
      where,
      orderBy: orderByList,
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
        salesKtvId: true,
        salesCommission: true,
        customSalesCommission: true,
        salesCommissionNote: true,
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
        salesKtv: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
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
      if (item.adminStatus === 'đã ẩn') return;
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

    // ── Enrich serial info cho serviceReports ──
    // Gom tất cả serialNumber từ service reports để lookup 1 lần
    const reportSerialNumbers = new Set<string>();
    orders.forEach((order: any) => {
      (order.serviceReports || []).forEach((r: any) => {
        if (r.serialNumber) reportSerialNumbers.add(r.serialNumber);
      });
    });

    // Bỏ qua nếu không có serial nào từ reports
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

      // Gắn serialInfo vào mỗi service report
      orders.forEach((order: any) => {
        (order.serviceReports || []).forEach((r: any) => {
          if (r.serialNumber) {
            r.serialInfo = serialMap.get(r.serialNumber) || null;
          }
        });
      });
    }

    // ── Enrich ảnh sản phẩm cho order items ──
    await enrichOrderItemsWithImages(orders);

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

/**
 * POST /api/orders
 * Tạo đơn hàng/dịch vụ thủ công (Cho phép các vai trò văn phòng có quyền điều chỉnh)
 */
export async function createManualOrder(req: Request, res: Response): Promise<void> {
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
      promoCode,
      hotlineTicketId
    } = req.body;

    if (!customerName || !customerPhone) {
      res.status(400).json({ error: 'Tên khách hàng và số điện thoại là bắt buộc' });
      return;
    }

    // 1. Tìm hoặc tạo Customer
    let customerId: string;
    const cleanPhone = customerPhone.trim();
    const normProvince = province ? (normalizeProvince(province) || province.trim()) : null;
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
      if (normProvince && !existingCustomer.provinceName) {
        updateData.provinceName = normProvince;
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
          provinceName: normProvince || null
        }
      });
      customerId = newCustomer.id;
    }

    // ── NGHIỆP VỤ: Hệ thống ID cho đơn hàng thủ công ───────────────────────────
    // Đơn hàng từ Pancake POS luôn có pancakeOrderId là số DƯƠNG (1, 2, 3, ...).
    // Đơn hàng thủ công (tạo từ Admin trong Truliva) được gán ID ÂM (-1, -2, -3, ...)
    // để đảm bảo không bao giờ bị trùng với ID của Pancake POS.
    //
    // Quy tắc tự tăng: Tìm đơn thủ công có ID âm NHỎ NHẤT hiện tại trong dải tuần tự (>-1,000,000)
    // rồi lấy giá trị = ID_nhỏ_nhất - 1 cho đơn mới tiếp theo.
    //
    // Trên UI, các ID âm này được format hiển thị bằng helper formatOrderId():
    //   -1 → "M1", -2 → "M2", ... (tiền tố "M" = Manual)
    // ─────────────────────────────────────────────────────────────────────────────
    const nextManualId = await getNextManualOrderId();

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
        shippingAddress: (address || normProvince) ? {
          full_address: address || '',
          province_name: normProvince || '',
          province: normProvince || ''
        } : undefined,
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

    // 6. Liên kết phiếu Hotline nếu có
    if (hotlineTicketId) {
      await prisma.hotlineTicket.update({
        where: { id: hotlineTicketId },
        data: {
          status: 'Đã chuyển yêu cầu',
          convertedOrderId: order.id
        }
      }).catch(console.error);

      await prisma.hotlineTicketFeedbackHistory.create({
        data: {
          ticketId: hotlineTicketId,
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'CONVERT_ORDER',
          feedback: `Đã chuyển thành ca dịch vụ M${Math.abs(nextManualId)}`
        }
      }).catch(console.error);
    }

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
}

/**
 * GET /api/orders/export
 * Xuất Excel danh sách đơn hàng theo bộ lọc (Admin only)
 */
export async function exportOrdersExcel(req: Request, res: Response): Promise<void> {
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
      dateType,
      creator,
      creators
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
    } else {
      // Mặc định: Loại trừ hoàn toàn các đơn có trạng thái "đã ẩn"
      conditions.push({
        OR: [
          { adminStatus: { not: 'đã ẩn' } },
          { adminStatus: null }
        ]
      });
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
              { serviceReports: { some: { ktvUserId: { in: actualKtvIds } } } },
              { assignedKtvId: null }
            ]
          });
        } else if (hasNullKtv) {
          conditions.push({
            AND: [
              { assignedKtvId: null },
              { serviceReports: { none: {} } }
            ]
          });
        } else {
          conditions.push({
            OR: [
              { assignedKtvId: { in: actualKtvIds } },
              { serviceReports: { some: { ktvUserId: { in: actualKtvIds } } } }
            ]
          });
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
        conditions.push({ adminStatus: 'hoàn thành' });
        // Ngày hoàn thành = ngày tạo báo cáo nghiệm thu (serviceReport.createdAt)
        conditions.push({
          serviceReports: { some: { createdAt: dateCond } }
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
        const orConds: Prisma.OrderWhereInput[] = [];
        for (const prov of list) {
          const norm = normalizeProvince(prov) || prov.trim();
          const variants = getProvinceSearchVariants(norm);
          for (const v of variants) {
            orConds.push({
              OR: [
                { customer: { provinceName: { contains: v, mode: 'insensitive' } } },
                { shippingAddress: { path: ['province'], equals: v } },
                { shippingAddress: { path: ['city'], equals: v } },
                { shippingAddress: { path: ['province_name'], equals: v } }
              ]
            });
          }
        }
        if (orConds.length > 0) {
          conditions.push({ OR: orConds });
        }
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

    const where: Prisma.OrderWhereInput = {};
    if (conditions.length > 0) {
      where.AND = conditions;
    }

    const orderDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    const orderByList: Prisma.OrderOrderByWithRelationInput[] = [];
    
    if (sortBy === 'appointmentTime') {
      orderByList.push({ appointmentTime: orderDirection });
    } else if (sortBy === 'updatedAt') {
      orderByList.push({ updatedAt: orderDirection });
    } else {
      orderByList.push({ pancakeCreatedAt: orderDirection });
    }
    orderByList.push({ createdAt: orderDirection });

    const orders = await prisma.order.findMany({
      where,
      orderBy: orderByList,
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
        rawData: true,
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
            mainStation: {
              select: {
                name: true,
              }
            }
          }
        },
        assignedKtv: {
          select: {
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
            createdAt: true
          },
          orderBy: {
            createdAt: 'desc'
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
      { header: 'Tỉnh / Thành phố', key: 'province', width: 22 },
      { header: 'Trạng thái xử lý', key: 'adminStatus', width: 18 },
      { header: 'Thời gian hoàn thành', key: 'completedAt', width: 22 },
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
      const provinceName = 
        o.shippingAddress?.province_name || 
        o.shippingAddress?.province || 
        o.customer?.provinceName || 
        o.customer?.province || 
        (typeof o.rawData === 'string' ? JSON.parse(o.rawData)?.shipping_address?.province_name : o.rawData?.shipping_address?.province_name) ||
        '';
      const productsList = o.items.map((i: any) => i.productName).join(', ');

      const mainStationName = 
        o.mainStation?.name || 
        o.techStation?.mainStation?.name || 
        o.assignedKtv?.techStation?.mainStation?.name || 
        '';

      const techStationName = 
        o.techStation?.name || 
        o.assignedKtv?.techStation?.name || 
        '';

      const latestReport = o.serviceReports && o.serviceReports.length > 0 ? o.serviceReports[0] : null;
      const completedAtStr = o.adminStatus === 'hoàn thành'
        ? (latestReport ? new Date(latestReport.createdAt).toLocaleString('vi-VN') : (o.appointmentTime ? new Date(o.appointmentTime).toLocaleString('vi-VN') : new Date(o.pancakeCreatedAt || o.createdAt).toLocaleString('vi-VN')))
        : '';

      sheet.addRow({
        pancakeOrderId: o.pancakeOrderId < 0 ? `M${Math.abs(o.pancakeOrderId)}` : o.pancakeOrderId,
        customerName,
        customerPhone: phone,
        address,
        province: provinceName,
        adminStatus: o.adminStatus || 'chờ xử lý',
        completedAt: completedAtStr,
        workType: o.workType || '',
        serviceType: o.serviceType || '',
        products: productsList,
        moneyToCollect: o.moneyToCollect ?? 0,
        mainStation: mainStationName,
        techStation: techStationName,
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
}

/**
 * GET /api/orders/filters-data
 * Lấy danh sách các dữ liệu phục vụ bộ lọc
 */
export async function getFilterOptions(req: Request, res: Response): Promise<void> {
  try {
    const [products, stations, customers, rawCreators] = await Promise.all([
      prisma.product.findMany({
        where: { isActive: true },
        select: { name: true, category: true, sku: true, sellingPrice: true }
      }),
      prisma.techStation.findMany({
        where: { isActive: true },
        select: { id: true, name: true }
      }),
      prisma.customer.findMany({
        where: { provinceName: { not: null } },
        select: { provinceName: true },
        distinct: ['provinceName']
      }),
      prisma.$queryRaw<Array<{ name: string }>>`
        SELECT DISTINCT "raw_data"->'creator'->>'name' as name
        FROM "orders"
        WHERE "raw_data"->'creator'->>'name' IS NOT NULL
        ORDER BY name ASC;
      `
    ]);

    const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];
    const productNames = Array.from(new Set(products.map(p => p.name).filter(Boolean))) as string[];
    const rawProvinces = customers
      .map(c => normalizeProvince(c.provinceName) || c.provinceName?.trim())
      .filter(Boolean) as string[];
    const uniqueProvinces = new Set(rawProvinces);
    const provinces = PANCAKE_PROVINCES.filter(p => uniqueProvinces.has(p));
    for (const p of uniqueProvinces) {
      if (!provinces.includes(p)) provinces.push(p);
    }
    const creators = [
      'Hệ thống (Shopee, Lazada, Tiktok, Tiki)',
      ...Array.from(new Set(rawCreators.map(c => c.name).filter(Boolean)))
    ] as string[];

    res.json({
      categories,
      productNames,
      products: products.map(p => ({ name: p.name, category: p.category, sku: p.sku || '', sellingPrice: p.sellingPrice || 0 })),
      techStations: stations,
      provinces,
      creators
    });
  } catch (error: any) {
    logger.error('Get filters data error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy dữ liệu bộ lọc' });
  }
}

/**
 * GET /api/orders/customers/search
 * Tìm kiếm khách hàng theo số điện thoại để gợi ý auto-fill
 */
export async function searchCustomers(req: Request, res: Response): Promise<void> {
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
}

/**
 * GET /api/orders/:id
 * Lấy chi tiết một đơn hàng
 */
export async function getOrderById(req: Request, res: Response): Promise<void> {
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
        salesKtv: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true
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

    await enrichOrderItemsWithImages([order]);

    res.json(order);
  } catch (error: any) {
    logger.error('Get order detail error', { id: req.params.id, error: error.message });
    res.status(500).json({ error: 'Lỗi lấy chi tiết đơn hàng' });
  }
}

/**
 * GET /api/orders/:id/audit
 * Lấy lịch sử thay đổi của 1 đơn hàng
 */
export async function getOrderAuditLogs(req: Request, res: Response): Promise<void> {
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
}

/**
 * POST /api/orders/:id/call-customer
 * KTV nhấn nút "Gọi khách hàng" → ghi nhận mốc thời gian
 * Chỉ KTV được phân công đơn mới có quyền gọi
 */
export async function callCustomerForOrder(req: Request, res: Response): Promise<void> {
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
}

/**
 * POST /api/orders/:id/reschedule
 * KTV yêu cầu hẹn lại lịch làm việc với khách hàng:
 * - Cập nhật appointmentTime mới
 * - Cập nhật lý do hẹn lại rescheduleReason
 * - Trạng thái chuyển về "chờ xử lý"
 * - Thu hồi phân bổ assignedKtvId = null (trả ca về cho Admin)
 * - Tạo Audit Log ghi nhận hành động hẹn lại
 */
export async function rescheduleOrder(req: Request, res: Response): Promise<void> {
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
}


/**
 * PATCH /api/orders/:id
 * Cập nhật đơn hàng (trạng thái, phân công, loại CV, trạm, hủy/khôi phục...)
 */
export async function updateOrder(req: Request, res: Response): Promise<void> {
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
      adminStatus, appointmentTime, assignedKtvId, salesKtvId,
      workType, serviceType, mainStationId, techStationId,
      rescheduleReason, cancelReason, note, warehouseId,
      items, customerName, customerPhone, address, province, moneyToCollect,
      promoCode, isExplicitUnassign
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

    const hasAssignPermission = role === 'ADMIN' || role === 'DEV' || role === 'COORDINATOR';

    // ── KTV Assignment Protection Guard ──
    let effectiveAssignedKtvId = assignedKtvId;
    let effectiveMainStationId = mainStationId;
    let effectiveTechStationId = techStationId;
    let effectiveAdminStatus = adminStatus;
    let effectiveWarehouseId = warehouseId;

    if (oldOrder.assignedKtvId) {
      // Đơn hàng ĐÃ CÓ KTV:
      if (!hasAssignPermission) {
        // User không có quyền ĐPV/Admin (ví dụ Sale, Hotline, Staff):
        // Tuyệt đối không cho phép gỡ hoặc đổi KTV, Trạm, Kho đã phân bổ
        effectiveAssignedKtvId = oldOrder.assignedKtvId;
        effectiveMainStationId = oldOrder.mainStationId;
        effectiveTechStationId = oldOrder.techStationId;
        if (effectiveAdminStatus === 'chờ xử lý') {
          effectiveAdminStatus = oldOrder.adminStatus;
        }
        if (oldOrder.warehouseId && effectiveWarehouseId !== oldOrder.warehouseId) {
          logger.info('Protected assigned warehouse from being changed by non-coordinator role', {
            orderId: id,
            role,
            preservedWarehouseId: oldOrder.warehouseId,
            requestedWarehouseId: effectiveWarehouseId
          });
          effectiveWarehouseId = oldOrder.warehouseId;
        }
      } else {
        // User có quyền ADMIN / DEV / COORDINATOR:
        // Nếu payload gửi assignedKtvId rỗng/null nhưng KHÔNG có cờ isExplicitUnassign = true
        // (xảy ra khi modal submit thiếu KTV hoặc form stale state):
        if (!assignedKtvId && !isExplicitUnassign) {
          effectiveAssignedKtvId = oldOrder.assignedKtvId;
          effectiveMainStationId = mainStationId !== undefined ? mainStationId : oldOrder.mainStationId;
          effectiveTechStationId = techStationId !== undefined ? techStationId : oldOrder.techStationId;
          if (effectiveAdminStatus === 'chờ xử lý') {
            effectiveAdminStatus = oldOrder.adminStatus;
          }
        }
      }
    } else {
      // Đơn hàng CHƯA CÓ KTV:
      // User không có quyền phân bổ mà cố tình gửi assignedKtvId
      if (!hasAssignPermission && assignedKtvId) {
        effectiveAssignedKtvId = null;
        effectiveMainStationId = null;
        effectiveTechStationId = null;
      }
    }

    // Validation: Require workType and serviceType if KTV is being assigned or already assigned
    const finalKtvId = effectiveAssignedKtvId !== undefined ? effectiveAssignedKtvId : oldOrder.assignedKtvId;
    const finalWorkType = workType !== undefined ? workType : oldOrder.workType;
    const finalServiceType = serviceType !== undefined ? serviceType : oldOrder.serviceType;

    if (finalKtvId) {
      if (!finalWorkType || !finalWorkType.trim() || finalWorkType === 'Chưa xác định') {
        res.status(400).json({ error: 'Vui lòng chọn loại công việc trước khi phân công KTV.' });
        return;
      }
      if (!finalServiceType || !finalServiceType.trim() || finalServiceType === 'Chưa xác định') {
        res.status(400).json({ error: 'Vui lòng chọn loại dịch vụ chi tiết trước khi phân công KTV.' });
        return;
      }
    }

    const updateData: any = {};
    const changes: any[] = [];

    if (effectiveWarehouseId !== undefined && effectiveWarehouseId !== oldOrder.warehouseId) {
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

      const shouldSyncWarehouseToPancake = !isInstallation && originallyHasProducts && !isManualOrder;

      try {
        let warehouseName = 'Kho hàng';
        try {
          const whResponse = await axios.get(`${PANCAKE_API_BASE}/api/v1/shops/${shopId}/warehouses`, {
            params: { api_key: apiKey },
            timeout: 5000
          });
          const whs = whResponse.data?.data || whResponse.data?.warehouses || [];
          const matchedWh = whs.find((w: any) => String(w.id) === String(effectiveWarehouseId));
          if (matchedWh) {
            warehouseName = matchedWh.name;
          }
        } catch (whErr) {
          logger.warn('Failed to fetch warehouse name from Pancake POS API, using default name', whErr);
        }

        if (shouldSyncWarehouseToPancake && effectiveWarehouseId) {
          if (isSandboxEnvironment()) {
            logSandboxBlockedAction('syncWarehouseChangeToPancake (updateOrder)', {
              pancakeOrderId: oldOrder.pancakeOrderId,
              warehouseId: effectiveWarehouseId
            });
          } else {
            logger.info('Syncing warehouse change to Pancake POS', { pancakeOrderId: oldOrder.pancakeOrderId, warehouseId: effectiveWarehouseId });
            const updateResponse = await axios.patch(
              `${PANCAKE_API_BASE}/api/v1/shops/${shopId}/orders/${oldOrder.pancakeOrderId}`,
              {
                warehouse_id: effectiveWarehouseId
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
          }
        } else {
          logger.info('Bypassed syncing warehouse change to Pancake POS (not deducting inventory)', {
            pancakeOrderId: oldOrder.pancakeOrderId,
            warehouseId: effectiveWarehouseId,
            reason: isInstallation ? 'Installation order' : (isManualOrder ? 'Manual order' : 'No original products')
          });
        }

        updateData.warehouseId = effectiveWarehouseId;
        updateData.warehouseInfo = { id: effectiveWarehouseId, name: warehouseName };
        updateData.pancakeSyncStatus = 'SUCCESS';

        changes.push({ field: 'warehouseId', from: oldOrder.warehouseId, to: effectiveWarehouseId });
        changes.push({ field: 'warehouseInfo', from: oldOrder.warehouseInfo, to: updateData.warehouseInfo });
      } catch (err: any) {
        logger.error('Failed to sync warehouse update to Pancake POS API', { error: err.message });
        const errorMsg = err.response?.data?.message || err.message || 'Lỗi không xác định từ Pancake POS';
        res.status(400).json({ error: `Không thể đồng bộ thay đổi kho xuất hàng sang Pancake: ${errorMsg}` });
        return;
      }
    }

    // Auto update adminStatus if KTV is assigned and status is currently 'chờ xử lý'
    const finalKtv = effectiveAssignedKtvId !== undefined ? (effectiveAssignedKtvId || null) : oldOrder.assignedKtvId;
    let targetAdminStatus = effectiveAdminStatus;
    if (finalKtv && (!targetAdminStatus || targetAdminStatus === 'chờ xử lý') && (!oldOrder.adminStatus || oldOrder.adminStatus === 'chờ xử lý')) {
      targetAdminStatus = 'đang thực hiện';
    } else if (!finalKtv && (targetAdminStatus === 'đang thực hiện' || (!targetAdminStatus && oldOrder.adminStatus === 'đang thực hiện'))) {
      targetAdminStatus = 'chờ xử lý';
    }

    if (targetAdminStatus !== undefined && targetAdminStatus !== oldOrder.adminStatus) {
      try {
        await syncOrderStatusToPancake(oldOrder.pancakeOrderId, targetAdminStatus);
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

    track('adminStatus', targetAdminStatus);
    track('workType', workType);
    track('serviceType', serviceType);
    track('mainStationId', effectiveMainStationId !== undefined ? (effectiveMainStationId || null) : oldOrder.mainStationId);
    track('techStationId', effectiveTechStationId !== undefined ? (effectiveTechStationId || null) : oldOrder.techStationId);
    track('rescheduleReason', rescheduleReason);
    track('cancelReason', cancelReason);
    track('note', note);
    track('promoCode', promoCode || null);

    if (effectiveAssignedKtvId !== undefined) {
      const val = effectiveAssignedKtvId || null;
      track('assignedKtvId', val);
    }

    if (salesKtvId !== undefined) {
      const val = salesKtvId || null;
      track('salesKtvId', val);
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
        const normProvince = province !== undefined ? (province ? (normalizeProvince(province) || province.trim()) : '') : undefined;
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
            if (normProvince !== undefined) {
              customerUpdate.provinceName = normProvince || null;
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
                provinceName: normProvince || null
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
        const normProvince = province !== undefined ? (province ? (normalizeProvince(province) || province.trim()) : '') : undefined;
        const currentAddr = oldOrder.shippingAddress as any;
        const targetProv = normProvince !== undefined ? normProvince : (currentAddr?.province_name || currentAddr?.province || '');
        const newAddr = {
          full_address: address !== undefined ? address : (currentAddr?.full_address || ''),
          province_name: targetProv,
          province: targetProv,
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
      // Tự động khử trùng lặp (Deduplicate): Nếu đơn hàng có gói Combo/Giải pháp, loại bỏ các máy con trùng lặp cấu thành gói đó
      const sanitizedItems: any[] = [];
      const activeComboComponents = new Set<string>();

      for (const it of items) {
        const comps = getComboComponents(it.productName, it.sku);
        if (comps) {
          comps.forEach(c => {
            activeComboComponents.add(c.name.trim().toLowerCase());
            if (c.sku) activeComboComponents.add(c.sku.trim().toLowerCase());
          });
        }
      }

      for (const it of items) {
        const comps = getComboComponents(it.productName, it.sku);
        if (comps) {
          sanitizedItems.push(it);
        } else {
          const itName = (it.productName || '').trim().toLowerCase();
          const itSku = (it.sku || '').trim().toLowerCase();
          if (activeComboComponents.has(itName) || (itSku && activeComboComponents.has(itSku))) {
            logger.warn('Stripped duplicate combo component from order items', { orderId: id, productName: it.productName, sku: it.sku });
            continue;
          }
          sanitizedItems.push(it);
        }
      }

      // Xóa các items cũ
      await prisma.orderItem.deleteMany({
        where: { orderId: id }
      });

      // Tạo các items mới
      if (sanitizedItems.length > 0) {
        const newItemsData = sanitizedItems.map((item: any) => {
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
      const totalQuantity = sanitizedItems.reduce((acc: number, curr: any) => acc + (Number(curr.quantity) || 1), 0);
      updateData.totalQuantity = totalQuantity;
      changes.push({ field: 'items', from: oldOrder.totalQuantity, to: totalQuantity });

      // Cập nhật totalPrice cho đơn thủ công
      if (oldOrder.pancakeOrderId < 0) {
        const totalPrice = sanitizedItems.reduce((acc: number, curr: any) => acc + ((Number(curr.price) || 0) * (Number(curr.quantity) || 1)), 0);
        updateData.totalPrice = totalPrice;
        changes.push({ field: 'totalPrice', from: oldOrder.totalPrice, to: totalPrice });
      }
    }

    // Thực hiện cập nhật
    const order = await prisma.order.update({
      where: { id },
      data: updateData,
    });

    // [RULE 7 - ZERO HARD-DELETE POLICY] Khi chuyển sang hủy đơn, tuyệt đối không xóa báo cáo kỹ thuật
    if (adminStatus === 'hủy đơn') {
      await prisma.serviceReport.updateMany({
        where: { orderId: id, approvalStatus: { not: 'APPROVED' } },
        data: { approvalStatus: 'REJECTED' }
      });
      logger.info(`Preserved service reports for cancelled order under Zero Hard-Delete Policy`, { orderId: id });
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
}

/**
 * POST /api/orders/:id/sync
 * Manually sync a single Pancake order by pulling its latest data from Pancake POS API
 */
export async function syncSingleOrder(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    
    // Check permissions
    const role = req.user?.role;
    const group = req.user?.group;
    if (role === 'KTV' || (role === 'STAFF' && group === 'Service')) {
      res.status(403).json({ error: 'Bạn không có quyền đồng bộ đơn hàng từ Pancake.' });
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

    const response = await axios.get(`${PANCAKE_API_BASE}/api/v1/shops/${shopId}/orders/${order.pancakeOrderId}`, {
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
    const isPancakeKeyError = error.response?.status === 403 || error.response?.data?.error_code === 105;
    const errorMsg = isPancakeKeyError
      ? 'API Key của Pancake POS đã hết hạn hoặc không hợp lệ (mã lỗi 105). Vui lòng cấu hình lại PANCAKE_API_KEY trong file .env trên máy chủ.'
      : error.message;
    res.status(500).json({ error: 'Lỗi khi đồng bộ đơn hàng: ' + errorMsg });
  }
}

/**
 * POST /api/orders/sync
 * Đồng bộ thủ công 50 đơn hàng gần nhất từ Pancake POS
 */
export async function syncOrders(req: Request, res: Response): Promise<void> {
  try {
    const role = req.user?.role;
    const group = req.user?.group;

    // Chỉ cho phép các vai trò có quyền phân công (ngoại trừ KTV và STAFF thuộc nhóm Service)
    if (role === 'KTV' || (role === 'STAFF' && group === 'Service')) {
      res.status(403).json({ error: 'Bạn không có quyền đồng bộ đơn hàng từ Pancake.' });
      return;
    }

    // 🛡️ Kiểm tra trạng thái Cầu chì tự ngắt Circuit Breaker
    const cbStatus = pancakeCircuitBreaker.getStatus();
    if (cbStatus.isLocked) {
      res.status(423).json({ 
        error: 'Cầu chì bảo vệ Pancake POS đang KHÓA HẲN (do xác thực thất bại liên tiếp). Vui lòng cập nhật PANCAKE_API_KEY mới trong .env hoặc Reset cầu chì trước khi đồng bộ.' 
      });
      return;
    }
    const cbCheck = pancakeCircuitBreaker.canExecute();
    if (!cbCheck.allowed) {
      res.status(429).json({
        error: `Hệ thống đang trong thời gian giãn cách thử lại (${cbCheck.waitSeconds}s còn lại). Vui lòng chờ trước khi đồng bộ tiếp.`
      });
      return;
    }

    logger.info('Manual orders sync initiated by user', { userId: req.user?.id, role });
    const [count, reconciledCount] = await Promise.all([
      syncRecentOrders(30),
      reconcileDraftOrders(30)
    ]);
    broadcastEvent('ORDER_UPDATED', { action: 'manual_sync', count, reconciledCount });
    res.json({ 
      success: true, 
      message: `Đồng bộ thành công ${count} đơn hàng gần đây và cập nhật trạng thái ${reconciledCount} đơn vừa xác nhận từ Pancake.` 
    });
  } catch (error: any) {
    logger.error('Manual orders sync failed', { error: error.message });
    const isPancakeKeyError = error.response?.status === 403 || error.response?.data?.error_code === 105;
    const errorMsg = isPancakeKeyError
      ? 'API Key của Pancake POS đã hết hạn hoặc không hợp lệ (mã lỗi 105). Vui lòng cấu hình lại PANCAKE_API_KEY trong file .env trên máy chủ.'
      : (error.message || 'Lỗi đồng bộ đơn hàng từ Pancake');
    res.status(500).json({ error: errorMsg });
  }
}

/**
 * PATCH /api/orders/bulk/assign
 * Bulk assign stations, KTV, warehouse, and reschedule multiple orders
 */
export async function bulkAssignOrders(req: Request, res: Response): Promise<void> {
  try {
    const role = req.user?.role;
    // Phân quyền: Chỉ ADMIN, DEV, COORDINATOR
    if (role !== 'ADMIN' && role !== 'DEV' && role !== 'COORDINATOR') {
      res.status(403).json({ error: 'Bạn không có quyền thực hiện phân bổ hàng loạt.' });
      return;
    }

    const {
      orderIds,
      mainStationId,
      techStationId,
      assignedKtvId,
      appointmentTime,
      rescheduleReason,
      warehouseId,
      workType,
      serviceType
    } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      res.status(400).json({ error: 'Danh sách ID đơn hàng không hợp lệ hoặc rỗng.' });
      return;
    }

    if (mainStationId) {
      // Kiểm tra trạm chính tồn tại
      const mainStation = await prisma.mainStation.findUnique({
        where: { id: mainStationId }
      });
      if (!mainStation) {
        res.status(404).json({ error: 'Trạm chính không tồn tại trên hệ thống.' });
        return;
      }
    }

    // Lọc quyền xem đơn hàng
    const iamFilter = await buildOrderFilter(req.user);
    const oldOrders = await prisma.order.findMany({
      where: {
        id: { in: orderIds },
        ...(iamFilter || {})
      },
      include: { items: true }
    });

    if (oldOrders.length === 0) {
      res.status(400).json({ error: 'Không tìm thấy đơn hàng nào hợp lệ hoặc bạn không có quyền chỉnh sửa.' });
      return;
    }

    // Validation: Require workType and serviceType if KTV is being assigned or already assigned
    for (const oldOrder of oldOrders) {
      const finalKtvId = assignedKtvId !== undefined ? assignedKtvId : oldOrder.assignedKtvId;
      const finalWorkType = workType !== undefined ? workType : oldOrder.workType;
      const finalServiceType = serviceType !== undefined ? serviceType : oldOrder.serviceType;

      if (finalKtvId) {
        const displayId = oldOrder.pancakeOrderId < 0 ? `M${Math.abs(oldOrder.pancakeOrderId)}` : `#${oldOrder.pancakeOrderId}`;
        if (!finalWorkType || !finalWorkType.trim() || finalWorkType === 'Chưa xác định') {
          res.status(400).json({ error: `Đơn hàng ${displayId} chưa chọn Loại công việc. Vui lòng chọn Loại công việc trước khi phân công KTV.` });
          return;
        }
        if (!finalServiceType || !finalServiceType.trim() || finalServiceType === 'Chưa xác định') {
          res.status(400).json({ error: `Đơn hàng ${displayId} chưa chọn Loại dịch vụ chi tiết. Vui lòng chọn Loại dịch vụ chi tiết trước khi phân công KTV.` });
          return;
        }
      }
    }

    // Fetch warehouse list once for Pancake sync if warehouseId is provided
    let warehouses: any[] = [];
    const apiKey = process.env.PANCAKE_API_KEY;
    const shopId = '1635300067';
    if (warehouseId && apiKey) {
      try {
        const whResponse = await axios.get(`${PANCAKE_API_BASE}/api/v1/shops/${shopId}/warehouses`, {
          params: { api_key: apiKey },
          timeout: 5000
        });
        warehouses = whResponse.data?.data || whResponse.data?.warehouses || [];
      } catch (err) {
        logger.warn('Failed to fetch warehouse list from Pancake POS API in bulk assign', err);
      }
    }

    const results: any[] = [];
    const warnings: string[] = [];

    // Loop through each order and update sequentially
    for (const oldOrder of oldOrders) {
      const updateData: any = {};
      const changes: any[] = [];

      // Main Station (optional)
      if (mainStationId && mainStationId !== oldOrder.mainStationId) {
        updateData.mainStationId = mainStationId;
        changes.push({ field: 'mainStationId', from: oldOrder.mainStationId, to: mainStationId });
      }

      // Tech Station
      if (techStationId !== undefined && techStationId !== oldOrder.techStationId) {
        updateData.techStationId = techStationId || null;
        changes.push({ field: 'techStationId', from: oldOrder.techStationId, to: techStationId || null });
      }

      // Work Type
      if (workType !== undefined && workType !== oldOrder.workType) {
        updateData.workType = workType || null;
        changes.push({ field: 'workType', from: oldOrder.workType, to: workType || null });
      }

      // Service Type
      if (serviceType !== undefined && serviceType !== oldOrder.serviceType) {
        updateData.serviceType = serviceType || null;
        changes.push({ field: 'serviceType', from: oldOrder.serviceType, to: serviceType || null });
      }

      // KTV Assignment
      if (assignedKtvId !== undefined && assignedKtvId !== oldOrder.assignedKtvId) {
        updateData.assignedKtvId = assignedKtvId || null;
        changes.push({ field: 'assignedKtvId', from: oldOrder.assignedKtvId, to: assignedKtvId || null });
      }

      // Auto update adminStatus if KTV is assigned (newly or previously) and status is currently 'chờ xử lý'
      const effectiveKtv = assignedKtvId !== undefined ? (assignedKtvId || null) : oldOrder.assignedKtvId;
      if (effectiveKtv && (!oldOrder.adminStatus || oldOrder.adminStatus === 'chờ xử lý') && !updateData.adminStatus) {
        updateData.adminStatus = 'đang thực hiện';
        changes.push({ field: 'adminStatus', from: oldOrder.adminStatus, to: 'đang thực hiện' });
      }

      // Appointment Time
      if (appointmentTime !== undefined) {
        const newAppTime = appointmentTime ? new Date(appointmentTime) : null;
        const oldAppTime = oldOrder.appointmentTime ? new Date(oldOrder.appointmentTime) : null;
        if (String(newAppTime) !== String(oldAppTime)) {
          updateData.appointmentTime = newAppTime;
          changes.push({ field: 'appointmentTime', from: oldOrder.appointmentTime, to: newAppTime });
          
          if (rescheduleReason) {
            updateData.rescheduleReason = rescheduleReason;
            changes.push({ field: 'rescheduleReason', from: oldOrder.rescheduleReason, to: rescheduleReason });
          }
        }
      }

      // Warehouse
      if (warehouseId !== undefined && warehouseId !== oldOrder.warehouseId) {
        const isInstallation = oldOrder.workType === 'Lắp đặt';
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
          const matchedWh = warehouses.find((w: any) => String(w.id) === String(warehouseId));
          if (matchedWh) {
            warehouseName = matchedWh.name;
          }

          if (shouldSyncWarehouseToPancake && warehouseId && apiKey) {
            if (isSandboxEnvironment()) {
              logSandboxBlockedAction('syncWarehouseChangeToPancake (bulkAssignOrders)', {
                pancakeOrderId: oldOrder.pancakeOrderId,
                warehouseId
              });
            } else {
              await axios.patch(
                `${PANCAKE_API_BASE}/api/v1/shops/${shopId}/orders/${oldOrder.pancakeOrderId}`,
                { warehouse_id: warehouseId },
                {
                  params: { api_key: apiKey },
                  headers: { 'Content-Type': 'application/json' },
                  timeout: 10000
                }
              );
            }
          }

          updateData.warehouseId = warehouseId;
          updateData.warehouseInfo = { id: warehouseId, name: warehouseName };
          updateData.pancakeSyncStatus = 'SUCCESS';

          changes.push({ field: 'warehouseId', from: oldOrder.warehouseId, to: warehouseId });
          changes.push({ field: 'warehouseInfo', from: oldOrder.warehouseInfo, to: updateData.warehouseInfo });
        } catch (err: any) {
          const errorMsg = err.response?.data?.message || err.message || 'Lỗi không xác định từ Pancake POS';
          warnings.push(`Đơn #${oldOrder.pancakeOrderId}: Lỗi đổi kho sang Pancake: ${errorMsg}`);
        }
      }

      // Sync status to Pancake POS if it changed in bulk assign
      if (updateData.adminStatus) {
        try {
          await syncOrderStatusToPancake(oldOrder.pancakeOrderId, updateData.adminStatus);
          updateData.pancakeSyncStatus = 'SUCCESS';
        } catch (err: any) {
          updateData.pancakeSyncStatus = 'FAILED';
          const errorMsg = err.response?.data?.message || err.response?.data?.errors?.order || err.message || 'Lỗi không xác định từ Pancake POS';
          warnings.push(`Đơn #${oldOrder.pancakeOrderId}: Không thể đồng bộ trạng thái sang Pancake: ${errorMsg}`);
        }
      }

      if (changes.length > 0) {
        // Save to Database
        const updatedOrder = await prisma.order.update({
          where: { id: oldOrder.id },
          data: updateData,
        });

        // Local inventory sync logic
        try {
          const newOrderItems = await prisma.orderItem.findMany({
            where: { orderId: oldOrder.id }
          });
          await syncOrderInventoryState(oldOrder.id, {
            adminStatus: oldOrder.adminStatus,
            warehouseId: oldOrder.warehouseId,
            items: oldOrder.items.map(item => ({
              productName: item.productName || '',
              quantity: item.quantity || 1
            }))
          }, {
            adminStatus: updatedOrder.adminStatus,
            warehouseId: updatedOrder.warehouseId,
            items: newOrderItems.map(item => ({
              productName: item.productName || '',
              quantity: item.quantity || 1
            }))
          });
        } catch (invErr: any) {
          logger.error('Lỗi khấu trừ kho khi cập nhật đơn hàng hàng loạt', { orderId: oldOrder.id, error: invErr.message });
        }

        // Audit Log
        let action = 'updated';
        if (updateData.adminStatus === 'hủy đơn') action = 'cancelled';
        if (assignedKtvId && !oldOrder.assignedKtvId) action = 'assigned';

        await prisma.auditLog.create({
          data: {
            entityType: 'Order',
            entityId: oldOrder.id,
            action,
            changes,
            userId: req.user!.id,
            userName: req.user!.fullName
          }
        });

        // KTV Push Notification
        if (assignedKtvId && assignedKtvId !== oldOrder.assignedKtvId) {
          const customerName = updatedOrder.billFullName || 'Khách hàng';
          const workTypeText = updatedOrder.workType || 'công việc';
          const title = 'Dịch vụ mới được phân công (hàng loạt)';
          const displayOrderId = updatedOrder.pancakeOrderId < 0 ? `M${Math.abs(updatedOrder.pancakeOrderId)}` : `#${updatedOrder.pancakeOrderId}`;
          const body = `Bạn vừa được phân công dịch vụ mới ${displayOrderId} (${workTypeText}) cho khách hàng ${customerName}`;

          sendPushNotification(assignedKtvId, title, body, {
            type: 'ORDER_ASSIGNED',
            orderId: updatedOrder.id,
            pancakeOrderId: updatedOrder.pancakeOrderId < 0 ? `M${Math.abs(updatedOrder.pancakeOrderId)}` : String(updatedOrder.pancakeOrderId)
          }).catch(err => {
            logger.error('Failed to trigger push notification for KTV bulk assignment', { error: err.message });
          });

          sendWebPushNotification(assignedKtvId, title, body, {
            type: 'ORDER_ASSIGNED',
            orderId: updatedOrder.id,
            pancakeOrderId: updatedOrder.pancakeOrderId < 0 ? `M${Math.abs(updatedOrder.pancakeOrderId)}` : String(updatedOrder.pancakeOrderId)
          }).catch(err => {
            logger.error('Failed to trigger Web Push notification for KTV bulk assignment', { error: err.message });
          });
        }

        logger.info('Order updated via bulk assign', { orderId: oldOrder.id, changes });
        broadcastEvent('ORDER_UPDATED', { orderId: updatedOrder.id, pancakeOrderId: updatedOrder.pancakeOrderId });
        results.push(updatedOrder);
      }
    }

    res.json({
      success: true,
      message: `Đã xử lý phân bổ cho ${oldOrders.length} đơn hàng. Cập nhật thành công ${results.length} đơn.`,
      warnings: warnings.length > 0 ? warnings : null
    });
  } catch (error: any) {
    logger.error('Bulk assign order error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật đơn hàng hàng loạt' });
  }
}

/**
 * PATCH /api/orders/bulk/cancel
 * Bulk cancel multiple orders
 */
export async function bulkCancelOrders(req: Request, res: Response): Promise<void> {
  try {
    const role = req.user?.role;
    if (role !== 'ADMIN' && role !== 'DEV' && role !== 'COORDINATOR') {
      res.status(403).json({ error: 'Bạn không có quyền hủy đơn hàng loạt.' });
      return;
    }

    const { orderIds } = req.body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      res.status(400).json({ error: 'Danh sách ID đơn hàng không hợp lệ hoặc rỗng.' });
      return;
    }

    // Lọc quyền xem đơn hàng
    const iamFilter = await buildOrderFilter(req.user);
    const oldOrders = await prisma.order.findMany({
      where: {
        id: { in: orderIds },
        ...(iamFilter || {})
      },
      include: { items: true }
    });

    if (oldOrders.length === 0) {
      res.status(400).json({ error: 'Không tìm thấy đơn hàng nào hợp lệ hoặc bạn không có quyền chỉnh sửa.' });
      return;
    }

    let cancelledCount = 0;
    let skippedCount = 0;

    for (const oldOrder of oldOrders) {
      // Bỏ qua đơn đã hủy rồi
      if (oldOrder.adminStatus === 'hủy đơn') {
        skippedCount++;
        continue;
      }

      // Cập nhật trạng thái sang hủy đơn
      const updatedOrder = await prisma.order.update({
        where: { id: oldOrder.id },
        data: { adminStatus: 'hủy đơn' }
      });

      // [RULE 7 - ZERO HARD-DELETE POLICY] Không xóa báo cáo kỹ thuật
      await prisma.serviceReport.updateMany({
        where: { orderId: oldOrder.id, approvalStatus: { not: 'APPROVED' } },
        data: { approvalStatus: 'REJECTED' }
      });
      logger.info(`Bulk cancel: preserved service reports under Zero Hard-Delete Policy`, { orderId: oldOrder.id });

      // Đồng bộ tồn kho
      try {
        await syncOrderInventoryState(oldOrder.id, {
          adminStatus: oldOrder.adminStatus,
          warehouseId: oldOrder.warehouseId,
          items: oldOrder.items.map(item => ({
            productName: item.productName || '',
            quantity: item.quantity || 1
          }))
        }, {
          adminStatus: 'hủy đơn',
          warehouseId: updatedOrder.warehouseId,
          items: oldOrder.items.map(item => ({
            productName: item.productName || '',
            quantity: item.quantity || 1
          }))
        });
      } catch (invErr: any) {
        logger.error('Lỗi đồng bộ kho khi hủy đơn hàng loạt', { orderId: oldOrder.id, error: invErr.message });
      }

      // Ghi audit log
      await prisma.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: oldOrder.id,
          action: 'cancelled',
          changes: [{ field: 'adminStatus', from: oldOrder.adminStatus, to: 'hủy đơn' }],
          userId: req.user!.id,
          userName: req.user!.fullName
        }
      });

      broadcastEvent('ORDER_UPDATED', { orderId: updatedOrder.id, pancakeOrderId: updatedOrder.pancakeOrderId });
      cancelledCount++;
    }

    res.json({
      success: true,
      message: `Đã hủy thành công ${cancelledCount} đơn hàng.${skippedCount > 0 ? ` (${skippedCount} đơn đã hủy trước đó, bỏ qua)` : ''}`
    });
  } catch (error: any) {
    logger.error('Bulk cancel order error', { error: error.message });
    res.status(500).json({ error: 'Lỗi hủy đơn hàng hàng loạt' });
  }
}



import prisma from '../config/database';

export function formatOrderCode(pancakeOrderId: number | null | undefined): string {
  if (pancakeOrderId === undefined || pancakeOrderId === null) return '';
  return pancakeOrderId < 0 ? `M${Math.abs(pancakeOrderId)}` : `#${pancakeOrderId}`;
}

/**
 * Reusable function to build standard & advanced report filter queries
 */
export async function buildReportFilter(query: any, user: any): Promise<any> {
  const {
    month,
    ktvId,
    province,
    serviceType,
    isPaid,
    search,
    startDate,
    endDate,
    workTypes,
    serviceTypes,
    productCategories,
    products,
    mainStationId,
    mainStationIds,
    techStationIds,
    ktvIds,
    completedStart,
    completedEnd,
    createdStart,
    createdEnd,
    updatedStart,
    updatedEnd
  } = query;

  const where: any = {};

  const { role, group, pancakeAccountName } = user;
  
  if (role === 'KTV') {
    where.ktvUserId = user.id;
  } else {
    if (
      role === 'ADMIN' ||
      role === 'DEV' ||
      role === 'COORDINATOR' ||
      role === 'HOTLINE' ||
      (role === 'STAFF' && group === 'Service')
    ) {
      const targetKtvIds: string[] = [];
      if (ktvId) targetKtvIds.push(ktvId);
      if (ktvIds) {
        const list = (ktvIds as string).split(',').map((s: string) => s.trim()).filter(Boolean);
        targetKtvIds.push(...list);
      }
      if (targetKtvIds.length > 0) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { ktvUserId: { in: targetKtvIds } },
            { order: { assignedKtvId: { in: targetKtvIds } } }
          ]
        });
      }
    } else {
      const orConditions: any[] = [];
      
      if (role === 'SALER' || role === 'STAFF') {
        const creatorName = pancakeAccountName || '';
        
        orConditions.push(
          { order: { rawData: { path: ['creator', 'id'], equals: user.id } } },
          { reportedById: user.id }
        );

        if (creatorName) {
          orConditions.push(
            { order: { rawData: { path: ['creator', 'name'], equals: creatorName } } },
            { order: { rawData: { path: ['assigning_seller', 'name'], equals: creatorName } } },
            { order: { rawData: { path: ['assigning_care', 'name'], equals: creatorName } } }
          );
        }

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
            order: { id: { in: createdManualOrderIds } }
          });
        }

        if (group && group.toLowerCase() === 'ecom') {
          orConditions.push(
            { order: { orderSource: { contains: 'shopee', mode: 'insensitive' } } },
            { order: { orderSource: { contains: 'lazada', mode: 'insensitive' } } },
            { order: { orderSource: { contains: 'tiktok', mode: 'insensitive' } } },
            { order: { orderSource: { contains: 'tiki', mode: 'insensitive' } } }
          );
        }
      } else if (role === 'SALE_SUPERVISOR') {
        if (group) {
          const groupUsers = await prisma.user.findMany({
            where: { group: group, isActive: true },
            select: { id: true, pancakeAccountName: true }
          });
          const groupUserIds = groupUsers.map(u => u.id);
          const pancakeNames = groupUsers
            .map(u => u.pancakeAccountName?.trim())
            .filter(Boolean) as string[];

          if (pancakeNames.length > 0) {
            pancakeNames.forEach(name => {
              orConditions.push(
                { order: { rawData: { path: ['creator', 'name'], equals: name } } },
                { order: { rawData: { path: ['assigning_seller', 'name'], equals: name } } },
                { order: { rawData: { path: ['assigning_care', 'name'], equals: name } } }
              );
            });
          }

          groupUserIds.forEach(uid => {
            orConditions.push(
              { order: { rawData: { path: ['creator', 'id'], equals: uid } } }
            );
          });

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
              order: { id: { in: createdManualOrderIds } }
            });
          }

          if (group.toLowerCase() === 'ecom') {
            orConditions.push(
              { order: { orderSource: { contains: 'shopee', mode: 'insensitive' } } },
              { order: { orderSource: { contains: 'lazada', mode: 'insensitive' } } },
              { order: { orderSource: { contains: 'tiktok', mode: 'insensitive' } } },
              { order: { orderSource: { contains: 'tiki', mode: 'insensitive' } } }
            );
          }
        }
      }

      if (orConditions.length === 0) {
        where.id = 'none';
      } else {
        where.AND = where.AND || [];
        where.AND.push({ OR: orConditions });
      }

      const targetKtvIds: string[] = [];
      if (ktvId) targetKtvIds.push(ktvId);
      if (ktvIds) {
        const list = (ktvIds as string).split(',').map((s: string) => s.trim()).filter(Boolean);
        targetKtvIds.push(...list);
      }
      if (targetKtvIds.length > 0) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { ktvUserId: { in: targetKtvIds } },
            { order: { assignedKtvId: { in: targetKtvIds } } }
          ]
        });
      }
    }
  }

  // Support both 8/2026 and 08/2026 formats
  if (month && !search) {
    const parts = String(month).trim().split('/');
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const y = parts[1].trim();
      if (!isNaN(m) && y) {
        const v1 = `${m}/${y}`;
        const v2 = `${m < 10 ? '0' + m : m}/${y}`;
        where.month = { in: Array.from(new Set([v1, v2])) };
      } else {
        where.month = month;
      }
    } else {
      where.month = month;
    }
  }

  if (province) where.province = { contains: province as string, mode: 'insensitive' };
  
  // When searching, bypass category, station, and date filters so that stale filters in sessionStorage don't hide the search result
  if (!search) {
    if (workTypes) {
      const list = (workTypes as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (list.length > 0) {
        where.workType = { in: list };
      }
    }

    if (serviceTypes) {
      const list = (serviceTypes as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (list.length > 0) {
        where.serviceType = { in: list };
      }
    } else if (serviceType) {
      where.serviceType = serviceType;
    }

    if (isPaid !== undefined) where.isPaid = isPaid === 'true';

    if (productCategories) {
      const categories = (productCategories as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (categories.length > 0) {
        const catConditions = categories.map(c => ({
          category: { contains: c, mode: 'insensitive' as const }
        }));
        const dbProducts = await prisma.product.findMany({
          where: { OR: catConditions },
          select: { name: true }
        });
        const productNames = dbProducts.map((p: any) => p.name);
        if (productNames.length > 0) {
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { products: { hasSome: productNames } },
              { spareParts: { hasSome: productNames } }
            ]
          });
        } else {
          where.id = 'none';
        }
      }
    }

    if (products) {
      const list = (products as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (list.length > 0) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { products: { hasSome: list } },
            { spareParts: { hasSome: list } }
          ]
        });
      }
    }

    // Trạm chính: kiểm tra cả ServiceReport.mainStationId, Order.mainStationId và KTV techStation.mainStationId
    const rawMainStationIds = mainStationIds || mainStationId;
    if (rawMainStationIds) {
      const list = String(rawMainStationIds).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (list.length > 0) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { mainStationId: { in: list } },
            { order: { mainStationId: { in: list } } },
            { ktvUser: { techStation: { mainStationId: { in: list } } } }
          ]
        });
      }
    }

    // Trạm kỹ thuật: điều kiện AND độc lập để thu hẹp kết quả chính xác
    if (techStationIds) {
      const list = String(techStationIds).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (list.length > 0) {
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { order: { techStationId: { in: list } } },
            { ktvUser: { techStationId: { in: list } } }
          ]
        });
      }
    }
  }

  if (!search) {
    // 1. Khoảng ngày ngoài toolbar (startDate / endDate)
    if (startDate || endDate) {
      where.createdAt = where.createdAt || {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        const eDate = new Date(endDate as string);
        eDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = eDate;
      }
    }

    // 2. Thời gian hoàn thành trong modal nâng cao (completedStart / completedEnd)
    if (completedStart || completedEnd) {
      where.createdAt = where.createdAt || {};
      if (completedStart) where.createdAt.gte = new Date(completedStart as string);
      if (completedEnd) {
        const eDate = new Date(completedEnd as string);
        eDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = eDate;
      }
    }

    // 3. Thời gian tạo đơn trong modal nâng cao: lọc theo ngày tạo của Đơn hàng (Order)
    if (createdStart || createdEnd) {
      const orderDateFilter: any = {};
      if (createdStart) orderDateFilter.gte = new Date(createdStart as string);
      if (createdEnd) {
        const eDate = new Date(createdEnd as string);
        eDate.setHours(23, 59, 59, 999);
        orderDateFilter.lte = eDate;
      }
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { order: { pancakeCreatedAt: orderDateFilter } },
          { order: { createdAt: orderDateFilter } }
        ]
      });
    }

    // 4. Thời gian cập nhật trong modal nâng cao
    if (updatedStart || updatedEnd) {
      where.updatedAt = {};
      if (updatedStart) where.updatedAt.gte = new Date(updatedStart as string);
      if (updatedEnd) {
        const eDate = new Date(updatedEnd as string);
        eDate.setHours(23, 59, 59, 999);
        where.updatedAt.lte = eDate;
      }
    }
  }

  if (search) {
    const s = String(search).trim();
    let numSearch: number | null = null;
    if (s.startsWith('#')) {
      const parsed = parseInt(s.substring(1), 10);
      if (!isNaN(parsed)) numSearch = parsed;
    } else if (s.toUpperCase().startsWith('M')) {
      const parsed = parseInt(s.substring(1), 10);
      if (!isNaN(parsed)) numSearch = -parsed;
    } else {
      const parsed = parseInt(s, 10);
      if (!isNaN(parsed)) numSearch = parsed;
    }

    const cleanPhone = s.replace(/\D/g, '').replace(/^84/, '').replace(/^0/, '');

    const searchConditions: any[] = [
      { customerName: { contains: s, mode: 'insensitive' } },
      { customerPhone: { contains: s, mode: 'insensitive' } },
      { address: { contains: s, mode: 'insensitive' } },
      { province: { contains: s, mode: 'insensitive' } },
      { serialNumber: { contains: s, mode: 'insensitive' } },
      { notes: { contains: s, mode: 'insensitive' } },
      { ktvUser: { fullName: { contains: s, mode: 'insensitive' } } },
      { order: { note: { contains: s, mode: 'insensitive' } } },
      { order: { billPhoneNumber: { contains: s, mode: 'insensitive' } } },
      { order: { customer: { fullName: { contains: s, mode: 'insensitive' } } } },
      { order: { customer: { phoneNumber: { contains: s, mode: 'insensitive' } } } }
    ];

    if (cleanPhone && cleanPhone.length >= 7) {
      searchConditions.push({ customerPhone: { contains: cleanPhone, mode: 'insensitive' } });
      searchConditions.push({ order: { billPhoneNumber: { contains: cleanPhone, mode: 'insensitive' } } });
      searchConditions.push({ order: { customer: { phoneNumber: { contains: cleanPhone, mode: 'insensitive' } } } });
    }

    if (s.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      searchConditions.push({ id: s });
      searchConditions.push({ orderId: s });
    }

    if (numSearch !== null) {
      searchConditions.push({ order: { pancakeOrderId: numSearch } });
    }

    where.AND = where.AND || [];
    where.AND.push({ OR: searchConditions });
  }

  return where;
}


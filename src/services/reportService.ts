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
      if (ktvId) {
        where.ktvUserId = ktvId;
      } else if (ktvIds) {
        const list = (ktvIds as string).split(',').map((s: string) => s.trim()).filter(Boolean);
        if (list.length > 0) {
          where.ktvUserId = { in: list };
        }
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

      if (ktvId) {
        where.ktvUserId = ktvId;
      } else if (ktvIds) {
        const list = (ktvIds as string).split(',').map((s: string) => s.trim()).filter(Boolean);
        if (list.length > 0) {
          where.ktvUserId = { in: list };
        }
      }
    }
  }

  // When searching, don't restrict by month - the user wants to find a specific report
  // regardless of which month it belongs to. This also prevents stale frontend filters
  // (cached in sessionStorage) from hiding search results.
  if (month && !search) where.month = month;
  if (province) where.province = { contains: province as string, mode: 'insensitive' };
  
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
      const dbProducts = await prisma.product.findMany({
        where: { category: { in: categories, mode: 'insensitive' } },
        select: { name: true }
      });
      const productNames = dbProducts.map((p: any) => p.name);
      if (productNames.length > 0) {
        where.products = {
          hasSome: productNames
        };
      } else {
        where.id = 'none';
      }
    }
  }

  if (products) {
    const list = (products as string).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      where.products = {
        hasSome: list
      };
    }
  }

  const stationOrConditions: any[] = [];
  const rawMainStationIds = mainStationIds || mainStationId;
  if (rawMainStationIds) {
    const list = String(rawMainStationIds).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      // Match reports where KTV belongs to the selected main station
      stationOrConditions.push({
        ktvUser: {
          techStation: {
            mainStationId: { in: list }
          }
        }
      });
      // Also match reports where the ORDER is assigned to the selected main station
      // (covers cases where a KTV from a different station handles the order)
      stationOrConditions.push({
        order: {
          mainStationId: { in: list }
        }
      });
    }
  }

  if (techStationIds) {
    const list = String(techStationIds).split(',').map((s: string) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      stationOrConditions.push({
        ktvUser: {
          techStationId: { in: list }
        }
      });
      // Also match reports where the ORDER is assigned to the selected tech station
      stationOrConditions.push({
        order: {
          techStationId: { in: list }
        }
      });
    }
  }

  if (stationOrConditions.length > 0) {
    where.AND = where.AND || [];
    where.AND.push({ OR: stationOrConditions });
  }

  // When searching, skip date/time range filters to prevent stale cached filters from hiding results
  if (!search) {
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        const eDate = new Date(endDate as string);
        eDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = eDate;
      }
    }

    if (completedStart || completedEnd) {
      where.createdAt = where.createdAt || {};
      if (completedStart) where.createdAt.gte = new Date(completedStart as string);
      if (completedEnd) {
        const eDate = new Date(completedEnd as string);
        eDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = eDate;
      }
    }

    if (createdStart || createdEnd) {
      where.createdAt = where.createdAt || {};
      if (createdStart) where.createdAt.gte = new Date(createdStart as string);
      if (createdEnd) {
        const eDate = new Date(createdEnd as string);
        eDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = eDate;
      }
    }

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


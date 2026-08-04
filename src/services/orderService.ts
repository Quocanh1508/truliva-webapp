import prisma from '../config/database';
import { Prisma } from '@prisma/client';

export async function buildOrderFilter(user: any): Promise<Prisma.OrderWhereInput | null> {
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

    const groupUsers = await prisma.user.findMany({
      where: { group, role: { in: ['SALER', 'STAFF', 'SALE_SUPERVISOR'] } },
      select: { id: true, pancakeAccountName: true }
    });

    const orConditions: Prisma.OrderWhereInput[] = [];
    groupUsers.forEach(u => {
      const cName = u.pancakeAccountName || '';
      orConditions.push(
        { rawData: { path: ['creator', 'id'], equals: u.id } }
      );
      if (cName) {
        orConditions.push(
          { rawData: { path: ['creator', 'name'], equals: cName } },
          { rawData: { path: ['assigning_seller', 'name'], equals: cName } },
          { rawData: { path: ['assigning_care', 'name'], equals: cName } }
        );
      }
    });

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

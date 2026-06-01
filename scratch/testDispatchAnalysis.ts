import dotenv from 'dotenv';
dotenv.config();

import prisma from '../src/config/database';

function removeAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function parseMultiValue(param: any): string[] {
  if (!param) return [];
  return String(param).split(',').map(s => s.trim()).filter(Boolean);
}

async function main() {
  const startDate = '2025-12-31';
  const endDate = '2026-06-29';
  const province = '';
  const mainStationId = '';
  const techStationId = '';
  const workType = '';
  const adminStatus = '';
  const assignedKtvId = '';

  const where: any = {
    appointmentTime: { not: null },
  };

  if (startDate || endDate) {
    where.appointmentTime = {
      not: null,
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {})
    };
  }

  const workTypes = parseMultiValue(workType);
  if (workTypes.length > 0) {
    where.workType = workTypes.length === 1 ? workTypes[0] : { in: workTypes };
  }
  const statuses = parseMultiValue(adminStatus);
  if (statuses.length > 0) {
    where.adminStatus = statuses.length === 1 ? statuses[0] : { in: statuses };
  }
  const ktvIds = parseMultiValue(assignedKtvId);
  if (ktvIds.length > 0) {
    where.assignedKtvId = ktvIds.length === 1 ? ktvIds[0] : { in: ktvIds };
  }

  let orders = await prisma.order.findMany({
    where,
    include: {
      serviceReports: {
        orderBy: { createdAt: 'asc' },
        take: 1
      },
      customer: {
        select: {
          fullName: true,
          phoneNumber: true,
          provinceName: true
        }
      },
      assignedKtv: {
        select: {
          fullName: true
        }
      },
      mainStation: {
        select: {
          name: true,
          isActive: true
        }
      },
      techStation: {
        select: {
          name: true,
          mainStation: {
            select: {
              name: true,
              isActive: true
            }
          }
        }
      }
    }
  });

  const provinces = parseMultiValue(province);
  if (provinces.length > 0) {
    const searchProvinces = provinces.map(p => removeAccents(p));
    orders = orders.filter(order => {
      const provName = removeAccents(order.customer?.provinceName || (order.shippingAddress as any)?.province_name || '');
      return searchProvinces.some(sp => provName.includes(sp));
    });
  }

  const processedOrders = orders.map(order => {
    let provName = order.customer?.provinceName || (order.shippingAddress as any)?.province_name || 'Khác';
    provName = provName.replace(/^(Tỉnh |Thành phố |TP\.?\s*)/i, '').trim();

    let mainStationName = 'Chưa phân trạm';
    if (order.mainStation) {
      if (order.mainStation.isActive) {
        mainStationName = order.mainStation.name;
      } else if (['Trạm Hồ Chí Minh', 'Trạm Đồng Nai', 'Trạm Vũng Tàu'].includes(order.mainStation.name)) {
        mainStationName = 'Truliva';
      }
    }
    if (mainStationName === 'Chưa phân trạm' && order.techStation?.mainStation) {
      if (order.techStation.mainStation.isActive) {
        mainStationName = order.techStation.mainStation.name;
      } else if (['Trạm Hồ Chí Minh', 'Trạm Đồng Nai', 'Trạm Vũng Tàu'].includes(order.techStation.mainStation.name)) {
        mainStationName = 'Truliva';
      }
    }

    return {
      id: order.id,
      province: provName,
      mainStationName,
      techStationId: order.techStationId
    };
  });

  let filteredOrders = processedOrders;
  const mainStationIds = parseMultiValue(mainStationId);
  if (mainStationIds.length > 0) {
    const targetMainStations = await prisma.mainStation.findMany({
      where: { id: { in: mainStationIds } }
    });
    const targetNames = targetMainStations.map(s => s.name);
    if (targetNames.length > 0) {
      filteredOrders = filteredOrders.filter(o => targetNames.includes(o.mainStationName));
    }
  }
  const techStationIds = parseMultiValue(techStationId);
  if (techStationIds.length > 0) {
    filteredOrders = filteredOrders.filter(o => o.techStationId != null && techStationIds.includes(o.techStationId));
  }

  // Calculate provinceStats
  const map: Record<string, any> = {};
  filteredOrders.forEach(o => {
    const val = o.province;
    if (!map[val]) {
      map[val] = { name: val, total: 0 };
    }
    map[val].total++;
  });

  const provinceStats = Object.values(map);
  console.log('Province Stats:', provinceStats);
  const sum = provinceStats.reduce((s, item) => s + item.total, 0);
  console.log('Sum of Province Stats:', sum);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());

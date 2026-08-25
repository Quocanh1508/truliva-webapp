import { Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import { syncOrderStatusToPancake } from '../services/orderProcessor';
import { sendPushNotification } from '../services/notificationService';
import { sendWebPushNotification } from '../services/webPushService';
import { syncOrderInventoryState } from '../services/inventoryService';
import { activateSerialWarranty, syncSerialFromReport } from '../services/warrantyService';
import ExcelJS from 'exceljs';
import axios from 'axios';
import { formatOrderCode, buildReportFilter } from '../services/reportService';
import { getComboComponents, ComboComponent } from './orderController';

export async function createReport(req: Request, res: Response): Promise<void> {
  try {
    const {
      month,
      customerName,
      customerPhone,
      province,
      products,
      serviceType,
      imageUrls,
      notes,
      serialNumber,
      distanceKm,
      serviceCost,
      additionalCost,
      orderId,
      workType,
      address,
      actualAmount,
      waterSource,
      tdsIn,
      tdsOut,
      waterPressure,
      spareParts,
      issueType,
      handlingMethod,
      items,
      mainStationId,
      techStationId,
      assignedKtvId,
    } = req.body;

    if (!customerName || !customerPhone) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin bắt buộc' });
      return;
    }

    if (!orderId) {
      res.status(400).json({ error: 'Vui lòng chọn đơn hàng để báo cáo' });
      return;
    }

    const userRole = req.user!.role;
    const isKtv = userRole === 'KTV';

    let resolvedMainStationId = mainStationId || null;

    if (!resolvedMainStationId) {
      if (orderId) {
        const targetOrder = await prisma.order.findUnique({
          where: { id: orderId },
          select: { mainStationId: true }
        });
        if (targetOrder?.mainStationId) {
          resolvedMainStationId = targetOrder.mainStationId;
        }
      }
      if (!resolvedMainStationId && (req.user as any).mainStationId) {
        resolvedMainStationId = (req.user as any).mainStationId;
      }
      if (!resolvedMainStationId) {
        const firstStation = await prisma.mainStation.findFirst({ select: { id: true } });
        if (firstStation) {
          resolvedMainStationId = firstStation.id;
        }
      }
    }

    if (!isKtv && !resolvedMainStationId) {
      res.status(400).json({ error: 'Tài khoản văn phòng bắt buộc phải chọn Trạm chính khi báo cáo' });
      return;
    }

    if (isKtv && (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0)) {
      res.status(400).json({ error: 'Báo cáo bắt buộc phải có hình ảnh xác nhận' });
      return;
    }

    const reportMonth = month || `${new Date().getMonth() + 1}/${new Date().getFullYear()}`;

    let reportItems = items || [];

    if (reportItems.length === 0 && ((products && products.length > 0) || (spareParts && spareParts.length > 0))) {
      const allStrings = [...(products || []), ...(spareParts || [])];
      for (const str of allStrings) {
        const match = str.match(/^(.+?)\s*x\s*(\d+)$/);
        let name = str.trim();
        let qty = 1;
        if (match) {
          name = match[1].trim();
          qty = parseInt(match[2], 10) || 1;
        }
        if (name) {
          reportItems.push({ productName: name, quantity: qty });
        }
      }
    }

    let finalProducts = products || [];
    let finalSpareParts = spareParts || [];

    const itemNames = reportItems.map((i: any) => i.productName);
    const matchedProducts = await prisma.product.findMany({
      where: {
        name: { in: itemNames },
        isActive: true
      }
    });

    if (reportItems.length > 0) {
      const parsedProducts: string[] = [];
      const parsedSpareParts: string[] = [];
      for (const item of reportItems) {
        const prod = matchedProducts.find(p => p.name === item.productName);
        const cat = prod?.category || '';
        const formatted = item.quantity > 1 ? `${item.productName} x${item.quantity}` : item.productName;
        if (cat.toLowerCase() === 'spare part') {
          parsedSpareParts.push(formatted);
        } else {
          parsedProducts.push(formatted);
        }
      }
      finalProducts = parsedProducts;
      finalSpareParts = parsedSpareParts;
    }

    let isApprovalRequired = false;
    let oldOrder = null;
    const arisingItemsList: string[] = [];

    if (orderId) {
      oldOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true }
      });

      if (oldOrder) {
        const isApprovalWorkType = ['Bảo hành', 'Sửa chữa', 'Thay lọc'].includes(oldOrder.workType || '');

        if (isApprovalWorkType) {
          for (const reportItem of reportItems) {
            const matchingOriginalItem = oldOrder.items.find(
              (oi: any) => oi.productName?.trim().toLowerCase() === reportItem.productName?.trim().toLowerCase()
            );

            if (!matchingOriginalItem) {
              isApprovalRequired = true;
              arisingItemsList.push(`${reportItem.productName} (x${reportItem.quantity})`);
            } else if (reportItem.quantity > (matchingOriginalItem.quantity || 0)) {
              isApprovalRequired = true;
              const extraQty = reportItem.quantity - (matchingOriginalItem.quantity || 0);
              arisingItemsList.push(`${reportItem.productName} (thêm x${extraQty})`);
            }
          }
        }
      }

      await prisma.serviceReport.deleteMany({
        where: {
          orderId,
          approvalStatus: { in: ['PENDING', 'REJECTED'] }
        }
      });
    }

    if (oldOrder && ['Bảo hành', 'Sửa chữa', 'Thay lọc'].includes(oldOrder.workType || '')) {
      if (finalSpareParts.length > 0) {
        isApprovalRequired = true;
        if (arisingItemsList.length === 0) {
          arisingItemsList.push(...finalSpareParts);
        }
      }
    } else {
      isApprovalRequired = false;
    }

    if (req.user!.role !== 'KTV') {
      isApprovalRequired = false;
    }

    const targetKtvUserId = isKtv ? req.user!.id : (assignedKtvId || req.user!.id);
    const reportedById = req.user!.id;

    const serviceTypeClean = (serviceType || '').trim().toLowerCase();
    const workTypeClean = (workType || oldOrder?.workType || '').trim().toLowerCase();

    const isSurveyInRepair = workTypeClean === 'sửa chữa' && serviceTypeClean.includes('khảo sát vị trí');
    const isDeliveryOnly = workTypeClean === 'giao hàng';
    const requiresSerial = !isSurveyInRepair && !isDeliveryOnly;

    let cleanedSn: string | null = null;
    if (serialNumber) {
      cleanedSn = serialNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    }

    if (requiresSerial) {
      if (!cleanedSn) {
        res.status(400).json({ error: 'Loại công việc/dịch vụ này bắt buộc phải nhập số Serial thiết bị.' });
        return;
      }
    }

    if (cleanedSn && cleanedSn !== 'XXXXX') {
      const existingSerialRecord = await prisma.serial.findUnique({
        where: { serialNumber: cleanedSn }
      });
      if (!existingSerialRecord) {
        res.status(400).json({
          error: `Số Serial "${cleanedSn}" không tồn tại trong hệ thống. Vui lòng kiểm tra lại thông tin trên thân máy hoặc liên hệ điều phối để đăng ký số Serial mới trước khi tạo báo cáo.`
        });
        return;
      }
    }

    const report = await prisma.serviceReport.create({
      data: {
        month: reportMonth,
        ktvUserId: targetKtvUserId,
        reportedById,
        customerName,
        customerPhone,
        province: province || 'N/A',
        products: finalProducts,
        serviceType: serviceType || 'N/A',
        imageUrls: imageUrls || [],
        notes: notes || null,
        serialNumber: cleanedSn,
        distanceKm: (distanceKm !== undefined && distanceKm !== null && distanceKm !== '') ? parseFloat(distanceKm) : null,
        serviceCost: (serviceCost !== undefined && serviceCost !== null && serviceCost !== '') ? parseFloat(serviceCost) : null,
        additionalCost: (additionalCost !== undefined && additionalCost !== null && additionalCost !== '') ? parseFloat(additionalCost) : null,
        orderId: orderId || null,
        mainStationId: resolvedMainStationId || null,
        workType: workType || null,
        address: address || null,
        actualAmount: (actualAmount !== undefined && actualAmount !== null && actualAmount !== '') ? parseFloat(actualAmount) : null,
        waterSource: waterSource || null,
        tdsIn: (tdsIn !== undefined && tdsIn !== null && tdsIn !== '') ? parseFloat(tdsIn) : null,
        tdsOut: (tdsOut !== undefined && tdsOut !== null && tdsOut !== '') ? parseFloat(tdsOut) : null,
        waterPressure: (waterPressure !== undefined && waterPressure !== null && waterPressure !== '') ? parseFloat(waterPressure) : null,
        spareParts: finalSpareParts,
        issueType: issueType || null,
        handlingMethod: handlingMethod || null,
        approvalStatus: isApprovalRequired ? 'PENDING' : 'APPROVED',
      } as any,
      include: {
        ktvUser: { select: { fullName: true } },
      },
    });

    if (report.serialNumber && report.serialNumber !== 'XXXXX') {
      try {
        const isActivationWorkType = ['lắp đặt', 'giao hàng và lắp đặt'].includes(workTypeClean);
        if (report.approvalStatus === 'APPROVED' && isActivationWorkType) {
          await activateSerialWarranty(
            report.serialNumber,
            orderId || null,
            { customerName, customerPhone, address, province },
            'KTV',
            'Đã kích hoạt'
          );
        } else {
          await syncSerialFromReport(
            report.serialNumber,
            orderId || null,
            { customerName, customerPhone, address, province }
          );
        }
      } catch (serialErr: any) {
        logger.error('Lỗi đối chiếu hoặc kích hoạt/đồng bộ serial khi tạo báo cáo', { error: serialErr.message, serialNumber: report.serialNumber });
      }
    }

    if (orderId) {
      try {
        if (oldOrder) {
          const currentShippingAddress = (oldOrder.shippingAddress as any) || {};
          const updatedShippingAddress = {
            ...currentShippingAddress,
            province_name: province || currentShippingAddress.province_name,
            full_address: address || currentShippingAddress.full_address,
          };

          let targetWarehouseId = oldOrder.warehouseId || null;
          let targetWarehouseName = (oldOrder.warehouseInfo as any)?.name || 'Kho hàng';

          const ktvUser = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { warehouseId: true, warehouseName: true }
          });
          
          if (!targetWarehouseId && ktvUser?.warehouseId) {
            targetWarehouseId = ktvUser.warehouseId;
            targetWarehouseName = ktvUser.warehouseName || 'Kho hàng';
          }

          await prisma.orderItem.deleteMany({
            where: { orderId: oldOrder.id }
          });

          const isWarranty = (oldOrder.workType || '').toLowerCase() === 'bảo hành';

          if (reportItems.length > 0) {
            await prisma.orderItem.createMany({
              data: reportItems.map((item: any) => {
                const prod = matchedProducts.find(p => p.name === item.productName);
                return {
                  orderId: oldOrder.id,
                  productName: item.productName,
                  sku: prod?.sku || null,
                  quantity: item.quantity,
                  price: isWarranty ? 0 : (prod?.sellingPrice || 0),
                  rawData: prod?.rawData || undefined
                };
              })
            });
          }

          const newTotalPrice = isWarranty ? 0 : reportItems.reduce((sum: number, item: any) => {
            const prod = matchedProducts.find(p => p.name === item.productName);
            return sum + ((prod?.sellingPrice || 0) * item.quantity);
          }, 0);
          const newTotalQuantity = reportItems.reduce((sum: number, item: any) => sum + item.quantity, 0);

          if (isApprovalRequired) {
            const orderUpdateData: any = {
              adminStatus: 'chờ duyệt',
              serviceType: serviceType || undefined,
              billFullName: customerName || undefined,
              billPhoneNumber: customerPhone || undefined,
              shippingAddress: updatedShippingAddress,
              totalPrice: newTotalPrice,
              totalQuantity: newTotalQuantity,
              warehouseId: targetWarehouseId,
              warehouseInfo: targetWarehouseId ? { id: targetWarehouseId, name: targetWarehouseName } : undefined
            };

            const updatedOrder = await prisma.order.update({
              where: { id: orderId },
              data: orderUpdateData,
            });

            try {
              const newOrderItems = await prisma.orderItem.findMany({
                where: { orderId }
              });
              await syncOrderInventoryState(orderId, {
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
              logger.error('Lỗi giữ kho khi chuyển đơn qua chờ duyệt', { orderId, error: invErr.message });
            }

            const orderCode = formatOrderCode(oldOrder.pancakeOrderId);
            const ktvTitle = 'Báo cáo đang chờ duyệt';
            const ktvContent = `Báo cáo với mã đơn ${orderCode} đang chờ được duyệt.`;
            
            await prisma.notification.create({
              data: {
                userId: req.user!.id,
                title: ktvTitle,
                content: ktvContent
              }
            });

            sendPushNotification(req.user!.id, ktvTitle, ktvContent, {
              type: 'REPORT_PENDING',
              reportId: report.id,
              orderId
            }).catch(err => logger.error('KTV push notification failed', { error: err.message }));

            sendWebPushNotification(req.user!.id, ktvTitle, ktvContent, {
              type: 'REPORT_PENDING',
              reportId: report.id,
              orderId
            }).catch(err => logger.error('KTV web push notification failed', { error: err.message }));

            const staffUsers = await prisma.user.findMany({
              where: {
                role: { in: ['ADMIN', 'COORDINATOR'] },
                isActive: true
              },
              select: { id: true, pushToken: true, webPushSubscription: true }
            });

            const staffTitle = 'Yêu cầu duyệt báo cáo';
            let staffContent = `KTV ${req.user!.fullName} đã gửi báo cáo có linh kiện phát sinh cho đơn hàng ${orderCode}. Vui lòng phê duyệt.`;
            if (arisingItemsList.length > 0) {
              staffContent += `\nLinh kiện phát sinh: ${arisingItemsList.join(', ')}`;
            }

            await prisma.notification.createMany({
              data: staffUsers.map(u => ({
                userId: u.id,
                title: staffTitle,
                content: staffContent,
                rawData: {
                  type: 'REPORT_APPROVAL_REQUEST',
                  reportId: report.id,
                  orderId
                } as any
              }))
            });

            for (const u of staffUsers) {
              if (u.pushToken) {
                sendPushNotification(u.id, staffTitle, staffContent, {
                  type: 'REPORT_APPROVAL_REQUEST',
                  reportId: report.id,
                  orderId
                }).catch(err => logger.error(`Staff push failed for user ${u.id}`, { error: err.message }));
              }
              if (u.webPushSubscription) {
                sendWebPushNotification(u.id, staffTitle, staffContent, {
                  type: 'REPORT_APPROVAL_REQUEST',
                  reportId: report.id,
                  orderId
                }).catch(err => logger.error(`Staff web push failed for user ${u.id}`, { error: err.message }));
              }
            }

            await prisma.auditLog.create({
              data: {
                entityType: 'Order',
                entityId: orderId,
                action: 'updated',
                changes: { adminStatus: { from: oldOrder.adminStatus || 'đang thực hiện', to: 'chờ duyệt' } },
                userId: req.user!.id,
                userName: req.user!.fullName,
              },
            });

            logger.info('Order status auto-updated to chờ duyệt due to KTV report submission with spare parts', { orderId });

          } else {
            if (oldOrder.pancakeOrderId > 0 && reportItems.length > 0) {
              const apiKey = process.env.PANCAKE_API_KEY;
              const shopId = '1635300067';
              if (apiKey) {
                const activeComboComponents = new Set<string>();
                for (const item of reportItems) {
                  const comps = getComboComponents(item.productName);
                  if (comps) {
                    comps.forEach((c: ComboComponent) => {
                      activeComboComponents.add(c.name.trim().toLowerCase());
                      if (c.sku) activeComboComponents.add(c.sku.trim().toLowerCase());
                    });
                  }
                }
                const sanitizedReportItems = reportItems.filter((item: any) => {
                  const comps = getComboComponents(item.productName);
                  if (comps) return true;
                  const iName = (item.productName || '').trim().toLowerCase();
                  return !activeComboComponents.has(iName);
                });

                const pancakeProducts = sanitizedReportItems.map((item: any) => {
                  const prod = matchedProducts.find(p => p.name === item.productName);
                  return {
                    variation_id: prod?.pancakeProductId || null,
                    quantity: item.quantity,
                    price: isWarranty ? 0 : (prod?.sellingPrice || 0)
                  };
                }).filter((p: any) => p.variation_id);

                try {
                  const updateResponse = await axios.patch(
                    `https://pos.pages.fm/api/v1/shops/${shopId}/orders/${oldOrder.pancakeOrderId}`,
                    {
                      products: pancakeProducts,
                      warehouse_id: targetWarehouseId || undefined
                    },
                    {
                      params: { api_key: apiKey },
                      headers: { 'Content-Type': 'application/json' },
                      timeout: 10000
                    }
                  );

                  if (!updateResponse.data || !updateResponse.data.success) {
                    logger.error('Failed to patch products on Pancake POS', {
                      pancakeOrderId: oldOrder.pancakeOrderId,
                      response: updateResponse.data
                    });
                  }
                } catch (syncErr: any) {
                  logger.error('Error patching products on Pancake POS API', {
                    pancakeOrderId: oldOrder.pancakeOrderId,
                    error: syncErr.message,
                    response: syncErr.response?.data
                  });
                }
              }
            }

            let syncStatus = 'SUCCESS';
            try {
              await syncOrderStatusToPancake(oldOrder.pancakeOrderId, 'hoàn thành');
            } catch (syncErr: any) {
              logger.warn('Non-blocking Pancake POS status sync failed on report submission', {
                orderId,
                pancakeOrderId: oldOrder.pancakeOrderId,
                error: syncErr.message
              });
              syncStatus = 'FAILED';
            }

            const orderUpdateData: any = {
              adminStatus: 'hoàn thành',
              serviceType: serviceType || undefined,
              billFullName: customerName || undefined,
              billPhoneNumber: customerPhone || undefined,
              shippingAddress: updatedShippingAddress,
              pancakeSyncStatus: syncStatus,
              totalPrice: newTotalPrice,
              totalQuantity: newTotalQuantity,
              warehouseId: targetWarehouseId,
              warehouseInfo: targetWarehouseId ? { id: targetWarehouseId, name: targetWarehouseName } : undefined
            };

            if (mainStationId) {
              orderUpdateData.mainStationId = mainStationId;
            }
            if (techStationId !== undefined) {
              orderUpdateData.techStationId = techStationId || null;
            }
            if (assignedKtvId !== undefined) {
              orderUpdateData.assignedKtvId = assignedKtvId || null;
            }

            const updatedOrder = await prisma.order.update({
              where: { id: orderId },
              data: orderUpdateData,
            });

            const isPancakeOrder = oldOrder.pancakeOrderId > 0;
            const shouldSyncInventory = userRole === 'KTV' || (isPancakeOrder && ['ADMIN', 'COORDINATOR', 'DEV', 'SALER'].includes(userRole));
            if (shouldSyncInventory) {
              try {
                const newOrderItems = await prisma.orderItem.findMany({
                  where: { orderId }
                });
                await syncOrderInventoryState(orderId, {
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
                logger.error('Lỗi khấu trừ kho khi hoàn thành đơn qua báo cáo', { orderId, error: invErr.message });
              }
            }

            await prisma.auditLog.create({
              data: {
                entityType: 'Order',
                entityId: orderId,
                action: 'updated',
                changes: { adminStatus: { from: oldOrder?.adminStatus || 'đang thực hiện', to: 'hoàn thành' } },
                userId: req.user!.id,
                userName: req.user!.fullName,
              },
            });
            logger.info('Order status auto-updated to hoàn thành due to KTV report submission', { orderId });
          }
        }
      } catch (err: any) {
        logger.error('Failed to auto-update order status on report creation', { orderId, error: err.message });
      }
    }

    logger.info('Report created', { reportId: report.id, ktvId: req.user!.id });
    res.status(201).json({ report });
  } catch (error: any) {
    logger.error('Create report error', { error: error.message });
    res.status(500).json({ error: 'Lỗi tạo báo cáo' });
  }
}

export async function getReports(req: Request, res: Response): Promise<void> {
  try {
    const { 
      page = '1', 
      limit = '20'
    } = req.query;

    const where = await buildReportFilter(req.query, req.user);

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const skip = (pageNum - 1) * limitNum;

    const [reports, total] = await Promise.all([
      prisma.serviceReport.findMany({
        where,
        include: {
          ktvUser: { 
            select: { 
              fullName: true, 
              username: true,
              role: true,
              techStation: {
                select: {
                  name: true,
                  mainStation: { select: { name: true } }
                }
              }
            } 
          },
          reportedByUser: {
            select: {
              fullName: true,
              username: true,
              role: true
            }
          },
          order: { 
            select: { 
              pancakeOrderId: true, 
              ktvCalledAt: true,
              appointmentTime: true,
              adminStatus: true,
              mainStation: { select: { name: true } },
              techStation: { select: { name: true } },
              pancakeCreatedAt: true,
              rawData: true,
              orderSource: true
            } 
          },
          mainStation: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.serviceReport.count({ where }),
    ]);

    res.json({
      reports,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    logger.error('Get reports error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách' });
  }
}

export async function getMyStats(req: Request, res: Response): Promise<void> {
  try {
    const ktvUserId = req.user!.id;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : null;

    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { assignedKtvId: ktvUserId },
          { serviceReports: { some: { ktvUserId: ktvUserId } } }
        ],
        AND: [
          {
            OR: [
              { statusCode: { not: 0 } },
              { statusCode: null },
              { pancakeOrderId: { lt: 0 } }
            ]
          }
        ]
      },
      select: {
        id: true,
        workType: true,
        adminStatus: true,
        ktvCalledAt: true,
        appointmentTime: true,
        createdAt: true,
        updatedAt: true,
        pancakeCreatedAt: true,
        pancakeUpdatedAt: true,
        serviceReports: {
          select: {
            createdAt: true,
            ktvUserId: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const todayTime = new Date(todayStr).getTime();

    const processed = orders.map(order => {
      const hasReport = order.serviceReports && order.serviceReports.length > 0;
      const isCompleted = order.adminStatus === 'hoàn thành' || hasReport;
      
      let status: 'chưa làm' | 'đang làm' | 'hoàn thành' | 'hủy' = 'chưa làm';
      if (isCompleted) {
        status = 'hoàn thành';
      } else if (order.adminStatus === 'hủy đơn') {
        status = 'hủy';
      } else if (order.ktvCalledAt !== null) {
        status = 'đang làm';
      } else {
        status = 'chưa làm';
      }

      let filterDate: Date;
      if (isCompleted) {
        filterDate = hasReport 
          ? order.serviceReports[0].createdAt 
          : (order.pancakeUpdatedAt || order.appointmentTime || order.pancakeCreatedAt || order.createdAt);
      } else {
        filterDate = order.appointmentTime || order.pancakeCreatedAt || order.createdAt;
      }

      let isOnTime = false;
      let isLate = false;
      const hasAppointment = order.appointmentTime !== null;
      if (hasAppointment) {
        const appointmentDateStr = order.appointmentTime!.toISOString().slice(0, 10);
        const appointmentTimeMs = new Date(appointmentDateStr).getTime();
        
        let completionTimeMs = 0;
        if (hasReport) {
          const completionDateStr = order.serviceReports[0].createdAt.toISOString().slice(0, 10);
          completionTimeMs = new Date(completionDateStr).getTime();
        } else if (order.adminStatus === 'hoàn thành') {
          const compDate = order.pancakeUpdatedAt || order.appointmentTime || order.pancakeCreatedAt || order.createdAt;
          const completionDateStr = compDate.toISOString().slice(0, 10);
          completionTimeMs = new Date(completionDateStr).getTime();
        }

        if (isCompleted) {
          if (completionTimeMs <= appointmentTimeMs) {
            isOnTime = true;
          } else {
            isLate = true;
          }
        } else if (order.adminStatus !== 'hủy đơn') {
          if (todayTime > appointmentTimeMs) {
            isLate = true;
          } else {
            isOnTime = true;
          }
        }
      }

      return {
        id: order.id,
        workType: order.workType || 'Chưa xác định',
        status,
        filterDate,
        isOnTime,
        isLate,
        hasAppointment
      };
    });

    const filtered = processed.filter(item => {
      if (start && item.filterDate < start) return false;
      if (end && item.filterDate > end) return false;
      return true;
    });

    let total = 0;
    let pending = 0;
    let progress = 0;
    let completed = 0;

    filtered.forEach(item => {
      if (item.status === 'hủy') return;
      total++;
      if (item.status === 'chưa làm') pending++;
      else if (item.status === 'đang làm') progress++;
      else if (item.status === 'hoàn thành') completed++;
    });

    const workTypeMap: Record<string, { pending: number, progress: number, completed: number }> = {};
    filtered.forEach(item => {
      if (item.status === 'hủy') return;
      if (!workTypeMap[item.workType]) {
        workTypeMap[item.workType] = { pending: 0, progress: 0, completed: 0 };
      }
      if (item.status === 'chưa làm') workTypeMap[item.workType].pending++;
      else if (item.status === 'đang làm') workTypeMap[item.workType].progress++;
      else if (item.status === 'hoàn thành') workTypeMap[item.workType].completed++;
    });

    const workTypeStats = Object.entries(workTypeMap).map(([name, counts]) => ({
      name,
      ...counts
    }));

    let onTimeCount = 0;
    let lateCount = 0;
    filtered.forEach(item => {
      if (item.status === 'hủy' || !item.hasAppointment) return;
      if (item.isOnTime) onTimeCount++;
      if (item.isLate) lateCount++;
    });

    const totalAppointed = onTimeCount + lateCount;
    const onTimePercent = totalAppointed > 0 ? Math.round((onTimeCount / totalAppointed) * 100) : 100;
    const latePercent = totalAppointed > 0 ? 100 - onTimePercent : 0;

    const delayMap: Record<string, { onTime: number, late: number }> = {};
    filtered.forEach(item => {
      if (item.status === 'hủy' || !item.hasAppointment) return;
      if (!delayMap[item.workType]) {
        delayMap[item.workType] = { onTime: 0, late: 0 };
      }
      if (item.isOnTime) delayMap[item.workType].onTime++;
      if (item.isLate) delayMap[item.workType].late++;
    });

    const delayStats = Object.entries(delayMap).map(([name, counts]) => ({
      name,
      ...counts
    }));

    const dailyCompleted: Record<string, Record<string, number>> = {};
    filtered.forEach(item => {
      if (item.status === 'hoàn thành') {
        const d = item.filterDate;
        const dayStr = String(d.getDate()).padStart(2, '0');
        const monthStr = String(d.getMonth() + 1).padStart(2, '0');
        const yearStr = d.getFullYear();
        const dateStr = `${dayStr}/${monthStr}/${yearStr}`;

        if (!dailyCompleted[dateStr]) {
          dailyCompleted[dateStr] = {};
        }
        if (!dailyCompleted[dateStr][item.workType]) {
          dailyCompleted[dateStr][item.workType] = 0;
        }
        dailyCompleted[dateStr][item.workType]++;
      }
    });

    const dailyBreakdown = Object.entries(dailyCompleted).map(([date, workTypes]) => {
      const totalCount = Object.values(workTypes).reduce((a, b) => a + b, 0);
      const details = Object.entries(workTypes).map(([wt, count]) => `${wt}: ${count}`).join(', ');
      return {
        date,
        total: totalCount,
        details,
        workTypes: Object.entries(workTypes).map(([name, count]) => ({ name, count }))
      };
    }).sort((a, b) => {
      const [dayA, monthA, yearA] = a.date.split('/').map(Number);
      const [dayB, monthB, yearB] = b.date.split('/').map(Number);
      const dateA = new Date(yearA, monthA - 1, dayA);
      const dateB = new Date(yearB, monthB - 1, dayB);
      return dateB.getTime() - dateA.getTime();
    });

    res.json({
      summary: {
        total,
        pending,
        progress,
        completed
      },
      workTypeStats,
      delaySummary: {
        onTime: onTimeCount,
        onTimePercent,
        late: lateCount,
        latePercent
      },
      delayStats,
      dailyBreakdown
    });
  } catch (error: any) {
    logger.error('Get KTV stats error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy thống kê báo cáo' });
  }
}

export async function getFilterOptions(req: Request, res: Response): Promise<void> {
  try {
    const [
      workTypes,
      serviceTypes,
      products,
      categories,
      mainStations,
      techStations,
      ktvs,
      provinces
    ] = await Promise.all([
      prisma.serviceReport.findMany({ select: { workType: true }, distinct: ['workType'] }),
      prisma.serviceReport.findMany({ select: { serviceType: true }, distinct: ['serviceType'] }),
      prisma.product.findMany({ select: { name: true, category: true }, orderBy: { name: 'asc' } }),
      prisma.product.findMany({ select: { category: true }, distinct: ['category'] }),
      prisma.mainStation.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.techStation.findMany({ where: { isActive: true }, select: { id: true, name: true, mainStationId: true }, orderBy: { name: 'asc' } }),
      prisma.user.findMany({
        where: { role: 'KTV', isActive: true },
        select: { id: true, fullName: true, techStationId: true },
        orderBy: { fullName: 'asc' }
      }),
      prisma.serviceReport.findMany({ select: { province: true }, distinct: ['province'] })
    ]);

    res.json({
      workTypes: workTypes.map((w: any) => w.workType).filter(Boolean),
      serviceTypes: serviceTypes.map((s: any) => s.serviceType).filter(Boolean),
      products: products.map((p: any) => p.name).filter(Boolean),
      productsDetailed: products.map((p: any) => ({ name: p.name, category: p.category })),
      categories: categories.map((c: any) => c.category).filter(Boolean),
      mainStations,
      techStations,
      ktvs,
      provinces: provinces.map((p: any) => p.province).filter(Boolean)
    });
  } catch (error: any) {
    logger.error('Get filter options error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh mục bộ lọc' });
  }
}

export async function getReportStats(req: Request, res: Response): Promise<void> {
  try {
    const { month } = req.query;
    const where: any = {};
    if (month) where.month = month;

    const [totalReports, totalPaid, aggregations, byServiceType, byProvince] = await Promise.all([
      prisma.serviceReport.count({ where }),
      prisma.serviceReport.count({ where: { ...where, isPaid: true } }),
      prisma.serviceReport.aggregate({
        where,
        _sum: { serviceCost: true, additionalCost: true, distanceKm: true },
      }),
      prisma.serviceReport.groupBy({
        by: ['serviceType'],
        where,
        _count: true,
      }),
      prisma.serviceReport.groupBy({
        by: ['province'],
        where,
        _count: true,
        orderBy: { _count: { province: 'desc' } },
        take: 10,
      }),
    ]);

    res.json({
      totalReports,
      totalPaid,
      totalUnpaid: totalReports - totalPaid,
      totalServiceCost: aggregations._sum.serviceCost || 0,
      totalAdditionalCost: aggregations._sum.additionalCost || 0,
      totalDistanceKm: aggregations._sum.distanceKm || 0,
      byServiceType: byServiceType.map((s) => ({ type: s.serviceType, count: s._count })),
      byProvince: byProvince.map((p) => ({ province: p.province, count: p._count })),
    });
  } catch (error: any) {
    logger.error('Get stats error', { error: error.message });
    res.status(500).json({ error: 'Lỗi thống kê' });
  }
}

export async function exportReports(req: Request, res: Response): Promise<void> {
  try {
    const month = req.query.month as string;
    const where = await buildReportFilter(req.query, req.user);

    const reports = await prisma.serviceReport.findMany({
      where,
      include: { 
        ktvUser: { select: { fullName: true } },
        order: { select: { pancakeOrderId: true, ktvCalledAt: true } }
      },
      orderBy: { createdAt: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Báo cáo KTV');

    sheet.columns = [
      { header: 'Tháng', key: 'month', width: 12 },
      { header: 'Thời gian', key: 'createdAt', width: 20 },
      { header: 'Tên KTV', key: 'ktvName', width: 25 },
      { header: 'Mã Đơn', key: 'pancakeOrderId', width: 15 },
      { header: 'Tên khách hàng', key: 'customerName', width: 25 },
      { header: 'SĐT khách hàng', key: 'customerPhone', width: 18 },
      { header: 'Địa chỉ', key: 'address', width: 30 },
      { header: 'Tỉnh/TP', key: 'province', width: 20 },
      { header: 'Loại công việc', key: 'workType', width: 22 },
      { header: 'Sản phẩm', key: 'products', width: 40 },
      { header: 'Loại dịch vụ', key: 'serviceType', width: 25 },
      { header: 'Số serial', key: 'serialNumber', width: 22 },
      { header: 'Nguyên nhân / Sự cố', key: 'issueType', width: 25 },
      { header: 'Cách xử lý', key: 'handlingMethod', width: 25 },
      { header: 'Nguồn nước', key: 'waterSource', width: 20 },
      { header: 'TDS đầu vào (ppm)', key: 'tdsIn', width: 18 },
      { header: 'TDS đầu ra (ppm)', key: 'tdsOut', width: 18 },
      { header: 'Áp suất (psi)', key: 'waterPressure', width: 16 },
      { header: 'Linh kiện phát sinh', key: 'spareParts', width: 30 },
      { header: 'Khoảng cách (km)', key: 'distanceKm', width: 18 },
      { header: 'Tiền thu thực tế', key: 'actualAmount', width: 18 },
      { header: 'Đã trả tiền', key: 'isPaid', width: 14 },
      { header: 'Ghi chú', key: 'notes', width: 30 },
      { header: 'Hình ảnh', key: 'imageUrls', width: 50 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };

    reports.forEach((r: any) => {
      sheet.addRow({
        month: r.month,
        createdAt: r.createdAt.toLocaleString('vi-VN'),
        ktvName: r.ktvUser.fullName,
        pancakeOrderId: r.order?.pancakeOrderId 
          ? (r.order.pancakeOrderId < 0 ? `M${Math.abs(r.order.pancakeOrderId)}` : r.order.pancakeOrderId) 
          : '',
        customerName: r.customerName,
        customerPhone: r.customerPhone,
        address: r.address || '',
        province: r.province,
        workType: r.workType || '',
        products: r.products.join(', '),
        serviceType: r.serviceType,
        serialNumber: r.serialNumber || '',
        issueType: r.issueType || '',
        handlingMethod: r.handlingMethod || '',
        waterSource: r.waterSource || '',
        tdsIn: r.tdsIn || '',
        tdsOut: r.tdsOut || '',
        waterPressure: r.waterPressure || '',
        spareParts: r.spareParts?.join(', ') || '',
        distanceKm: r.distanceKm || '',
        actualAmount: r.actualAmount || 0,
        isPaid: r.isPaid ? 'Đã trả' : 'Chưa trả',
        notes: r.notes || '',
        imageUrls: r.imageUrls.join(', '),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=bao-cao-ktv-${month || 'all'}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Export error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xuất file' });
  }
}

export async function checkReportSerial(req: Request, res: Response): Promise<void> {
  try {
    const { serialNumber } = req.query;
    if (!serialNumber) {
      res.status(400).json({ error: 'Thiếu số Serial' });
      return;
    }

    const cleanInput = (serialNumber as string).replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
    if (!cleanInput) {
      res.json({ exists: false });
      return;
    }

    if (cleanInput === 'XXXXX') {
      res.json({
        exists: true,
        installDate: null,
        customerName: null,
        products: [],
        serialNumber: cleanInput,
        model: 'Thiết bị ngoại lệ',
        source: 'exception',
      });
      return;
    }

    const serialRecord = await prisma.serial.findUnique({
      where: { serialNumber: cleanInput },
    });

    if (serialRecord) {
      const installReport = await prisma.serviceReport.findFirst({
        where: {
          serialNumber: { mode: 'insensitive', equals: cleanInput },
          workType: { in: ['Lắp đặt', 'Giao hàng và Lắp đặt'] },
        },
        orderBy: { createdAt: 'asc' },
      });

      res.json({
        exists: true,
        installDate: serialRecord.activationDate || installReport?.createdAt || null,
        customerName: serialRecord.customerName || installReport?.customerName || null,
        products: installReport?.products || [serialRecord.model],
        serialNumber: serialRecord.serialNumber,
        model: serialRecord.model,
        warrantyExpiryDate: serialRecord.warrantyExpiryDate,
        status: serialRecord.status,
        source: 'serial_table',
      });
      return;
    }

    const exactMatch = await prisma.serviceReport.findFirst({
      where: {
        serialNumber: {
          mode: 'insensitive',
          equals: (serialNumber as string).trim()
        },
        workType: { in: ['Lắp đặt', 'Giao hàng và Lắp đặt'] }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (exactMatch) {
      res.json({
        exists: true,
        installDate: exactMatch.createdAt,
        customerName: exactMatch.customerName,
        products: exactMatch.products,
        serialNumber: exactMatch.serialNumber,
        source: 'service_report',
      });
      return;
    }

    const possibleReports = await prisma.serviceReport.findMany({
      where: {
        workType: { in: ['Lắp đặt', 'Giao hàng và Lắp đặt'] },
        serialNumber: { not: null }
      },
      select: {
        id: true,
        serialNumber: true,
        createdAt: true,
        customerName: true,
        products: true
      }
    });

    const fuzzyMatch = possibleReports.find((r: any) => {
      const cleanDb = (r.serialNumber || '').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
      return cleanDb === cleanInput;
    });

    if (fuzzyMatch) {
      res.json({
        exists: true,
        installDate: fuzzyMatch.createdAt,
        customerName: fuzzyMatch.customerName,
        products: fuzzyMatch.products,
        serialNumber: fuzzyMatch.serialNumber,
        source: 'service_report',
      });
      return;
    }

    res.json({ exists: false });
  } catch (error: any) {
    logger.error('Check serial error', { error: error.message });
    res.status(500).json({ error: 'Lỗi kiểm tra số Serial' });
  }
}

export async function getReportById(req: Request, res: Response): Promise<void> {
  try {
    const targetId = req.params.id as string;
    const reportFilter = await buildReportFilter({}, req.user);

    const reportInclude = {
      ktvUser: { select: { fullName: true, username: true, role: true } },
      reportedByUser: { select: { fullName: true, username: true, role: true } },
      order: {
        select: {
          id: true,
          pancakeOrderId: true,
          billFullName: true,
          billPhoneNumber: true,
          shippingAddress: true,
          customer: true,
          workType: true,
          serviceType: true,
          items: true,
          moneyToCollect: true,
          totalPrice: true
        }
      }
    };

    // 1. Tìm theo ID chính xác của Báo cáo (ServiceReport.id)
    let report = await prisma.serviceReport.findFirst({
      where: {
        id: targetId,
        ...reportFilter
      },
      include: reportInclude,
    });

    // 2. Nếu không tìm thấy (do ID cũ bị thay thế/xóa hoặc truyền orderId/pancakeOrderId), tìm báo cáo mới nhất theo orderId hoặc pancakeOrderId
    if (!report) {
      const parsedPancakeId = parseInt(targetId, 10);
      const isNumeric = !isNaN(parsedPancakeId) && String(parsedPancakeId) === targetId.trim();

      report = await prisma.serviceReport.findFirst({
        where: {
          OR: [
            { orderId: targetId },
            ...(isNumeric ? [{ order: { pancakeOrderId: parsedPancakeId } }] : [])
          ],
          ...reportFilter
        },
        orderBy: { createdAt: 'desc' },
        include: reportInclude,
      });
    }

    // 3. Nếu vẫn chưa tìm thấy (ID báo cáo cũ nằm trong Notification rawData), tra cứu orderId từ Notification
    if (!report) {
      const relatedNotif = await prisma.notification.findFirst({
        where: {
          rawData: { path: ['reportId'], equals: targetId }
        },
        select: { rawData: true }
      });
      const orderIdFromNotif = (relatedNotif?.rawData as any)?.orderId;
      if (orderIdFromNotif) {
        report = await prisma.serviceReport.findFirst({
          where: {
            orderId: orderIdFromNotif,
            ...reportFilter
          },
          orderBy: { createdAt: 'desc' },
          include: reportInclude,
        });
      }
    }

    if (!report) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo hoặc bạn không có quyền xem' });
      return;
    }

    res.json({ report });
  } catch (error: any) {
    logger.error('Get report error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy báo cáo' });
  }
}

export async function updateReport(req: Request, res: Response): Promise<void> {
  try {
    const existingReport = await prisma.serviceReport.findUnique({
      where: { id: req.params.id as string },
      include: { order: { select: { pancakeOrderId: true } } },
    });

    if (!existingReport) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo' });
      return;
    }

    const isAdminOrCoordinator = req.user!.role === 'ADMIN' || req.user!.role === 'COORDINATOR' || req.user!.role === 'DEV';
    const isOwner = existingReport.ktvUserId === req.user!.id;

    if (!isAdminOrCoordinator && !isOwner) {
      res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa báo cáo này' });
      return;
    }

    const {
      isPaid, serviceCost, additionalCost, notes,
      customerName, customerPhone, province, address,
      products, serviceType, workType,
      serialNumber, distanceKm, actualAmount,
      waterSource, tdsIn, tdsOut, waterPressure,
      spareParts, issueType, handlingMethod,
      imageUrls,
      items,
    } = req.body;

    if (imageUrls !== undefined && (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0)) {
      res.status(400).json({ error: 'Báo cáo bắt buộc phải có hình ảnh xác nhận' });
      return;
    }

    let finalProducts = products;
    let finalSpareParts = spareParts;

    let reportItems = items;
    if (reportItems === undefined && (products !== undefined || spareParts !== undefined)) {
      reportItems = [];
      const allStrings = [...(products || []), ...(spareParts || [])];
      for (const str of allStrings) {
        const match = str.match(/^(.+?)\s*x\s*(\d+)$/);
        let name = str.trim();
        let qty = 1;
        if (match) {
          name = match[1].trim();
          qty = parseInt(match[2], 10) || 1;
        }
        if (name) {
          reportItems.push({ productName: name, quantity: qty });
        }
      }
    }

    let matchedProducts: any[] = [];
    if (reportItems !== undefined) {
      const itemNames = reportItems.map((i: any) => i.productName);
      matchedProducts = await prisma.product.findMany({
        where: {
          name: { in: itemNames },
          isActive: true
        }
      });

      const parsedProducts: string[] = [];
      const parsedSpareParts: string[] = [];
      for (const item of reportItems) {
        const prod = matchedProducts.find(p => p.name === item.productName);
        const cat = prod?.category || '';
        const formatted = item.quantity > 1 ? `${item.productName} x${item.quantity}` : item.productName;
        if (cat.toLowerCase() === 'spare part') {
          parsedSpareParts.push(formatted);
        } else {
          parsedProducts.push(formatted);
        }
      }
      finalProducts = parsedProducts;
      finalSpareParts = parsedSpareParts;
    }

    const targetServiceType = serviceType !== undefined ? serviceType : existingReport.serviceType;
    const targetWorkType = workType !== undefined ? workType : (existingReport.workType || '');
    const targetSerialNumber = serialNumber !== undefined ? serialNumber : existingReport.serialNumber;

    const serviceTypeClean = (targetServiceType || '').trim().toLowerCase();
    const workTypeClean = (targetWorkType || '').trim().toLowerCase();

    const isSurveyInRepair = workTypeClean === 'sửa chữa' && serviceTypeClean.includes('khảo sát vị trí');
    const isDeliveryOnly = workTypeClean === 'giao hàng';
    const requiresSerial = !isSurveyInRepair && !isDeliveryOnly;

    let cleanedSn: string | null = null;
    if (targetSerialNumber) {
      cleanedSn = targetSerialNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    }

    if (requiresSerial) {
      if (!cleanedSn) {
        res.status(400).json({ error: 'Loại công việc/dịch vụ này bắt buộc phải nhập số Serial thiết bị.' });
        return;
      }
    }

    if (cleanedSn && cleanedSn !== 'XXXXX') {
      const existingSerialRecord = await prisma.serial.findUnique({
        where: { serialNumber: cleanedSn }
      });
      if (!existingSerialRecord) {
        res.status(400).json({
          error: `Số Serial "${cleanedSn}" không tồn tại trong hệ thống. Vui lòng kiểm tra lại thông tin trên thân máy hoặc liên hệ điều phối để đăng ký số Serial mới trước khi cập nhật báo cáo.`
        });
        return;
      }
    }

    const updateData: any = {};
    if (isPaid !== undefined) updateData.isPaid = isPaid;
    if (serviceCost !== undefined) updateData.serviceCost = parseFloat(serviceCost);
    if (additionalCost !== undefined) updateData.additionalCost = parseFloat(additionalCost);
    if (notes !== undefined) updateData.notes = notes;

    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (province !== undefined) updateData.province = province;
    if (address !== undefined) updateData.address = address;
    if (finalProducts !== undefined) updateData.products = finalProducts;
    if (serviceType !== undefined) updateData.serviceType = serviceType;
    if (workType !== undefined) updateData.workType = workType;
    if (actualAmount !== undefined) updateData.actualAmount = actualAmount !== null && actualAmount !== '' ? parseFloat(actualAmount) : null;

    if (serialNumber !== undefined) updateData.serialNumber = cleanedSn;
    if (distanceKm !== undefined) updateData.distanceKm = distanceKm !== null && distanceKm !== '' ? parseFloat(distanceKm) : null;
    if (waterSource !== undefined) updateData.waterSource = waterSource || null;
    if (tdsIn !== undefined) updateData.tdsIn = tdsIn !== null && tdsIn !== '' ? parseFloat(tdsIn) : null;
    if (tdsOut !== undefined) updateData.tdsOut = tdsOut !== null && tdsOut !== '' ? parseFloat(tdsOut) : null;
    if (waterPressure !== undefined) updateData.waterPressure = waterPressure !== null && waterPressure !== '' ? parseFloat(waterPressure) : null;
    if (finalSpareParts !== undefined) updateData.spareParts = finalSpareParts;
    if (issueType !== undefined) updateData.issueType = issueType || null;
    if (handlingMethod !== undefined) updateData.handlingMethod = handlingMethod || null;

    if (imageUrls !== undefined) updateData.imageUrls = imageUrls || [];

    const report = await prisma.serviceReport.update({
      where: { id: req.params.id as string },
      data: updateData,
      include: { ktvUser: { select: { fullName: true } } },
    });

    if (report.serialNumber && report.serialNumber !== 'XXXXX') {
      try {
        const isActivationWorkType = ['lắp đặt', 'giao hàng và lắp đặt'].includes(workTypeClean);
        if (report.approvalStatus === 'APPROVED' && isActivationWorkType) {
          await activateSerialWarranty(
            report.serialNumber,
            report.orderId || null,
            {
              customerName: report.customerName,
              customerPhone: report.customerPhone,
              address: report.address,
              province: report.province
            },
            'KTV',
            'Đã kích hoạt'
          );
        } else {
          await syncSerialFromReport(
            report.serialNumber,
            report.orderId || null,
            {
              customerName: report.customerName,
              customerPhone: report.customerPhone,
              address: report.address,
              province: report.province
            }
          );
        }
      } catch (serialErr: any) {
        logger.error('Lỗi đối chiếu hoặc kích hoạt/đồng bộ serial khi cập nhật báo cáo', { error: serialErr.message, serialNumber: report.serialNumber });
      }
    }

    if (existingReport.orderId && reportItems !== undefined) {
      try {
        const orderId = existingReport.orderId;
        const oldOrder = await prisma.order.findUnique({
          where: { id: orderId },
          include: { items: true }
        });

        if (oldOrder) {
          let targetWarehouseId = oldOrder.warehouseId || null;
          let targetWarehouseName = (oldOrder.warehouseInfo as any)?.name || 'Kho hàng';

          const isWarranty = (oldOrder.workType || '').toLowerCase() === 'bảo hành';

          await prisma.orderItem.deleteMany({
            where: { orderId }
          });

          if (reportItems.length > 0) {
            await prisma.orderItem.createMany({
              data: reportItems.map((item: any) => {
                const prod = matchedProducts.find(p => p.name === item.productName);
                return {
                  orderId,
                  productName: item.productName,
                  sku: prod?.sku || null,
                  quantity: item.quantity,
                  price: isWarranty ? 0 : (prod?.sellingPrice || 0),
                  rawData: prod?.rawData || undefined
                };
              })
            });
          }

          const newTotalPrice = isWarranty ? 0 : reportItems.reduce((sum: number, item: any) => {
            const prod = matchedProducts.find(p => p.name === item.productName);
            return sum + ((prod?.sellingPrice || 0) * item.quantity);
          }, 0);
          const newTotalQuantity = reportItems.reduce((sum: number, item: any) => sum + item.quantity, 0);

          if (oldOrder.pancakeOrderId > 0 && reportItems.length > 0) {
            const apiKey = process.env.PANCAKE_API_KEY;
            const shopId = '1635300067';
            if (apiKey) {
              const activeComboComponents = new Set<string>();
              for (const item of reportItems) {
                const comps = getComboComponents(item.productName);
                if (comps) {
                  comps.forEach((c: ComboComponent) => {
                    activeComboComponents.add(c.name.trim().toLowerCase());
                    if (c.sku) activeComboComponents.add(c.sku.trim().toLowerCase());
                  });
                }
              }
              const sanitizedReportItems = reportItems.filter((item: any) => {
                const comps = getComboComponents(item.productName);
                if (comps) return true;
                const iName = (item.productName || '').trim().toLowerCase();
                return !activeComboComponents.has(iName);
              });

              const pancakeProducts = sanitizedReportItems.map((item: any) => {
                const prod = matchedProducts.find(p => p.name === item.productName);
                return {
                  variation_id: prod?.pancakeProductId || null,
                  quantity: item.quantity,
                  price: isWarranty ? 0 : (prod?.sellingPrice || 0)
                };
              }).filter((p: any) => p.variation_id);

              try {
                await axios.patch(
                  `https://pos.pages.fm/api/v1/shops/${shopId}/orders/${oldOrder.pancakeOrderId}`,
                  {
                    products: pancakeProducts,
                    warehouse_id: targetWarehouseId || undefined
                  },
                  {
                    params: { api_key: apiKey },
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                  }
                );
              } catch (syncErr: any) {
                logger.error('Error patching edited products on Pancake POS API', {
                  pancakeOrderId: oldOrder.pancakeOrderId,
                  error: syncErr.message
                });
              }
            }
          }

          const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: {
              totalPrice: newTotalPrice,
              totalQuantity: newTotalQuantity,
            }
          });

          try {
            const newOrderItems = await prisma.orderItem.findMany({
              where: { orderId }
            });
            await syncOrderInventoryState(orderId, {
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
            logger.error('Lỗi khấu trừ kho khi cập nhật báo cáo', { orderId, error: invErr.message });
          }
        }
      } catch (err: any) {
        logger.error('Failed to update order details on report edit', { error: err.message });
      }
    }

    const hasContentEdit = Object.keys(updateData).some(k => k !== 'isPaid');
    if (hasContentEdit && !isOwner) {
      try {
        const orderNum = existingReport.order?.pancakeOrderId;
        const orderText = orderNum ? `#${orderNum}` : '(không rõ mã đơn)';
        const title = 'Báo cáo đã được Admin chỉnh sửa';
        const content = `Báo cáo cho đơn hàng ${orderText} của bạn đã được Admin sửa thông tin.`;

        await prisma.notification.create({
          data: {
            userId: existingReport.ktvUserId,
            title,
            content,
          },
        });

        sendPushNotification(existingReport.ktvUserId, title, content, {
          type: 'REPORT_UPDATED',
          reportId: report.id,
          orderId: report.orderId || ''
        }).catch(err => {
          logger.error('Failed to trigger push notification for report update', { error: err.message });
        });

        sendWebPushNotification(existingReport.ktvUserId, title, content, {
          type: 'REPORT_UPDATED',
          reportId: report.id,
          orderId: report.orderId || ''
        }).catch(err => {
          logger.error('Failed to trigger Web Push notification for report update', { error: err.message });
        });
      } catch (notifErr: any) {
        logger.error('Failed to create edit notification', { error: notifErr.message });
      }
    }

    logger.info('Report updated by admin', { reportId: report.id, by: req.user!.id, fieldsUpdated: Object.keys(updateData) });
    res.json({ report });
  } catch (error: any) {
    logger.error('Update report error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật' });
  }
}

export async function deleteReport(req: Request, res: Response): Promise<void> {
  try {
    const reportId = req.params.id as string;
    const { deleteReason } = req.body;

    if (!deleteReason || !deleteReason.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập lý do xóa báo cáo' });
      return;
    }

    const existingReport = await prisma.serviceReport.findUnique({
      where: { id: reportId },
      include: {
        order: { select: { pancakeOrderId: true } },
      }
    });

    if (!existingReport) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo' });
      return;
    }

    const orderNum = existingReport.order?.pancakeOrderId;
    const orderText = orderNum ? `#${orderNum}` : '(không rõ mã đơn)';
    const notificationContent = `Báo cáo cho đơn hàng ${orderText} của bạn đã bị Admin xóa.\nLý do: ${deleteReason.trim()}`;
    const title = 'Báo cáo bị xóa';

    await prisma.notification.create({
      data: {
        userId: existingReport.ktvUserId,
        title,
        content: notificationContent,
      }
    });

    sendPushNotification(existingReport.ktvUserId, title, notificationContent, {
      type: 'REPORT_DELETED',
      reportId: existingReport.id,
      orderId: existingReport.orderId || ''
    }).catch(err => {
      logger.error('Failed to trigger push notification for report deletion', { error: err.message });
    });

    sendWebPushNotification(existingReport.ktvUserId, title, notificationContent, {
      type: 'REPORT_DELETED',
      reportId: existingReport.id,
      orderId: existingReport.orderId || ''
    }).catch(err => {
      logger.error('Failed to trigger Web Push notification for report deletion', { error: err.message });
    });

    if (existingReport.orderId) {
      const oldOrder = await prisma.order.findUnique({
        where: { id: existingReport.orderId },
        include: { items: true }
      });

      if (oldOrder && oldOrder.adminStatus !== 'hủy đơn') {
        const updatedOrder = await prisma.order.update({
          where: { id: existingReport.orderId },
          data: {
            adminStatus: 'hủy đơn',
            statusCode: 6,
            statusName: 'cancelled'
          }
        });

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
          logger.error('Lỗi hoàn kho khi hủy đơn do xóa báo cáo', { orderId: oldOrder.id, error: invErr.message });
        }

        if (oldOrder.pancakeOrderId > 0) {
          try {
            await syncOrderStatusToPancake(oldOrder.pancakeOrderId, 'hủy đơn');
            await prisma.order.update({
              where: { id: oldOrder.id },
              data: { pancakeSyncStatus: 'SUCCESS' }
            });
          } catch (syncErr: any) {
            await prisma.order.update({
              where: { id: oldOrder.id },
              data: { pancakeSyncStatus: 'FAILED' }
            });
          }
        }
      }
    }

    await prisma.serviceReport.delete({
      where: { id: reportId },
    });

    logger.info('Report deleted by Admin', { reportId, adminId: req.user!.id, deleteReason });
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Delete report error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xóa báo cáo' });
  }
}

export async function approveReport(req: Request, res: Response): Promise<void> {
  try {
    const { role } = req.user!;
    if (role !== 'ADMIN' && role !== 'DEV' && role !== 'COORDINATOR') {
      res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này' });
      return;
    }

    const reportId = req.params.id as string;

    const report = await prisma.serviceReport.findUnique({
      where: { id: reportId },
      include: { order: { include: { items: true } } }
    });

    if (!report) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo' });
      return;
    }

    if (report.approvalStatus !== 'PENDING') {
      res.status(400).json({ error: 'Báo cáo này đã được xử lý từ trước' });
      return;
    }

    await prisma.serviceReport.update({
      where: { id: reportId },
      data: { approvalStatus: 'APPROVED' }
    });

    const order = report.order;
    if (order) {
      const orderId = order.id;
      const { items: adjustedItems, discount } = req.body;

      let reportItems: any[] = [];
      const changesList: string[] = [];

      if (adjustedItems && Array.isArray(adjustedItems)) {
        reportItems = adjustedItems.map((item: any) => ({
          productName: item.productName,
          quantity: parseInt(item.quantity, 10) || 1,
          price: item.price !== undefined && item.price !== null ? parseFloat(item.price) : null
        }));
      } else {
        const reportProducts = report.products || [];
        const reportSpareParts = report.spareParts || [];
        const allStrings = [...reportProducts, ...reportSpareParts];

        for (const str of allStrings) {
          const match = str.match(/^(.+?)\s*x\s*(\d+)$/);
          let name = str.trim();
          let qty = 1;
          if (match) {
            name = match[1].trim();
            qty = parseInt(match[2], 10) || 1;
          }
          if (name) {
            reportItems.push({ productName: name, quantity: qty, price: null });
          }
        }
      }

      const itemNames = reportItems.map(i => i.productName);
      const matchedProducts = await prisma.product.findMany({
        where: { name: { in: itemNames }, isActive: true }
      });

      const updatedProductsList: string[] = [];
      const updatedSparePartsList: string[] = [];
      for (const item of reportItems) {
        const prod = matchedProducts.find(p => p.name === item.productName);
        const cat = prod?.category || '';
        const formatted = item.quantity > 1 ? `${item.productName} x${item.quantity}` : item.productName;
        if (cat.toLowerCase() === 'spare part') {
          updatedSparePartsList.push(formatted);
        } else {
          updatedProductsList.push(formatted);
        }
      }

      await prisma.serviceReport.update({
        where: { id: reportId },
        data: {
          products: updatedProductsList,
          spareParts: updatedSparePartsList,
          actualAmount: report.actualAmount
        }
      });

      if (adjustedItems && Array.isArray(adjustedItems)) {
        changesList.push(`Admin ${req.user!.fullName} đã điều chỉnh chi tiết linh kiện/giá khi duyệt báo cáo:`);
        
        const newDiscount = discount !== undefined ? parseFloat(discount) : (order.totalDiscount || 0);
        if (newDiscount !== (order.totalDiscount || 0)) {
          changesList.push(`- Chiết khấu đơn: từ ${order.totalDiscount || 0}đ thành ${newDiscount}đ`);
        }

        const parsedOriginal: any[] = [];
        const origProducts = report.products || [];
        const origSpareParts = report.spareParts || [];
        const allOrigStrings = [...origProducts, ...origSpareParts];
        for (const str of allOrigStrings) {
          const match = str.match(/^(.+?)\s*x\s*(\d+)$/);
          let name = str.trim();
          let qty = 1;
          if (match) {
            name = match[1].trim();
            qty = parseInt(match[2], 10) || 1;
          }
          if (name) {
            parsedOriginal.push({ productName: name, quantity: qty });
          }
        }

        for (const item of reportItems) {
          const orig = parsedOriginal.find(o => o.productName === item.productName);
          const prod = matchedProducts.find(p => p.name === item.productName);
          const origPrice = prod?.sellingPrice || 0;
          const newPrice = item.price !== undefined && item.price !== null ? item.price : origPrice;

          if (!orig) {
            changesList.push(`- Thêm mới linh kiện: ${item.productName} (x${item.quantity}) với giá ${newPrice}đ`);
          } else {
            if (orig.quantity !== item.quantity) {
              changesList.push(`- Sửa số lượng [${item.productName}]: từ x${orig.quantity} thành x${item.quantity}`);
            }
            if (item.price !== undefined && item.price !== null && item.price !== origPrice) {
              changesList.push(`- Sửa đơn giá [${item.productName}]: từ ${origPrice}đ thành ${newPrice}đ`);
            }
          }
        }

        for (const orig of parsedOriginal) {
          const current = reportItems.find(c => c.productName === orig.productName);
          if (!current) {
            changesList.push(`- Xóa linh kiện: ${orig.productName}`);
          }
        }
      }

      await prisma.orderItem.deleteMany({
        where: { orderId }
      });

      const isWarranty = (order.workType || '').toLowerCase() === 'bảo hành';

      if (reportItems.length > 0) {
        await prisma.orderItem.createMany({
          data: reportItems.map((item: any) => {
            const prod = matchedProducts.find(p => p.name === item.productName);
            const itemPrice = isWarranty ? 0 : (item.price !== undefined && item.price !== null ? item.price : (prod?.sellingPrice || 0));
            return {
              orderId,
              productName: item.productName,
              sku: prod?.sku || null,
              quantity: item.quantity,
              price: itemPrice,
              rawData: prod?.rawData || undefined
            };
          })
        });
      }

      const newTotalPrice = isWarranty ? 0 : reportItems.reduce((sum: number, item: any) => {
        const prod = matchedProducts.find(p => p.name === item.productName);
        const itemPrice = item.price !== undefined && item.price !== null ? item.price : (prod?.sellingPrice || 0);
        return sum + (itemPrice * item.quantity);
      }, 0);
      const newTotalQuantity = reportItems.reduce((sum: number, item: any) => sum + item.quantity, 0);

      const shippingFee = order.shippingFee || 0;
      const totalDiscount = discount !== undefined ? parseFloat(discount) : (order.totalDiscount || 0);
      const newMoneyToCollect = Math.max(0, newTotalPrice + shippingFee - totalDiscount);

      if (order.pancakeOrderId > 0 && reportItems.length > 0) {
        const apiKey = process.env.PANCAKE_API_KEY;
        const shopId = '1635300067';
        if (apiKey) {
          const activeComboComponents = new Set<string>();
          for (const item of reportItems) {
            const comps = getComboComponents(item.productName);
            if (comps) {
              comps.forEach((c: ComboComponent) => {
                activeComboComponents.add(c.name.trim().toLowerCase());
                if (c.sku) activeComboComponents.add(c.sku.trim().toLowerCase());
              });
            }
          }
          const sanitizedReportItems = reportItems.filter((item: any) => {
            const comps = getComboComponents(item.productName);
            if (comps) return true;
            const iName = (item.productName || '').trim().toLowerCase();
            return !activeComboComponents.has(iName);
          });

          const pancakeProducts = sanitizedReportItems.map((item: any) => {
            const prod = matchedProducts.find(p => p.name === item.productName);
            const itemPrice = isWarranty ? 0 : (item.price !== undefined && item.price !== null ? item.price : (prod?.sellingPrice || 0));
            return {
              variation_id: prod?.pancakeProductId || null,
              quantity: item.quantity,
              price: itemPrice
            };
          }).filter((p: any) => p.variation_id);

          try {
            await axios.patch(
              `https://pos.pages.fm/api/v1/shops/${shopId}/orders/${order.pancakeOrderId}`,
              {
                products: pancakeProducts,
                warehouse_id: order.warehouseId || undefined,
                discount: totalDiscount,
                cod: newMoneyToCollect
              },
              {
                params: { api_key: apiKey },
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
              }
            );
          } catch (syncErr: any) {
            logger.error('Error syncing products to Pancake POS on approval', {
              pancakeOrderId: order.pancakeOrderId,
              error: syncErr.message
            });
          }
        }
      }

      let syncStatus = 'SUCCESS';
      try {
        await syncOrderStatusToPancake(order.pancakeOrderId, 'hoàn thành');
      } catch (syncErr: any) {
        syncStatus = 'FAILED';
      }

      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          adminStatus: 'hoàn thành',
          pancakeSyncStatus: syncStatus,
          totalPrice: newTotalPrice,
          totalQuantity: newTotalQuantity,
          totalDiscount: totalDiscount,
          moneyToCollect: newMoneyToCollect
        }
      });

      try {
        const newOrderItems = await prisma.orderItem.findMany({
          where: { orderId }
        });
        await syncOrderInventoryState(orderId, {
          adminStatus: order.adminStatus,
          warehouseId: order.warehouseId,
          items: order.items.map(item => ({
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
        logger.error('Lỗi khấu trừ kho khi duyệt hoàn thành đơn', { orderId, error: invErr.message });
      }

      await prisma.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: orderId,
          action: 'updated',
          changes: {
            adminStatus: { from: order.adminStatus || 'chờ duyệt', to: 'hoàn thành' },
            adjustments: changesList.length > 0 ? changesList : undefined
          },
          userId: req.user!.id,
          userName: req.user!.fullName,
        }
      });
    }

    if (report.serialNumber) {
      const cleanedSn = report.serialNumber.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (cleanedSn !== 'XXXXX') {
        try {
          const reportWorkType = report.workType || order?.workType || '';
          const workTypeClean = reportWorkType.trim().toLowerCase();
          const isActivationWorkType = ['lắp đặt', 'giao hàng và lắp đặt'].includes(workTypeClean);

          if (isActivationWorkType) {
            await activateSerialWarranty(
              report.serialNumber,
              report.orderId || null,
              {
                customerName: report.customerName,
                customerPhone: report.customerPhone,
                address: report.address,
                province: report.province,
              },
              'KTV',
              'Đã kích hoạt'
            );
          } else {
            await syncSerialFromReport(
              report.serialNumber,
              report.orderId || null,
              {
                customerName: report.customerName,
                customerPhone: report.customerPhone,
                address: report.address,
                province: report.province,
              }
            );
          }
        } catch (serialErr: any) {
          logger.error('Lỗi tự động kích hoạt bảo hành khi duyệt báo cáo', {
            error: serialErr.message,
            serialNumber: report.serialNumber,
            reportId: report.id
          });
        }
      }
    }

    const orderCode = formatOrderCode(report.order?.pancakeOrderId);
    const ktvTitle = 'Báo cáo đã được phê duyệt';
    const ktvContent = `Báo cáo của đơn hàng ${orderCode} đã được phê duyệt.`;

    await prisma.notification.create({
      data: {
        userId: report.ktvUserId,
        title: ktvTitle,
        content: ktvContent
      }
    });

    sendPushNotification(report.ktvUserId, ktvTitle, ktvContent, {
      type: 'REPORT_APPROVED',
      reportId,
      orderId: report.orderId || ''
    }).catch(err => logger.error('Push notification failed on approval', { error: err.message }));

    sendWebPushNotification(report.ktvUserId, ktvTitle, ktvContent, {
      type: 'REPORT_APPROVED',
      reportId,
      orderId: report.orderId || ''
    }).catch(err => logger.error('Web push notification failed on approval', { error: err.message }));

    logger.info('Report approved successfully', { reportId, approvedBy: req.user!.id });
    res.json({ success: true, message: 'Phê duyệt báo cáo thành công' });
  } catch (error: any) {
    logger.error('Approve report error', { error: error.message });
    res.status(500).json({ error: 'Lỗi phê duyệt báo cáo' });
  }
}

export async function rejectReport(req: Request, res: Response): Promise<void> {
  try {
    const { role } = req.user!;
    if (role !== 'ADMIN' && role !== 'DEV' && role !== 'COORDINATOR') {
      res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này' });
      return;
    }

    const { rejectReason } = req.body;
    if (!rejectReason || !rejectReason.trim()) {
      res.status(400).json({ error: 'Vui lòng cung cấp lý do từ chối' });
      return;
    }

    const reportId = req.params.id as string;

    const report = await prisma.serviceReport.findUnique({
      where: { id: reportId },
      include: { order: { include: { items: true } } }
    });

    if (!report) {
      res.status(404).json({ error: 'Không tìm thấy báo cáo' });
      return;
    }

    if (report.approvalStatus !== 'PENDING') {
      res.status(400).json({ error: 'Báo cáo này đã được xử lý từ trước' });
      return;
    }

    await prisma.serviceReport.update({
      where: { id: reportId },
      data: {
        approvalStatus: 'REJECTED',
        rejectReason: rejectReason.trim()
      }
    });

    const order = report.order;
    if (order) {
      const orderId = order.id;

      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: { adminStatus: 'đang thực hiện' }
      });

      try {
        await syncOrderInventoryState(orderId, {
          adminStatus: order.adminStatus,
          warehouseId: order.warehouseId,
          items: order.items.map(item => ({
            productName: item.productName || '',
            quantity: item.quantity || 1
          }))
        }, {
          adminStatus: updatedOrder.adminStatus,
          warehouseId: updatedOrder.warehouseId,
          items: order.items.map(item => ({
            productName: item.productName || '',
            quantity: item.quantity || 1
          }))
        });
      } catch (invErr: any) {
        logger.error('Lỗi đồng bộ kho khi từ chối đơn', { orderId, error: invErr.message });
      }

      await prisma.auditLog.create({
        data: {
          entityType: 'Order',
          entityId: orderId,
          action: 'updated',
          changes: { adminStatus: { from: order.adminStatus || 'chờ duyệt', to: 'đang thực hiện' } },
          userId: req.user!.id,
          userName: req.user!.fullName,
        }
      });
    }

    const orderCode = formatOrderCode(report.order?.pancakeOrderId);
    const ktvTitle = 'Báo cáo không được phê duyệt';
    const ktvContent = `Báo cáo của bạn cho đơn hàng ${orderCode} không được duyệt vì lý do: ${rejectReason.trim()}`;

    await prisma.notification.create({
      data: {
        userId: report.ktvUserId,
        title: ktvTitle,
        content: ktvContent
      }
    });

    sendPushNotification(report.ktvUserId, ktvTitle, ktvContent, {
      type: 'REPORT_REJECTED',
      reportId,
      orderId: report.orderId || '',
      rejectReason: rejectReason.trim()
    }).catch(err => logger.error('Push notification failed on reject', { error: err.message }));

    sendWebPushNotification(report.ktvUserId, ktvTitle, ktvContent, {
      type: 'REPORT_REJECTED',
      reportId,
      orderId: report.orderId || '',
      rejectReason: rejectReason.trim()
    }).catch(err => logger.error('Web push notification failed on reject', { error: err.message }));

    logger.info('Report rejected successfully', { reportId, rejectedBy: req.user!.id, reason: rejectReason });
    res.json({ success: true, message: 'Từ chối phê duyệt báo cáo thành công' });
  } catch (error: any) {
    logger.error('Reject report error', { error: error.message });
    res.status(500).json({ error: 'Lỗi từ chối phê duyệt báo cáo' });
  }
}

import prisma from '../config/database';
import logger from '../utils/logger';
import axios from 'axios';
import { syncOrderInventoryState } from './inventoryService';
import { broadcastEvent } from './websocketService';

/**
 * Xử lý event "orders" từ Pancake webhook.
 * 
 * Bóc tách thông tin đơn hàng từ raw payload:
 *   1. Upsert Customer (nếu có thông tin khách)
 *   2. Upsert Order
 *   3. Thay thế OrderItems (xóa cũ, tạo mới)
 *   4. Đánh dấu WebhookRawEvent = PROCESSED
 */
export async function processOrderEvent(rawEventId: string | null, payload: any): Promise<void> {
  try {
    const systemId = payload.system_id;

    if (!systemId) {
      logger.warn('Order event missing system_id, skipping', { rawEventId });
      if (rawEventId) {
        await markProcessed(rawEventId);
      }
      return;
    }

    // ══════════════════════════════════════
    // 1. Upsert Customer từ thông tin đơn hàng
    // ══════════════════════════════════════
    let customerId: string | null = null;
    const shippingAddr = payload.shipping_address || {};
    const billPhone = payload.bill_phone_number || shippingAddr.phone_number || null;
    const billName = payload.bill_full_name || shippingAddr.full_name || null;

    if (billPhone) {
      // Dùng SĐT làm key tìm khách (vì Pancake không luôn gửi customer ID trong order event)
      const existingCustomer = await prisma.customer.findFirst({
        where: { phoneNumber: billPhone },
      });

      if (existingCustomer) {
        customerId = existingCustomer.id;

        // Cập nhật tên nếu trước đó bị che (Shopee che tên)
        if (billName && !existingCustomer.fullName.includes('*')) {
          // Không ghi đè tên đã rõ bằng tên bị che
        } else if (billName && !billName.includes('*')) {
          await prisma.customer.update({
            where: { id: existingCustomer.id },
            data: { fullName: billName },
          });
        }
      } else {
        // Tạo customer mới từ thông tin đơn hàng
        const newCustomer = await prisma.customer.create({
          data: {
            fullName: billName || 'Không rõ',
            phoneNumber: billPhone,
            address: shippingAddr.address || null,
            fullAddress: shippingAddr.full_address || null,
            provinceId: shippingAddr.province_id || null,
            districtId: shippingAddr.district_id || null,
            communeId: shippingAddr.commune_id || null,
            provinceName: shippingAddr.province_name || null,
            districtName: shippingAddr.district_name || null,
            communeName: shippingAddr.commune_name || shippingAddr.commnue_name || null,
            source: payload.order_sources_name || null,
          },
        });
        customerId = newCustomer.id;
      }
    }

    // ══════════════════════════════════════
    // 2. Upsert Order
    // ══════════════════════════════════════

    // Parse status code từ status hoặc status_history
    let statusCode: number | null = null;
    if (typeof payload.status === 'number') {
      statusCode = payload.status;
    } else if (payload.status_history && payload.status_history.length > 0) {
      const lastStatus = payload.status_history[payload.status_history.length - 1];
      statusCode = lastStatus.status ?? null;
    }

    // Parse dates (Pancake POS returns UTC times without timezone designation, causing them to be parsed as local time)
    const parsePancakeDate = (dateStr: string | null | undefined): Date | null => {
      if (!dateStr) return null;
      let normalized = String(dateStr).trim();
      
      // 1. Replace space with 'T' if present
      if (!normalized.includes('T')) {
        normalized = normalized.replace(' ', 'T');
      }
      
      // 2. If it contains a dot (milliseconds), let's normalize the milliseconds to exactly 3 digits
      const dotIndex = normalized.indexOf('.');
      if (dotIndex !== -1) {
        // Find where timezone starts
        let tzStart = normalized.length;
        for (let i = dotIndex + 1; i < normalized.length; i++) {
          const char = normalized[i];
          if (char === 'Z' || char === '+' || char === '-') {
            tzStart = i;
            break;
          }
        }
        const msPart = normalized.substring(dotIndex + 1, tzStart);
        const msNormalized = msPart.substring(0, 3).padEnd(3, '0');
        const tzPart = tzStart < normalized.length ? normalized.substring(tzStart) : 'Z';
        normalized = normalized.substring(0, dotIndex + 1) + msNormalized + tzPart;
      } else {
        if (!normalized.includes('Z') && !normalized.includes('+') && !normalized.includes('-')) {
          normalized = normalized + 'Z';
        }
      }
      const d = new Date(normalized);
      return isNaN(d.getTime()) ? new Date(dateStr) : d;
    };

    const pancakeCreatedAt = parsePancakeDate(payload.inserted_at);
    const pancakeUpdatedAt = parsePancakeDate(payload.updated_at);

    // ══════════════════════════════════════
    // Auto map adminStatus
    // ══════════════════════════════════════
    const existingOrder = await prisma.order.findUnique({
      where: { pancakeOrderId: systemId },
      select: {
        id: true,
        adminStatus: true,
        warehouseId: true,
        warehouseInfo: true,
        workType: true,
        items: {
          select: {
            productName: true,
            quantity: true
          }
        }
      }
    });

    let newAdminStatus = existingOrder?.adminStatus || 'chờ xử lý';
    const pStatus = (payload.status_name || '').toLowerCase();
    const statusId = typeof payload.status === 'number' ? payload.status : statusCode;

    // ══════════════════════════════════════
    // Mapping Pancake POS Status → adminStatus
    // ══════════════════════════════════════
    // Ref: "Mapping status - Truliva webapp.xlsx"
    //
    // Pancake statusId reference:
    //   0 = Mới (Nháp)        → Không gửi ticket (lọc bởi statusCode=0)
    //   1 = Đã xác nhận       → chờ xử lý
    //   2 = Đã gửi hàng       → chờ xử lý (khi phân bổ KTV → đang thực hiện)
    //   3 = Đã nhận            → hoàn thành
    //   4 = Đang hoàn          → đang hoàn
    //   5 = Đã hoàn            → đã hoàn
    //   6 = Đã hủy             → hủy đơn
    //  16 = Đã thu tiền        → hoàn thành
    //
    // Các trạng thái khác khớp bằng status_name:
    //   Đang đổi, Đã đổi, Hoàn một phần, Xóa gần đây, Chờ hàng, Đang đóng hàng, Chờ chuyển hàng

    // 1. Trạng thái Hoàn/Đổi hàng (tách riêng, KHÔNG gộp vào hủy đơn)
    const isReturning =
      statusId === 4 ||
      pStatus.includes('đang hoàn') ||
      pStatus.includes('returning');

    const isReturned =
      statusId === 5 ||
      pStatus.includes('đã hoàn') ||
      pStatus.includes('returned');

    const isExchanging =
      pStatus.includes('đang đổi') ||
      pStatus.includes('exchanging');

    const isExchanged =
      pStatus.includes('đã đổi') ||
      pStatus.includes('exchanged');

    const isPartialReturn =
      statusId === 15 ||
      pStatus.includes('hoàn một phần') ||
      pStatus.includes('part_returned') ||
      pStatus.includes('partially_returned');

    // 2. Trạng thái Hủy đơn (chỉ Đã hủy + Xóa gần đây)
    const isCancelled =
      statusId === 6 ||
      pStatus === 'cancelled' ||
      pStatus === 'cancel' ||
      pStatus.includes('đã hủy') ||
      pStatus.includes('xóa gần đây');

    // 3. Trạng thái Hoàn thành (Đã nhận, Đã thu tiền)
    const isCompleted =
      statusId === 3 ||
      statusId === 16 ||
      pStatus === 'delivered' ||
      pStatus === 'done' ||
      pStatus === 'received' ||
      pStatus === 'received_money' ||
      pStatus.includes('hoàn thành') ||
      pStatus.includes('đã nhận') ||
      pStatus.includes('thu tiền');

    // Áp dụng mapping theo thứ tự ưu tiên
    if (isCancelled) {
      newAdminStatus = 'hủy đơn';
    } else if (isPartialReturn) {
      newAdminStatus = 'hoàn một phần';
    } else if (isReturning) {
      newAdminStatus = 'đang hoàn';
    } else if (isReturned) {
      newAdminStatus = 'đã hoàn';
    } else if (isExchanging) {
      newAdminStatus = 'đang đổi';
    } else if (isExchanged) {
      newAdminStatus = 'đã đổi';
    } else if (isCompleted) {
      if (newAdminStatus !== 'hủy đơn') newAdminStatus = 'hoàn thành';
    }

    const isWarrantyOrder = (existingOrder?.workType || '').toLowerCase() === 'bảo hành';

    const orderData: any = {
      customerId,
      statusCode,
      statusName: payload.status_name || null,
      totalPrice: isWarrantyOrder ? 0 : (payload.total_price ?? null),
      shippingFee: payload.shipping_fee ?? null,
      totalDiscount: payload.total_discount ?? null,
      totalQuantity: payload.total_quantity ?? null,
      moneyToCollect: isWarrantyOrder ? 0 : (payload.money_to_collect ?? null),
      orderSource: payload.order_sources_name || null,
      orderSourceId: payload.marketplace_id ? String(payload.marketplace_id) : null,
      orderLink: payload.order_link || null,
      checkoutLink: payload.tracking_link
        ? payload.tracking_link.replace('/tracking?', '/payment?')
        : null,
      shippingAddress: payload.shipping_address || null,
      warehouseInfo: payload.warehouse_info || null,
      warehouseId: payload.warehouse_id ? String(payload.warehouse_id) : null,
      billFullName: billName,
      billPhoneNumber: billPhone,
      note: payload.note || null,
      partnerFee: payload.partner_fee ?? null,
      feeMarketplace: payload.fee_marketplace ?? null,
      pancakeCreatedAt,
      pancakeUpdatedAt,
      adminStatus: newAdminStatus, // mapped status
      rawData: payload,
    };

    // Bảo vệ warehouseId và warehouseInfo cục bộ cho các đơn thuộc diện không trừ kho
    if (existingOrder && !payload.warehouse_id) {
      const isInstallation = existingOrder.workType === 'Lắp đặt';
      const originallyHasProducts = existingOrder.items && existingOrder.items.length > 0;

      if (isInstallation || !originallyHasProducts) {
        orderData.warehouseId = existingOrder.warehouseId;
        orderData.warehouseInfo = existingOrder.warehouseInfo;
      }
    }

    // ══════════════════════════════════════
    // Kiểm tra và xử lý trùng lặp đơn Ecom cùng mã gốc
    // ══════════════════════════════════════
    const originalPosId = payload.id || (payload.rawData as any)?.id;
    let duplicateOrder: any = null;
    if (originalPosId) {
      duplicateOrder = await prisma.order.findFirst({
        where: {
          rawData: {
            path: ['id'],
            equals: originalPosId
          },
          pancakeOrderId: {
            not: systemId
          }
        }
      });
    }

    if (duplicateOrder) {
      if (systemId > duplicateOrder.pancakeOrderId) {
        // Đơn mới hơn -> Thừa kế các thông tin nghiệp vụ đặc thù của Truliva từ đơn cũ sang đơn mới
        orderData.assignedKtvId = orderData.assignedKtvId || duplicateOrder.assignedKtvId;
        orderData.mainStationId = orderData.mainStationId || duplicateOrder.mainStationId;
        orderData.techStationId = orderData.techStationId || duplicateOrder.techStationId;
        orderData.workType = orderData.workType || duplicateOrder.workType;
        orderData.serviceType = orderData.serviceType || duplicateOrder.serviceType;
        orderData.appointmentTime = orderData.appointmentTime || duplicateOrder.appointmentTime;
        orderData.rescheduleReason = orderData.rescheduleReason || duplicateOrder.rescheduleReason;
        orderData.cancelReason = orderData.cancelReason || duplicateOrder.cancelReason;
        orderData.ktvCalledAt = orderData.ktvCalledAt || duplicateOrder.ktvCalledAt;
        orderData.warehouseId = orderData.warehouseId || duplicateOrder.warehouseId;
        orderData.warehouseInfo = orderData.warehouseInfo || duplicateOrder.warehouseInfo;

        const returnStatuses = ['đang hoàn', 'đã hoàn', 'hoàn một phần', 'đang đổi', 'đã đổi'];
        if (!returnStatuses.includes(newAdminStatus)) {
          orderData.adminStatus = duplicateOrder.adminStatus || newAdminStatus;
        }
      } else {
        // Đơn mới cũ hơn đơn đang có trong DB -> Bỏ qua không xử lý đè lên bản ghi mới hơn
        logger.info('Bypassed processing older duplicate Ecom webhook event', {
          systemId,
          existingNewerPancakeId: duplicateOrder.pancakeOrderId,
          originalPosId
        });
        if (rawEventId) {
          await markProcessed(rawEventId);
        }
        return;
      }
    }

    const orderSource = (payload.order_sources_name || '').toLowerCase();
    const isEcom = orderSource.includes('shopee') || orderSource.includes('lazada') || orderSource.includes('tiktok') || orderSource.includes('tiki');
    const defaultAppointmentTime = isEcom
      ? null
      : pancakeCreatedAt
        ? new Date(pancakeCreatedAt.getTime() + 2 * 60 * 60 * 1000)
        : new Date(Date.now() + 2 * 60 * 60 * 1000);

    const order = await prisma.order.upsert({
      where: { pancakeOrderId: systemId },
      create: {
        pancakeOrderId: systemId,
        appointmentTime: defaultAppointmentTime,
        ...orderData,
      },
      update: orderData,
    });

    // Nếu phát hiện trùng lặp và đơn mới hơn được lưu thành công, tiến hành dọn dẹp đơn cũ
    if (duplicateOrder && systemId > duplicateOrder.pancakeOrderId) {
      // 1. Chuyển toàn bộ ServiceReport từ đơn cũ sang đơn mới
      await prisma.serviceReport.updateMany({
        where: { orderId: duplicateOrder.id },
        data: { orderId: order.id }
      });

      // 2. Xóa đơn cũ (Cascade delete sẽ tự động xóa OrderItem của đơn cũ)
      await prisma.order.delete({
        where: { id: duplicateOrder.id }
      });

      logger.info('Merged duplicate Ecom order, transferred reports and deleted old order', {
        oldPancakeId: duplicateOrder.pancakeOrderId,
        newPancakeId: systemId,
        oldUuid: duplicateOrder.id,
        newUuid: order.id
      });
    }

    // ══════════════════════════════════════
    // 3. Xử lý Order Items
    // ══════════════════════════════════════
    const items = payload.items || payload.order_items || [];

    if (items.length > 0) {
      // Xóa items cũ rồi tạo mới (đảm bảo đồng bộ)
      await prisma.orderItem.deleteMany({
        where: { orderId: order.id },
      });

      await prisma.orderItem.createMany({
        data: items.map((item: any) => ({
          orderId: order.id,
          productName: item.product_name || item.name || item.variation_info?.name || item.variations?.name || 'Sản phẩm không tên',
          sku: item.sku || item.product_sku || item.variation_info?.display_id || null,
          quantity: item.quantity ?? 1,
          price: isWarrantyOrder ? 0 : (item.price ?? item.product_price ?? null),
          discount: item.discount ?? 0,
          variationInfo: item.variation_info || item.variations || null,
          rawData: item,
        })),
      });
    }

    // Tích hợp đồng bộ tồn kho cục bộ
    try {
      const newOrderItems = await prisma.orderItem.findMany({
        where: { orderId: order.id }
      });
      await syncOrderInventoryState(order.id, existingOrder ? {
        adminStatus: existingOrder.adminStatus,
        warehouseId: existingOrder.warehouseId,
        items: existingOrder.items.map(item => ({
          productName: item.productName || '',
          quantity: item.quantity || 1
        }))
      } : null, {
        adminStatus: order.adminStatus,
        warehouseId: order.warehouseId,
        items: newOrderItems.map(item => ({
          productName: item.productName || '',
          quantity: item.quantity || 1
        }))
      });
    } catch (invErr: any) {
      logger.error('Lỗi khấu trừ kho khi đồng bộ webhook Pancake', { orderId: order.id, error: invErr.message });
    }

    // Nếu đơn hàng bị hủy, tự động xóa các báo cáo kỹ thuật liên quan
    if (newAdminStatus === 'hủy đơn') {
      const deletedReports = await prisma.serviceReport.deleteMany({
        where: { orderId: order.id }
      });
      if (deletedReports.count > 0) {
        logger.info(`Automatically deleted ${deletedReports.count} service reports for cancelled order`, {
          orderId: order.id,
          pancakeOrderId: systemId
        });
      }
    }

    // ══════════════════════════════════════
    // 4. Đánh dấu raw event đã xử lý
    // ══════════════════════════════════════
    if (rawEventId) {
      await markProcessed(rawEventId);
    }

    logger.info('Order processed successfully', {
      rawEventId,
      pancakeOrderId: systemId,
      statusName: payload.status_name,
      totalPrice: payload.total_price,
      itemCount: items.length,
    });

    broadcastEvent('ORDER_UPDATED', { orderId: order.id, pancakeOrderId: order.pancakeOrderId });

  } catch (error: any) {
    logger.error('Failed to process order event', {
      rawEventId,
      error: error.message,
      stack: error.stack,
    });

    if (rawEventId) {
      await markFailed(rawEventId, error.message);
    }
  }
}

// ── Helpers ──
async function markProcessed(rawEventId: string) {
  await prisma.webhookRawEvent.update({
    where: { id: rawEventId },
    data: { status: 'PROCESSED' },
  });
}

async function markFailed(rawEventId: string, errorLog: string) {
  await prisma.webhookRawEvent.update({
    where: { id: rawEventId },
    data: { status: 'FAILED', errorLog: errorLog.substring(0, 1000) },
  });
}

/**
 * Đồng bộ trạng thái đơn hàng sang Pancake POS API.
 * Trả về chuỗi trạng thái đồng bộ: 'SUCCESS' hoặc ném ra lỗi nếu thất bại.
 */
export async function syncOrderStatusToPancake(pancakeOrderId: number, adminStatus: string): Promise<string> {
  if (pancakeOrderId < 0) {
    logger.info('Bypassed syncing status change to Pancake POS: manual order', { pancakeOrderId });
    return 'SUCCESS';
  }

  const apiKey = process.env.PANCAKE_API_KEY;
  const shopId = '1635300067';
  if (!apiKey) {
    throw new Error('Thiếu cấu hình PANCAKE_API_KEY trên máy chủ.');
  }

  let statusIdToSync: number | null = null;
  if (adminStatus === 'hoàn thành') {
    statusIdToSync = 3; // Đã nhận
  } else if (adminStatus === 'hủy đơn') {
    statusIdToSync = 6; // Đã hủy
  } else if (adminStatus === 'chờ xử lý') {
    statusIdToSync = 1; // Đã xác nhận
  }

  if (statusIdToSync === null) {
    logger.info('Bypassed syncing status change to Pancake POS: status does not map', { pancakeOrderId, adminStatus });
    return 'SUCCESS';
  }

  logger.info('Syncing status change to Pancake POS API', { pancakeOrderId, adminStatus, statusIdToSync });
  const updateResponse = await axios.patch(
    `https://pos.pages.fm/api/v1/shops/${shopId}/orders/${pancakeOrderId}`,
    {
      status: statusIdToSync
    },
    {
      params: { api_key: apiKey },
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    }
  );

  if (!updateResponse.data || !updateResponse.data.success) {
    throw new Error(updateResponse.data?.message || 'Yêu cầu cập nhật trạng thái thất bại trên Pancake POS');
  }

  return 'SUCCESS';
}


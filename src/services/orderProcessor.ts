import prisma from '../config/database';
import logger from '../utils/logger';

/**
 * Xử lý event "orders" từ Pancake webhook.
 * 
 * Bóc tách thông tin đơn hàng từ raw payload:
 *   1. Upsert Customer (nếu có thông tin khách)
 *   2. Upsert Order
 *   3. Thay thế OrderItems (xóa cũ, tạo mới)
 *   4. Đánh dấu WebhookRawEvent = PROCESSED
 */
export async function processOrderEvent(rawEventId: string, payload: any): Promise<void> {
  try {
    const systemId = payload.system_id;

    if (!systemId) {
      logger.warn('Order event missing system_id, skipping', { rawEventId });
      await markProcessed(rawEventId);
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

    // Parse status code từ status_history hoặc trực tiếp
    let statusCode: number | null = null;
    if (payload.status_history && payload.status_history.length > 0) {
      const lastStatus = payload.status_history[payload.status_history.length - 1];
      statusCode = lastStatus.status ?? null;
    }

    // Parse dates
    const pancakeCreatedAt = payload.inserted_at ? new Date(payload.inserted_at) : null;
    const pancakeUpdatedAt = payload.updated_at ? new Date(payload.updated_at) : null;

    // ══════════════════════════════════════
    // Auto map adminStatus
    // ══════════════════════════════════════
    const existingOrder = await prisma.order.findUnique({
      where: { pancakeOrderId: systemId },
      select: { adminStatus: true }
    });

    let newAdminStatus = existingOrder?.adminStatus || 'chờ xử lý';
    const pStatus = (payload.status_name || '').toLowerCase();
    const statusId = typeof payload.status === 'number' ? payload.status : statusCode;

    // Lọc trạng thái Hủy / Trả hàng:
    // - statusId: 4 (Đang hoàn), 5 (Đã hoàn), 6 (Đã hủy)
    // - Tên chữ: cancelled, returned, cancel, hoặc chứa chữ 'hủy'
    const isCancelledOrReturned = 
      statusId === 4 ||
      statusId === 5 ||
      statusId === 6 ||
      pStatus === 'cancelled' ||
      pStatus === 'returned' ||
      pStatus === 'cancel' ||
      pStatus.includes('hủy');

    // Lọc trạng thái Hoàn thành:
    // - statusId: 3 (Đã nhận / delivered), 16 (Đã thu tiền / received_money)
    // - Tên chữ: delivered, done, received, received_money, hoặc chứa chữ 'hoàn thành', 'đã nhận', 'thu tiền'
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

    if (isCancelledOrReturned) {
      newAdminStatus = 'hủy đơn';
    } else if (isCompleted) {
      if (newAdminStatus !== 'hủy đơn') newAdminStatus = 'hoàn thành';
    }

    const orderData: any = {
      customerId,
      statusCode,
      statusName: payload.status_name || null,
      totalPrice: payload.total_price ?? null,
      shippingFee: payload.shipping_fee ?? null,
      totalDiscount: payload.total_discount ?? null,
      totalQuantity: payload.total_quantity ?? null,
      moneyToCollect: payload.money_to_collect ?? null,
      orderSource: payload.order_sources_name || null,
      orderSourceId: payload.marketplace_id ? String(payload.marketplace_id) : null,
      orderLink: payload.order_link || null,
      shippingAddress: payload.shipping_address || null,
      warehouseInfo: payload.warehouse_info || null,
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

    const order = await prisma.order.upsert({
      where: { pancakeOrderId: systemId },
      create: {
        pancakeOrderId: systemId,
        ...orderData,
      },
      update: orderData,
    });

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
          price: item.price ?? item.product_price ?? null,
          discount: item.discount ?? 0,
          variationInfo: item.variation_info || item.variations || null,
          rawData: item,
        })),
      });
    }

    // ══════════════════════════════════════
    // 4. Đánh dấu raw event đã xử lý
    // ══════════════════════════════════════
    await markProcessed(rawEventId);

    logger.info('Order processed successfully', {
      rawEventId,
      pancakeOrderId: systemId,
      statusName: payload.status_name,
      totalPrice: payload.total_price,
      itemCount: items.length,
    });

  } catch (error: any) {
    logger.error('Failed to process order event', {
      rawEventId,
      error: error.message,
      stack: error.stack,
    });

    await markFailed(rawEventId, error.message);
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

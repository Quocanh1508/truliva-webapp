import axios from 'axios';
import prisma from '../config/database';
import { processCustomerEvent } from './customerProcessor';
import { processOrderEvent } from './orderProcessor';
import logger from '../utils/logger';

/**
 * Event Router — Bộ điều phối sự kiện.
 * 
 * Pancake webhook gửi payload theo cấu trúc:
 *   - Nhóm "orders": payload chứa `system_id`, `total_price`, `status_name`
 *   - Nhóm "customers": payload chứa `id` (UUID), `full_name`, nhưng KHÔNG có `system_id`
 *   - Nhóm "products": chưa xử lý (lưu raw)
 *
 * event_type trong payload thường là hành động: "create", "update"
 * Webhook route lấy nó làm eventType, nên ta cần phân loại bằng NỘI DUNG payload.
 */
export function routeEvent(rawEventId: string, eventType: string, payload: any): void {
  // Fire-and-forget: không await, chạy ngầm
  processEventAsync(rawEventId, eventType, payload);
}

async function processEventAsync(rawEventId: string, eventType: string, payload: any): Promise<void> {
  try {
    const detectedType = detectEventCategory(eventType, payload);

    switch (detectedType) {
      case 'order':
        await processOrderEvent(rawEventId, payload);
        break;

      case 'customer':
        await processCustomerEvent(rawEventId, payload);
        break;

      case 'order_stock_update':
        await handleOrderStockUpdateEvent(rawEventId, payload);
        break;

      default:
        logger.info('Unhandled event category, raw data preserved', {
          rawEventId,
          eventType,
          detectedType,
        });
    }

  } catch (error: any) {
    logger.error('Event routing failed', {
      rawEventId,
      eventType,
      error: error.message,
    });
  }
}

/**
 * Xử lý sự kiện đồng bộ hàng tồn kho (variations_warehouses) để kéo trạng thái đơn hàng.
 * Đây là cơ chế tự phục hồi (Self-Healing Fallback) khi Pancake POS không gửi Webhook update đơn hàng.
 */
async function handleOrderStockUpdateEvent(rawEventId: string, payload: any): Promise<void> {
  // --- Cập nhật số lượng tồn kho sản phẩm thời gian thực ---
  if (payload.variation_id) {
    try {
      const product = await prisma.product.findUnique({
        where: { pancakeProductId: String(payload.variation_id) }
      });

      if (product) {
        let rawData: any = product.rawData || {};
        let vwList: any[] = rawData.variations_warehouses || [];
        const newRemain = Number(payload.remain_quantity) || 0;
        
        const vwIndex = vwList.findIndex((w: any) => w.warehouse_id === payload.warehouse_id);
        if (vwIndex !== -1) {
          vwList[vwIndex].remain_quantity = newRemain;
          vwList[vwIndex].actual_remain_quantity = Number(payload.actual_remain_quantity) || newRemain;
        } else if (payload.warehouse_id) {
          vwList.push({
            warehouse_id: payload.warehouse_id,
            remain_quantity: newRemain,
            actual_remain_quantity: Number(payload.actual_remain_quantity) || newRemain,
            total_quantity: newRemain
          });
        }
        
        rawData.variations_warehouses = vwList;

        await prisma.product.update({
          where: { id: product.id },
          data: {
            availableStock: newRemain,
            rawData: rawData
          }
        });
        logger.info('Product stock updated in real-time from webhook', {
          pancakeProductId: payload.variation_id,
          warehouseId: payload.warehouse_id,
          remain: newRemain
        });
      }
    } catch (err: any) {
      logger.error('Failed to update product stock from webhook event', {
        variationId: payload.variation_id,
        error: err.message
      });
    }
  }

  const orderId = payload.order_id || payload.system_id;
  if (!orderId) {
    logger.info('Stock update event does not contain order_id, skipping sync fallback', { rawEventId });
    await prisma.webhookRawEvent.update({
      where: { id: rawEventId },
      data: { status: 'PROCESSED' },
    });
    return;
  }

  const apiKey = process.env.PANCAKE_API_KEY;
  const shopId = '1635300067'; // Shop ID mặc định

  if (!apiKey) {
    logger.warn('PANCAKE_API_KEY is not defined in env, cannot run order sync fallback', { rawEventId, orderId });
    await prisma.webhookRawEvent.update({
      where: { id: rawEventId },
      data: { status: 'FAILED', errorLog: 'Missing PANCAKE_API_KEY' },
    });
    return;
  }

  try {
    logger.info('Running order sync fallback via stock update event', { rawEventId, orderId });
    const response = await axios.get(`https://pos.pages.fm/api/v1/shops/${shopId}/orders/${orderId}`, {
      params: { api_key: apiKey },
      timeout: 10000 // 10 giây timeout
    });

    if (response.data && response.data.success && response.data.data) {
      const orderPayload = response.data.data;
      logger.info('Fetched latest order details, processing order update', { orderId });
      // Tái sử dụng hàm processOrderEvent để cập nhật trạng thái đơn hàng
      await processOrderEvent(rawEventId, orderPayload);
    } else {
      logger.warn('Failed to fetch order details from Pancake POS API', { orderId, data: response.data });
      await prisma.webhookRawEvent.update({
        where: { id: rawEventId },
        data: { status: 'FAILED', errorLog: 'Pancake API returned success: false' },
      });
    }
  } catch (error: any) {
    logger.error('Error fetching order details in stock update fallback', {
      rawEventId,
      orderId,
      error: error.message,
    });
    await prisma.webhookRawEvent.update({
      where: { id: rawEventId },
      data: { status: 'FAILED', errorLog: error.message },
    });
  }
}

/**
 * Phát hiện loại event dựa trên nội dung payload.
 * 
 * Logic ưu tiên:
 *   1. Nếu eventType rõ ràng (orders/customers) → dùng luôn
 *   2. Nếu eventType là hành động (create/update) → kiểm tra payload
 *   3. Kiểm tra các trường đặc trưng: system_id → order, id (UUID) → customer
 */
function detectEventCategory(eventType: string, payload: any): 'order' | 'customer' | 'product' | 'order_stock_update' | 'unknown' {
  const normalized = eventType.toLowerCase().trim();

  // ── Nhóm rõ ràng từ tên event hoặc payload.type ──
  const payloadType = (payload.type || '').toLowerCase();
  
  if (normalized === 'variations_warehouses' || payloadType === 'variations_warehouses') {
    return 'order_stock_update';
  }
  
  if (normalized === 'orders' || normalized === 'order' || normalized === 'order_created' || payloadType === 'orders') {
    return 'order';
  }
  if (normalized === 'customers' || normalized === 'customer' || payloadType === 'customers') {
    return 'customer';
  }
  if (normalized === 'products' || normalized === 'product' || payloadType === 'products') {
    return 'product';
  }

  // ── Nhóm hành động: phân loại bằng nội dung payload ──
  // Order luôn có system_id (số nguyên = ID đơn hàng Pancake)
  if (payload.system_id !== undefined) {
    return 'order';
  }

  // Customer có id dạng UUID và thường có phone_numbers hoặc tên.
  // Thêm điều kiện không phải là type products để tránh nhận diện nhầm.
  if (payload.id && typeof payload.id === 'string' && payload.id.includes('-') && payloadType !== 'products' && payloadType !== 'product') {
    return 'customer';
  }

  // ── Không xác định được ──
  return 'unknown';
}

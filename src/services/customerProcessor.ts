import prisma from '../config/database';
import logger from '../utils/logger';
import { normalizeProvince } from '../utils/provinces';

/**
 * Xử lý event "customers" từ Pancake webhook.
 * 
 * Bóc tách thông tin khách hàng từ raw payload → upsert vào bảng `customers`.
 * Nếu customer đã tồn tại (dựa trên pancakeCustomerId), cập nhật thông tin mới.
 */
export async function processCustomerEvent(rawEventId: string, payload: any): Promise<void> {
  try {
    // ── Bóc tách thông tin khách hàng ──
    const customerId = payload.id ? String(payload.id) : null;
    const fullName = payload.full_name || payload.bill_full_name || 'Không rõ';
    const phoneNumber = payload.phone_number || payload.bill_phone_number || null;
    const email = payload.email || payload.bill_email || null;

    // ── Địa chỉ ──
    const shippingAddr = payload.shipping_address || {};
    const address = shippingAddr.address || payload.address || null;
    const fullAddress = shippingAddr.full_address || payload.full_address || null;
    const provinceId = shippingAddr.province_id || null;
    const districtId = shippingAddr.district_id || null;
    const communeId = shippingAddr.commune_id || null;
    const rawProvName = shippingAddr.province_name || null;
    const provinceName = rawProvName ? (normalizeProvince(rawProvName) || rawProvName) : null;
    const districtName = shippingAddr.district_name || null;
    const communeName = shippingAddr.commune_name || shippingAddr.commnue_name || null;

    // ── Nguồn khách ──
    const source = payload.order_sources_name || payload.source || null;

    if (!customerId) {
      logger.warn('Customer event missing ID, skipping upsert', { rawEventId });
      // Vẫn đánh dấu PROCESSED vì không phải lỗi
      await markProcessed(rawEventId);
      return;
    }

    // ── Upsert: tạo mới hoặc cập nhật ──
    await prisma.customer.upsert({
      where: { pancakeCustomerId: customerId },
      create: {
        pancakeCustomerId: customerId,
        fullName,
        phoneNumber,
        email,
        address,
        fullAddress,
        provinceId,
        districtId,
        communeId,
        provinceName,
        districtName,
        communeName,
        source,
        rawData: payload,
      },
      update: {
        fullName,
        phoneNumber: phoneNumber || undefined,
        email: email || undefined,
        address: address || undefined,
        fullAddress: fullAddress || undefined,
        provinceId: provinceId || undefined,
        districtId: districtId || undefined,
        communeId: communeId || undefined,
        provinceName: provinceName || undefined,
        districtName: districtName || undefined,
        communeName: communeName || undefined,
        source: source || undefined,
        rawData: payload,
      },
    });

    // ── Đánh dấu raw event đã xử lý xong ──
    await markProcessed(rawEventId);

    logger.info('Customer processed successfully', {
      rawEventId,
      pancakeCustomerId: customerId,
      fullName,
    });

  } catch (error: any) {
    logger.error('Failed to process customer event', {
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

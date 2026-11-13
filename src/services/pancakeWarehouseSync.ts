import axios from 'axios';
import logger from '../utils/logger';
import { PANCAKE_API_BASE } from '../config/pancake';
import { isSandboxEnvironment, logSandboxBlockedAction } from '../utils/sandboxGuard';

const SHOP_ID = '1635300067';

/**
 * Đổi kho xuất hàng của đơn trên Pancake POS.
 *
 * VÌ SAO KHÔNG GỬI MỖI `{ warehouse_id }`:
 * Khi đổi kho, POS xóa toàn bộ dòng sản phẩm rồi tạo lại. Nếu lệnh không kèm `items`, POS tạo lại
 * cả các dòng thành phần ẨN của sản phẩm combo (is_composite) thành dòng thường, sau đó combo lại
 * tự sinh thêm một bộ thành phần ẩn nữa -> đơn bị thừa dòng thành phần (giá 0đ), trừ tồn 2 lần.
 * (Đã kiểm chứng trên đơn test #6727 ngày 13/11/2026, cả PATCH lẫn PUT.)
 *
 * CÁCH ĐÚNG (đã kiểm chứng): với đơn có combo, gửi `PUT { warehouse_id, items }` trong đó `items`
 * lấy từ chính POS (dòng cha combo + dòng lẻ thật). POS chỉ tự sinh thành phần ẩn đúng 1 lần;
 * giá, giảm giá (số tiền / %), ghi chú, COD đều được giữ nguyên.
 *
 * TUYỆT ĐỐI không gửi trường `status` trong lệnh này.
 * Ném lỗi nếu POS từ chối (vd: kho đích không đủ tồn) để nơi gọi đánh dấu đồng bộ FAILED.
 */
export async function syncOrderWarehouseToPancake(pancakeOrderId: number, warehouseId: string): Promise<void> {
  if (isSandboxEnvironment()) {
    logSandboxBlockedAction('syncOrderWarehouseToPancake', { pancakeOrderId, warehouseId });
    return;
  }
  if (!pancakeOrderId || pancakeOrderId <= 0 || !warehouseId) return;

  const apiKey = process.env.PANCAKE_API_KEY;
  if (!apiKey) throw new Error('Thiếu cấu hình PANCAKE_API_KEY trên máy chủ.');

  const url = `${PANCAKE_API_BASE}/api/v1/shops/${SHOP_ID}/orders/${pancakeOrderId}`;
  const reqConfig = { params: { api_key: apiKey }, headers: { 'Content-Type': 'application/json' } };

  const fetchOrder = async (): Promise<any> => {
    const res = await axios.get(url, { params: { api_key: apiKey }, timeout: 15000 });
    if (!res.data?.success || !res.data?.data) {
      throw new Error(res.data?.message || 'Không đọc được đơn hàng từ Pancake POS');
    }
    return res.data.data;
  };

  const assertSuccess = (res: any) => {
    if (!res.data || !res.data.success) {
      throw new Error(res.data?.message || 'Yêu cầu đổi kho thất bại trên Pancake POS');
    }
  };

  try {
    const posOrder = await fetchOrder();
    const posItems: any[] = Array.isArray(posOrder.items) ? posOrder.items : [];
    const hasComposite = posItems.some(i => i?.is_composite === true);

    if (String(posOrder.warehouse_id || '') === String(warehouseId)) {
      logger.info('Pancake POS order already at target warehouse, skip warehouse sync', { pancakeOrderId, warehouseId });
      return;
    }

    // ── Đơn KHÔNG có combo: lệnh đổi kho đơn giản hoạt động đúng ──
    if (!hasComposite) {
      const res = await axios.patch(url, { warehouse_id: warehouseId }, { ...reqConfig, timeout: 10000 });
      assertSuccess(res);
      logger.info('Synced warehouse change to Pancake POS', { pancakeOrderId, warehouseId, mode: 'warehouse_only' });
      return;
    }

    // ── Đơn CÓ combo: gửi kèm items để POS không nhân đôi dòng thành phần ──
    const items = buildItemsForWarehouseChange(posItems, pancakeOrderId);
    const body = { warehouse_id: warehouseId, items };

    const res = await axios.put(url, body, { ...reqConfig, timeout: 20000 });
    assertSuccess(res);

    // Kiểm tra lại kết quả trên POS
    const after = await fetchOrder();
    const afterCount = Array.isArray(after.items) ? after.items.length : 0;
    if (String(after.warehouse_id || '') !== String(warehouseId)) {
      throw new Error('Pancake POS báo thành công nhưng kho của đơn chưa đổi');
    }
    if (afterCount !== items.length) {
      logger.error('Pancake POS item line count mismatch after warehouse change on composite order', {
        pancakeOrderId, warehouseId, sentLines: items.length, posLines: afterCount
      });
    } else {
      logger.info('Synced warehouse change to Pancake POS', {
        pancakeOrderId, warehouseId, mode: 'warehouse_with_items', lines: items.length
      });
    }
  } catch (err: any) {
    // Chuẩn hóa thông điệp lỗi từ POS (vd: "Sản phẩm X tồn kho không đủ !")
    const posMsg = err?.response?.data?.message || err?.response?.data?.errors?.order;
    if (posMsg && typeof posMsg === 'string') {
      const wrapped: any = new Error(posMsg);
      wrapped.response = err.response;
      throw wrapped;
    }
    throw err;
  }
}

/**
 * Dựng `items` cho lệnh đổi kho từ danh sách dòng POS trả về.
 * - Giữ nguyên dòng cha combo (kèm is_composite + components) và các dòng lẻ thật.
 * - Bỏ các dòng thành phần combo bị "lộ" do lỗi nhân đôi trước đó: dòng lẻ trùng thành phần của
 *   combo trong cùng đơn, GIÁ 0đ, không phải quà tặng; chỉ bỏ tối đa đúng số lượng combo tự sinh
 *   (sl combo × sl thành phần). Dòng thành phần khách mua lẻ thêm (có giá) hoặc quà tặng được giữ nguyên.
 */
export function buildItemsForWarehouseChange(posItems: any[], pancakeOrderId?: number): any[] {
  const budget = new Map<string, number>();
  for (const it of posItems) {
    if (it?.is_composite !== true || !Array.isArray(it.components)) continue;
    const parentQty = Number(it.quantity) || 1;
    for (const c of it.components) {
      const compId = String(c?.component_id || '');
      if (!compId) continue;
      budget.set(compId, (budget.get(compId) || 0) + (Number(c?.quantity) || 1) * parentQty);
    }
  }

  const result: any[] = [];
  const stripped: Array<{ name: string; quantity: number }> = [];

  for (const it of posItems) {
    let quantity = Number(it?.quantity) || 0;
    const varId = String(it?.variation_id || '');
    const isExposedComponentCandidate =
      it?.is_composite !== true &&
      it?.is_bonus_product !== true &&
      !it?.composite_item_id &&
      budget.has(varId) &&
      (Number(it?.variation_info?.retail_price) || 0) === 0;

    if (isExposedComponentCandidate) {
      const remaining = budget.get(varId) || 0;
      const take = Math.min(remaining, quantity);
      if (take > 0) {
        budget.set(varId, remaining - take);
        quantity -= take;
        stripped.push({ name: it?.variation_info?.name || varId, quantity: take });
      }
    }
    if (quantity <= 0) continue;

    const line: any = {
      variation_id: it.variation_id,
      product_id: it.product_id,
      quantity,
      discount_each_product: it.discount_each_product ?? 0,
      is_discount_percent: Boolean(it.is_discount_percent),
      is_bonus_product: Boolean(it.is_bonus_product),
      is_wholesale: Boolean(it.is_wholesale),
      one_time_product: Boolean(it.one_time_product),
      variation_info: it.variation_info,
    };
    if (it.note) line.note = it.note;
    if (it.note_product) line.note_product = it.note_product;
    if (it.is_composite === true) {
      line.is_composite = true;
      line.components = it.components;
    }
    result.push(line);
  }

  if (stripped.length > 0) {
    logger.info('Removed exposed combo component lines while changing warehouse on Pancake POS', { pancakeOrderId, stripped });
  }
  return result;
}

import prisma from '../config/database';
import logger from '../utils/logger';

interface OrderItemState {
  productName: string;
  quantity: number;
}

interface OrderState {
  adminStatus: string | null;
  warehouseId: string | null;
  items: OrderItemState[];
}

/**
 * Điều chỉnh tồn kho cục bộ cho một sản phẩm tại một kho hàng cụ thể.
 * @param productName Tên hoặc SKU của sản phẩm
 * @param warehouseId ID kho hàng
 * @param qtyDiff Số lượng thay đổi (dương để cộng, âm để trừ)
 * @param stockType 'available' (Có thể bán) hoặc 'actual' (Tồn thực tế)
 */
export async function adjustLocalStock(
  productName: string,
  warehouseId: string | null,
  qtyDiff: number,
  stockType: 'available' | 'actual'
): Promise<void> {
  if (!warehouseId || qtyDiff === 0) return;

  try {
    // Tìm sản phẩm hoạt động trong DB
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { name: productName },
          { sku: productName }
        ],
        isActive: true
      }
    });

    if (!product) {
      logger.warn(`adjustLocalStock: Không tìm thấy sản phẩm "${productName}" trong danh mục.`);
      return;
    }

    const rawData = (product.rawData as any) || {};
    const vwList = rawData.variations_warehouses || [];

    const vwIndex = vwList.findIndex((w: any) => String(w.warehouse_id) === String(warehouseId));
    if (vwIndex !== -1) {
      if (stockType === 'available') {
        const oldVal = Number(vwList[vwIndex].remain_quantity) || 0;
        vwList[vwIndex].remain_quantity = Math.max(0, oldVal + qtyDiff);
      } else {
        const oldVal = Number(vwList[vwIndex].actual_remain_quantity) || Number(vwList[vwIndex].remain_quantity) || 0;
        vwList[vwIndex].actual_remain_quantity = Math.max(0, oldVal + qtyDiff);
      }
    } else {
      // Nếu kho hàng chưa tồn tại trong variations_warehouses
      const newObj: any = {
        warehouse_id: warehouseId,
        remain_quantity: 0,
        actual_remain_quantity: 0,
        total_quantity: 0
      };
      if (stockType === 'available') {
        newObj.remain_quantity = Math.max(0, qtyDiff);
      } else {
        newObj.actual_remain_quantity = Math.max(0, qtyDiff);
      }
      vwList.push(newObj);
    }

    rawData.variations_warehouses = vwList;

    // Tính toán lại tổng tồn kho (aggregates)
    const totalAvailable = vwList.reduce((sum: number, w: any) => sum + (Number(w.remain_quantity) || 0), 0);
    const totalStockVal = vwList.reduce((sum: number, w: any) => sum + (Number(w.actual_remain_quantity) || Number(w.remain_quantity) || 0), 0);
    const totalImportedVal = vwList.reduce((sum: number, w: any) => sum + (Number(w.total_quantity) || 0), 0);

    await prisma.product.update({
      where: { id: product.id },
      data: {
        availableStock: totalAvailable,
        totalStock: totalStockVal,
        totalImported: totalImportedVal,
        rawData: rawData
      }
    });

    logger.info(`adjustLocalStock: Cập nhật thành công tồn kho "${product.name}" tại kho "${warehouseId}" (${stockType} += ${qtyDiff}).`);
  } catch (err: any) {
    logger.error(`adjustLocalStock: Lỗi cập nhật tồn kho`, { productName, warehouseId, qtyDiff, stockType, error: err.message });
  }
}

/**
 * Đồng bộ tồn kho cục bộ dựa trên sự thay đổi trạng thái và linh kiện của đơn hàng.
 * @param orderId ID của đơn hàng
 * @param oldState Trạng thái cũ (hoặc null nếu là đơn hàng mới tạo)
 * @param newState Trạng thái mới của đơn hàng
 */
export async function syncOrderInventoryState(
  orderId: string,
  oldState: OrderState | null,
  newState: OrderState
): Promise<void> {
  try {
    const isActiveStatus = (status: string | null) => {
      if (!status) return true; // Mặc định là chờ xử lý (Active)
      const s = status.toLowerCase();
      return s !== 'hoàn thành' && s !== 'hủy đơn';
    };

    const isCompletedStatus = (status: string | null) => {
      return status?.toLowerCase() === 'hoàn thành';
    };

    // 1. Đảo ngược các ảnh hưởng của trạng thái cũ (nếu có)
    if (oldState) {
      const oldIsActive = isActiveStatus(oldState.adminStatus);
      const oldIsCompleted = isCompletedStatus(oldState.adminStatus);

      if (oldIsActive && oldState.warehouseId) {
        // Trả lại lượng giữ hàng vào tồn có thể bán (Available)
        for (const item of oldState.items) {
          if (item.productName) {
            await adjustLocalStock(item.productName, oldState.warehouseId, item.quantity, 'available');
          }
        }
      } else if (oldIsCompleted && oldState.warehouseId) {
        // Trả lại lượng đã trừ vào tồn thực tế (Actual)
        for (const item of oldState.items) {
          if (item.productName) {
            await adjustLocalStock(item.productName, oldState.warehouseId, item.quantity, 'actual');
          }
        }
      }
    }

    // 2. Áp dụng các ảnh hưởng của trạng thái mới
    const newIsActive = isActiveStatus(newState.adminStatus);
    const newIsCompleted = isCompletedStatus(newState.adminStatus);

    if (newIsActive && newState.warehouseId) {
      // Khấu trừ tồn có thể bán (giữ hàng)
      for (const item of newState.items) {
        if (item.productName) {
          await adjustLocalStock(item.productName, newState.warehouseId, -item.quantity, 'available');
        }
      }
    } else if (newIsCompleted && newState.warehouseId) {
      // Khấu trừ tồn thực tế (Actual)
      for (const item of newState.items) {
        if (item.productName) {
          await adjustLocalStock(item.productName, newState.warehouseId, -item.quantity, 'actual');
        }
      }
    }

    logger.info(`syncOrderInventoryState: Đã đồng bộ tồn kho cho đơn hàng "${orderId}". Trạng thái: ${oldState?.adminStatus || 'N/A'} -> ${newState.adminStatus}.`);
  } catch (err: any) {
    logger.error(`syncOrderInventoryState: Lỗi đồng bộ tồn kho cho đơn hàng "${orderId}"`, { error: err.message });
  }
}

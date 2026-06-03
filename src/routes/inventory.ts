import { Router, Request, Response } from 'express';
import axios from 'axios';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';

const router = Router();
const SHOP_ID = '1635300067';

// Tất cả các API quản lý kho chỉ dành cho Admin đã đăng nhập
router.use(requireAuth);
router.use(requireAdmin);

/**
 * Helper để lấy danh sách kho hàng từ Pancake POS
 */
async function fetchPancakeWarehouses(): Promise<any[]> {
  const apiKey = process.env.PANCAKE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing PANCAKE_API_KEY in server environment');
  }

  try {
    const response = await axios.get(`https://pos.pages.fm/api/v1/shops/${SHOP_ID}/warehouses`, {
      params: { api_key: apiKey },
      timeout: 10000
    });

    if (response.data && response.data.success) {
      return response.data.warehouses || [];
    }
    return [];
  } catch (error: any) {
    logger.error('Error fetching warehouses from Pancake POS API', { error: error.message });
    return [];
  }
}

/**
 * GET /api/inventory/warehouses
 * Lấy danh sách toàn bộ các kho hàng đang có trên Pancake
 */
router.get('/warehouses', async (req: Request, res: Response): Promise<void> => {
  try {
    const warehouses = await fetchPancakeWarehouses();
    res.json(warehouses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/inventory/stock
 * Lấy bảng tổng hợp tồn kho của tất cả sản phẩm tại từng kho
 */
router.get('/stock', async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Lấy danh sách kho
    const warehouses = await fetchPancakeWarehouses();
    
    // 2. Lấy toàn bộ sản phẩm có liên kết Pancake trong database
    const dbProducts = await prisma.product.findMany({
      orderBy: { name: 'asc' }
    });

    // 3. Chuẩn bị dữ liệu trả về
    const productsData = dbProducts.map((p) => {
      const rawData = (p.rawData as any) || {};
      const vwList = rawData.variations_warehouses || [];
      
      // Ánh xạ tồn kho của từng kho
      const stocks: Record<string, number> = {};
      vwList.forEach((vw: any) => {
        if (vw.warehouse_id) {
          stocks[vw.warehouse_id] = Number(vw.remain_quantity) || 0;
        }
      });

      return {
        id: p.id,
        pancakeProductId: p.pancakeProductId,
        sku: p.sku,
        name: p.name,
        category: p.category,
        imageUrl: p.imageUrl,
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        availableStock: p.availableStock ?? 0,
        isActive: p.isActive,
        stocks // { [warehouse_id]: remain_quantity }
      };
    });

    res.json({
      warehouses: warehouses.map((w: any) => ({
        id: w.id,
        name: w.name,
        address: w.address,
        fullAddress: w.full_address,
        phone: w.phone_number
      })),
      products: productsData
    });

  } catch (error: any) {
    logger.error('Get inventory stock error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy tổng hợp dữ liệu tồn kho' });
  }
});

export default router;

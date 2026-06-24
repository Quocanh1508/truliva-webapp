import { Router, Request, Response } from 'express';
import axios from 'axios';
import ExcelJS from 'exceljs';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin, requireCoordinatorOrAdmin } from '../middleware/authSession';
import { syncProducts } from '../scripts/syncProducts';

const router = Router();
const SHOP_ID = '1635300067';

// Các API quản lý kho yêu cầu đăng nhập
router.use(requireAuth);

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
      return response.data.data || response.data.warehouses || [];
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
 * Lấy bảng tổng hợp tồn kho của tất cả sản phẩm tại từng kho (Admin only)
 */
router.get('/stock', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Lấy danh sách kho
    const warehouses = await fetchPancakeWarehouses();
    
    // 2. Lấy toàn bộ sản phẩm ACTIVE có liên kết Pancake trong database
    const dbProducts = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    // 3. Chuẩn bị dữ liệu trả về
    const productsData = dbProducts.map((p) => {
      const rawData = (p.rawData as any) || {};
      const vwList = rawData.variations_warehouses || [];
      
      // Ánh xạ tồn kho của từng kho
      const stocks: Record<string, number> = {};
      const actualStocks: Record<string, number> = {};
      vwList.forEach((vw: any) => {
        if (vw.warehouse_id) {
          stocks[vw.warehouse_id] = Number(vw.remain_quantity) || 0;
          actualStocks[vw.warehouse_id] = Number(vw.actual_remain_quantity) || Number(vw.remain_quantity) || 0;
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
        totalStock: p.totalStock ?? 0,
        isActive: p.isActive,
        stocks, // { [warehouse_id]: remain_quantity }
        actualStocks // { [warehouse_id]: actual_remain_quantity }
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

/**
 * POST /api/inventory/sync
 * Kích hoạt đồng bộ sản phẩm từ Pancake POS trong nền (Admin only)
 */
router.post('/sync', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    syncProducts().catch((err) => logger.error('Sync products in background failed', { error: err.message }));
    res.status(200).json({ message: 'Sync process started in the background.' });
  } catch (error: any) {
    logger.error('Sync products route error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/inventory/export
 * Xuất Excel báo cáo tồn kho hàng có áp dụng bộ lọc (Admin hoặc KTV)
 */
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }

    const userDb = await prisma.user.findUnique({
      where: { id: userId },
      select: { warehouseId: true, role: true }
    });

    if (!userDb) {
      res.status(401).json({ error: 'Người dùng không hợp lệ' });
      return;
    }

    const { 
      search, 
      categories, 
      warehouses, 
      lowStockThreshold: thresholdStr,
      showOnlyLowStock,
      showOnlyInStock 
    } = req.query;

    // 1. Lấy danh sách tất cả kho hàng từ Pancake POS
    const allWarehouses = await fetchPancakeWarehouses();
    
    // 2. Lấy toàn bộ sản phẩm từ database
    const dbProducts = await prisma.product.findMany({
      orderBy: { name: 'asc' }
    });

    const lowStockThreshold = thresholdStr ? parseInt(String(thresholdStr), 10) : 2;

    // 3. Chuẩn bị dữ liệu tồn kho sản phẩm tương tự như /stock
    let productsData = dbProducts.map((p) => {
      const rawData = (p.rawData as any) || {};
      const vwList = rawData.variations_warehouses || [];
      
      const stocks: Record<string, number> = {};
      const actualStocks: Record<string, number> = {};
      vwList.forEach((vw: any) => {
        if (vw.warehouse_id) {
          stocks[vw.warehouse_id] = Number(vw.remain_quantity) || 0;
          actualStocks[vw.warehouse_id] = Number(vw.actual_remain_quantity) || Number(vw.remain_quantity) || 0;
        }
      });

      return {
        id: p.id,
        pancakeProductId: p.pancakeProductId,
        sku: p.sku || '',
        name: p.name || '',
        category: p.category || '',
        costPrice: p.costPrice,
        sellingPrice: p.sellingPrice,
        availableStock: p.availableStock ?? 0,
        totalStock: p.totalStock ?? 0,
        isActive: p.isActive,
        stocks,
        actualStocks
      };
    });

    // 4. Xác định các kho hàng cần xuất cột
    let selectedWarehouseIds: string[] = [];
    if (userDb.role === 'KTV') {
      if (!userDb.warehouseId) {
        res.status(400).json({ error: 'Bạn không trực thuộc quản lý kho nào, nếu có sai sót hãy liên hệ admin.' });
        return;
      }
      selectedWarehouseIds = [userDb.warehouseId];
    } else {
      if (warehouses) {
        selectedWarehouseIds = String(warehouses).split(',').map(s => s.trim()).filter(Boolean);
      } else {
        selectedWarehouseIds = allWarehouses.map((w: any) => String(w.id));
      }
    }

    const exportWarehouses = allWarehouses.filter((w: any) => selectedWarehouseIds.includes(String(w.id)));

    // 5. Áp dụng bộ lọc cho danh sách sản phẩm y hệt như frontend
    // Lọc theo tìm kiếm Tên / SKU
    if (search) {
      const q = String(search).trim().toLowerCase();
      productsData = productsData.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.sku.toLowerCase().includes(q)
      );
    }

    // Lọc theo Danh mục
    if (categories) {
      const catList = String(categories).split(',').map(s => s.trim()).filter(Boolean);
      if (catList.length > 0) {
        productsData = productsData.filter(p => p.category && catList.includes(p.category));
      }
    }

    // Lọc theo trạng thái Sắp hết hàng
    if (String(showOnlyLowStock) === 'true') {
      productsData = productsData.filter(p => 
        selectedWarehouseIds.some(wId => {
          const qty = p.stocks[wId] ?? 0;
          return qty <= lowStockThreshold;
        })
      );
    } 
    // Lọc theo trạng thái Còn hàng
    else if (String(showOnlyInStock) === 'true') {
      productsData = productsData.filter(p => 
        selectedWarehouseIds.some(wId => {
          const qty = p.stocks[wId] ?? 0;
          return qty > lowStockThreshold;
        })
      );
    }

    // 6. Khởi tạo workbook ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tồn kho');

    // Cấu hình các cột trong Excel
    const columns: any[] = [
      { header: 'Tên sản phẩm', key: 'name', width: 40 },
      { header: 'Mã SKU', key: 'sku', width: 18 },
      { header: 'Danh mục', key: 'category', width: 20 },
      { header: 'Trạng thái trên POS', key: 'status', width: 18 }
    ];

    // Thêm các cột động cho từng kho hàng
    exportWarehouses.forEach((w: any) => {
      columns.push({
        header: `${w.name}\n(Có thể bán)`,
        key: `available_${w.id}`,
        width: 25
      });
      columns.push({
        header: `${w.name}\n(Tồn thực tế)`,
        key: `actual_${w.id}`,
        width: 25
      });
    });

    // Cột tổng cộng
    columns.push({ header: 'Tổng có thể bán', key: 'totalAvailable', width: 18 });
    columns.push({ header: 'Tổng tồn thực tế', key: 'totalActual', width: 18 });

    worksheet.columns = columns;

    // Định dạng dòng header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B3A6B' } // Xanh Truliva (#1B3A6B)
    };
    headerRow.height = 35; // Tăng chiều cao để hỗ trợ wrapText xuống dòng của tên kho

    headerRow.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF0F203C' } },
        left: { style: 'thin', color: { argb: 'FF0F203C' } },
        bottom: { style: 'medium', color: { argb: 'FF0F203C' } },
        right: { style: 'thin', color: { argb: 'FF0F203C' } }
      };
    });

    // Thêm dữ liệu
    productsData.forEach((p) => {
      const rowData: any = {
        name: p.name,
        sku: p.sku,
        category: p.category,
        status: p.isActive ? 'Đang hoạt động' : 'Ẩn trên POS',
        totalAvailable: p.availableStock,
        totalActual: p.totalStock
      };

      // Điền số lượng từng kho
      exportWarehouses.forEach((w: any) => {
        rowData[`available_${w.id}`] = p.stocks[w.id] ?? 0;
        rowData[`actual_${w.id}`] = p.actualStocks[w.id] ?? 0;
      });

      const row = worksheet.addRow(rowData);
      row.height = 24;

      // Căn lề, viền và highlight
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        // Căn lề trái cho tên sản phẩm, các cột khác căn giữa
        if (colNumber === 1) {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }

        cell.font = { name: 'Arial', size: 9 };

        // Viền nhạt
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
      });

      // Highlight các ô có lượng tồn có thể bán <= ngưỡng báo hết hàng
      exportWarehouses.forEach((w: any) => {
        const qty = p.stocks[w.id] ?? 0;
        if (qty <= lowStockThreshold) {
          const cell = row.getCell(`available_${w.id}`);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFEE2E2' } // đỏ nhạt
          };
          cell.font = {
            name: 'Arial',
            size: 9,
            color: { argb: 'FF991B1B' }, // đỏ đậm
            bold: true
          };
        }
      });

      // Highlight cột Tổng có thể bán nếu tổng <= ngưỡng
      if (p.availableStock <= lowStockThreshold) {
        const cell = row.getCell('totalAvailable');
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' }
        };
        cell.font = {
          name: 'Arial',
          size: 9,
          color: { argb: 'FF991B1B' },
          bold: true
        };
      }
    });

    // Thiết lập header và gửi file về client
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + encodeURIComponent('Bao_cao_ton_kho_san_pham.xlsx')
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error: any) {
    logger.error('Export inventory stock error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xuất file Excel tồn kho' });
  }
});

/**
 * GET /api/inventory/my-stock
 * Lấy bảng tồn kho của riêng KTV đang đăng nhập dựa trên warehouseId được gán
 */
router.get('/my-stock', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }

    // 1. Lấy thông tin User để xem warehouseId được gán
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { warehouseId: true, warehouseName: true }
    });

    if (!user || !user.warehouseId) {
      res.status(400).json({ error: 'Bạn không trực thuộc quản lý kho nào, nếu có sai sót hãy liên hệ admin.' });
      return;
    }

    // 2. Lấy danh sách kho hoạt động từ Pancake POS để xác thực kho có hoạt động
    const activeWarehouses = await fetchPancakeWarehouses();
    const currentWarehouse = activeWarehouses.find(w => String(w.id) === String(user.warehouseId));
    
    if (!currentWarehouse) {
      res.status(400).json({ error: `Kho hàng được gán (${user.warehouseName}) hiện đã bị khóa hoặc không tồn tại trên Pancake POS.` });
      return;
    }

    // 3. Lấy các sản phẩm có liên kết Pancake từ DB
    const dbProducts = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    // 4. Lọc tồn kho của duy nhất kho này
    const productsData = dbProducts.map((p) => {
      const rawData = (p.rawData as any) || {};
      const vwList = rawData.variations_warehouses || [];
      
      let availableStock = 0;
      let actualStock = 0;
      
      const matchedWarehouse = vwList.find((vw: any) => String(vw.warehouse_id) === String(user.warehouseId));
      if (matchedWarehouse) {
        availableStock = Number(matchedWarehouse.remain_quantity) || 0;
        actualStock = Number(matchedWarehouse.actual_remain_quantity) || Number(matchedWarehouse.remain_quantity) || 0;
      }

      return {
        id: p.id,
        sku: p.sku || '',
        name: p.name,
        category: p.category || '',
        imageUrl: p.imageUrl || '',
        sellingPrice: p.sellingPrice || 0,
        availableStock, // Tồn có thể bán tại kho KTV
        actualStock    // Tồn thực tế tại kho KTV
      };
    });

    res.json({
      warehouse: {
        id: currentWarehouse.id,
        name: currentWarehouse.name,
        address: currentWarehouse.address,
        fullAddress: currentWarehouse.full_address
      },
      products: productsData
    });

  } catch (error: any) {
    logger.error('Get KTV inventory stock error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy thông tin tồn kho của KTV' });
  }
});

export default router;

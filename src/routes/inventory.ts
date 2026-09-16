import { Router, Request, Response } from 'express';
import axios from 'axios';
import ExcelJS from 'exceljs';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin, requireCoordinatorOrAdmin } from '../middleware/authSession';
import { syncProducts } from '../scripts/syncProducts';
import { getComboMappingsForInventory } from '../controllers/orderController';

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
 * Lấy bảng tổng hợp tồn kho của tất cả sản phẩm tại từng kho (Có phân quyền lọc chi tiết)
 */
router.get('/stock', async (req: Request, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    const isCoordinatorOrAdmin = role === 'ADMIN' || role === 'DEV' || role === 'COORDINATOR';

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

      const prod: any = {
        id: p.id,
        pancakeProductId: p.pancakeProductId,
        sku: p.sku,
        name: p.name,
        category: p.category,
        imageUrl: p.imageUrl || ((p.rawData as any)?.images?.[0]) || null,
        sellingPrice: p.sellingPrice,
        availableStock: p.availableStock ?? 0,
        totalStock: p.totalStock ?? 0,
        isActive: p.isActive,
      };

      // Chỉ trả về giá vốn và tồn kho chi tiết nếu là Admin/Coordinator
      if (isCoordinatorOrAdmin) {
        prod.costPrice = p.costPrice;
        prod.stocks = stocks;
        prod.actualStocks = actualStocks;
      }

      return prod;
    });

    res.json({
      warehouses: warehouses.map((w: any) => ({
        id: w.id,
        name: w.name,
        address: w.address,
        fullAddress: w.full_address,
        phone: w.phone_number
      })),
      products: productsData,
      comboMappings: getComboMappingsForInventory()
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
    await syncProducts();
    res.status(200).json({ success: true, message: 'Đã đồng bộ danh mục sản phẩm từ Pancake POS thành công!' });
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

    if (userDb.role === 'KTV') {
      res.status(403).json({ error: 'Kỹ thuật viên không có quyền xuất file Excel tồn kho.' });
      return;
    }

    const { 
      search, 
      categories, 
      warehouses, 
      lowStockThreshold: thresholdStr,
      showOnlyLowStock,
      showOnlyOutOfStock,
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
    if (warehouses) {
      selectedWarehouseIds = String(warehouses).split(',').map(s => s.trim()).filter(Boolean);
    } else {
      selectedWarehouseIds = allWarehouses.map((w: any) => String(w.id));
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

    // Lọc theo trạng thái Hết hàng (lượng tồn <= 0)
    if (String(showOnlyOutOfStock) === 'true' || String(showOnlyLowStock) === 'true') {
      productsData = productsData.filter(p => 
        selectedWarehouseIds.some(wId => {
          const qty = p.stocks[wId] ?? 0;
          return qty <= 0;
        })
      );
    } 
    // Lọc theo trạng thái Còn hàng (lượng tồn > 0)
    else if (String(showOnlyInStock) === 'true') {
      productsData = productsData.filter(p => 
        selectedWarehouseIds.some(wId => {
          const qty = p.stocks[wId] ?? 0;
          return qty > 0;
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
      products: productsData,
      comboMappings: getComboMappingsForInventory()
    });

  } catch (error: any) {
    logger.error('Get KTV inventory stock error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy thông tin tồn kho của KTV' });
  }
});

/**
 * GET /api/inventory/analytics
 * Lấy báo cáo Xuất - Nhập - Tồn từ Pancake POS (Hỗ trợ lọc theo kho và khoảng thời gian)
 */
router.get('/analytics', async (req: Request, res: Response): Promise<void> => {
  try {
    const apiKey = process.env.PANCAKE_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Missing PANCAKE_API_KEY in server environment' });
      return;
    }

    const role = req.user?.role;
    let targetWarehouseIds: string[] | undefined = undefined;

    // Nếu là KTV, chỉ cho phép xem kho của mình
    if (role === 'KTV') {
      const userDb = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { warehouseId: true }
      });
      if (!userDb?.warehouseId) {
        res.status(403).json({ error: 'Tài khoản KTV chưa được gắn kho hàng quản lý.' });
        return;
      }
      targetWarehouseIds = [userDb.warehouseId];
    } else {
      if (req.query.warehouse_ids) {
        const list = String(req.query.warehouse_ids).split(',').map(s => s.trim()).filter(Boolean);
        if (list.length > 0 && !list.includes('all')) {
          targetWarehouseIds = list;
        }
      } else if (req.query.warehouse_id && req.query.warehouse_id !== 'all') {
        targetWarehouseIds = [String(req.query.warehouse_id)];
      }
    }

    const startTime = (req.query.start_date || req.query.start_time) ? Number(req.query.start_date || req.query.start_time) : undefined;
    const endTime = (req.query.end_date || req.query.end_time) ? Number(req.query.end_date || req.query.end_time) : undefined;

    // 1. Lấy danh sách kho
    const warehouses = await fetchPancakeWarehouses();

    // 2. Gọi song song: Danh sách tồn kho theo sản phẩm, tổng hợp Xuất/Nhập, và tổng tồn
    const [analyticsItemsRes, totalImportExportRes, totalInventoryRes, dbProducts] = await Promise.all([
      axios.get(`https://pos.pages.fm/api/v1/shops/${SHOP_ID}/inventory_analytics/inventory`, {
        params: {
          api_key: apiKey,
          warehouse_ids: targetWarehouseIds,
          start_date: startTime,
          end_date: endTime,
          start_time: startTime,
          end_time: endTime,
          page_size: 200,
          page_number: 1
        },
        timeout: 15000
      }).catch(err => {
        logger.error('Error fetching inventory_analytics/inventory', { error: err.message });
        return { data: { data: [], success: false } };
      }),
      axios.get(`https://pos.pages.fm/api/v1/shops/${SHOP_ID}/inventory_analytics/total_import_export`, {
        params: {
          api_key: apiKey,
          warehouse_ids: targetWarehouseIds,
          start_date: startTime,
          end_date: endTime,
          start_time: startTime,
          end_time: endTime
        },
        timeout: 10000
      }).catch(err => {
        logger.error('Error fetching inventory_analytics/total_import_export', { error: err.message });
        return { data: { data: {} } };
      }),
      axios.get(`https://pos.pages.fm/api/v1/shops/${SHOP_ID}/inventory_analytics/total_inventory`, {
        params: {
          api_key: apiKey,
          warehouse_ids: targetWarehouseIds,
          start_date: startTime,
          end_date: endTime,
          start_time: startTime,
          end_time: endTime
        },
        timeout: 10000
      }).catch(err => {
        logger.error('Error fetching inventory_analytics/total_inventory', { error: err.message });
        return { data: { data: {} } };
      }),
      prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          pancakeProductId: true,
          sku: true,
          name: true,
          category: true,
          imageUrl: true,
          costPrice: true,
          sellingPrice: true,
          rawData: true
        }
      })
    ]);

    const rawItems: any[] = analyticsItemsRes.data?.data || [];
    const summaryData: any = totalImportExportRes.data?.data || {};
    const totalInvData: any = totalInventoryRes.data?.data || {};

    // Map dbProducts by pancakeProductId & SKU for fast lookup
    const dbProductMap = new Map<string, any>();
    const dbSkuMap = new Map<string, any>();
    dbProducts.forEach(p => {
      if (p.pancakeProductId) dbProductMap.set(p.pancakeProductId, p);
      if (p.sku) dbSkuMap.set(p.sku.toLowerCase(), p);
      dbSkuMap.set(p.name.toLowerCase(), p);
    });

    // Enrich items
    const enrichedItems = rawItems.map((item: any) => {
      const variation = item.variation || {};
      const product = variation.product || {};
      const pancakeVariationId = String(variation.id || item.id || '');
      const sku = String(variation.custom_id || variation.display_id || product.custom_id || '');
      const name = String(product.name || variation.name || 'Sản phẩm không tên');

      const matchedDb = dbProductMap.get(pancakeVariationId) || dbSkuMap.get(sku.toLowerCase()) || dbSkuMap.get(name.toLowerCase());

      const imageUrl = matchedDb?.imageUrl 
        || ((matchedDb?.rawData as any)?.images?.[0]) 
        || variation.images?.[0] 
        || product.images?.[0] 
        || null;

      const isKTV = role === 'KTV';
      const category = matchedDb?.category || 'Chưa phân loại';
      const sellingPrice = isKTV ? 0 : (matchedDb?.sellingPrice || variation.retail_price || 0);
      const costPrice = isKTV ? 0 : (matchedDb?.costPrice || variation.last_imported_price || 0);

      const totalImport = Math.max(0, Number(item.total_import) || 0);
      const totalExport = Math.abs(Number(item.total_export) || 0);
      const beginInventory = Math.max(0, Number(item.begin_inventory) || 0);
      const endInventory = Math.max(0, Number(item.end_inventory) || 0);

      return {
        id: matchedDb?.id || pancakeVariationId,
        pancakeProductId: pancakeVariationId,
        name,
        sku,
        category,
        imageUrl,
        sellingPrice: isKTV ? 0 : sellingPrice,
        costPrice: isKTV ? 0 : costPrice,
        begin_inventory: beginInventory,
        begin_inventory_value: isKTV ? 0 : Math.max(0, Number(item.begin_inventory_value) || 0),
        total_import: totalImport,
        total_import_value: isKTV ? 0 : Math.max(0, Number(item.total_import_value) || 0),
        purchase_import: isKTV ? 0 : Math.max(0, Number(item.purchase_import) || 0),
        transfer_import: isKTV ? 0 : Math.max(0, Number(item.transfer_import) || 0),
        return_import: isKTV ? 0 : Math.max(0, Number(item.return_import) || 0),
        stocktaking_import: isKTV ? 0 : Math.max(0, Number(item.stocktaking_import) || 0),
        total_export: totalExport,
        total_export_value: isKTV ? 0 : Math.abs(Number(item.total_export_value) || 0),
        sell_export: isKTV ? 0 : Math.abs(Number(item.sell_export) || 0),
        transfer_export: isKTV ? 0 : Math.abs(Number(item.transfer_export) || 0),
        purchase_export: isKTV ? 0 : Math.abs(Number(item.purchase_export) || 0),
        stocktaking_export: isKTV ? 0 : Math.abs(Number(item.stocktaking_export) || 0),
        end_inventory: endInventory,
        end_inventory_value: isKTV ? 0 : Math.max(0, Number(item.end_inventory_value) || 0)
      };
    });

    // Summary numbers: tính toán an toàn từ API kết hợp enriched items để không bao giờ có số âm
    let sumBegin = 0;
    let sumBeginVal = 0;
    let sumEnd = 0;
    let sumEndVal = 0;
    enrichedItems.forEach(it => {
      sumBegin += it.begin_inventory;
      sumBeginVal += it.begin_inventory_value;
      sumEnd += it.end_inventory;
      sumEndVal += it.end_inventory_value;
    });

    const isKTV = role === 'KTV';
    const totalImport = Math.max(0, Number(summaryData.total_import) || 0);
    const totalExport = Math.abs(Number(summaryData.total_export) || 0);
    const endInventory = Number(totalInvData.end_inventory) > 0 ? Number(totalInvData.end_inventory) : sumEnd;
    const endInventoryValue = Number(totalInvData.end_inventory_value) > 0 ? Number(totalInvData.end_inventory_value) : sumEndVal;
    const beginInventory = sumBegin > 0 ? sumBegin : Math.max(0, endInventory - totalImport + totalExport);
    const beginInventoryValue = sumBeginVal > 0 ? sumBeginVal : Math.max(0, endInventoryValue - (Number(summaryData.total_import_value) || 0) + Math.abs(Number(summaryData.total_export_value) || 0));

    const summary = {
      begin_inventory: beginInventory,
      begin_inventory_value: isKTV ? 0 : beginInventoryValue,
      total_import: totalImport,
      total_import_value: isKTV ? 0 : Math.max(0, Number(summaryData.total_import_value) || 0),
      purchase_import: isKTV ? 0 : Math.max(0, Number(summaryData.purchase_import) || 0),
      transfer_import: isKTV ? 0 : Math.max(0, Number(summaryData.transfer_import) || 0),
      return_import: isKTV ? 0 : Math.max(0, Number(summaryData.return_import) || 0),
      stocktaking_import: isKTV ? 0 : Math.max(0, Number(summaryData.stocktaking_import) || 0),
      total_export: totalExport,
      total_export_value: isKTV ? 0 : Math.abs(Number(summaryData.total_export_value) || 0),
      sell_export: isKTV ? 0 : Math.abs(Number(summaryData.sell_export) || 0),
      transfer_export: isKTV ? 0 : Math.abs(Number(summaryData.transfer_export) || 0),
      purchase_export: isKTV ? 0 : Math.abs(Number(summaryData.purchase_export) || 0),
      stocktaking_export: isKTV ? 0 : Math.abs(Number(summaryData.stocktaking_export) || 0),
      end_inventory: endInventory,
      end_inventory_value: isKTV ? 0 : endInventoryValue
    };

    const returnedWarehouses = isKTV
      ? warehouses.filter((w: any) => targetWarehouseIds?.includes(String(w.id)))
      : warehouses;

    res.json({
      summary,
      items: enrichedItems,
      warehouses: returnedWarehouses.map((w: any) => ({
        id: w.id,
        name: w.name,
        address: w.address,
        fullAddress: w.full_address,
        phone: w.phone_number
      })),
      categories: Array.from(new Set(enrichedItems.map(i => i.category).filter(Boolean)))
    });
  } catch (error: any) {
    logger.error('Inventory analytics error', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi lấy báo cáo xuất nhập kho từ Pancake POS' });
  }
});

/**
 * GET /api/inventory/analytics/export
 * Xuất file Excel báo cáo Xuất - Nhập - Tồn kho
 */
router.get('/analytics/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const apiKey = process.env.PANCAKE_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'Missing PANCAKE_API_KEY in server environment' });
      return;
    }

    const role = req.user?.role;
    if (role === 'KTV') {
      res.status(403).json({ error: 'Kỹ thuật viên không có quyền xuất file Excel báo cáo kho.' });
      return;
    }

    let targetWarehouseIds: string[] | undefined = undefined;
    if (req.query.warehouse_ids) {
        const list = String(req.query.warehouse_ids).split(',').map(s => s.trim()).filter(Boolean);
        if (list.length > 0 && !list.includes('all')) {
          targetWarehouseIds = list;
        }
      } else if (req.query.warehouse_id && req.query.warehouse_id !== 'all') {
        targetWarehouseIds = [String(req.query.warehouse_id)];
      }
    const startTime = (req.query.start_date || req.query.start_time) ? Number(req.query.start_date || req.query.start_time) : undefined;
    const endTime = (req.query.end_date || req.query.end_time) ? Number(req.query.end_date || req.query.end_time) : undefined;

    const [analyticsRes, warehouses] = await Promise.all([
      axios.get(`https://pos.pages.fm/api/v1/shops/${SHOP_ID}/inventory_analytics/inventory`, {
        params: {
          api_key: apiKey,
          warehouse_ids: targetWarehouseIds,
          start_date: startTime,
          end_date: endTime,
          start_time: startTime,
          end_time: endTime,
          page_size: 200
        },
        timeout: 15000
      }),
      fetchPancakeWarehouses()
    ]);

    const items: any[] = analyticsRes.data?.data || [];
    const currentWhName = targetWarehouseIds && targetWarehouseIds.length === 1
      ? warehouses.find((w: any) => String(w.id) === String(targetWarehouseIds[0]))?.name || 'Kho đã chọn'
      : (targetWarehouseIds && targetWarehouseIds.length > 1 ? `${targetWarehouseIds.length} kho đã chọn` : 'Tất cả kho hàng');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Xuat_Nhap_Ton');

    // Title
    worksheet.mergeCells('A1:L1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `BÁO CÁO XUẤT - NHẬP - TỒN KHO (${currentWhName.toUpperCase()})`;
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };
    worksheet.getRow(1).height = 35;

      const headers = [
        'STT', 'Mã SKU', 'Tên sản phẩm', 'Tồn đầu kỳ', 
        'Tổng Nhập', 'Nhập mua NCC', 'Nhập chuyển kho', 'Khách trả hàng',
        'Tổng Xuất', 'Xuất bán/KTV', 'Xuất chuyển kho', 'Tồn cuối kỳ'
      ];
      worksheet.getRow(3).values = headers;
      worksheet.getRow(3).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(3).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      worksheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      worksheet.getRow(3).height = 28;

      items.forEach((item, index) => {
        const v = item.variation || {};
        const p = v.product || {};
        const row = worksheet.addRow([
          index + 1,
          v.custom_id || v.display_id || '',
          p.name || v.name || '',
          Math.max(0, Number(item.begin_inventory) || 0),
          Math.max(0, Number(item.total_import) || 0),
          Math.max(0, Number(item.purchase_import) || 0),
          Math.max(0, Number(item.transfer_import) || 0),
          Math.max(0, Number(item.return_import) || 0),
          Math.abs(Number(item.total_export) || 0),
          Math.abs(Number(item.sell_export) || 0),
          Math.abs(Number(item.transfer_export) || 0),
          Math.max(0, Number(item.end_inventory) || 0)
        ]);

        row.alignment = { vertical: 'middle' };
        row.getCell(1).alignment = { horizontal: 'center' };
        row.getCell(2).alignment = { horizontal: 'center' };
        for (let c = 4; c <= 12; c++) {
          row.getCell(c).alignment = { horizontal: 'right' };
          row.getCell(c).numFmt = '#,##0';
        }
      });

      worksheet.columns = [
        { width: 6 },  // STT
        { width: 16 }, // SKU
        { width: 38 }, // Tên
        { width: 14 }, // Tồn đầu
        { width: 14 }, // Tổng nhập
        { width: 14 }, // Mua NCC
        { width: 14 }, // Chuyển kho đến
        { width: 14 }, // Khách trả
        { width: 14 }, // Tổng xuất
        { width: 14 }, // Xuất bán
        { width: 14 }, // Chuyển kho đi
        { width: 14 }, // Tồn cuối
      ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Xuat_Nhap_Ton_${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Export inventory analytics error', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi xuất báo cáo Excel' });
  }
});

export default router;

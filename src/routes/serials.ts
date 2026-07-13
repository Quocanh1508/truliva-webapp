import { Router, Request, Response } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireCoordinatorOrAdmin } from '../middleware/authSession';
import { activateSerialWarranty, extractWarrantyMonths } from '../services/warrantyService';
import { getZaloConfig, exchangeAuthorizationCode, sendZnsWarrantyActivation } from '../services/zaloService';

// Cấu hình Cloudinary cho hóa đơn
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const invoiceStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (_req, file) => {
    return {
      folder: 'truliva_invoices',
      format: 'jpg',
      public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    };
  },
});

const invoiceUpload = multer({
  storage: invoiceStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

const router = Router();

// ══════════════════════════════════════
//  PUBLIC ROUTES (Không cần đăng nhập)
// ══════════════════════════════════════

/**
 * POST /api/serials/public/upload-invoice
 * Upload ảnh hóa đơn mua hàng (Public route không cần đăng nhập)
 */
router.post('/public/upload-invoice', (req, res, next) => {
  invoiceUpload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Ảnh quá lớn (tối đa 20MB)' });
      }
      return res.status(400).json({ error: `Lỗi tải ảnh: ${err.message}` });
    } else if (err) {
      logger.error('Multer upload invoice error', { error: err.message || err });
      return res.status(500).json({ error: 'Lỗi hệ thống khi tải ảnh' });
    }
    next();
  });
}, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Không tìm thấy file ảnh' });
      return;
    }
    res.json({
      url: req.file.path,
      publicId: req.file.filename,
    });
  } catch (error: any) {
    logger.error('Upload invoice error', { error: error.message });
    res.status(500).json({ error: 'Lỗi upload ảnh hóa đơn' });
  }
});

/**
 * GET /api/serials/public/check/:serialNumber
 * Kiểm tra số serial để kích hoạt bảo hành. Trả về model máy và thời gian bảo hành tiêu chuẩn.
 */
router.get('/public/check/:serialNumber', async (req: Request, res: Response): Promise<void> => {
  try {
    const serialNumber = req.params.serialNumber as string;
    if (!serialNumber) {
      res.status(400).json({ error: 'Thiếu số Serial' });
      return;
    }

    const cleaned = serialNumber.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
    const serial = await prisma.serial.findUnique({
      where: { serialNumber: cleaned }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy số Serial trong hệ thống. Vui lòng kiểm tra lại.' });
      return;
    }

    if (serial.status === 'Đã kích hoạt' || serial.status === 'KH xác nhận') {
      res.status(400).json({ error: 'Số Serial này đã được kích hoạt bảo hành trước đó.' });
      return;
    }

    if (serial.status === 'Chờ duyệt') {
      res.status(400).json({ error: 'Yêu cầu kích hoạt bảo hành cho số Serial này đang ở trạng thái chờ duyệt.' });
      return;
    }

    // Tra cứu WarrantyPolicy để tìm thời gian bảo hành tiêu chuẩn
    let standardMonths = 12; // Mặc định 12 tháng
    const policies = await prisma.warrantyPolicy.findMany();
    const matchedPolicy = policies.find((p: any) => 
      serial.model.toLowerCase().includes(p.modelKeyword.toLowerCase())
    );
    if (matchedPolicy) {
      standardMonths = matchedPolicy.warrantyMonths;
    }

    res.json({
      serialNumber: serial.serialNumber,
      model: serial.model,
      status: serial.status,
      standardMonths
    });
  } catch (error: any) {
    logger.error('Lỗi kiểm tra serial public', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra Serial' });
  }
});

/**
 * POST /api/serials/public/activate
 * Khách hàng tự gửi yêu cầu kích hoạt bảo hành (kèm ảnh hóa đơn bắt buộc)
 */
router.post('/public/activate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { serialNumber, customerName, customerPhone, address, province, invoiceImageUrl } = req.body;

    if (!serialNumber || !customerName || !customerPhone || !address || !province || !invoiceImageUrl) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ các thông tin bắt buộc và tải lên ảnh hóa đơn' });
      return;
    }

    const cleaned = serialNumber.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
    const serial = await prisma.serial.findUnique({
      where: { serialNumber: cleaned }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy số Serial trong hệ thống. Vui lòng kiểm tra lại.' });
      return;
    }

    if (serial.status === 'Đã kích hoạt' || serial.status === 'KH xác nhận') {
      res.status(400).json({ error: 'Số Serial này đã được kích hoạt bảo hành.' });
      return;
    }

    if (serial.status === 'Chờ duyệt') {
      res.status(400).json({ error: 'Yêu cầu kích hoạt bảo hành cho số Serial này đã được gửi trước đó.' });
      return;
    }

    // Tiến hành đăng ký kích hoạt (Chuyển trạng thái sang Chờ duyệt)
    await activateSerialWarranty(
      cleaned,
      null,
      {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        address: address.trim(),
        province: province.trim(),
        invoiceImageUrl: invoiceImageUrl.trim()
      },
      'CUSTOMER',
      'Chờ duyệt'
    );

    res.json({
      success: true,
      message: 'Gửi yêu cầu kích hoạt bảo hành thành công. Vui lòng chờ bộ phận CSKH phê duyệt.'
    });
  } catch (error: any) {
    logger.error('Lỗi gửi yêu cầu kích hoạt bảo hành public', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi gửi yêu cầu kích hoạt bảo hành' });
  }
});

/**
 * POST /api/serials/public/confirm
 * Khách hàng bấm nút Xác nhận KHBH từ Zalo ZNS để xác nhận kích hoạt bảo hành thành công
 */
router.post('/public/confirm', async (req: Request, res: Response): Promise<void> => {
  try {
    const { serialNumber } = req.body;
    if (!serialNumber) {
      res.status(400).json({ error: 'Thiếu số Serial' });
      return;
    }

    const cleaned = serialNumber.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
    const serial = await prisma.serial.findUnique({
      where: { serialNumber: cleaned }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy số Serial trong hệ thống' });
      return;
    }

    // Cập nhật trạng thái sang "Đã kích hoạt" và lưu ngày xác nhận
    const updatedSerial = await prisma.serial.update({
      where: { id: serial.id },
      data: {
        status: 'Đã kích hoạt',
        customerConfirmationDate: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Xác nhận kích hoạt bảo hành thành công!',
      serial: {
        serialNumber: updatedSerial.serialNumber,
        model: updatedSerial.model,
        warrantyExpiryDate: updatedSerial.warrantyExpiryDate
      }
    });
  } catch (error: any) {
    logger.error('Public confirm serial error', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi xác nhận bảo hành' });
  }
});

// Tất cả route phía dưới yêu cầu đăng nhập
router.use(requireAuth);

// Cấu hình multer để upload Excel file (lưu vào bộ nhớ tạm)
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.endsWith('.xlsx') ||
      file.originalname.endsWith('.xls')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file Excel (.xlsx, .xls)'));
    }
  },
});

// ══════════════════════════════════════
//  Helper: Parse ngày tháng từ Excel
// ══════════════════════════════════════

/**
 * Parse ngày tháng từ giá trị ô Excel.
 * Hỗ trợ:
 *  - Date object (khi Excel lưu dạng Date serial)
 *  - String dạng "dd/MM/yyyy HH:mm:ss"
 *  - String dạng "dd/MM/yyyy"
 */
function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Thử parse dd/MM/yyyy HH:mm:ss
    const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?$/);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
      const year = parseInt(match[3], 10);
      const hour = match[4] ? parseInt(match[4], 10) : 0;
      const minute = match[5] ? parseInt(match[5], 10) : 0;
      const second = match[6] ? parseInt(match[6], 10) : 0;
      const date = new Date(year, month, day, hour, minute, second);
      if (!isNaN(date.getTime())) return date;
    }
    // Thử parse ISO string
    const isoDate = new Date(trimmed);
    if (!isNaN(isoDate.getTime())) return isoDate;
  }
  // Nếu là số (Excel Date serial number)
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30); // Excel epoch
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    if (!isNaN(date.getTime())) return date;
  }
  return null;
}

/**
 * Chuẩn hóa số serial: trim, uppercase, loại bỏ ký tự đặc biệt
 */
function cleanSerialNumber(serial: string): string {
  return serial.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
}

/**
 * Lấy giá trị string từ cell Excel (xử lý cả richtext)
 */
function getCellText(cell: any): string {
  if (!cell) return '';
  const value = cell.value !== undefined ? cell.value : cell;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.richText) {
    return value.richText.map((rt: any) => rt.text || '').join('');
  }
  if (typeof value === 'object' && value.text) {
    return String(value.text);
  }
  return String(value).trim();
}

// ══════════════════════════════════════
//  GET /api/serials - Danh sách serial (phân trang, tìm kiếm, lọc)
// ══════════════════════════════════════

router.get('/', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;
    const search = (req.query.search as string || '').trim();
    const status = req.query.status as string || '';
    const modelFilter = req.query.model as string || '';
    const batchFilter = req.query.batch as string || '';

    const where: any = {};

    // Tìm kiếm theo serial, tên KH, SĐT
    if (search) {
      where.OR = [
        { serialNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerPhone: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Lọc theo trạng thái
    if (status) {
      where.status = status;
    }

    // Lọc theo model máy
    if (modelFilter) {
      where.model = { contains: modelFilter, mode: 'insensitive' };
    }

    // Lọc theo lô import
    if (batchFilter) {
      where.importBatchId = batchFilter;
    }

    const [serials, total] = await Promise.all([
      prisma.serial.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          importedBy: {
            select: {
              fullName: true
            }
          }
        }
      }),
      prisma.serial.count({ where }),
    ]);

    // Thống kê nhanh
    const [totalAll, activated, unactivated, confirmed, pending] = await Promise.all([
      prisma.serial.count(),
      prisma.serial.count({ where: { status: 'Đã kích hoạt' } }),
      prisma.serial.count({ where: { status: 'Chưa kích hoạt' } }),
      prisma.serial.count({ where: { status: 'KH xác nhận' } }),
      prisma.serial.count({ where: { status: 'Chờ duyệt' } }),
    ]);

    res.json({
      serials,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalAll,
        activated,
        unactivated,
        confirmed,
        pending,
      },
    });
  } catch (error: any) {
    logger.error('Lỗi lấy danh sách serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách serial' });
  }
});

// ══════════════════════════════════════
//  GET /api/serials/batches - Lấy danh sách các lô import
// ══════════════════════════════════════
router.get('/batches', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const batches = await prisma.serial.groupBy({
      by: ['importBatchId'],
      where: {
        importBatchId: {
          not: null,
          startsWith: 'Lô '
        }
      },
      _count: {
        _all: true
      }
    });

    const formatted = batches.map(b => ({
      batchId: b.importBatchId,
      count: b._count._all
    })).sort((a, b) => String(b.batchId).localeCompare(String(a.batchId)));

    res.json({ success: true, batches: formatted });
  } catch (error: any) {
    logger.error('Lỗi lấy danh sách lô serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi lấy danh sách lô' });
  }
});

// ══════════════════════════════════════
//  POST /api/serials/rollback - Revert lô import (Ctrl+Z)
// ══════════════════════════════════════
router.post('/rollback', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.body;
    if (!batchId) {
      res.status(400).json({ error: 'Vui lòng cung cấp mã Lô cần rollback' });
      return;
    }

    // Tìm lịch sử import của lô này trong AuditLog
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'Serial',
        entityId: batchId,
        action: 'import_batch'
      }
    });

    if (!auditLog) {
      res.status(400).json({ error: 'Không tìm thấy lịch sử import của Lô này hoặc không thể rollback' });
      return;
    }

    const changes = auditLog.changes as any;
    if (!changes) {
      res.status(400).json({ error: 'Dữ liệu rollback không hợp lệ' });
      return;
    }

    let deletedCount = 0;
    let revertedCount = 0;

    // 1. Xóa các serial mới được tạo trong lô này
    if (changes.newSerialNumbers && changes.newSerialNumbers.length > 0) {
      const deleteResult = await prisma.serial.deleteMany({
        where: {
          serialNumber: { in: changes.newSerialNumbers }
        }
      });
      deletedCount = deleteResult.count;
    }

    // 2. Khôi phục lại trạng thái cũ cho các serial bị ghi đè/cập nhật
    if (changes.updatedSerials && changes.updatedSerials.length > 0) {
      for (const item of changes.updatedSerials) {
        await prisma.serial.update({
          where: { id: item.id },
          data: item.before
        });
        revertedCount++;
      }
    }

    // Xóa audit log sau khi đã rollback để tránh bấm rollback nhiều lần
    await prisma.auditLog.delete({
      where: { id: auditLog.id }
    });

    logger.info(`Rollback batch success`, { batchId, deletedCount, revertedCount });

    res.json({
      success: true,
      message: `Rollback thành công Lô ${batchId}. Đã xóa ${deletedCount} serial mới tạo và khôi phục ${revertedCount} serial cập nhật.`,
      summary: {
        deletedCount,
        revertedCount
      }
    });
  } catch (error: any) {
    logger.error('Lỗi rollback lô serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi rollback lô serial' });
  }
});

// ══════════════════════════════════════
//  POST /api/serials/import - Import Excel
// ══════════════════════════════════════

router.post('/import', requireCoordinatorOrAdmin, (req, res, next) => {
  excelUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File quá lớn (tối đa 10MB)' });
      }
      return res.status(400).json({ error: `Lỗi upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Vui lòng chọn file Excel để import' });
      return;
    }

    // Sử dụng SheetJS (xlsx) để đọc cả file .xls và .xlsx
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    } catch (readErr: any) {
      res.status(400).json({ error: `Không thể đọc file Excel: ${readErr.message}` });
      return;
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      res.status(400).json({ error: 'File Excel không có sheet dữ liệu nào' });
      return;
    }
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

    if (rawRows.length <= 1) {
      res.status(400).json({ error: 'File Excel không có dữ liệu để import' });
      return;
    }

    // Tính số lô tiếp theo (ví dụ: Lô 0001, Lô 0002)
    let nextLotNum = 1;
    const lastSerialWithLot = await prisma.serial.findFirst({
      where: {
        importBatchId: {
          startsWith: 'Lô '
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        importBatchId: true
      }
    });

    if (lastSerialWithLot && lastSerialWithLot.importBatchId) {
      const match = lastSerialWithLot.importBatchId.match(/\d+/);
      if (match) {
        nextLotNum = parseInt(match[0], 10) + 1;
      }
    }
    const batchId = `Lô ${String(nextLotNum).padStart(4, '0')}`;
    const userId = req.user!.id;

    let totalRowsProcessed = 0;
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    // 1. Nhận diện các cột động từ Header ở dòng 1
    const headerRow = rawRows[0] || [];
    let productCodeColIdx = -1;
    let modelColIdx = -1;
    let deliveryDateColIdx = -1;
    let serialColIdx = -1;
    let isNewFormat = false;

    headerRow.forEach((val: any, idx: number) => {
      const str = String(val || '').toLowerCase().trim();
      if (str.includes('product code') || str === 'mã sp' || str === 'mã sản phẩm' || str === 'productcode') {
        productCodeColIdx = idx;
        isNewFormat = true;
      } else if (str.includes('serial') || str === 'số máy' || str === 'số serial') {
        serialColIdx = idx;
      } else if (str.includes('model') || str === 'dòng máy') {
        modelColIdx = idx;
      } else if (str.includes('delivery date') || str === 'ngày giao' || str === 'ngày xuất' || str === 'deliverydate') {
        deliveryDateColIdx = idx;
        isNewFormat = true;
      }
    });

    // Fallback nếu có 4 cột nhưng tên cột không chính xác hoàn toàn
    if (!isNewFormat && headerRow.length === 4) {
      productCodeColIdx = 0;
      modelColIdx = 1;
      deliveryDateColIdx = 2;
      serialColIdx = 3;
      isNewFormat = true;
    }

    // Nạp toàn bộ danh mục sản phẩm từ DB để đối chiếu product code lấy tên sp trên POS
    const dbProducts = await prisma.product.findMany({ select: { sku: true, name: true } });
    const productMap = new Map<string, string>();
    for (const p of dbProducts) {
      if (p.sku) {
        productMap.set(p.sku.trim().toLowerCase(), p.name);
      }
    }

    // Nạp các chính sách bảo hành tiêu chuẩn từ DB
    const policies = await prisma.warrantyPolicy.findMany();

    // Thu thập danh sách serial thô để truy vấn hàng loạt (batch query)
    const rawDataRows = rawRows.slice(1);
    const cleanedSerialsInBatch: string[] = [];
    const rowMappings: Array<{
      rowNumber: number;
      rawSerial: string;
      cleanedSerial: string;
      rawModel: string;
      rawProductCode: string;
      rawDeliveryDateVal: any;
      rawData: Record<string, any>;
    }> = [];

    rawDataRows.forEach((row, idx) => {
      const rowNumber = idx + 2; // Dòng excel thực tế (1-indexed, bỏ qua header)
      if (row.length === 0 || row.every(cell => cell === '')) return; // Bỏ qua dòng trống hoàn toàn

      let rawSerial = '';
      let rawModel = '';
      let rawProductCode = '';
      let rawDeliveryDateVal: any = null;

      if (isNewFormat) {
        rawSerial = serialColIdx !== -1 && row[serialColIdx] !== undefined ? String(row[serialColIdx]) : '';
        rawModel = modelColIdx !== -1 && row[modelColIdx] !== undefined ? String(row[modelColIdx]) : '';
        rawProductCode = productCodeColIdx !== -1 && row[productCodeColIdx] !== undefined ? String(row[productCodeColIdx]) : '';
        rawDeliveryDateVal = deliveryDateColIdx !== -1 && row[deliveryDateColIdx] !== undefined ? row[deliveryDateColIdx] : null;
      } else {
        // Định dạng cũ (10 cột)
        rawSerial = row[0] !== undefined ? String(row[0]) : '';
        rawModel = row[1] !== undefined ? String(row[1]) : '';
      }

      if (!rawSerial) {
        errorCount++;
        errors.push({ row: rowNumber, error: 'Thiếu số Serial' });
        return;
      }

      const cleanedSerial = rawSerial.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
      if (!cleanedSerial) {
        errorCount++;
        errors.push({ row: rowNumber, error: `Số Serial không hợp lệ: "${rawSerial}"` });
        return;
      }

      // Lưu thông tin thô của dòng
      const rawData: Record<string, any> = {};
      row.forEach((cellVal, colIdx) => {
        rawData[`col_${colIdx + 1}`] = cellVal !== undefined && cellVal !== null ? String(cellVal) : '';
      });

      cleanedSerialsInBatch.push(cleanedSerial);
      rowMappings.push({
        rowNumber,
        rawSerial,
        cleanedSerial,
        rawModel,
        rawProductCode,
        rawDeliveryDateVal,
        rawData
      });
    });

    // Truy vấn hàng loạt các Báo cáo hoàn thành ca (ServiceReport) và Đơn hàng tương ứng của list serial này
    const dbReports = await prisma.serviceReport.findMany({
      where: {
        serialNumber: { in: cleanedSerialsInBatch }
      },
      include: {
        order: true
      },
      orderBy: { createdAt: 'asc' } // Ưu tiên báo cáo đầu tiên
    });

    const reportMap = new Map<string, any>();
    for (const rep of dbReports) {
      if (rep.serialNumber) {
        const cleanSn = rep.serialNumber.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
        if (!reportMap.has(cleanSn)) {
          reportMap.set(cleanSn, rep);
        }
      }
    }

    // Truy vấn hàng loạt các Serial đang tồn tại trong DB để thực hiện "matching và vá dữ liệu"
    const dbSerials = await prisma.serial.findMany({
      where: {
        serialNumber: { in: cleanedSerialsInBatch }
      }
    });

    const existingSerialsMap = new Map<string, any>();
    for (const s of dbSerials) {
      existingSerialsMap.set(s.serialNumber, s);
    }

    // Danh sách serial mới cần insert
    const newSerialsToCreate: any[] = [];
    // Danh sách các Serial mới tạo và Serial được cập nhật để ghi Audit Log (Ctrl+Z)
    const newlyCreatedSerialNumbers: string[] = [];
    const updatedSerialsLog: Array<{
      id: string;
      serialNumber: string;
      before: Record<string, any>;
    }> = [];
    // Danh sách serial trùng trong batch đang xử lý để tránh chèn lặp
    const processedSerialsInBatch = new Set<string>();

    for (const item of rowMappings) {
      totalRowsProcessed++;

      const cleanedSerial = item.cleanedSerial;

      // Tránh trùng lặp trong chính file excel đang import
      if (processedSerialsInBatch.has(cleanedSerial)) {
        skippedCount++;
        continue;
      }
      processedSerialsInBatch.add(cleanedSerial);

      // Bước 1: Đối chiếu productcode để lấy tên sp trên POS
      let modelName = '';
      if (item.rawProductCode) {
        const matchedProductName = productMap.get(item.rawProductCode.trim().toLowerCase());
        if (matchedProductName) {
          modelName = matchedProductName;
        }
      }
      // Fallback lấy model ghi trong dòng
      if (!modelName) {
        modelName = item.rawModel.trim() || 'Không rõ dòng máy';
      }

      // Xử lý Ngày giao thô
      let deliveryDate: Date | null = null;
      if (item.rawDeliveryDateVal) {
        if (item.rawDeliveryDateVal instanceof Date) {
          deliveryDate = item.rawDeliveryDateVal;
        } else if (typeof item.rawDeliveryDateVal === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          deliveryDate = new Date(excelEpoch.getTime() + item.rawDeliveryDateVal * 86400000);
        } else {
          const parsed = Date.parse(String(item.rawDeliveryDateVal));
          if (!isNaN(parsed)) {
            deliveryDate = new Date(parsed);
          }
        }
      }

      // Bước 2 & 3: Matching đối chiếu với ServiceReport để xác định kích hoạt bảo hành
      let statusVal = isNewFormat ? 'Chưa kích hoạt' : (item.rawData.col_3 || 'Chưa kích hoạt');
      let activationDate: Date | null = null;
      let warrantyExpiryDate: Date | null = null;
      let customerName: string | null = isNewFormat ? null : (item.rawData.col_7 || null);
      let customerPhone: string | null = isNewFormat ? null : (item.rawData.col_8 || null);
      let address: string | null = isNewFormat ? null : (item.rawData.col_9 || null);
      let province: string | null = isNewFormat ? null : (item.rawData.col_10 || null);
      let orderId: string | null = null;

      if (!isNewFormat) {
        // Nếu là format cũ, parse trực tiếp ngày tháng từ excel
        activationDate = item.rawData.col_4 ? new Date(item.rawData.col_4) : null;
        if (isNaN(activationDate?.getTime() || 0)) activationDate = null;

        warrantyExpiryDate = item.rawData.col_5 ? new Date(item.rawData.col_5) : null;
        if (isNaN(warrantyExpiryDate?.getTime() || 0)) warrantyExpiryDate = null;
      }

      // Lấy báo cáo hoàn thành ca lắp đặt
      const matchedReport = reportMap.get(cleanedSerial);
      if (matchedReport) {
        // Tự động chuyển trạng thái kích hoạt bảo hành
        statusVal = 'Đã kích hoạt';
        // Thời gian kích hoạt = Hôm báo cáo được nộp (createdAt của báo cáo)
        activationDate = matchedReport.createdAt;
        orderId = matchedReport.orderId;

        // Auto-fill thông tin khách hàng từ báo cáo
        customerName = matchedReport.customerName || customerName;
        customerPhone = matchedReport.customerPhone || customerPhone;
        address = matchedReport.address || address;
        province = matchedReport.province || province;

        // Chắt lọc thời hạn bảo hành:
        // Rank 1: Note của sale (Order.note / Order.rawData.note)
        let warrantyMonths: number | null = null;
        const order = matchedReport.order;
        if (order) {
          warrantyMonths = extractWarrantyMonths(order.note);
          if (!warrantyMonths && order.rawData) {
            let rawJson: any = order.rawData;
            if (typeof rawJson === 'string') {
              try { rawJson = JSON.parse(rawJson); } catch (e) {}
            }
            if (rawJson) {
              warrantyMonths = extractWarrantyMonths(rawJson.note) || extractWarrantyMonths(rawJson.description) || extractWarrantyMonths(rawJson.customer_note);
            }
          }
        }

        // Rank 2: Thời gian mặc định của POS (WarrantyPolicy)
        if (warrantyMonths === null) {
          const matchedPolicy = policies.find((p: any) =>
            modelName.toLowerCase().includes(p.modelKeyword.toLowerCase())
          );
          if (matchedPolicy) {
            warrantyMonths = matchedPolicy.warrantyMonths;
          } else {
            warrantyMonths = 12; // Mặc định 12 tháng
          }
        }

        // Tính ngày hết hạn
        const expiry = new Date(activationDate!);
        expiry.setMonth(expiry.getMonth() + warrantyMonths!);
        warrantyExpiryDate = expiry;
      }

      // Kiểm tra xem serial đã tồn tại trong DB chưa để thực hiện vá dữ liệu còn thiếu
      const existingSerial = existingSerialsMap.get(cleanedSerial);
      if (existingSerial) {
        // Vá lại dữ liệu còn thiếu
        const updateData: any = {};
        if (existingSerial.model === 'Không rõ dòng máy' || !existingSerial.model) {
          updateData.model = modelName;
        }
        if (existingSerial.status === 'Chưa kích hoạt' && statusVal === 'Đã kích hoạt') {
          updateData.status = 'Đã kích hoạt';
        }
        if (!existingSerial.activationDate && activationDate) {
          updateData.activationDate = activationDate;
        }
        if (!existingSerial.warrantyExpiryDate && warrantyExpiryDate) {
          updateData.warrantyExpiryDate = warrantyExpiryDate;
        }
        if (!existingSerial.customerName && customerName) {
          updateData.customerName = customerName;
        }
        if (!existingSerial.customerPhone && customerPhone) {
          updateData.customerPhone = customerPhone;
        }
        if (!existingSerial.address && address) {
          updateData.address = address;
        }
        if (!existingSerial.province && province) {
          updateData.province = province;
        }
        if (!existingSerial.orderId && orderId) {
          updateData.orderId = orderId;
        }

        // Chỉ cập nhật nếu thực sự có thông tin mới cần vá
        if (Object.keys(updateData).length > 0) {
          updatedSerialsLog.push({
            id: existingSerial.id,
            serialNumber: existingSerial.serialNumber,
            before: {
              model: existingSerial.model,
              status: existingSerial.status,
              activationDate: existingSerial.activationDate,
              warrantyExpiryDate: existingSerial.warrantyExpiryDate,
              customerName: existingSerial.customerName,
              customerPhone: existingSerial.customerPhone,
              address: existingSerial.address,
              province: existingSerial.province,
              orderId: existingSerial.orderId
            }
          });

          await prisma.serial.update({
            where: { id: existingSerial.id },
            data: updateData
          });
          importedCount++;
        } else {
          skippedCount++;
        }
      } else {
        // Tạo Serial mới hoàn toàn
        newSerialsToCreate.push({
          serialNumber: cleanedSerial,
          model: modelName,
          status: statusVal,
          activationDate,
          warrantyExpiryDate,
          customerName,
          customerPhone,
          address,
          province,
          orderId,
          importBatchId: batchId,
          importedById: userId,
          rawData: item.rawData
        });
        newlyCreatedSerialNumbers.push(cleanedSerial);
      }
    }

    // Insert các Serial mới vào DB
    if (newSerialsToCreate.length > 0) {
      await prisma.serial.createMany({
        data: newSerialsToCreate,
        skipDuplicates: true
      });
      importedCount += newSerialsToCreate.length;
    }

    // Ghi Audit Log cho lô import này phục vụ rollback (Ctrl+Z)
    await prisma.auditLog.create({
      data: {
        entityType: 'Serial',
        entityId: batchId,
        action: 'import_batch',
        changes: {
          batchId,
          newSerialsCount: newlyCreatedSerialNumbers.length,
          updatedSerialsCount: updatedSerialsLog.length,
          newSerialNumbers: newlyCreatedSerialNumbers,
          updatedSerials: updatedSerialsLog
        },
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    logger.info('Serial import completed with matching and data patch logic', {
      batchId,
      userId,
      totalRowsProcessed,
      importedCount,
      skippedCount,
      errorCount
    });

    res.json({
      success: true,
      summary: {
        totalRowsProcessed,
        importedCount,
        skippedCount,
        errorCount
      },
      errors: errors.slice(0, 50),
      batchId
    });
  } catch (error: any) {
    logger.error('Lỗi import serial', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Lỗi hệ thống khi import serial' });
  }
});

// ══════════════════════════════════════
//  GET /api/serials/export - Xuất Excel
// ══════════════════════════════════════

router.get('/export', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const serials = await prisma.serial.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Danh sách Serial');

    worksheet.columns = [
      { header: 'Số Serial', key: 'serialNumber', width: 20 },
      { header: 'Model', key: 'model', width: 30 },
      { header: 'Trạng thái', key: 'status', width: 18 },
      { header: 'Ngày kích hoạt', key: 'activationDate', width: 22 },
      { header: 'Ngày hết hạn BH', key: 'warrantyExpiryDate', width: 22 },
      { header: 'Ngày KH xác nhận', key: 'customerConfirmationDate', width: 22 },
      { header: 'Tên khách hàng', key: 'customerName', width: 25 },
      { header: 'SĐT khách hàng', key: 'customerPhone', width: 18 },
      { header: 'Địa chỉ', key: 'address', width: 40 },
      { header: 'Tỉnh/Thành phố', key: 'province', width: 20 },
    ];

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    for (const serial of serials) {
      worksheet.addRow({
        serialNumber: serial.serialNumber,
        model: serial.model,
        status: serial.status,
        activationDate: serial.activationDate || '',
        warrantyExpiryDate: serial.warrantyExpiryDate || '',
        customerConfirmationDate: serial.customerConfirmationDate || '',
        customerName: serial.customerName || '',
        customerPhone: serial.customerPhone || '',
        address: serial.address || '',
        province: serial.province || '',
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=serial_export_${new Date().toISOString().slice(0, 10)}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Lỗi xuất Excel serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi xuất file Excel' });
  }
});

// ══════════════════════════════════════
//  GET /api/serials/policies - Danh sách chính sách bảo hành
// ══════════════════════════════════════
router.get('/policies', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const policies = await prisma.warrantyPolicy.findMany();
    res.json(policies);
  } catch (error: any) {
    logger.error('Lỗi lấy chính sách bảo hành', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy chính sách bảo hành' });
  }
});

// ══════════════════════════════════════
//  GET /api/serials/:id - Chi tiết serial + Lịch sử
// ══════════════════════════════════════

router.get('/:id', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const serial = await prisma.serial.findUnique({
      where: { id: req.params.id as string },
      include: {
        importedBy: {
          select: {
            fullName: true
          }
        }
      }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy serial' });
      return;
    }

    // Tìm tất cả báo cáo dịch vụ có cùng số serial (history tracking)
    const history = await prisma.serviceReport.findMany({
      where: {
        serialNumber: {
          mode: 'insensitive',
          equals: serial.serialNumber,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        ktvUser: {
          select: { fullName: true, phoneNumber: true },
        },
      },
    });

    res.json({
      serial,
      history: history.map(report => ({
        id: report.id,
        workType: report.workType,
        serviceType: report.serviceType,
        customerName: report.customerName,
        customerPhone: report.customerPhone,
        province: report.province,
        address: report.address,
        products: report.products,
        spareParts: report.spareParts,
        serialNumber: report.serialNumber,
        notes: report.notes,
        issueType: report.issueType,
        handlingMethod: report.handlingMethod,
        approvalStatus: report.approvalStatus,
        createdAt: report.createdAt,
        ktvName: report.ktvUser?.fullName || 'N/A',
        ktvPhone: report.ktvUser?.phoneNumber || null,
        orderId: report.orderId,
      })),
    });
  } catch (error: any) {
    logger.error('Lỗi lấy chi tiết serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy chi tiết serial' });
  }
});

/**
 * POST /api/serials/:id/activate
 * Admin/Sales/Coordinator kích hoạt trực tiếp bảo hành cho Serial (không cần duyệt)
 */
router.post('/:id/activate', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { customerName, customerPhone, address, province, promoCode, manualStartDate } = req.body;

    if (!customerName || !customerPhone || !address || !province) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ các thông tin bắt buộc' });
      return;
    }

    const serial = await prisma.serial.findUnique({
      where: { id }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy Serial' });
      return;
    }

    const startDate = manualStartDate ? new Date(manualStartDate) : new Date();

    const updated = await activateSerialWarranty(
      serial.serialNumber,
      null,
      {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        address: address.trim(),
        province: province.trim()
      },
      'ADMIN',
      'Đã kích hoạt',
      startDate,
      promoCode || null
    );

    // Ghi Audit Log
    await prisma.auditLog.create({
      data: {
        entityType: 'Serial',
        entityId: serial.id,
        action: 'activated_manual',
        changes: {
          status: { from: serial.status, to: 'Đã kích hoạt' },
          customerName,
          customerPhone,
          promoCode
        },
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    res.json({ success: true, serial: updated });
  } catch (error: any) {
    logger.error('Lỗi Admin kích hoạt bảo hành', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi kích hoạt bảo hành' });
  }
});

/**
 * POST /api/serials/:id/approve-warranty
 * Admin/Coordinator duyệt yêu cầu kích hoạt bảo hành từ Khách hàng
 */
router.post('/:id/approve-warranty', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { manualStartDate, promoCode } = req.body;

    const serial = await prisma.serial.findUnique({
      where: { id }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy Serial' });
      return;
    }

    if (serial.status !== 'Chờ duyệt') {
      res.status(400).json({ error: 'Chỉ có thể phê duyệt các Serial có trạng thái "Chờ duyệt"' });
      return;
    }

    const startDate = manualStartDate ? new Date(manualStartDate) : new Date();

    const updated = await activateSerialWarranty(
      serial.serialNumber,
      serial.orderId,
      {
        customerName: serial.customerName,
        customerPhone: serial.customerPhone,
        address: serial.address,
        province: serial.province,
        invoiceImageUrl: serial.invoiceImageUrl
      },
      'ADMIN',
      'Đã kích hoạt',
      startDate,
      promoCode || null
    );

    // Ghi Audit Log
    await prisma.auditLog.create({
      data: {
        entityType: 'Serial',
        entityId: serial.id,
        action: 'approved_warranty',
        changes: {
          status: { from: serial.status, to: 'Đã kích hoạt' },
          startDate,
          promoCode
        },
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    res.json({ success: true, serial: updated });
  } catch (error: any) {
    logger.error('Lỗi phê duyệt bảo hành', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi phê duyệt bảo hành' });
  }
});

/**
 * PATCH /api/serials/:id
 * Admin/Coordinator chỉnh sửa thông tin Serial
 */
router.patch('/:id', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { 
      serialNumber, 
      model, 
      status,
      customerName, 
      customerPhone, 
      address, 
      province, 
      activationDate, 
      warrantyExpiryDate, 
      activatedBy, 
      promoCode, 
      importBatchId 
    } = req.body;

    const serial = await prisma.serial.findUnique({
      where: { id: id as string }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy Serial' });
      return;
    }

    // Nếu thay đổi số serial, kiểm tra xem số mới có bị trùng với serial khác không
    if (serialNumber && serialNumber !== serial.serialNumber) {
      const existing = await prisma.serial.findUnique({
        where: { serialNumber }
      });
      if (existing) {
        res.status(400).json({ error: 'Số Serial này đã tồn tại trong hệ thống' });
        return;
      }
    }

    const updateData: any = {};
    if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
    if (model !== undefined) updateData.model = model;
    if (status !== undefined) updateData.status = status;
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (address !== undefined) updateData.address = address;
    if (province !== undefined) updateData.province = province;
    if (activatedBy !== undefined) updateData.activatedBy = activatedBy;
    if (promoCode !== undefined) updateData.promoCode = promoCode;
    if (importBatchId !== undefined) updateData.importBatchId = importBatchId;

    if (activationDate !== undefined) {
      updateData.activationDate = activationDate ? new Date(activationDate) : null;
    }
    if (warrantyExpiryDate !== undefined) {
      updateData.warrantyExpiryDate = warrantyExpiryDate ? new Date(warrantyExpiryDate) : null;
    }

    // Tự động gán ngày kích hoạt & hết hạn nếu trạng thái chuyển sang Đã kích hoạt/KH xác nhận mà không truyền ngày
    const newStatus = status !== undefined ? status : serial.status;
    const isNewActive = newStatus === 'Đã kích hoạt' || newStatus === 'KH xác nhận';
    const isOldActive = serial.status === 'Đã kích hoạt' || serial.status === 'KH xác nhận';

    if (isNewActive && !isOldActive) {
      // 1. Gán ngày kích hoạt
      const finalActivationDate = updateData.activationDate !== undefined ? updateData.activationDate : (serial.activationDate || new Date());
      updateData.activationDate = finalActivationDate;

      // 2. Tính toán ngày hết hạn nếu chưa có
      if (updateData.warrantyExpiryDate === undefined || !updateData.warrantyExpiryDate) {
        let standardMonths = 12;
        const currentModel = model !== undefined ? model : serial.model;
        const policies = await prisma.warrantyPolicy.findMany();
        const matchedPolicy = policies.find((p: any) => 
          currentModel.toLowerCase().includes(p.modelKeyword.toLowerCase())
        );
        if (matchedPolicy) {
          standardMonths = matchedPolicy.warrantyMonths;
        }

        let promoMonths = 0;
        const currentPromo = promoCode !== undefined ? promoCode : serial.promoCode;
        if (currentPromo) {
          const promo = await prisma.warrantyPromo.findUnique({
            where: { code: currentPromo.trim().toUpperCase() }
          });
          if (promo) {
            promoMonths = promo.promoMonths;
          }
        }

        const totalMonths = standardMonths + promoMonths;
        const expiry = new Date(finalActivationDate.getTime());
        expiry.setMonth(expiry.getMonth() + totalMonths);
        updateData.warrantyExpiryDate = expiry;
      }

      // Tự động gán activatedBy nếu chưa có
      if (updateData.activatedBy === undefined && !serial.activatedBy) {
        updateData.activatedBy = 'ADMIN';
      }
    }

    const updated = await prisma.serial.update({
      where: { id: id as string },
      data: updateData,
      include: {
        importedBy: {
          select: {
            fullName: true
          }
        }
      }
    });

    // Ghi Audit Log
    await prisma.auditLog.create({
      data: {
        entityType: 'Serial',
        entityId: serial.id,
        action: 'updated',
        changes: {
          from: serial,
          to: updated
        },
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    res.json({ success: true, serial: updated });
  } catch (error: any) {
    logger.error('Lỗi Admin cập nhật serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi cập nhật Serial' });
  }
});

/**
 * POST /api/serials/:id/restore
 * Khôi phục serial về trạng thái chưa kích hoạt (xóa trắng các thông tin kích hoạt)
 */
router.post('/:id/restore', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const serial = await prisma.serial.findUnique({
      where: { id: id as string }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy Serial' });
      return;
    }

    const restored = await prisma.serial.update({
      where: { id: id as string },
      data: {
        status: 'Chưa kích hoạt',
        activationDate: null,
        warrantyExpiryDate: null,
        customerConfirmationDate: null,
        customerName: null,
        customerPhone: null,
        address: null,
        province: null,
        invoiceImageUrl: null,
        activatedBy: null,
        orderId: null,
        promoCode: null
      },
      include: {
        importedBy: {
          select: {
            fullName: true
          }
        }
      }
    });

    // Ghi Audit Log
    await prisma.auditLog.create({
      data: {
        entityType: 'Serial',
        entityId: serial.id,
        action: 'restored',
        changes: {
          status: { from: serial.status, to: 'Chưa kích hoạt' },
          restored: true
        },
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    res.json({ success: true, serial: restored });
  } catch (error: any) {
    logger.error('Lỗi Admin khôi phục serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi khôi phục Serial' });
  }
});

// ══════════════════════════════════════
//  ZALO OA OAUTH & ZNS ROUTES
// ══════════════════════════════════════

/**
 * GET /api/serials/zalo/authorize
 * Chuyển hướng Admin tới trang OAuth của Zalo để bắt đầu cấp quyền liên kết OA
 */
router.get('/zalo/authorize', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getZaloConfig();
    if (!config.appId) {
      res.status(400).send('Cấu hình Zalo OA chưa được thiết lập App ID trong DB hoặc file .env');
      return;
    }
    
    // Zalo yêu cầu redirect_uri phải khớp chính xác với những gì đã cấu hình trên Zalo Developer portal.
    const redirectUri = process.env.ZALO_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/serials/zalo/callback`;
    const authorizeUrl = `https://oauth.zalo.me/pc/oauth/authorize?app_id=${config.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=truliva`;
    
    logger.info('Redirecting admin to Zalo OAuth page', { appId: config.appId, redirectUri });
    res.redirect(authorizeUrl);
  } catch (error: any) {
    logger.error('Error initiating Zalo OAuth redirect', { error: error.message });
    res.status(500).send(`Lỗi hệ thống khi bắt đầu liên kết Zalo OA: ${error.message}`);
  }
});

/**
 * GET /api/serials/zalo/callback
 * Endpoint nhận callback từ Zalo OAuth, nhận authorization_code để đổi lấy tokens
 */
router.get('/zalo/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).send('Thiếu mã authorization code từ Zalo OA');
      return;
    }

    await exchangeAuthorizationCode(code);

    // Trả về trang thông báo liên kết thành công đẹp mắt
    res.send(`
      <html>
        <head>
          <title>Liên kết Zalo OA thành công</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f0f4f8; margin: 0; padding: 20px; }
            .card { background: white; padding: 40px 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 450px; width: 100%; border-top: 4px solid #3182ce; }
            .icon { font-size: 48px; color: #48bb78; margin-bottom: 20px; }
            h1 { color: #2b6cb0; font-size: 22px; margin-bottom: 12px; font-weight: 700; }
            p { color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
            .btn { background: #3182ce; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; border: none; cursor: pointer; transition: all 0.2s; font-size: 15px; box-shadow: 0 4px 6px rgba(49,130,206,0.2); }
            .btn:hover { background: #2b6cb0; box-shadow: 0 6px 12px rgba(49,130,206,0.3); transform: translateY(-1px); }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✓</div>
            <h1>Liên kết thành công!</h1>
            <p>Hệ thống Truliva đã kết nối thành công với Zalo Official Account. Bây giờ bạn có thể đóng cửa sổ này và quay trở về trang quản lý.</p>
            <button onclick="window.close()" class="btn">Đóng cửa sổ</button>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    logger.error('Zalo OAuth callback route error', { error: error.message });
    res.status(500).send(`
      <html>
        <head>
          <title>Liên kết Zalo OA thất bại</title>
          <meta charset="utf-8">
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #fff5f5; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center; max-width: 400px; border-top: 4px solid #e53e3e; }
            h1 { color: #c53030; margin-bottom: 16px; }
            p { color: #4a5568; margin-bottom: 24px; line-height: 1.5; }
            .btn { background: #e53e3e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Liên kết thất bại</h1>
            <p>Có lỗi xảy ra trong quá trình thiết lập liên kết với Zalo OA: ${error.message}</p>
            <button onclick="window.close()" class="btn">Đóng cửa sổ</button>
          </div>
        </body>
      </html>
    `);
  }
});

/**
 * GET /api/serials/zalo/status
 * Kiểm tra trạng thái kết nối và tokens hiện tại của Zalo OA
 */
router.get('/zalo/status', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getZaloConfig();
    const isConnected = !!config.accessToken && !!config.refreshToken;
    const isExpired = config.tokenExpiredAt ? new Date(config.tokenExpiredAt).getTime() < Date.now() : true;
    
    res.json({
      success: true,
      isConnected,
      isExpired,
      oaId: config.oaId || null,
      appId: config.appId || null,
      tokenExpiredAt: config.tokenExpiredAt || null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi kiểm tra trạng thái Zalo' });
  }
});

/**
 * POST /api/serials/zns-activate
 * API từ KTV App để kích hoạt bảo hành qua ZNS gửi tin nhắn đến số điện thoại khách hàng
 */
router.post('/zns-activate', requireCoordinatorOrAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { serialNumber, recipientPhone } = req.body;
    if (!serialNumber || !recipientPhone) {
      res.status(400).json({ error: 'Thiếu số Serial hoặc Số điện thoại nhận ZNS' });
      return;
    }

    const cleanSerial = serialNumber.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
    
    // 1. Thực hiện gửi tin nhắn ZNS qua API
    const znsResult = await sendZnsWarrantyActivation(cleanSerial, recipientPhone);

    // 2. Chuyển trạng thái Serial sang "KH xác nhận" (chờ khách hàng click nút trong Zalo)
    await prisma.serial.update({
      where: { serialNumber: cleanSerial },
      data: {
        status: 'KH xác nhận',
        customerPhone: recipientPhone.trim() // Cập nhật số Zalo nhận tin nhắn
      }
    });

    res.json({
      success: true,
      message: 'Gửi tin nhắn kích hoạt bảo hành qua Zalo ZNS thành công!',
      znsResult
    });
  } catch (error: any) {
    logger.error('ZNS activation route error', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi gửi tin nhắn kích hoạt ZNS' });
  }
});

export default router;

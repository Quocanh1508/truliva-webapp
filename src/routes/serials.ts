import { Router, Request, Response } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireCoordinatorOrAdmin } from '../middleware/authSession';
import { activateSerialWarranty } from '../services/warrantyService';

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

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer as any);

    // Tìm sheet "Data" hoặc dùng sheet đầu tiên
    let worksheet = workbook.getWorksheet('Data');
    if (!worksheet) {
      worksheet = workbook.worksheets[0];
    }
    if (!worksheet) {
      res.status(400).json({ error: 'File Excel không có sheet dữ liệu' });
      return;
    }

    const batchId = uuidv4();
    const userId = req.user!.id;

    let totalRowsProcessed = 0;
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    // Header ở dòng 1, dữ liệu bắt đầu từ dòng 2
    // Cột theo template:
    // 1: Serial *
    // 2: Model *
    // 3: Trạng thái
    // 4: Ngày kích hoạt (dd/MM/yyyy HH:mm:ss)
    // 5: Ngày hết hạn bảo hành (dd/MM/yyyy HH:mm:ss)
    // 6: Ngày khách hàng xác nhận (dd/MM/yyyy HH:mm:ss)
    // 7: Tên khách hàng
    // 8: SĐT khách hàng
    // 9: Địa chỉ
    // 10: Tỉnh/Thành phố

    // Lấy tất cả serial hiện có trong DB để check trùng nhanh (batch query)
    const existingSerials = await prisma.serial.findMany({
      select: { serialNumber: true },
    });
    const existingSet = new Set(existingSerials.map(s => s.serialNumber));

    // Chuẩn bị batch insert
    const newSerials: any[] = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Bỏ qua header

      totalRowsProcessed++;

      const rawSerial = getCellText(row.getCell(1));
      const rawModel = getCellText(row.getCell(2));

      // Validation: Serial và Model bắt buộc
      if (!rawSerial) {
        errorCount++;
        errors.push({ row: rowNumber, error: 'Thiếu số Serial (cột 1)' });
        return;
      }
      if (!rawModel) {
        errorCount++;
        errors.push({ row: rowNumber, error: 'Thiếu Model máy (cột 2)' });
        return;
      }

      const cleanedSerial = cleanSerialNumber(rawSerial);
      if (!cleanedSerial) {
        errorCount++;
        errors.push({ row: rowNumber, error: `Số Serial không hợp lệ: "${rawSerial}"` });
        return;
      }

      // Kiểm tra trùng
      if (existingSet.has(cleanedSerial)) {
        skippedCount++;
        return;
      }

      // Kiểm tra trùng trong batch hiện tại
      if (newSerials.some(s => s.serialNumber === cleanedSerial)) {
        skippedCount++;
        return;
      }

      const statusVal = getCellText(row.getCell(3)) || 'Chưa kích hoạt';
      const activationDate = parseExcelDate(row.getCell(4).value);
      const warrantyExpiryDate = parseExcelDate(row.getCell(5).value);
      const customerConfirmationDate = parseExcelDate(row.getCell(6).value);
      const customerName = getCellText(row.getCell(7)) || null;
      const customerPhone = getCellText(row.getCell(8)) || null;
      const address = getCellText(row.getCell(9)) || null;
      const province = getCellText(row.getCell(10)) || null;

      // Lưu raw data
      const rawData: Record<string, any> = {};
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        rawData[`col_${colNumber}`] = getCellText(cell);
      });

      newSerials.push({
        serialNumber: cleanedSerial,
        model: rawModel.trim(),
        status: statusVal,
        activationDate,
        warrantyExpiryDate,
        customerConfirmationDate,
        customerName,
        customerPhone,
        address,
        province,
        importBatchId: batchId,
        importedById: userId,
        rawData,
      });
    });

    // Đối chiếu ngược với ServiceReport cũ trước khi insert
    if (newSerials.length > 0) {
      const serialNumbers = newSerials.map(s => s.serialNumber);

      // Tìm báo cáo lắp đặt có serial trùng
      const matchingReports = await prisma.serviceReport.findMany({
        where: {
          serialNumber: { in: serialNumbers },
          workType: { in: ['Lắp đặt', 'Giao hàng và Lắp đặt'] },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Tạo map serial -> report (lấy report đầu tiên)
      const reportMap = new Map<string, any>();
      for (const report of matchingReports) {
        const cleanSn = (report.serialNumber || '').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
        if (!reportMap.has(cleanSn)) {
          reportMap.set(cleanSn, report);
        }
      }

      // Auto-fill thông tin từ báo cáo nếu Excel không có
      for (const serial of newSerials) {
        const matchedReport = reportMap.get(serial.serialNumber);
        if (matchedReport) {
          if (!serial.customerName && matchedReport.customerName) {
            serial.customerName = matchedReport.customerName;
          }
          if (!serial.customerPhone && matchedReport.customerPhone) {
            serial.customerPhone = matchedReport.customerPhone;
          }
          if (!serial.address && matchedReport.address) {
            serial.address = matchedReport.address;
          }
          if (!serial.province && matchedReport.province) {
            serial.province = matchedReport.province;
          }
          if (!serial.activationDate) {
            serial.activationDate = matchedReport.createdAt;
          }
          // Cập nhật trạng thái nếu đang ở "Chưa kích hoạt"
          if (serial.status === 'Chưa kích hoạt') {
            serial.status = 'Đã kích hoạt';
          }
        }
      }

      // Batch insert
      await prisma.serial.createMany({
        data: newSerials,
        skipDuplicates: true,
      });

      importedCount = newSerials.length;
    }

    logger.info('Serial import completed', {
      batchId,
      userId,
      totalRowsProcessed,
      importedCount,
      skippedCount,
      errorCount,
    });

    res.json({
      success: true,
      summary: {
        totalRowsProcessed,
        importedCount,
        skippedCount,
        errorCount,
      },
      errors: errors.slice(0, 50), // Giới hạn 50 lỗi hiển thị
      batchId,
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

export default router;

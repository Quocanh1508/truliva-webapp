import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import logger from '../utils/logger';
import { requireAuth, requireSerialAccess, requireDev } from '../middleware/authSession';
import {
  uploadInvoiceResponse,
  previewDuration,
  checkPublicSerial,
  activatePublicSerial,
  confirmPublicSerial,
  zaloAuthorize,
  zaloCallback,
  getSerials,
  getBatches,
  rollbackBatch,
  importSerials,
  getImportTemplate,
  exportSerials,
  getWarrantyPolicies,
  getSerialDetail,
  activateSerialDirect,
  approveWarranty,
  updateSerial,
  restoreSerial,
  getZaloStatus,
  activateZns,
  activateManual,
  testZnsSend,
  checkZnsStatus,
  getZnsLogs,
  updateZnsLog
} from '../controllers/serialController';

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

const router = Router();

// PUBLIC ROUTES
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
}, uploadInvoiceResponse);

router.get('/public/preview-duration', previewDuration);
router.get('/public/check/:serialNumber', checkPublicSerial);
router.post('/public/activate', activatePublicSerial);
router.post('/public/confirm', confirmPublicSerial);

// ZALO OA OAUTH ROUTES
router.get('/zalo/authorize', zaloAuthorize);
router.get('/zalo/callback', zaloCallback);

// PROTECTED ROUTES
router.use(requireAuth);

router.get('/', requireSerialAccess, getSerials);
router.get('/batches', requireSerialAccess, getBatches);
router.post('/rollback', requireSerialAccess, rollbackBatch);
router.post('/import', requireSerialAccess, (req, res, next) => {
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
}, importSerials);
router.get('/import-template', requireSerialAccess, getImportTemplate);
router.get('/export', exportSerials);
router.get('/policies', requireSerialAccess, getWarrantyPolicies);
router.get('/:id', requireSerialAccess, getSerialDetail);
router.post('/:id/activate', requireSerialAccess, activateSerialDirect);
router.post('/:id/approve-warranty', requireSerialAccess, approveWarranty);
router.patch('/:id', requireSerialAccess, updateSerial);
router.post('/:id/restore', requireSerialAccess, restoreSerial);

router.get('/zalo/status', requireSerialAccess, getZaloStatus);
router.post('/zns-activate', activateZns);
router.post('/activate-manual', requireSerialAccess, activateManual);

router.post('/zns/test-send', requireDev, testZnsSend);
router.post('/zns/check-status', requireDev, checkZnsStatus);
router.get('/zns/logs', requireDev, getZnsLogs);
router.put('/zns/logs/:id', requireDev, updateZnsLog);

export default router;

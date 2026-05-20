import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/authSession';

const router = Router();

// Đảm bảo thư mục uploads tồn tại
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình Multer lưu vào đĩa (diskStorage)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh'));
    }
  },
});

/**
 * Lấy URL hoàn chỉnh cho ảnh
 */
const getImageUrl = (req: Request, filename: string) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}/uploads/${filename}`;
};

/**
 * POST /api/upload
 * Upload 1 ảnh lên server cục bộ
 */
router.post(
  '/',
  requireAuth,
  upload.single('image'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Không có file ảnh' });
        return;
      }

      res.json({
        url: getImageUrl(req, req.file.filename),
        publicId: req.file.filename,
      });
    } catch (error: any) {
      logger.error('Upload error', { error: error.message });
      res.status(500).json({ error: 'Lỗi upload ảnh' });
    }
  }
);

/**
 * POST /api/upload/multiple
 * Upload nhiều ảnh cùng lúc
 */
router.post(
  '/multiple',
  requireAuth,
  upload.array('images', 20),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'Không có file ảnh' });
        return;
      }

      const urls = files.map((file) => getImageUrl(req, file.filename));

      res.json({ urls });
    } catch (error: any) {
      logger.error('Multiple upload error', { error: error.message });
      res.status(500).json({ error: 'Lỗi upload ảnh' });
    }
  }
);

export default router;

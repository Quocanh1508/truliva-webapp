import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/authSession';

const router = Router();

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cấu hình Multer sử dụng CloudinaryStorage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (_req, file) => {
    return {
      folder: 'truliva_reports',
      allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'heic'],
      public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
    };
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

/**
 * POST /api/upload
 * Upload 1 ảnh
 */
router.post(
  '/',
  requireAuth,
  (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Ảnh quá lớn (tối đa 100MB)' });
        }
        return res.status(400).json({ error: `Lỗi tải ảnh: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ error: 'Lỗi hệ thống khi tải ảnh' });
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Không có file ảnh' });
        return;
      }

      res.json({
        url: req.file.path,
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
  (req, res, next) => {
    upload.array('images', 20)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Ảnh quá lớn (tối đa 100MB mỗi file)' });
        }
        return res.status(400).json({ error: `Lỗi tải ảnh: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ error: 'Lỗi hệ thống khi tải ảnh' });
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'Không có file ảnh' });
        return;
      }

      const urls = files.map((file) => file.path);

      res.json({ urls });
    } catch (error: any) {
      logger.error('Multiple upload error', { error: error.message });
      res.status(500).json({ error: 'Lỗi upload ảnh' });
    }
  }
);

export default router;

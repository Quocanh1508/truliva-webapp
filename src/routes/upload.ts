import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/authSession';

const router = Router();

// Cấu hình Cloudinary với timeout 120s
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 120000,
});

// Sử dụng memoryStorage để Multer nhận trọn vẹn file từ client trước khi stream lên Cloudinary.
// Tránh lỗi "Request Timeout" do đường truyền di động (4G/3G) bị chập chờn / rớt stream giữa chừng.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
});

const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-m4v',
  'video/3gpp',
  'video/ogg',
]);

const uploadMediaMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (đủ cho video < 1 phút)
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || ALLOWED_VIDEO_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Định dạng không hỗ trợ. Chỉ chấp nhận ảnh hoặc video (MP4, MOV, WebM).'));
    }
  },
});

async function uploadVideoBuffer(buffer: Buffer, originalname: string = 'video.mp4', folder = 'truliva_hotline'): Promise<string> {
  const publicId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'video',
            public_id: publicId,
            timeout: 180000,
          },
          (error, res) => {
            if (error) return reject(error);
            resolve(res);
          }
        );
        stream.end(buffer);
      });

      if (result && (result.secure_url || result.url)) {
        return result.secure_url || result.url;
      }
    } catch (err: any) {
      logger.warn(`Cloudinary video upload attempt ${attempt} failed: ${err.message || err}`);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  logger.error('Cloudinary video upload failed after retries, falling back to local storage');
  const uploadsDir = path.join(process.cwd(), 'uploads', 'hotline');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const rawExt = path.extname(originalname || '').toLowerCase();
  const safeExt = ['.mp4', '.mov', '.webm', '.m4v', '.3gp', '.ogg'].includes(rawExt) ? rawExt : '.mp4';
  const localFileName = `${publicId}${safeExt}`;
  const localPath = path.join(uploadsDir, localFileName);
  await fs.promises.writeFile(localPath, buffer);
  return `/uploads/hotline/${localFileName}`;
}

/**
 * Upload buffer lên Cloudinary kèm cơ chế retry tự động.
 * Nếu Cloudinary gặp sự cố mạng kéo dài, fallback lưu vào ổ cứng local VPS.
 */
async function uploadBuffer(buffer: Buffer, originalname: string = 'image.jpg', folder = 'truliva_reports'): Promise<string> {
  const publicId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

  // Thử upload lên Cloudinary tối đa 2 lần
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            format: 'jpg',
            resource_type: 'image',
            public_id: publicId,
            timeout: 120000,
          },
          (error, res) => {
            if (error) return reject(error);
            resolve(res);
          }
        );
        stream.end(buffer);
      });

      if (result && (result.secure_url || result.url)) {
        return result.secure_url || result.url;
      }
    } catch (err: any) {
      logger.warn(`Cloudinary upload attempt ${attempt} failed: ${err.message || err}`);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // Fallback cứu hộ: Lưu trực tiếp vào thư mục uploads trên VPS nếu Cloudinary timeout/lỗi
  logger.error('Cloudinary upload failed after retries, falling back to local storage');
  const uploadsDir = path.join(process.cwd(), 'uploads', 'reports');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const localFileName = `${publicId}.jpg`;
  const localPath = path.join(uploadsDir, localFileName);
  await fs.promises.writeFile(localPath, buffer);
  return `/uploads/reports/${localFileName}`;
}

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
          return res.status(400).json({ error: 'Ảnh quá lớn (tối đa 30MB)' });
        }
        return res.status(400).json({ error: `Lỗi tải ảnh: ${err.message}` });
      } else if (err) {
        logger.error('Multer single upload error', { error: err.message || err });
        return res.status(500).json({ error: 'Lỗi hệ thống khi tải ảnh' });
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file || !req.file.buffer) {
        res.status(400).json({ error: 'Không có file ảnh' });
        return;
      }

      const url = await uploadBuffer(req.file.buffer, req.file.originalname, 'truliva_reports');
      res.json({
        url,
        publicId: req.file.originalname,
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
          return res.status(400).json({ error: 'Ảnh quá lớn (tối đa 30MB mỗi file)' });
        }
        return res.status(400).json({ error: `Lỗi tải ảnh: ${err.message}` });
      } else if (err) {
        logger.error('Multer multiple upload error', { error: err.message || err });
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

      const uploadPromises = files.map(async (file) => {
        if (file.buffer) {
          return await uploadBuffer(file.buffer, file.originalname, 'truliva_reports');
        }
        return null;
      });
      const results = await Promise.all(uploadPromises);
      const urls = results.filter((u): u is string => u !== null);

      res.json({ urls });
    } catch (error: any) {
      logger.error('Multiple upload error', { error: error.message });
      res.status(500).json({ error: 'Lỗi upload ảnh' });
    }
  }
);

/**
 * POST /api/upload/media
 * Upload nhiều ảnh và/hoặc video (tối đa 5 file, mỗi file tối đa 50MB)
 */
router.post(
  '/media',
  requireAuth,
  (req, res, next) => {
    uploadMediaMulter.array('files', 5)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Tệp quá lớn (tối đa 50MB mỗi tệp)' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: 'Tối đa 5 tệp mỗi lần tải lên' });
        }
        return res.status(400).json({ error: `Lỗi tải tệp: ${err.message}` });
      } else if (err) {
        logger.error('Multer media upload error', { error: err.message || err });
        return res.status(400).json({ error: err.message || 'Lỗi hệ thống khi tải tệp' });
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'Không có tệp đính kèm' });
        return;
      }

      const uploadPromises = files.map(async (file) => {
        if (!file.buffer) return null;
        if (file.mimetype.startsWith('video/')) {
          return await uploadVideoBuffer(file.buffer, file.originalname, 'truliva_hotline');
        }
        return await uploadBuffer(file.buffer, file.originalname, 'truliva_hotline');
      });

      const results = await Promise.all(uploadPromises);
      const urls = results.filter((u): u is string => u !== null);

      res.json({ urls });
    } catch (error: any) {
      logger.error('Media upload error', { error: error.message });
      res.status(500).json({ error: 'Lỗi tải lên tệp đính kèm' });
    }
  }
);

export default router;

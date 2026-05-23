import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        fullName: string;
        role: 'KTV' | 'ADMIN' | 'DEV';
      };
    }
  }
}

/**
 * Middleware xác thực session.
 * Kiểm tra cookie "session_token" (chứa userId).
 * Nếu hợp lệ, gắn user vào req.user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionToken = req.cookies?.session_token;

    if (!sessionToken) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }

    // Session token = userId (simple approach)
    const user = await prisma.user.findUnique({
      where: { id: sessionToken },
      select: { id: true, username: true, fullName: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' });
      return;
    }

    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    };

    next();
  } catch (error: any) {
    logger.error('Auth middleware error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xác thực' });
  }
}

/**
 * Middleware kiểm tra quyền Admin.
 * Phải dùng sau requireAuth.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Không có quyền truy cập' });
    return;
  }
  next();
}

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import logger from '../utils/logger';

// Extend Express Request to include user info
// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        fullName: string;
        phoneNumber?: string | null;
        role: 'KTV' | 'ADMIN' | 'DEV' | 'SALE_SUPERVISOR' | 'SALER' | 'HOTLINE' | 'COORDINATOR' | 'STAFF';
        group?: string | null;
        pancakeAccountName?: string | null;
      };
    }
  }
}

/**
 * Middleware xác thực session.
 * Kiểm tra cookie "session_token" (chứa JWT).
 * Nếu hợp lệ, gắn user vào req.user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let sessionToken = req.cookies?.session_token;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionToken = authHeader.substring(7);
    }

    if (!sessionToken) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET is not configured in environment');
      res.status(500).json({ error: 'Lỗi hệ thống' });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(sessionToken, jwtSecret);
    } catch (err: any) {
      logger.warn('Unauthorized attempt with invalid or expired JWT token', { error: err.message });
      res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
      return;
    }

    if (!decoded || !decoded.id) {
      res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, username: true, fullName: true, phoneNumber: true, role: true, isActive: true, group: true, pancakeAccountName: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc tài khoản đã bị vô hiệu hóa' });
      return;
    }

    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      role: user.role,
      group: user.group,
      pancakeAccountName: user.pancakeAccountName,
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

import { getDefaultPermission, SYSTEM_FEATURES } from '../config/permissions';
import { UserRole } from '@prisma/client';

export async function checkDynamicPermission(role: string, featureKey: string, group?: string | null): Promise<boolean> {
  const feat = SYSTEM_FEATURES.find(f => f.key === featureKey);
  // Admin luôn có tất cả quyền thông thường (trừ devOnly cần được cấp trong phân quyền)
  if (role === 'ADMIN' && !feat?.devOnly) return true;
  try {
    const grp = (group || '').trim();
    // 1. Kiểm tra cấu hình riêng của Group nếu có
    if (grp) {
      const groupCustom = await prisma.rolePermission.findUnique({
        where: {
          role_group_featureKey: {
            role: role as UserRole,
            group: grp,
            featureKey
          }
        }
      });
      if (groupCustom !== null && groupCustom !== undefined) {
        return groupCustom.isAllowed;
      }
    }

    // 2. Kiểm tra cấu hình chung của Role (group = "")
    const roleCustom = await prisma.rolePermission.findUnique({
      where: {
        role_group_featureKey: {
          role: role as UserRole,
          group: '',
          featureKey
        }
      }
    });
    if (roleCustom !== null && roleCustom !== undefined) {
      return roleCustom.isAllowed;
    }
  } catch (err) {
    logger.warn('Failed to check dynamic permission in DB:', err);
  }
  return getDefaultPermission(role as UserRole, featureKey);
}

export function requirePermission(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const role = req.user?.role;
    const group = req.user?.group;
    if (!role) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    const isAllowed = await checkDynamicPermission(role, featureKey, group);
    if (!isAllowed) {
      res.status(403).json({ error: 'Tài khoản của bạn không có quyền thực hiện thao tác này' });
      return;
    }
    next();
  };
}

/**
 * Middleware kiểm tra quyền Coordinator (Điều phối viên) hoặc Admin.
 */
export function requireCoordinatorOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role !== 'ADMIN' && role !== 'DEV' && role !== 'COORDINATOR') {
    res.status(403).json({ error: 'Không có quyền truy cập' });
    return;
  }
  next();
}

/**
 * Middleware kiểm tra quyền xem Dashboard.
 */
export function requireDashboardAccess(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (
    role === 'ADMIN' ||
    role === 'DEV' ||
    (role === 'STAFF' && req.user?.group === 'Service')
  ) {
    next();
  } else {
    res.status(403).json({ error: 'Không có quyền truy cập' });
  }
}

/**
 * Middleware kiểm tra quyền DEV.
 */
export async function requireDev(req: Request, res: Response, next: NextFunction): Promise<void> {
  const role = req.user?.role;
  if (!role) {
    res.status(401).json({ error: 'Chưa đăng nhập' });
    return;
  }
  if (role === 'DEV' || role === 'ADMIN') {
    next();
    return;
  }
  const hasZns = await checkDynamicPermission(role, 'DEV_ZNS_MANAGE', req.user?.group);
  const hasMap = await checkDynamicPermission(role, 'DEV_SYSTEM_MAP', req.user?.group);
  const hasFb = await checkDynamicPermission(role, 'DEV_FEEDBACK_MANAGE', req.user?.group);
  if (hasZns || hasMap || hasFb) {
    next();
    return;
  }
  res.status(403).json({ error: 'Không có quyền truy cập. Chỉ dành cho DEV/ADMIN.' });
}

/**
 * Middleware kiểm tra quyền Quản lý Serial (Admin, Dev, Coordinator, Hotline, Staff thuộc nhóm Hotline).
 */
export async function requireSerialAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const role = req.user?.role;
  if (!role) {
    res.status(401).json({ error: 'Chưa đăng nhập' });
    return;
  }
  const isAllowed = await checkDynamicPermission(role, 'SERIAL_VIEW');
  if (isAllowed || role === 'ADMIN' || role === 'DEV') {
    next();
    return;
  }
  res.status(403).json({ error: 'Không có quyền truy cập Quản lý Serial' });
}


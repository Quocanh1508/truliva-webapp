import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
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
        phoneNumber?: string | null;
        role: 'KTV' | 'ADMIN' | 'DEV' | 'SALE_SUPERVISOR' | 'SALER' | 'HOTLINE' | 'COORDINATOR' | 'STAFF' | 'CUSTOMER';
        group?: string | null;
        pancakeAccountName?: string | null;
      };
    }
  }
}

function isMiniAppAudience(aud: unknown): boolean {
  if (aud === 'truliva-miniapp') return true;
  if (Array.isArray(aud) && aud.includes('truliva-miniapp')) return true;
  return false;
}

/**
 * Middleware xác thực session nội bộ (CRM / ERP / Admin / KTV).
 * Kiểm tra cookie "session_token" hoặc Bearer JWT ký bằng JWT_SECRET.
 * Từ chối mọi token có role === 'CUSTOMER', aud === 'truliva-miniapp', hoặc user.group === 'CUSTOMER'.
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

    // Chặn tuyệt đối token của khách hàng Zalo Mini App truy cập API nội bộ
    if (decoded.role === 'CUSTOMER' || decoded.group === 'CUSTOMER' || isMiniAppAudience(decoded.aud)) {
      logger.warn('Blocked Zalo Mini App customer token from accessing internal endpoint', {
        userId: decoded.id,
        path: req.originalUrl,
        role: decoded.role,
        aud: decoded.aud
      });
      res.status(403).json({ error: 'Tài khoản khách hàng không có quyền truy cập hệ thống nội bộ' });
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

    // Chặn tài khoản thuộc nhóm CUSTOMER trong DB truy cập API nội bộ
    if (user.group === 'CUSTOMER' || (user.role as string) === 'CUSTOMER') {
      logger.warn('Blocked DB CUSTOMER account from accessing internal endpoint', {
        userId: user.id,
        path: req.originalUrl,
        group: user.group
      });
      res.status(403).json({ error: 'Tài khoản khách hàng không có quyền truy cập hệ thống nội bộ' });
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

export const authenticate = requireAuth;
export const requireAuthSession = requireAuth;

/**
 * Middleware kiểm tra quyền theo danh sách role cho phép.
 * Phải dùng sau requireAuth / authenticate.
 */
export function authorize(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Không có quyền truy cập' });
      return;
    }
    next();
  };
}

/**
 * Middleware vô hiệu hóa các route debug thuần túy trên môi trường Production.
 */
export function blockInProduction(_req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Endpoint is disabled in production' });
    return;
  }
  next();
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

export async function checkDynamicPermission(role: string, featureKey: string, group?: string | null, userId?: string): Promise<boolean> {
  const feat = SYSTEM_FEATURES.find(f => f.key === featureKey);
  // Admin luôn có tất cả quyền thông thường (trừ devOnly cần được cấp trong phân quyền)
  if (role === 'ADMIN' && !feat?.devOnly) return true;
  try {
    // 0. Kiểm tra quyền riêng cấp cá nhân (User-Level Override) — ưu tiên cao nhất
    if (userId) {
      const userPerm = await prisma.userPermission.findUnique({
        where: {
          userId_featureKey: {
            userId,
            featureKey
          }
        }
      });
      if (userPerm !== null && userPerm !== undefined) {
        return userPerm.isAllowed;
      }
    }

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
    const isAllowed = await checkDynamicPermission(role, featureKey, group, req.user?.id);
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

/**
 * Middleware xác thực dành riêng cho khách hàng Zalo Mini App.
 * Xác minh JWT bằng ZALO_MINIAPP_JWT_SECRET và audience === 'truliva-miniapp'.
 */
export async function requireCustomerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token = req.cookies?.zalo_session_token || req.cookies?.session_token;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      res.status(401).json({ error: 'Chưa đăng nhập Zalo Mini App' });
      return;
    }

    const miniAppJwtSecret = process.env.ZALO_MINIAPP_JWT_SECRET;
    if (!miniAppJwtSecret) {
      logger.error('ZALO_MINIAPP_JWT_SECRET is not configured in environment');
      res.status(500).json({ error: 'Lỗi cấu hình bảo mật máy chủ' });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, miniAppJwtSecret, { audience: 'truliva-miniapp' });
    } catch (err: any) {
      logger.warn('Invalid or expired Zalo Mini App token', { error: err.message });
      res.status(401).json({ error: 'Phiên đăng nhập Zalo Mini App không hợp lệ hoặc đã hết hạn' });
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
      role: 'CUSTOMER',
      group: 'CUSTOMER',
      pancakeAccountName: null,
    };

    next();
  } catch (error: any) {
    logger.error('Customer auth middleware error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xác thực Zalo Mini App' });
  }
}

export const requireMiniAppAuth = requireCustomerAuth;

/**
 * Middleware tùy chọn xác thực khách hàng Zalo Mini App.
 * Nếu có Bearer JWT hợp lệ (ký bằng ZALO_MINIAPP_JWT_SECRET) -> gán thông tin khách hàng vào req.user.
 * Nếu không có hoặc token lỗi -> vẫn tiếp tục (next()) để hỗ trợ khách vãng lai.
 */
export async function optionalCustomerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let token = req.cookies?.zalo_session_token || req.cookies?.session_token;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    if (!token) {
      return next();
    }

    const miniAppJwtSecret = process.env.ZALO_MINIAPP_JWT_SECRET;
    if (!miniAppJwtSecret) {
      return next();
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, miniAppJwtSecret, { audience: 'truliva-miniapp' });
    } catch {
      return next();
    }

    if (decoded && decoded.id) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, username: true, fullName: true, phoneNumber: true, role: true, isActive: true, group: true, pancakeAccountName: true },
      });

      if (user && user.isActive) {
        req.user = {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          role: 'CUSTOMER',
          group: 'CUSTOMER',
          pancakeAccountName: null,
        };
      }
    }

    next();
  } catch {
    next();
  }
}

export const optionalMiniAppAuth = optionalCustomerAuth;
export const optionalAuth = optionalCustomerAuth;


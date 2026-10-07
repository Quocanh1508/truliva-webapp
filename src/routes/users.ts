import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { UserRole } from '@prisma/client';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireCoordinatorOrAdmin } from '../middleware/authSession';

const router = Router();

const ROLE_RANKS: Record<string, number> = {
  DEV: 100,
  ADMIN: 80,
  COORDINATOR: 60,
  HOTLINE: 50,
  SALE_SUPERVISOR: 40,
  SALER: 30,
  STAFF: 20,
  KTV: 10
};

// ==========================================
// PUBLIC ROUTES (Dành cho mọi role đã login)
// ==========================================

/**
 * GET /api/users/ktvs
 * Lấy danh sách kỹ thuật viên (public cho authenticated users)
 */
router.get('/ktvs', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { techStationId, excludeOrderId } = req.query;
    const where: any = { role: 'KTV', isActive: true };
    if (techStationId) {
      const stationIds = String(techStationId).split(',').map(s => s.trim()).filter(Boolean);
      if (stationIds.length > 0) {
        where.techStationId = { in: stationIds };
      }
    }

    const ktvs = await prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        username: true,
        phoneNumber: true,
        techStationId: true,
        // Đếm đơn đang xử lý: chưa hủy VÀ chưa có báo cáo
        assignedOrders: {
          where: {
            ...(excludeOrderId ? { id: { not: excludeOrderId as string } } : {}),
            adminStatus: { notIn: ['hủy đơn', 'hoàn thành'] },
            serviceReports: { none: {} }
          },
          select: { id: true }
        }
      }
    });

    // Map để thêm pendingOrderCount
    const result = ktvs.map(k => ({
      id: k.id,
      fullName: k.fullName,
      username: k.username,
      phoneNumber: k.phoneNumber,
      techStationId: k.techStationId,
      pendingOrderCount: k.assignedOrders.length
    }));

    res.json(result);
  } catch (error: any) {
    logger.error('Fetch KTVs error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách KTV' });
  }
});

// ==========================================
// ADMIN ROUTES
// ==========================================
router.use(requireAuth, requireCoordinatorOrAdmin);

/**
 * GET /api/users/export
 * Xuất Excel danh sách KTV / Nhân viên theo bộ lọc (Admin only)
 */
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, mainStationId, techStationId, status } = req.query;

    const conditions: any[] = [
      {
        OR: [
          { group: null },
          { group: { not: 'CUSTOMER' } }
        ]
      },
      {
        username: { not: { startsWith: 'zalo_' } }
      }
    ];

    // 1. Tìm kiếm text
    if (search) {
      const q = String(search).trim();
      conditions.push({
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { phoneNumber: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } }
        ]
      });
    }

    // 2. Lọc theo trạm chính / trạm kỹ thuật
    if (techStationId) {
      conditions.push({ techStationId: String(techStationId) });
    } else if (mainStationId) {
      const techStations = await prisma.techStation.findMany({
        where: { mainStationId: String(mainStationId) },
        select: { id: true }
      });
      const techStationIds = techStations.map(ts => ts.id);
      conditions.push({ techStationId: { in: techStationIds } });
    }

    // 3. Lọc theo tình trạng
    if (status === 'active') {
      conditions.push({ isActive: true });
    } else if (status === 'inactive') {
      conditions.push({ isActive: false });
    }

    const where: any = { AND: conditions };

    const users = await prisma.user.findMany({
      where,
      select: {
        username: true,
        fullName: true,
        role: true,
        phoneNumber: true,
        group: true,
        warehouseName: true,
        pancakeAccountName: true,
        techStation: {
          select: {
            name: true,
            mainStation: {
              select: {
                name: true
              }
            }
          }
        },
        isActive: true,
        address: true,
        cccdNumber: true,
        cccdDate: true,
        cccdPlace: true,
        bankAccount: true,
        bankName: true,
        email: true,
        _count: { select: { serviceReports: true } },
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Danh sách Nhân viên');

    worksheet.columns = [
      { header: 'Họ và tên', key: 'fullName', width: 25 },
      { header: 'Số điện thoại', key: 'phoneNumber', width: 15 },
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Vai trò', key: 'role', width: 15 },
      { header: 'Nhóm công việc', key: 'group', width: 18 },
      { header: 'Trạm chính', key: 'mainStation', width: 25 },
      { header: 'Trạm kỹ thuật', key: 'techStation', width: 25 },
      { header: 'Kho Pancake POS', key: 'warehouseName', width: 25 },
      { header: 'Account Pancake', key: 'pancakeAccountName', width: 22 },
      { header: 'Số báo cáo', key: 'reportCount', width: 15 },
      { header: 'Trạng thái', key: 'status', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Địa chỉ', key: 'address', width: 35 },
      { header: 'Số CCCD', key: 'cccdNumber', width: 18 },
      { header: 'Ngày cấp CCCD', key: 'cccdDate', width: 15 },
      { header: 'Nơi cấp CCCD', key: 'cccdPlace', width: 30 },
      { header: 'Số tài khoản', key: 'bankAccount', width: 20 },
      { header: 'Ngân hàng', key: 'bankName', width: 25 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B3A6B' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 25;

    users.forEach(u => {
      const row = worksheet.addRow({
        fullName: u.fullName || '',
        phoneNumber: u.phoneNumber || '',
        username: u.username || '',
        role: u.role || '',
        group: u.group || '',
        mainStation: u.techStation?.mainStation?.name || '',
        techStation: u.techStation?.name || '',
        warehouseName: u.warehouseName || '',
        pancakeAccountName: u.pancakeAccountName || '',
        reportCount: u._count.serviceReports || 0,
        status: u.isActive ? 'Hoạt động' : 'Đã khóa',
        email: u.email || '',
        address: u.address || '',
        cccdNumber: u.cccdNumber || '',
        cccdDate: u.cccdDate || '',
        cccdPlace: u.cccdPlace || '',
        bankAccount: u.bankAccount || '',
        bankName: u.bankName || '',
      });

      row.getCell('status').alignment = { horizontal: 'center' };
      row.getCell('reportCount').alignment = { horizontal: 'right' };
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + encodeURIComponent('Danh_sach_Nhan_vien.xlsx')
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Export users error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xuất file Excel' });
  }
});

/**
 * GET /api/users
 * Danh sách tất cả nhân viên nội bộ (Loại trừ khách hàng Zalo Mini App)
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { group: null },
              { group: { not: 'CUSTOMER' } }
            ]
          },
          {
            username: { not: { startsWith: 'zalo_' } }
          }
        ]
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        phoneNumber: true,
        techStationId: true,
        techStation: { select: { name: true, mainStation: { select: { name: true } } } },
        isActive: true,
        createdAt: true,
        address: true,
        cccdNumber: true,
        cccdDate: true,
        cccdPlace: true,
        bankAccount: true,
        bankName: true,
        email: true,
        warehouseId: true,
        warehouseName: true,
        group: true,
        pancakeAccountName: true,
        _count: { select: { serviceReports: true } },
      } as any,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ users });
  } catch (error: any) {
    logger.error('Get users error', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách' });
  }
});

/**
 * POST /api/users
 * Tạo tài khoản mới (KTV hoặc Admin)
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      username, password, fullName, role, phoneNumber, techStationId,
      address, cccdNumber, cccdDate, cccdPlace, bankAccount, bankName, email,
      warehouseId, warehouseName, group, pancakeAccountName
    } = req.body;

    if (!username || !password || !fullName) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
      return;
    }

    if (password.length < 4) {
      res.status(400).json({ error: 'Mật khẩu phải có ít nhất 4 ký tự' });
      return;
    }

    // Check username tồn tại
    const existing = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
    });
    if (existing) {
      res.status(409).json({ error: 'Username đã tồn tại' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const validRoles = ['KTV', 'ADMIN', 'DEV', 'SALE_SUPERVISOR', 'SALER', 'HOTLINE', 'COORDINATOR', 'STAFF'];
    const finalRole = validRoles.includes(role) ? role : 'KTV';

    // Ngăn chặn leo thang đặc quyền (Privilege Escalation Prevention)
    const creatorRole = req.user!.role;
    const creatorRank = ROLE_RANKS[creatorRole] || 0;
    const targetRank = ROLE_RANKS[finalRole] || 0;

    if (targetRank > creatorRank) {
      res.status(403).json({ error: `Bạn không có quyền tạo tài khoản với vai trò ${finalRole}` });
      return;
    }

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase().trim(),
        passwordHash,
        fullName,
        role: finalRole,
        phoneNumber: phoneNumber || null,
        techStationId: techStationId || null,
        address: address || null,
        cccdNumber: cccdNumber || null,
        cccdDate: cccdDate || null,
        cccdPlace: cccdPlace || null,
        bankAccount: bankAccount || null,
        bankName: bankName || null,
        email: email || null,
        warehouseId: warehouseId || null,
        warehouseName: warehouseName || null,
        group: group || null,
        pancakeAccountName: pancakeAccountName || null,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        phoneNumber: true,
        techStationId: true,
        isActive: true,
        createdAt: true,
        address: true,
        cccdNumber: true,
        cccdDate: true,
        cccdPlace: true,
        bankAccount: true,
        bankName: true,
        email: true,
        warehouseId: true,
        warehouseName: true,
        group: true,
        pancakeAccountName: true,
      } as any,
    });

    logger.info('User created', { userId: user.id, by: req.user?.id });
    res.status(201).json({ user });
  } catch (error: any) {
    logger.error('Create user error', { error: error.message });
    res.status(500).json({ error: 'Lỗi tạo tài khoản' });
  }
});

/**
 * PUT /api/users/:id
 * Cập nhật thông tin user
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { 
      username, fullName, phoneNumber, password, isActive, role, techStationId,
      address, cccdNumber, cccdDate, cccdPlace, bankAccount, bankName, email,
      warehouseId, warehouseName, group, pancakeAccountName,
      applyScope // 'OVERWRITE' | 'FUTURE_ONLY'
    } = req.body;

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        passwordHash: true,
        phoneNumber: true,
        techStationId: true,
        warehouseId: true,
        warehouseName: true,
        group: true,
        pancakeAccountName: true,
        address: true,
        cccdNumber: true,
        cccdDate: true,
        cccdPlace: true,
        bankAccount: true,
        bankName: true,
        email: true
      }
    });

    if (!targetUser) {
      res.status(404).json({ error: 'Không tìm thấy người dùng' });
      return;
    }

    const creatorRole = req.user!.role;
    const creatorRank = ROLE_RANKS[creatorRole] || 0;
    const currentTargetRank = ROLE_RANKS[targetUser.role] || 0;

    // Ngăn chặn leo thang đặc quyền (Privilege Escalation Prevention)
    if (currentTargetRank > creatorRank) {
      res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa tài khoản có vai trò cao hơn' });
      return;
    }

    if (id === req.user!.id && role !== undefined && role !== creatorRole) {
      res.status(400).json({ error: 'Bạn không thể tự thay đổi vai trò của chính mình' });
      return;
    }

    const validRoles = ['KTV', 'ADMIN', 'DEV', 'SALE_SUPERVISOR', 'SALER', 'HOTLINE', 'COORDINATOR', 'STAFF'];
    const finalRole = role !== undefined ? (validRoles.includes(role) ? (role as UserRole) : 'KTV') : targetUser.role;
    const targetNewRank = ROLE_RANKS[finalRole] || 0;

    if (targetNewRank > creatorRank) {
      res.status(403).json({ error: `Bạn không có quyền chuyển đổi vai trò sang ${finalRole}` });
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // TRƯỜNG HỢP 1: TÁCH DỮ LIỆU - CHỈ ÁP DỤNG TỪ NAY VỀ SAU
    // (Bảo toàn nguyên vẹn user cũ & lịch sử cũ, tạo nhân sự mới)
    // ─────────────────────────────────────────────────────────────
    if (applyScope === 'FUTURE_ONLY') {
      const newUsername = String(username || phoneNumber || '').toLowerCase().trim();
      if (!newUsername) {
        res.status(400).json({ error: 'Username đăng nhập cho nhân sự mới không được để trống' });
        return;
      }

      // Check username exists
      const existing = await prisma.user.findFirst({
        where: { username: newUsername }
      });
      if (existing) {
        res.status(409).json({ error: `Username "${newUsername}" đã tồn tại bởi tài khoản khác` });
        return;
      }

      let newPasswordHash = targetUser.passwordHash;
      if (password && password.trim()) {
        if (password.length < 4) {
          res.status(400).json({ error: 'Mật khẩu phải có ít nhất 4 ký tự' });
          return;
        }
        newPasswordHash = await bcrypt.hash(password, 10);
      } else {
        newPasswordHash = await bcrypt.hash('Truliva@2025', 10);
      }

      const newUser = await prisma.user.create({
        data: {
          username: newUsername,
          fullName: (fullName || targetUser.fullName).trim(),
          phoneNumber: phoneNumber ? phoneNumber.trim() : null,
          passwordHash: newPasswordHash,
          role: finalRole,
          techStationId: techStationId !== undefined ? (techStationId || null) : targetUser.techStationId,
          address: address !== undefined ? (address || null) : targetUser.address,
          cccdNumber: cccdNumber !== undefined ? (cccdNumber || null) : targetUser.cccdNumber,
          cccdDate: cccdDate !== undefined ? (cccdDate || null) : targetUser.cccdDate,
          cccdPlace: cccdPlace !== undefined ? (cccdPlace || null) : targetUser.cccdPlace,
          bankAccount: bankAccount !== undefined ? (bankAccount || null) : targetUser.bankAccount,
          bankName: bankName !== undefined ? (bankName || null) : targetUser.bankName,
          email: email !== undefined ? (email || null) : targetUser.email,
          warehouseId: warehouseId !== undefined ? (warehouseId || null) : targetUser.warehouseId,
          warehouseName: warehouseName !== undefined ? (warehouseName || null) : targetUser.warehouseName,
          group: group !== undefined ? (group || null) : targetUser.group,
          pancakeAccountName: pancakeAccountName !== undefined ? (pancakeAccountName || null) : targetUser.pancakeAccountName,
          isActive: true,
        }
      });
      const newUserId: string = newUser.id;

      // Kế thừa đơn giá KTV riêng (ktvServiceRates) từ người cũ sang người mới
      const oldRates = await prisma.ktvServiceRate.findMany({
        where: { userId: targetUser.id }
      });
      if (oldRates.length > 0) {
        for (const r of oldRates) {
          await prisma.ktvServiceRate.create({
            data: {
              userId: newUserId,
              workType: r.workType,
              rate: r.rate
            }
          }).catch(() => null);
        }
      }

      // Chuyển giao các đơn chưa hoàn thành (chờ xử lý, đang thực hiện) sang nhân sự mới
      const transferredOrders = await prisma.order.updateMany({
        where: {
          assignedKtvId: targetUser.id,
          adminStatus: { in: ['chờ xử lý', 'đang thực hiện'] }
        },
        data: {
          assignedKtvId: newUserId
        }
      });

      // Ghi AuditLog
      await prisma.auditLog.create({
        data: {
          entityType: 'User',
          entityId: newUserId,
          action: 'created',
          changes: {
            mode: 'FUTURE_ONLY_SUCCESSOR',
            transferredFromUserId: targetUser.id,
            transferredFromUserName: targetUser.fullName,
            transferredOrdersCount: transferredOrders.count
          },
          userId: req.user!.id,
          userName: req.user!.username || 'ADMIN'
        }
      });

      logger.info('User split successor created (FUTURE_ONLY)', {
        oldUserId: targetUser.id,
        newUserId: newUser.id,
        transferredOrders: transferredOrders.count,
        by: req.user?.id
      });

      res.status(201).json({
        user: newUser,
        mode: 'FUTURE_ONLY',
        transferredOrdersCount: transferredOrders.count,
        message: `Đã tạo nhân sự mới "${newUser.fullName}" và bảo lưu nguyên vẹn lịch sử cũ của "${targetUser.fullName}". Đã chuyển ${transferredOrders.count} đơn đang thực hiện sang người mới.`
      });
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // TRƯỜNG HỢP 2: OVERWRITE (MẶC ĐỊNH HOẶC CHỌN GHI ĐÈ LỊCH SỬ)
    // ─────────────────────────────────────────────────────────────
    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = fullName.trim();
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber.trim() || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (role !== undefined) updateData.role = finalRole;
    if (techStationId !== undefined) updateData.techStationId = techStationId || null;
    
    if (address !== undefined) updateData.address = address || null;
    if (cccdNumber !== undefined) updateData.cccdNumber = cccdNumber || null;
    if (cccdDate !== undefined) updateData.cccdDate = cccdDate || null;
    if (cccdPlace !== undefined) updateData.cccdPlace = cccdPlace || null;
    if (bankAccount !== undefined) updateData.bankAccount = bankAccount || null;
    if (bankName !== undefined) updateData.bankName = bankName || null;
    if (email !== undefined) updateData.email = email || null;
    if (warehouseId !== undefined) updateData.warehouseId = warehouseId || null;
    if (warehouseName !== undefined) updateData.warehouseName = warehouseName || null;
    if (group !== undefined) updateData.group = group || null;
    if (pancakeAccountName !== undefined) updateData.pancakeAccountName = pancakeAccountName || null;

    if (username !== undefined) {
      const cleanUsername = String(username).toLowerCase().trim();
      if (!cleanUsername) {
        res.status(400).json({ error: 'Username không được để trống' });
        return;
      }
      if (cleanUsername !== targetUser.username.toLowerCase()) {
        const existing = await prisma.user.findFirst({
          where: {
            id: { not: id },
            username: cleanUsername
          }
        });
        if (existing) {
          res.status(409).json({ error: `Username "${cleanUsername}" đã được sử dụng bởi tài khoản khác` });
          return;
        }
        updateData.username = cleanUsername;
      }
    }

    if (password) {
      if (password.length < 4) {
        res.status(400).json({ error: 'Mật khẩu phải có ít nhất 4 ký tự' });
        return;
      }
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        phoneNumber: true,
        techStationId: true,
        isActive: true,
        address: true,
        cccdNumber: true,
        cccdDate: true,
        cccdPlace: true,
        bankAccount: true,
        bankName: true,
        email: true,
        warehouseId: true,
        warehouseName: true,
        group: true,
        pancakeAccountName: true,
      } as any,
    });

    // Ghi AuditLog
    await prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: id,
        action: 'updated',
        changes: {
          mode: 'OVERWRITE',
          from: {
            fullName: targetUser.fullName,
            username: targetUser.username,
            phoneNumber: targetUser.phoneNumber
          },
          to: {
            fullName: updatedUser.fullName,
            username: updatedUser.username,
            phoneNumber: updatedUser.phoneNumber
          }
        },
        userId: req.user!.id,
        userName: req.user!.username || 'ADMIN'
      }
    });

    logger.info('User updated (OVERWRITE)', { userId: id, by: req.user?.id });
    res.json({ user: updatedUser, mode: 'OVERWRITE' });
  } catch (error: any) {
    logger.error('Update user error', { error: error.message });
    res.status(500).json({ error: 'Lỗi cập nhật' });
  }
});

/**
 * DELETE /api/users/:id
 * Vô hiệu hóa tài khoản (soft delete)
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    if (id === req.user!.id) {
      res.status(400).json({ error: 'Bạn không thể tự vô hiệu hóa tài khoản của chính mình' });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { role: true }
    });

    if (!targetUser) {
      res.status(404).json({ error: 'Không tìm thấy người dùng' });
      return;
    }

    const creatorRole = req.user!.role;
    const creatorRank = ROLE_RANKS[creatorRole] || 0;
    const currentTargetRank = ROLE_RANKS[targetUser.role] || 0;

    if (currentTargetRank > creatorRank) {
      res.status(403).json({ error: 'Bạn không có quyền vô hiệu hóa tài khoản có vai trò cao hơn' });
      return;
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    logger.info('User deactivated', { userId: id, by: req.user?.id });
    res.json({ message: 'Đã vô hiệu hóa tài khoản' });
  } catch (error: any) {
    logger.error('Delete user error', { error: error.message });
    res.status(500).json({ error: 'Lỗi vô hiệu hóa' });
  }
});

export default router;

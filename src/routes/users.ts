import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth, requireAdmin } from '../middleware/authSession';

const router = Router();

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
            serviceReports: { none: {} },
            OR: [
              { statusCode: { not: 0 } },
              { statusCode: null }
            ]
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
router.use(requireAuth, requireAdmin);

/**
 * GET /api/users/export
 * Xuất Excel danh sách KTV theo bộ lọc (Admin only)
 */
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, mainStationId, techStationId, status } = req.query;

    const where: any = {};

    // 1. Tìm kiếm text
    if (search) {
      const q = String(search).trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } }
      ];
    }

    // 2. Lọc theo trạm chính / trạm kỹ thuật
    if (techStationId) {
      where.techStationId = String(techStationId);
    } else if (mainStationId) {
      const techStations = await prisma.techStation.findMany({
        where: { mainStationId: String(mainStationId) },
        select: { id: true }
      });
      const techStationIds = techStations.map(ts => ts.id);
      where.techStationId = { in: techStationIds };
    }

    // 3. Lọc theo tình trạng
    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        username: true,
        fullName: true,
        role: true,
        phoneNumber: true,
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
    const worksheet = workbook.addWorksheet('Danh sách KTV');

    worksheet.columns = [
      { header: 'Họ và tên', key: 'fullName', width: 25 },
      { header: 'Số điện thoại', key: 'phoneNumber', width: 15 },
      { header: 'Username', key: 'username', width: 20 },
      { header: 'Vai trò', key: 'role', width: 12 },
      { header: 'Trạm chính', key: 'mainStation', width: 25 },
      { header: 'Trạm kỹ thuật', key: 'techStation', width: 25 },
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
        mainStation: u.techStation?.mainStation?.name || '',
        techStation: u.techStation?.name || '',
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
      'attachment; filename=' + encodeURIComponent('Danh_sach_KTV.xlsx')
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Export KTVs error', { error: error.message });
    res.status(500).json({ error: 'Lỗi xuất file Excel' });
  }
});

/**
 * GET /api/users
 * Danh sách tất cả users
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
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
      fullName, phoneNumber, password, isActive, role, techStationId,
      address, cccdNumber, cccdDate, cccdPlace, bankAccount, bankName, email,
      warehouseId, warehouseName, group, pancakeAccountName
    } = req.body;

    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    if (role !== undefined) {
      const validRoles = ['KTV', 'ADMIN', 'DEV', 'SALE_SUPERVISOR', 'SALER', 'HOTLINE', 'COORDINATOR', 'STAFF'];
      updateData.role = validRoles.includes(role) ? role : 'KTV';
    }
    
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

    if (password) {
      if (password.length < 4) {
        res.status(400).json({ error: 'Mật khẩu phải có ít nhất 4 ký tự' });
        return;
      }
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
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

    logger.info('User updated', { userId: id, by: req.user?.id });
    res.json({ user });
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

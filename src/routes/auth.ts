import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import logger from '../utils/logger';
import { requireAuth } from '../middleware/authSession';
import { sendPasswordResetEmail } from '../utils/emailService';

const router = Router();

/**
 * POST /api/auth/login
 * Đăng nhập bằng username + password
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Vui lòng nhập username và password' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase().trim() },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị vô hiệu hóa' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: 'Mật khẩu không đúng' });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET is not configured in environment');
      res.status(500).json({ error: 'Lỗi hệ thống' });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Set session cookie with JWT token (httpOnly, 7 ngày)
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.info('User logged in with JWT', { userId: user.id, username: user.username });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error: any) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ error: 'Lỗi đăng nhập' });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('session_token');
  res.json({ message: 'Đã đăng xuất' });
});

/**
 * GET /api/auth/me
 * Lấy thông tin user hiện tại đầy đủ từ Database
 */
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        email: true,
        phoneNumber: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy người dùng' });
      return;
    }

    res.json({ user });
  } catch (error: any) {
    logger.error('Get profile me error', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống' });
  }
});

/**
 * PUT /api/auth/profile
 * Cập nhật thông tin cá nhân (Họ tên, email, số điện thoại)
 */
router.put('/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { fullName, email, phoneNumber } = req.body;

    if (!fullName || !fullName.trim()) {
      res.status(400).json({ error: 'Họ và tên không được để trống' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        fullName: fullName.trim(),
        email: email ? email.trim() : null,
        phoneNumber: phoneNumber ? phoneNumber.trim() : null,
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        email: true,
        phoneNumber: true,
      },
    });

    logger.info('User updated their own profile', { userId: updatedUser.id });
    res.json({ message: 'Cập nhật thông tin cá nhân thành công', user: updatedUser });
  } catch (error: any) {
    logger.error('Update profile error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi cập nhật thông tin cá nhân' });
  }
});

/**
 * POST /api/auth/change-password
 * KTV hoặc Admin tự thay đổi mật khẩu của mình
 */
router.post('/change-password', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới' });
      return;
    }

    if (newPassword.length < 4) {
      res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 4 ký tự' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy người dùng' });
      return;
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
      return;
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    logger.info('Password changed by user', { userId: user.id });

    res.json({ message: 'Thay đổi mật khẩu thành công' });
  } catch (error: any) {
    logger.error('Change password error', { error: error.message });
    res.status(500).json({ error: 'Lỗi khi thay đổi mật khẩu' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Yêu cầu gửi email reset password
 */
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { usernameOrEmail } = req.body;

    if (!usernameOrEmail) {
      res.status(400).json({ error: 'Vui lòng nhập username hoặc email' });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: usernameOrEmail.toLowerCase().trim() },
          { email: { equals: usernameOrEmail.trim(), mode: 'insensitive' } },
        ],
      },
    });

    if (!user || !user.isActive) {
      res.status(404).json({ error: 'Không tìm thấy tài khoản hoạt động với thông tin này' });
      return;
    }

    if (!user.email) {
      res.status(400).json({ error: 'Tài khoản này chưa cấu hình email. Vui lòng liên hệ Admin để đặt lại mật khẩu.' });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET is not configured in environment');
      res.status(500).json({ error: 'Lỗi hệ thống' });
      return;
    }

    // Generate JWT token valid for 15 minutes, with signature containing passwordHash fragment for single-use logic
    const signature = user.passwordHash.substring(0, 15);
    const token = jwt.sign(
      { id: user.id, sig: signature },
      jwtSecret,
      { expiresIn: '15m' }
    );

    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const resetLink = `${appUrl}/reset-password?token=${token}`;

    const emailSent = await sendPasswordResetEmail(user.email, resetLink, user.fullName);
    if (!emailSent) {
      res.status(500).json({ error: 'Không thể gửi email. Vui lòng thử lại sau.' });
      return;
    }

    logger.info('Password reset request successful', { userId: user.id, email: user.email });
    res.json({ message: 'Đã gửi liên kết khôi phục mật khẩu vào email của bạn. Vui lòng kiểm tra hộp thư.' });
  } catch (error: any) {
    logger.error('Forgot password error', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi yêu cầu khôi phục mật khẩu' });
  }
});

/**
 * POST /api/auth/reset-password
 * Thực hiện đặt lại mật khẩu mới bằng reset token
 */
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({ error: 'Thiếu thông tin yêu cầu' });
      return;
    }

    if (newPassword.length < 4) {
      res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 4 ký tự' });
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
      decoded = jwt.verify(token, jwtSecret);
    } catch (err: any) {
      logger.warn('Invalid or expired reset token used', { error: err.message });
      res.status(400).json({ error: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' });
      return;
    }

    const { id, sig } = decoded;
    if (!id || !sig) {
      res.status(400).json({ error: 'Liên kết không hợp lệ' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, passwordHash: true, username: true },
    });

    if (!user) {
      res.status(404).json({ error: 'Người dùng không tồn tại' });
      return;
    }

    // Verify signature fragment (check if token was already used)
    const currentSignature = user.passwordHash.substring(0, 15);
    if (currentSignature !== sig) {
      res.status(400).json({ error: 'Liên kết này đã được sử dụng hoặc đã hết hiệu lực' });
      return;
    }

    // Hash new password and update
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    logger.info('Password reset successfully via email link', { userId: user.id, username: user.username });
    res.json({ message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' });
  } catch (error: any) {
    logger.error('Reset password error', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi đặt lại mật khẩu' });
  }
});

export default router;

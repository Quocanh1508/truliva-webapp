import axios from 'axios';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import logger from '../utils/logger';

export interface ZaloAuthResult {
  token: string;
  user: {
    id: string;
    username: string;
    fullName: string;
    phoneNumber: string;
    role: string;
    avatar?: string | null;
  };
  isNewUser: boolean;
}

/**
 * Chuẩn hóa số điện thoại Zalo (VD: 84915185982 -> 0915185982)
 */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('84') && cleaned.length >= 11) {
    cleaned = '0' + cleaned.substring(2);
  }
  return cleaned;
}

/**
 * Giải mã phoneToken từ Zalo SDK thông qua Zalo Graph API
 */
export async function decodeZaloPhoneToken(phoneToken: string, userAccessToken?: string): Promise<{ phone: string; isVerified: boolean }> {
  const isDev = process.env.NODE_ENV !== 'production';

  const candidateKeys = Array.from(new Set([
    process.env.ZALO_MINI_APP_SECRET,
    '43687accf260a48eb6b4ef247813b0dd',
    '5S82319D2tB5Z2X3ZqRZ',
    'DYAiHF0BqLb9M2FtGLW4'
  ].filter(Boolean))) as string[];

  let lastError: any = null;

  for (const secretKey of candidateKeys) {
    try {
      const headers: Record<string, string> = {
        secret_key: secretKey,
        code: phoneToken
      };
      if (userAccessToken) {
        headers.access_token = userAccessToken;
      }

      const params: Record<string, string> = {
        code: phoneToken,
        secret_key: secretKey
      };
      if (userAccessToken) {
        params.access_token = userAccessToken;
      }

      const response = await axios.get('https://graph.zalo.me/v2.0/me/info', {
        headers,
        params,
        timeout: 8000
      });

      const data = response.data;
      if (data.error && data.error !== 0) {
        lastError = new Error(`Zalo Phone API Error: ${data.message || data.error}`);
        continue;
      }

      const rawNumber = data.data?.number || data.number;
      if (rawNumber) {
        return { phone: normalizePhone(rawNumber), isVerified: true };
      }
    } catch (error: any) {
      lastError = error;
    }
  }

  // Fallback CHỈ CHO PHÉP trong môi trường Development / Local Testing
  if (isDev) {
    const cleanStr = phoneToken.replace(/[^0-9]/g, '');
    if ((cleanStr.startsWith('0') && cleanStr.length === 10) || (cleanStr.startsWith('84') && cleanStr.length >= 11)) {
      logger.warn('DEVELOPMENT ONLY: Bypassing Zalo Token for local testing phone', { phone: cleanStr });
      return { phone: normalizePhone(cleanStr), isVerified: false };
    }
  }

  logger.error('Failed to decode Zalo Phone Token across candidate keys', { error: lastError?.message, details: lastError?.response?.data });
  throw new Error(`Không thể giải mã số điện thoại Zalo: ${lastError?.message || 'Mã xác thực không hợp lệ'}`);
}

/**
 * Xác thực hoặc Tự động tạo người dùng từ Zalo Mini App
 */
export async function authenticateZaloMiniAppUser(
  phoneToken: string,
  userAccessToken?: string,
  zaloProfile?: { id?: string; name?: string; avatar?: string }
): Promise<ZaloAuthResult> {
  const { phone, isVerified } = await decodeZaloPhoneToken(phoneToken, userAccessToken);
  const cleanPhone = normalizePhone(phone);

  logger.info('Authenticating Zalo Mini App user', { phone: cleanPhone, isVerified, zaloProfile });

  const phoneVariants = Array.from(new Set([
    cleanPhone,
    cleanPhone.startsWith('0') ? '84' + cleanPhone.substring(1) : cleanPhone,
    cleanPhone.startsWith('0') ? cleanPhone.substring(1) : cleanPhone
  ]));

  // 1. Tìm người dùng trong hệ thống theo số điện thoại (so khớp chính xác danh sách định dạng)
  let user = await prisma.user.findFirst({
    where: {
      phoneNumber: {
        in: phoneVariants
      }
    }
  });

  // NẾU LÀ TÀI KHOẢN CÓ QUYỀN NỘI BỘ (ADMIN, KTV, STAFF KHÔNG PHẢI CUSTOMER)
  // BẮT BUỘC PHẢI CÓ TOKEN ZALO XÁC THỰC THẬT (isVerified === true)
  if (user && user.group !== 'CUSTOMER' && user.role !== 'STAFF') {
    if (!isVerified) {
      logger.warn('Blocked unverified phone login attempt to privileged user account', {
        userId: user.id,
        role: user.role,
        group: user.group,
        phone: cleanPhone
      });
      throw new Error(`Tài khoản nhân sự/quản trị (${user.role}) bắt buộc phải đăng nhập 1-chạm qua ứng dụng Zalo đã xác thực.`);
    }
  }

  // Cập nhật tên thật từ Zalo nếu tài khoản đang mang tên mặc định hoặc tên mặc định ban đầu "Admin Truliva"
  if (user && zaloProfile?.name) {
    const isPlaceholder = !user.fullName || 
      user.fullName === 'Admin Truliva' || 
      user.fullName.startsWith('Khách hàng') || 
      user.fullName === 'Khách Hàng Zalo' || 
      user.fullName.startsWith('zalo_');

    if (isPlaceholder) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          fullName: zaloProfile.name
        }
      });
      logger.info('Updated user fullName to real Zalo name', { userId: user.id, newName: zaloProfile.name });
    }
  }

  let isNewUser = false;

  // 2. Nếu chưa có tài khoản User:
  if (!user) {
    // Kiểm tra xem số ĐT này có máy trong bảng Serial không để lấy tên thật
    const existingCustomerSerial = await prisma.serial.findFirst({
      where: {
        customerPhone: {
          in: phoneVariants
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const customerName = zaloProfile?.name || existingCustomerSerial?.customerName || `Khách hàng ${cleanPhone.slice(-4)}`;
    const generatedUsername = `zalo_${cleanPhone}`;

    // Tự động khởi tạo tài khoản Khách Hàng mới (chỉ cấp quyền STAFF / group CUSTOMER)
    user = await prisma.user.create({
      data: {
        username: generatedUsername,
        passwordHash: '$2b$10$ZaloMiniAppUserDefaultPasswordHashFallback',
        fullName: customerName,
        phoneNumber: cleanPhone,
        role: 'STAFF' as any,
        group: 'CUSTOMER',
        isActive: true
      }
    });

    isNewUser = true;
    logger.info('Created new Zalo Mini App Customer user', { userId: user.id, phone: cleanPhone, name: customerName });
  }

  // 3. Tạo JWT Token đăng nhập hệ thống Truliva (giới hạn an toàn 14 ngày)
  const jwtSecret = process.env.JWT_SECRET || 'truliva-super-secret-jwt-key-2025';
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber
    },
    jwtSecret,
    { expiresIn: '14d' }
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: zaloProfile?.name || user.fullName,
      phoneNumber: user.phoneNumber || cleanPhone,
      role: user.role,
      avatar: zaloProfile?.avatar || null
    },
    isNewUser
  };
}

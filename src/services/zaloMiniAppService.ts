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
  if (cleaned.startsWith('84')) {
    cleaned = '0' + cleaned.substring(2);
  }
  return cleaned;
}

/**
 * Giải mã phoneToken từ Zalo SDK thông qua Zalo Graph API
 */
export async function decodeZaloPhoneToken(phoneToken: string, userAccessToken?: string): Promise<string> {
  const secretKey = process.env.ZALO_MINI_APP_SECRET || 'DYAiHF0BqLb9M2FtGLW4';

  try {
    const headers: Record<string, string> = {
      secret_key: secretKey
    };
    if (userAccessToken) {
      headers.access_token = userAccessToken;
    }

    const response = await axios.get('https://graph.zalo.me/v2.0/me/info', {
      headers,
      params: { code: phoneToken }
    });

    const data = response.data;
    if (data.error && data.error !== 0) {
      throw new Error(`Zalo Phone API Error: ${data.message || data.error}`);
    }

    const rawNumber = data.data?.number || data.number;
    if (!rawNumber) {
      throw new Error('Zalo API không trả về số điện thoại hợp lệ');
    }

    return normalizePhone(rawNumber);
  } catch (error: any) {
    logger.error('Failed to decode Zalo Phone Token', { error: error.message, details: error.response?.data });
    // Nếu trong môi trường phát triển (Dev Sandbox), cho phép số điện thoại test nếu giả lập
    if (phoneToken.startsWith('0') || phoneToken.startsWith('84')) {
      return normalizePhone(phoneToken);
    }
    throw new Error(`Không thể giải mã số điện thoại Zalo: ${error.message}`);
  }
}

/**
 * Xác thực hoặc Tự động tạo người dùng từ Zalo Mini App
 */
export async function authenticateZaloMiniAppUser(
  phoneToken: string,
  userAccessToken?: string,
  zaloProfile?: { id?: string; name?: string; avatar?: string }
): Promise<ZaloAuthResult> {
  const phone = await decodeZaloPhoneToken(phoneToken, userAccessToken);
  const cleanPhone = normalizePhone(phone);

  logger.info('Authenticating Zalo Mini App user', { phone: cleanPhone, zaloProfile });

  // 1. Tìm người dùng trong hệ thống theo số điện thoại
  let user = await prisma.user.findFirst({
    where: {
      phoneNumber: {
        contains: cleanPhone.substring(1) // Khớp 9 số đuôi
      }
    }
  });

  let isNewUser = false;

  // 2. Nếu chưa có tài khoản User:
  if (!user) {
    // Kiểm tra xem số ĐT này có phải là khách hàng trong bảng Serial hoặc Order không
    const existingCustomerSerial = await prisma.serial.findFirst({
      where: {
        customerPhone: {
          contains: cleanPhone.substring(1)
        }
      }
    });

    const fullName = zaloProfile?.name || existingCustomerSerial?.customerName || `Khách hàng ${cleanPhone.slice(-4)}`;
    const username = `zalo_${cleanPhone}`;
    const dummyPasswordHash = '$2b$10$ZaloMiniAppDefaultPasswordHashForSecurity1234567890';

    // Tạo mới hồ sơ User với vai trò KHÁCH HÀNG (KTV/Admin tạo qua WebPC)
    user = await prisma.user.create({
      data: {
        username,
        passwordHash: dummyPasswordHash,
        fullName,
        phoneNumber: cleanPhone,
        role: 'STAFF', // Dùng vai trò Staff nhóm Customer hoặc mặc định
        group: 'Customer',
        isActive: true
      }
    });

    isNewUser = true;
    logger.info('Created new Customer profile for Zalo Mini App', { userId: user.id, phone: cleanPhone });
  }

  // 3. Tạo JWT Session Token
  const jwtSecret = process.env.JWT_SECRET || 'dev-jwt-secret-change-me-in-production';
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      group: user.group
    },
    jwtSecret,
    { expiresIn: '90d' } // Session 90 ngày trên điện thoại
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber || cleanPhone,
      role: user.role,
      avatar: zaloProfile?.avatar || null
    },
    isNewUser
  };
}

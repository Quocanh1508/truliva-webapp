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
export async function decodeZaloPhoneToken(phoneToken: string, userAccessToken?: string): Promise<string> {
  // 1. Kiểm tra nếu phoneToken đã là số điện thoại thuần (VD: 0915185982 hoặc 84915185982)
  const cleanStr = phoneToken.replace(/[^0-9]/g, '');
  if ((cleanStr.startsWith('0') && cleanStr.length === 10) || (cleanStr.startsWith('84') && cleanStr.length === 11)) {
    return normalizePhone(cleanStr);
  }

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
        params
      });

      const data = response.data;
      if (data.error && data.error !== 0) {
        lastError = new Error(`Zalo Phone API Error: ${data.message || data.error}`);
        continue;
      }

      const rawNumber = data.data?.number || data.number;
      if (rawNumber) {
        return normalizePhone(rawNumber);
      }
    } catch (error: any) {
      lastError = error;
    }
  }

  logger.error('Failed to decode Zalo Phone Token across candidate keys', { error: lastError?.message, details: lastError?.response?.data });
  // Nếu truyền chuỗi số điện thoại test/fallback
  if (phoneToken.length >= 9 && !isNaN(Number(phoneToken))) {
    return normalizePhone(phoneToken);
  }
  throw new Error(`Không thể giải mã số điện thoại Zalo: ${lastError?.message || 'secret_key is invalid'}`);
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

    const customerName = zaloProfile?.name || existingCustomerSerial?.customerName || `Khách hàng ${cleanPhone.substring(6)}`;
    const generatedUsername = `zalo_${cleanPhone}`;

    // Tự động khởi tạo tài khoản Khách Hàng mới
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
    logger.info('Created new Zalo Mini App Customer user', { userId: user.id, phone: cleanPhone });
  }

  // 3. Tạo JWT Token đăng nhập hệ thống Truliva
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
    { expiresIn: '90d' }
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber || cleanPhone,
      role: user.role
    },
    isNewUser
  };
}

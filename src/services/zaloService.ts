import axios from 'axios';
import prisma from '../config/database';
import logger from '../utils/logger';

export interface ZnsTemplateData {
  customer_name: string;
  product_name: string;
  serial_number: string;
  expiry_date: string;
  [key: string]: string; // For additional dynamic parameters
}

/**
 * Lấy hoặc tạo cấu hình Zalo OA duy nhất từ Database
 */
export async function getZaloConfig() {
  let config = await prisma.zaloConfig.findFirst();

  if (!config) {
    const appId = process.env.ZALO_APP_ID || '';
    const appSecret = process.env.ZALO_APP_SECRET || '';
    const oaId = process.env.ZALO_OA_ID || '';

    config = await prisma.zaloConfig.create({
      data: {
        appId,
        appSecret,
        oaId,
      }
    });
    logger.info('Created new ZaloConfig record in DB using environment variables');
  }

  return config;
}

/**
 * Cập nhật thông tin cấu hình Zalo OA
 */
export async function updateZaloConfig(data: {
  appId?: string;
  appSecret?: string;
  oaId?: string;
}) {
  const config = await getZaloConfig();
  return prisma.zaloConfig.update({
    where: { id: config.id },
    data
  });
}

/**
 * Đổi authorization_code lấy access_token & refresh_token
 */
export async function exchangeAuthorizationCode(code: string): Promise<any> {
  const config = await getZaloConfig();

  if (!config.appId || !config.appSecret) {
    throw new Error('Cấu hình Zalo OA thiếu App ID hoặc App Secret');
  }

  const params = new URLSearchParams();
  params.append('code', code);
  params.append('app_id', config.appId);
  params.append('grant_type', 'authorization_code');

  logger.info('Exchanging Zalo authorization code for tokens', { appId: config.appId });

  try {
    const response = await axios.post('https://oauth.zalo.me/v4/oa/access_token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': config.appSecret
      }
    });

    const data = response.data;
    if (data.error) {
      throw new Error(`Zalo OAuth Error: ${data.error_name || data.error} - ${data.error_description}`);
    }

    const { access_token, refresh_token, expires_in } = data;
    const tokenExpiredAt = new Date(Date.now() + parseInt(expires_in, 10) * 1000);

    const updatedConfig = await prisma.zaloConfig.update({
      where: { id: config.id },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiredAt
      }
    });

    logger.info('Zalo OA linked and tokens saved successfully', { tokenExpiredAt });
    return updatedConfig;
  } catch (error: any) {
    logger.error('Error exchanging Zalo OAuth code', { error: error.message, details: error.response?.data });
    throw error;
  }
}

/**
 * Lấy Access Token hợp lệ, tự động làm mới bằng refresh_token nếu sắp hết hạn
 */
export async function getValidAccessToken(): Promise<string> {
  const config = await getZaloConfig();

  if (!config.accessToken) {
    throw new Error('Chưa kết nối Zalo OA. Vui lòng liên kết tài khoản trước.');
  }

  const isExpired = !config.tokenExpiredAt || new Date(config.tokenExpiredAt).getTime() - Date.now() < 5 * 60 * 1000; // Hết hạn hoặc còn dưới 5 phút

  if (!isExpired) {
    return config.accessToken;
  }

  if (!config.refreshToken) {
    throw new Error('Access token đã hết hạn và thiếu Refresh token. Vui lòng liên kết lại Zalo OA.');
  }

  logger.info('Zalo access token is expired or expiring soon, refreshing...', { appId: config.appId });

  const params = new URLSearchParams();
  params.append('refresh_token', config.refreshToken);
  params.append('app_id', config.appId);
  params.append('grant_type', 'refresh_token');

  try {
    const response = await axios.post('https://oauth.zalo.me/v4/oa/access_token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': config.appSecret
      }
    });

    const data = response.data;
    if (data.error) {
      throw new Error(`Zalo Token Refresh Error: ${data.error_name || data.error} - ${data.error_description}`);
    }

    const { access_token, refresh_token, expires_in } = data;
    const tokenExpiredAt = new Date(Date.now() + parseInt(expires_in, 10) * 1000);

    await prisma.zaloConfig.update({
      where: { id: config.id },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiredAt
      }
    });

    logger.info('Zalo access token refreshed successfully', { tokenExpiredAt });
    return access_token;
  } catch (error: any) {
    logger.error('Error refreshing Zalo access token', { error: error.message, details: error.response?.data });
    throw new Error(`Không thể tự động gia hạn kết nối Zalo OA: ${error.message}. Vui lòng thực hiện liên kết lại.`);
  }
}

/**
 * Chuẩn hóa số điện thoại theo chuẩn quốc tế của Zalo (ví dụ: 0912345678 -> 84912345678)
 */
export function formatZaloPhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '84' + cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Gửi tin nhắn ZNS xác nhận kích hoạt bảo hành
 */
export async function sendZnsWarrantyActivation(serialNumber: string, recipientPhone: string): Promise<any> {
  const cleanSerial = serialNumber.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
  const formattedPhone = formatZaloPhone(recipientPhone.trim());
  const templateId = process.env.ZALO_ZNS_TEMPLATE_ID || '';

  if (!templateId || templateId === 'YOUR_APPROVED_TEMPLATE_ID') {
    logger.warn('Chưa cấu hình ZALO_ZNS_TEMPLATE_ID trong .env. Tin nhắn ZNS sẽ giả lập gửi thành công.');
    return { success: true, message: '[Simulation] ZNS sent successfully (Template ID not configured)' };
  }

  // 1. Lấy thông tin bảo hành của Serial từ DB
  const serial = await prisma.serial.findUnique({
    where: { serialNumber: cleanSerial }
  });

  if (!serial) {
    throw new Error(`Không tìm thấy số Serial ${cleanSerial} trên hệ thống`);
  }

  const customerName = serial.customerName || 'Quý Khách';
  const productName = serial.productLine || serial.model || 'Máy lọc nước Truliva';
  
  let expiryDateStr = '';
  if (serial.warrantyExpiryDate) {
    const d = new Date(serial.warrantyExpiryDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    expiryDateStr = `${day}/${month}/${year}`;
  } else {
    const d = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    expiryDateStr = `${day}/${month}/${year}`;
  }

  // 2. Kiểm tra nếu có cấu hình cổng FNS (FPT Notification Service)
  const fnsAppId = process.env.FNS_APP_ID || '';
  const fnsSecretKey = process.env.FNS_SECRET_KEY || '';

  if (fnsAppId && fnsSecretKey) {
    // Dữ liệu gửi chuẩn cho FNS Template 10232 (chỉ gửi các biến chính xác mà Template yêu cầu)
    const fnsPayload = {
      phone: formattedPhone,
      template_id: templateId,
      template_data: {
        Ten_Khach_Hang: customerName,
        Ten_San_Pham: productName,
        So_Seri: cleanSerial,
        Ngay_Het_Bao_Hanh: expiryDateStr
      },
      ref_id: `${cleanSerial}-${Date.now()}`
    };

    logger.info('Sending ZNS warranty activation message via FNS API', { phone: formattedPhone, templateId, fnsAppId });
    const startTime = Date.now();

    try {
      const response = await axios.post('https://api-fns.fpt.work/api/send-message', fnsPayload, {
        headers: {
          'Content-Type': 'application/json',
          'app-id': fnsAppId,
          'secret-key': fnsSecretKey
        }
      });

      const data = response.data;
      if (data.code !== 1) {
        throw new Error(`FNS Send Error: ${data.message} (Code: ${data.code})`);
      }

      const durationMs = Date.now() - startTime;
      logger.info('ZNS message sent successfully via FNS API', { refId: fnsPayload.ref_id, messageId: data.data?.message_id, durationMs: `${durationMs}ms` });
      return data;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      logger.error('Error sending ZNS message via FNS API', { error: error.message, details: error.response?.data, durationMs: `${durationMs}ms` });
      throw new Error(`Gửi ZNS qua FNS thất bại: ${error.message}`);
    }
  }

  // 3. Fallback: Lấy Access Token hợp lệ của Zalo trực tiếp nếu không dùng FNS
  const accessToken = await getValidAccessToken();

  // 4. Chuẩn bị dữ liệu gửi (Zalo OpenAPI)
  const payload = {
    phone: formattedPhone,
    template_id: templateId,
    template_data: {
      Ten_Khach_Hang: customerName,
      Ten_San_Pham: productName,
      So_Seri: cleanSerial,
      Ngay_Het_Bao_Hanh: expiryDateStr
    },
    tracking_id: `${cleanSerial}-${Date.now()}`
  };

  logger.info('Sending ZNS warranty activation message via Zalo Direct API', { phone: formattedPhone, templateId });
  const startTimeDirect = Date.now();

  try {
    const response = await axios.post('https://business.openapi.zalo.me/message/template', payload, {
      headers: {
        'Content-Type': 'application/json',
        'access_token': accessToken
      }
    });

    const data = response.data;
    if (data.error) {
      throw new Error(`Zalo ZNS Send Error: ${data.message} (Code: ${data.error})`);
    }

    const durationMs = Date.now() - startTimeDirect;
    logger.info('ZNS message sent successfully via Zalo Direct API', { trackingId: payload.tracking_id, messageId: data.data?.message_id, durationMs: `${durationMs}ms` });
    return data;
  } catch (error: any) {
    const durationMs = Date.now() - startTimeDirect;
    logger.error('Error sending ZNS message via Zalo Direct API', { error: error.message, details: error.response?.data, durationMs: `${durationMs}ms` });
    throw error;
  }
}

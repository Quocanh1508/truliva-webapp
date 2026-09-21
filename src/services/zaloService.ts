import axios from 'axios';
import prisma from '../config/database';
import logger from '../utils/logger';
import { isSandboxEnvironment, logSandboxBlockedAction } from '../utils/sandboxGuard';

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
export async function sendZnsWarrantyActivation(
  serialNumber: string, 
  recipientPhone: string,
  warrantyMonths: number = 12,
  options?: {
    customerName?: string;
    productName?: string;
    expiryDateStr?: string;
    gatewayMode?: 'AUTO' | 'ZALO_DIRECT' | 'FNS_GATEWAY';
  }
): Promise<any> {
  const cleanSerial = serialNumber.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
  const formattedPhone = formatZaloPhone(recipientPhone.trim());
  const zaloTemplateId = process.env.ZALO_ZNS_TEMPLATE_ID || '617366';
  const fnsTemplateId = Number(process.env.FNS_TEMPLATE_ID_LAP_DAT || '10232');
  const fnsAppId = process.env.FNS_APP_ID || '';
  const fnsSecretKey = process.env.FNS_SECRET_KEY || '';
  const gatewayMode = options?.gatewayMode || 'AUTO';

  if (!zaloTemplateId || zaloTemplateId === 'YOUR_APPROVED_TEMPLATE_ID') {
    logger.warn('Chưa cấu hình ZALO_ZNS_TEMPLATE_ID trong .env. Tin nhắn ZNS sẽ giả lập gửi thành công.');
    return { success: true, message: '[Simulation] ZNS sent successfully (Template ID not configured)' };
  }

  // 1. Lấy thông tin bảo hành của Serial từ DB (nếu có)
  const serial = await prisma.serial.findUnique({
    where: { serialNumber: cleanSerial }
  });

  const customerName = options?.customerName || serial?.customerName || 'Quý Khách';
  const productName = options?.productName || serial?.productLine || serial?.model || (warrantyMonths === 3 ? 'Lõi lọc nước Truliva' : 'Máy lọc nước Truliva');
  
  let expiryDateStr = '';
  if (warrantyMonths === 3) {
    // Với ca thay lọc, thời hạn bảo hành lõi lọc luôn tính riêng 3 tháng kể từ thời điểm thực hiện
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    expiryDateStr = `${day}/${month}/${year}`;
  } else if (serial?.warrantyExpiryDate) {
    // Luôn ưu tiên lấy ngày hết hạn thực tế từ Database (đã được tính chính xác gồm cả Tiêu chuẩn POS + Khuyến mãi)
    const d = new Date(serial.warrantyExpiryDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    expiryDateStr = `${day}/${month}/${year}`;
  } else if (options?.expiryDateStr) {
    expiryDateStr = options.expiryDateStr;
  } else {
    // Tự động cộng N tháng kể từ ngày hoàn thành / ngày kích hoạt
    const d = new Date();
    d.setMonth(d.getMonth() + warrantyMonths);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    expiryDateStr = `${day}/${month}/${year}`;
  }

  // Template data cho Zalo Direct OpenAPI (Template 617366)
  const zaloTemplateData = {
    _TEN_KHACH_HANG_: customerName.substring(0, 30),
    _TEN_SAN_PHAM_: productName.substring(0, 200),
    _ID_BAO_HANH_: cleanSerial.substring(0, 30),
    _NGAY_BAO_HANH_: expiryDateStr.substring(0, 30),
    _TEN_: customerName.substring(0, 30),
    _SO_SERI_: cleanSerial.substring(0, 30),
    _NGAY_HET_BAO_HANH_: expiryDateStr.substring(0, 30),

    TEN_KHACH_HANG: customerName,
    TEN_SAN_PHAM: productName,
    ID_BAO_HANH: cleanSerial,
    NGAY_BAO_HANH: expiryDateStr,
    SO_SERI: cleanSerial,
    NGAY_HET_BAO_HANH: expiryDateStr,

    Ten_Khach_Hang: customerName,
    Ten_San_Pham: productName,
    Id_Bao_Hanh: cleanSerial,
    Ngay_Bao_Hanh: expiryDateStr,
    So_Seri: cleanSerial,
    Ngay_Het_Bao_Hanh: expiryDateStr,

    ten_khach_hang: customerName,
    ten_san_pham: productName,
    so_seri: cleanSerial,
    ngay_het_bao_hanh: expiryDateStr,

    customer_name: customerName,
    product_name: productName,
    code: cleanSerial,
    serial_number: cleanSerial,
    expiry_date: expiryDateStr,
    time: expiryDateStr,
    date: expiryDateStr,

    _CUSTOMER_NAME_: customerName,
    _PRODUCT_NAME_: productName,
    _CODE_: cleanSerial,
    _SERIAL_NUMBER_: cleanSerial,
    _EXPIRY_DATE_: expiryDateStr,
    _TIME_: expiryDateStr
  };

  // Template data chuẩn hóa cho FPT FNS Gateway (Template 10232 - DỊCH VỤ LẮP ĐẶT)
  const fnsTemplateData = {
    Ten_Khach_Hang: customerName.substring(0, 30),
    Ten_San_Pham: productName.substring(0, 200),
    So_Seri: cleanSerial.substring(0, 30),
    Ngay_Het_Bao_Hanh: expiryDateStr.substring(0, 30)
  };

  // ═══ CHỐT CHẶN SANDBOX: TUYỆT ĐỐI KHÔNG GỬI TIN NHẮN ZNS / FNS THẬT RA BÊN NGOÀI ═══
  if (isSandboxEnvironment()) {
    logSandboxBlockedAction('sendZnsWarrantyActivation', {
      phone: formattedPhone,
      serialNumber: cleanSerial,
      customerName,
      productName,
      templateId: zaloTemplateId
    });

    const mockMsgId = `SANDBOX_MOCK_${Date.now()}`;
    try {
      await prisma.znsMessageLog.create({
        data: {
          messageId: mockMsgId,
          phone: formattedPhone,
          serialNumber: cleanSerial,
          customerName,
          productName,
          templateId: zaloTemplateId,
          status: 'SUCCESS',
          sentAt: new Date(),
          durationMs: '1ms',
          gateway: 'Sandbox Mock (Blocked External Dispatch)',
          rawData: { simulated: true, environment: 'SANDBOX', note: 'ZNS blocked and simulated in sandbox environment' }
        }
      });
    } catch (dbErr: any) {
      logger.warn('Failed to write mock ZnsMessageLog in sandbox', { error: dbErr.message });
    }

    return {
      success: true,
      message: '[SANDBOX MOCK] ZNS message simulated successfully (Blocked real external dispatch)',
      data: { message_id: mockMsgId },
      trackingId: `${cleanSerial}-${Date.now()}`
    };
  }

  // Helper hàm gửi tin qua FPT FNS Gateway
  const sendViaFnsGateway = async (isFallback: boolean = false, primaryErrorMsg?: string) => {
    if (!fnsAppId || !fnsSecretKey) {
      throw new Error('Chưa cấu hình cổng FPT FNS Gateway (FNS_APP_ID / FNS_SECRET_KEY) trong file .env');
    }

    const fnsPayload = {
      phone: formattedPhone,
      template_id: fnsTemplateId,
      template_data: fnsTemplateData,
      ref_id: `${isFallback ? 'FB-' : ''}${cleanSerial}-${Date.now()}`
    };

    logger.info(`Sending ZNS warranty activation message via FNS Gateway ${isFallback ? '(FALLBACK MODE)' : ''}`, {
      phone: formattedPhone,
      templateId: fnsTemplateId,
      fnsAppId,
      isFallback
    });

    const startTimeFns = Date.now();
    const response = await axios.post('https://api-fns.fpt.work/api/send-message', fnsPayload, {
      headers: {
        'Content-Type': 'application/json',
        'app-id': fnsAppId,
        'secret-key': fnsSecretKey
      },
      timeout: 10000
    });

    const data = response.data;
    if (data.code !== 1) {
      throw new Error(`FNS API Error: ${data.message || 'Mã lỗi FNS không thành công'} (Code: ${data.code})`);
    }

    const durationMs = Date.now() - startTimeFns;
    const gatewayName = isFallback ? 'FPT FNS Gateway (Fallback)' : 'FPT FNS Gateway';

    logger.info(`ZNS message sent successfully via ${gatewayName}`, {
      phone: formattedPhone,
      serialNumber: cleanSerial,
      templateId: fnsTemplateId,
      messageId: data.data?.message_id,
      durationMs: `${durationMs}ms`,
      isFallback
    });

    try {
      await prisma.znsMessageLog.create({
        data: {
          messageId: data.data?.message_id || null,
          phone: formattedPhone,
          serialNumber: cleanSerial,
          customerName,
          productName,
          templateId: String(fnsTemplateId),
          status: 'SUCCESS',
          durationMs: `${durationMs}ms`,
          gateway: gatewayName,
          sentAt: new Date(),
          rawData: {
            fnsData: data,
            isFallback,
            primaryError: primaryErrorMsg || null
          }
        }
      });
    } catch (dbErr: any) {
      logger.warn('Failed to save ZnsMessageLog to DB', { error: dbErr.message });
    }

    return {
      ...data,
      gateway: gatewayName,
      isFallback,
      templateId: fnsTemplateId
    };
  };

  // ─────────────────────────────────────────────────────────────
  // NẾU CHỈ ĐỊNH CHỈ GỬI QUA FNS (FNS_GATEWAY)
  // ─────────────────────────────────────────────────────────────
  if (gatewayMode === 'FNS_GATEWAY') {
    return await sendViaFnsGateway(false);
  }

  // ─────────────────────────────────────────────────────────────
  // KÊNH 1 (PRIMARY): GỬI QUA ZALO DIRECT OPENAPI (TEMPLATE 617366)
  // ─────────────────────────────────────────────────────────────
  let primaryError: any = null;
  const startTimeDirect = Date.now();

  try {
    const accessToken = await getValidAccessToken();
    const payload = {
      phone: formattedPhone,
      template_id: zaloTemplateId,
      template_data: zaloTemplateData,
      tracking_id: `${cleanSerial}-${Date.now()}`
    };

    logger.info('Sending ZNS warranty activation message via Zalo Direct API (Primary Channel)', {
      phone: formattedPhone,
      templateId: zaloTemplateId
    });

    const response = await axios.post('https://business.openapi.zalo.me/message/template', payload, {
      headers: {
        'Content-Type': 'application/json',
        'access_token': accessToken
      },
      timeout: 10000
    });

    const data = response.data;
    if (data.error && data.error !== 0) {
      throw new Error(`Zalo ZNS Send Error: ${data.message} (Code: ${data.error})`);
    }

    const durationMs = Date.now() - startTimeDirect;
    logger.info('ZNS message sent successfully via Zalo Direct API', {
      phone: formattedPhone,
      serialNumber: cleanSerial,
      customerName,
      productName,
      templateId: payload.template_id,
      trackingId: payload.tracking_id,
      messageId: data.data?.message_id,
      durationMs: `${durationMs}ms`,
      status: 'SUCCESS'
    });

    // Lưu vào bảng ZnsMessageLog trong Database
    try {
      await prisma.znsMessageLog.create({
        data: {
          messageId: data.data?.message_id || null,
          phone: formattedPhone,
          serialNumber: cleanSerial,
          customerName,
          productName,
          templateId: payload.template_id,
          status: 'SUCCESS',
          durationMs: `${durationMs}ms`,
          gateway: 'Zalo Direct ZBS OpenAPI',
          sentAt: new Date(),
          rawData: data
        }
      });
    } catch (dbErr: any) {
      logger.warn('Failed to save ZnsMessageLog to DB', { error: dbErr.message });
    }

    return {
      ...data,
      gateway: 'Zalo Direct ZBS OpenAPI',
      isFallback: false,
      templateId: payload.template_id
    };
  } catch (err: any) {
    primaryError = err;
    const durationMs = Date.now() - startTimeDirect;
    logger.warn('Primary Channel (Zalo Direct API) failed, checking fallback...', {
      phone: formattedPhone,
      serialNumber: cleanSerial,
      error: err.message,
      details: err.response?.data,
      durationMs: `${durationMs}ms`
    });

    // Nếu chỉ định ZALO_DIRECT only thì không fallback
    if (gatewayMode === 'ZALO_DIRECT') {
      try {
        await prisma.znsMessageLog.create({
          data: {
            phone: formattedPhone,
            serialNumber: cleanSerial,
            customerName,
            productName,
            templateId: zaloTemplateId,
            status: 'FAILED',
            error: err.message,
            durationMs: `${durationMs}ms`,
            gateway: 'Zalo Direct ZBS OpenAPI',
            sentAt: new Date(),
            rawData: { error: err.message, details: err.response?.data }
          }
        });
      } catch (dbErr: any) {}
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // KÊNH 2 (FALLBACK): KÍCH HOẠT DỰ PHÒNG FPT FNS GATEWAY (TEMPLATE 10232)
  // ─────────────────────────────────────────────────────────────
  if (fnsAppId && fnsSecretKey) {
    try {
      logger.info('🚀 Kích hoạt Fallback sang FPT FNS Gateway (Template 10232)...', {
        phone: formattedPhone,
        serialNumber: cleanSerial,
        primaryError: primaryError?.message
      });

      return await sendViaFnsGateway(true, primaryError?.message || 'Zalo Direct failed');
    } catch (fnsErr: any) {
      logger.error('❌ Cả 2 kênh (Zalo Direct và FPT FNS Gateway Fallback) đều thất bại!', {
        phone: formattedPhone,
        serialNumber: cleanSerial,
        primaryError: primaryError?.message,
        fallbackError: fnsErr.message
      });

      try {
        await prisma.znsMessageLog.create({
          data: {
            phone: formattedPhone,
            serialNumber: cleanSerial,
            customerName,
            productName,
            templateId: `${zaloTemplateId} -> ${fnsTemplateId}`,
            status: 'FAILED',
            error: `Primary (Zalo Direct): ${primaryError?.message} | Fallback (FNS): ${fnsErr.message}`,
            durationMs: `${Date.now() - startTimeDirect}ms`,
            gateway: 'Zalo Direct + FPT FNS (Both Failed)',
            sentAt: new Date(),
            rawData: {
              primaryError: primaryError?.response?.data || primaryError?.message,
              fallbackError: fnsErr.response?.data || fnsErr.message
            }
          }
        });
      } catch (dbErr: any) {}

      throw new Error(`Gửi ZNS thất bại qua cả 2 cổng. Kênh 1: ${primaryError?.message}; Kênh dự phòng FNS: ${fnsErr.message}`);
    }
  }

  // Nếu không có FNS config, lưu log thất bại và ném lỗi Kênh 1
  try {
    await prisma.znsMessageLog.create({
      data: {
        phone: formattedPhone,
        serialNumber: cleanSerial,
        customerName,
        productName,
        templateId: zaloTemplateId,
        status: 'FAILED',
        error: primaryError?.message,
        durationMs: `${Date.now() - startTimeDirect}ms`,
        gateway: 'Zalo Direct ZBS OpenAPI (No Fallback Configured)',
        sentAt: new Date(),
        rawData: { error: primaryError?.message, details: primaryError?.response?.data }
      }
    });
  } catch (dbErr: any) {}

  throw primaryError;
}

// ══════════════════════════════════════════════════════════════════════════
//  ZALO OA ARTICLES ENGINE (CACHE & BATCH PAGINATION)
// ══════════════════════════════════════════════════════════════════════════
let cachedArticlesList: { timestamp: number; data: any[] } | null = null;
const ARTICLES_CACHE_TTL = 5 * 60 * 1000; // Cache 5 phút

const articleDetailCache = new Map<string, { timestamp: number; data: any }>();
const ARTICLE_DETAIL_CACHE_TTL = 15 * 60 * 1000; // Cache chi tiết 15 phút

/**
 * Lấy danh sách bài viết truyền thông công khai từ Zalo OA của Truliva
 * Zalo OpenAPI giới hạn tối đa 10 bài/lần gọi (/article/getslice), nên sử dụng batching song song để lấy đầy đủ.
 */
export async function getZaloOaArticles(offset: number = 0, limit: number = 50): Promise<any[]> {
  const now = Date.now();

  // 1. Kiểm tra bộ nhớ cache danh sách
  if (cachedArticlesList && (now - cachedArticlesList.timestamp) < ARTICLES_CACHE_TTL) {
    const list = cachedArticlesList.data;
    return list.slice(offset, offset + limit);
  }

  try {
    const accessToken = await getValidAccessToken();

    // 2. Gọi batch đầu tiên (offset=0, limit=10) để đọc total thực tế từ Zalo OA
    const firstRes = await axios.get('https://openapi.zalo.me/v2.0/article/getslice?offset=0&limit=10&type=normal', {
      headers: { 'access_token': accessToken },
      timeout: 8000
    });

    const firstData = firstRes.data;
    if (firstData.error === 0 && firstData.data && Array.isArray(firstData.data.medias)) {
      const total = typeof firstData.data.total === 'number' ? firstData.data.total : firstData.data.medias.length;
      let allRawMedias = [...firstData.data.medias];

      // 3. Nếu tổng số bài > 10, chạy batching song song (mỗi batch tối đa 10)
      const maxToFetch = Math.min(total, 60); // Lấy tối đa 60 bài gần nhất
      const batchPromises: Promise<any[]>[] = [];

      for (let batchOffset = 10; batchOffset < maxToFetch; batchOffset += 10) {
        const batchLimit = Math.min(10, maxToFetch - batchOffset);
        batchPromises.push(
          axios.get(`https://openapi.zalo.me/v2.0/article/getslice?offset=${batchOffset}&limit=${batchLimit}&type=normal`, {
            headers: { 'access_token': accessToken },
            timeout: 8000
          }).then(r => (r.data && r.data.error === 0 && r.data.data?.medias) ? r.data.data.medias : [])
            .catch(err => {
              logger.warn(`Failed fetching Zalo OA article batch at offset ${batchOffset}`, { error: err.message });
              return [];
            })
        );
      }

      if (batchPromises.length > 0) {
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(batch => {
          allRawMedias = allRawMedias.concat(batch);
        });
      }

      // 4. Map chuẩn hóa dữ liệu bài viết
      const mappedArticles = allRawMedias.map((m: any) => {
        const timestamp = m.create_date || m.created_time;
        const dateStr = timestamp 
          ? new Date(Number(timestamp)).toLocaleDateString('vi-VN')
          : 'Mới đăng';
        return {
          id: m.id,
          title: m.title,
          date: dateStr,
          views: m.total_view || 0,
          image: m.thumb || m.cover?.photo_url || 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=60',
          summary: m.description || m.summary || '',
          url: m.link_view || m.url || `https://post.oa.zalo.me/d/3870382725035413507?id=${m.id}&pageId=3870382725035413507`
        };
      });

      // 5. Lưu vào cache bộ nhớ
      cachedArticlesList = {
        timestamp: now,
        data: mappedArticles
      };

      logger.info(`Fetched and cached ${mappedArticles.length}/${total} articles from Zalo OA`);
      return mappedArticles.slice(offset, offset + limit);
    } else {
      logger.warn('Zalo OA getslice returned non-zero error or missing medias', { response: firstData });
    }
  } catch (err: any) {
    logger.warn('Could not fetch articles directly from Zalo OA API, falling back', { error: err.message });
  }

  // Nếu có cache cũ đã hết hạn, vẫn ưu tiên trả về cache cũ hơn là hardcoded
  if (cachedArticlesList && cachedArticlesList.data.length > 0) {
    return cachedArticlesList.data.slice(offset, offset + limit);
  }

  return CURATED_TRULIVA_ARTICLES;
}

/**
 * Lấy chi tiết nội dung bài viết từ Zalo OA theo ID (hỗ trợ cache chi tiết)
 */
export async function getZaloOaArticleDetail(articleId: string): Promise<any> {
  const now = Date.now();

  // 1. Kiểm tra cache bài viết chi tiết
  const cached = articleDetailCache.get(articleId);
  if (cached && (now - cached.timestamp) < ARTICLE_DETAIL_CACHE_TTL) {
    return cached.data;
  }

  try {
    const accessToken = await getValidAccessToken();
    const response = await axios.get(`https://openapi.zalo.me/v2.0/article/getdetail?id=${encodeURIComponent(articleId)}`, {
      headers: {
        'access_token': accessToken
      },
      timeout: 8000
    });

    const data = response.data;
    if (data.error === 0 && data.data) {
      const art = data.data;
      const timestamp = art.create_date || art.created_time;
      const dateStr = timestamp 
        ? new Date(Number(timestamp)).toLocaleDateString('vi-VN')
        : '';
      const detail = {
        id: art.id,
        title: art.title,
        date: dateStr,
        views: art.total_view || 0,
        image: art.cover?.photo_url || art.thumb || '',
        summary: art.description || '',
        body: art.body || [],
        actionLink: art.action_link || null,
        linkView: art.link_view || `https://post.oa.zalo.me/d/3870382725035413507?id=${art.id}&pageId=3870382725035413507`
      };

      // Lưu vào cache
      articleDetailCache.set(articleId, {
        timestamp: now,
        data: detail
      });

      return detail;
    }
  } catch (err: any) {
    logger.warn('Could not fetch article detail from Zalo OA API', { articleId, error: err.message });
  }

  // Fallback từ danh sách curated
  const curated = CURATED_TRULIVA_ARTICLES.find(a => a.id === articleId);
  if (curated) {
    return {
      id: curated.id,
      title: curated.title,
      date: curated.date,
      views: curated.views,
      image: curated.image,
      summary: curated.summary,
      content: curated.content,
      body: (curated.content || []).map((c: string) => ({ type: 'text', content: `<p>${c}</p>` })),
      linkView: curated.url || ''
    };
  }

  return null;
}


export const CURATED_TRULIVA_ARTICLES = [
    {
      id: 'zns-602994',
      templateId: '602994',
      title: 'THU CŨ ĐỔI MỚI – NÂNG CẤP MÁY LỌC NƯỚC',
      date: '13/07/2026',
      views: 1420,
      image: '/templates/zns_602994.png',
      summary: 'Chương trình trợ giá thu hồi máy lọc nước cũ bất kỳ lên đến 2.000.000 VNĐ khi nâng cấp lên dòng máy lọc nước thông minh Truliva.',
      content: [
        'Truliva trân trọng gửi tới Quý khách hàng chương trình "Thu Cũ Đổi Mới - Nâng Tầm Nguồn Nước Sạch".',
        'Áp dụng cho tất cả các dòng máy lọc nước cũ, hư hỏng hoặc không rõ nguồn gốc thuộc mọi thương hiệu trên thị trường.',
        'Khách hàng được hỗ trợ thu hồi máy cũ tận nhà và trợ giá trực tiếp khi nâng cấp lên dòng máy lọc nước Truliva Ro/Nano thế hệ mới.',
        'Miễn phí 100% công lắp đặt và kiểm tra đo chỉ số TDS nước đầu vào/đầu ra tận nhà bởi đội ngũ Kỹ thuật viên chính hãng Truliva.'
      ],
      url: ''
    },
    {
      id: 'zns-591923',
      templateId: '591923',
      title: 'ĐẾN HẠN THAY LỌC',
      date: '12/06/2026',
      views: 2850,
      image: '/templates/zns_591923.png',
      summary: 'Nhắc nhở chu kỳ thay thế lõi lọc định kỳ (PPC 3-6 tháng, CTO 6-9 tháng, RO 24-36 tháng) để đảm bảo chất lượng nước đạt chuẩn uống trực tiếp QCVN 6-1:2010/BYT.',
      content: [
        'Lõi lọc nước hoạt động như lá chắn bảo vệ sức khỏe cả gia đình bạn. Sau một thời gian dài giữ lại cặn bẩn, kim loại nặng và vi khuẩn, màng lọc sẽ bị bão hòa.',
        'Việc không thay lõi đúng hạn có thể khiến nước bị tái nhiễm khuẩn và làm giảm tuổi thọ của bơm cũng như màng lọc RO.',
        'Hãy kiểm tra chỉ số TDS hoặc liên hệ tổng đài Truliva 1900 638 463 để được KTV hỗ trợ kiểm tra và thay lõi chính hãng tận nhà.'
      ],
      url: ''
    },
    {
      id: 'zns-590478',
      templateId: '590478',
      title: 'CHIA SẺ NƯỚC SẠCH – RINH QUÀ XỊN CÙNG TRULIVA',
      date: '14/06/2026',
      views: 1890,
      image: '/templates/zns_590478.png',
      summary: 'Giới thiệu người thân, bạn bè sử dụng máy lọc nước Truliva để nhận ngay Voucher 300.000 VNĐ cùng bộ quà tặng lõi lọc cao cấp.',
      content: [
        'Lan tỏa nguồn nước tinh khiết đến cộng đồng cùng chương trình "Chia Sẻ Nước Sạch - Rinh Quà Xịn".',
        'Mỗi lượt giới thiệu thành công, Quý khách sẽ nhận ngay Voucher tiền mặt trừ trực tiếp vào đơn thay lõi hoặc mua sắm thiết bị mới.',
        'Người được giới thiệu cũng nhận ngay ưu đãi giảm 10% khi đăng ký lắp đặt máy mới qua Zalo Mini App.'
      ],
      url: ''
    },
    {
      id: 'zns-588834',
      templateId: '588834',
      title: 'BÍ QUYẾT GIỮ MÁY LỌC NƯỚC LAVITA LUÔN HOẠT ĐỘNG TỐT',
      date: '14/06/2026',
      views: 3120,
      image: '/templates/zns_588834.png',
      summary: 'Hướng dẫn sử dụng, bảo dưỡng máy lọc nước Lavita / Truliva đúng cách: Xả nước định kỳ, kiểm tra áp lực nước và vệ sinh vòi lấy nước.',
      content: [
        'Để máy lọc nước luôn hoạt động bền bỉ với công suất tối ưu, bạn cần lưu ý một số thói quen sử dụng hàng ngày.',
        '1. Không đặt máy ở nơi có ánh nắng trực tiếp chiếu vào hoặc gần nguồn nhiệt cao.',
        '2. Định kỳ xả sạch bình áp nếu gia đình không sử dụng nước trong nhiều ngày liên tục.',
        '3. Luôn duy trì nguồn điện và van cấp nước đầu vào ổn định để bảo vệ bơm tăng áp.'
      ],
      url: ''
    },
    {
      id: 'zns-581578',
      templateId: '581578',
      title: 'Thiết bị lọc tại vòi chỉ từ 700.000 vnd',
      date: '25/05/2026',
      views: 4210,
      image: '/templates/zns_581578.png',
      summary: 'Giải pháp lọc nước sinh hoạt nhỏ gọn lắp trực tiếp tại bồn rửa, loại bỏ 99% clo dư, cặn gỉ sét với chi phí siêu tiết kiệm chỉ từ 700.000đ.',
      content: [
        'Thiết bị lọc tại vòi Truliva là lựa chọn hoàn hảo cho nhu cầu rửa rau củ, nấu ăn và đánh răng rửa mặt sạch khuẩn.',
        'Lắp đặt cực kỳ đơn giản chỉ trong 3 phút, tương thích với 99% các loại vòi nước gia đình hiện nay.',
        'Thiết kế thân vỏ trong suốt giúp bạn dễ dàng theo dõi mức độ bám bẩn của lõi lọc và chủ động thay thế khi cần.'
      ],
      url: ''
    },
    {
      id: 'zns-580754',
      templateId: '580754',
      title: 'THƯ MỜI HỢP TÁC CÙNG TRULIVA',
      date: '21/05/2026',
      views: 2350,
      image: '/templates/zns_580754.png',
      summary: 'Chính sách chiết khấu hấp dẫn và hỗ trợ kỹ thuật toàn diện dành cho Đại lý, Trạm kỹ thuật và Cộng tác viên trên toàn quốc.',
      content: [
        'Truliva mở rộng mạng lưới phân phối và trạm dịch vụ kỹ thuật ủy quyền tại 63 tỉnh thành trên toàn quốc.',
        'Chính sách chiết khấu cao, đào tạo kỹ thuật chuyên sâu và cấp phát tài khoản phần mềm điều phối ca thông minh.',
        'Liên hệ ngay phòng phát triển đối tác qua Hotline 1900 638 463 để nhận hồ sơ và chính sách hợp tác chi tiết.'
      ],
      url: ''
    }
  ];


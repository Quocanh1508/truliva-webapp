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
export async function sendZnsWarrantyActivation(
  serialNumber: string, 
  recipientPhone: string,
  warrantyMonths: number = 12,
  options?: {
    customerName?: string;
    productName?: string;
    expiryDateStr?: string;
  }
): Promise<any> {
  const cleanSerial = serialNumber.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
  const formattedPhone = formatZaloPhone(recipientPhone.trim());
  const templateId = process.env.ZALO_ZNS_TEMPLATE_ID || '617366';

  if (!templateId || templateId === 'YOUR_APPROVED_TEMPLATE_ID') {
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
  if (options?.expiryDateStr) {
    expiryDateStr = options.expiryDateStr;
  } else if (warrantyMonths === 3) {
    // Với ca thay lọc, thời hạn bảo hành lõi lọc luôn tính riêng 3 tháng kể từ thời điểm thực hiện
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    expiryDateStr = `${day}/${month}/${year}`;
  } else if (serial?.warrantyExpiryDate) {
    const d = new Date(serial.warrantyExpiryDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    expiryDateStr = `${day}/${month}/${year}`;
  } else {
    // Tự động cộng N tháng kể từ ngày hoàn thành / ngày kích hoạt
    const d = new Date();
    d.setMonth(d.getMonth() + warrantyMonths);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    expiryDateStr = `${day}/${month}/${year}`;
  }

  // Common template data payload matching ZBS / ZNS approved Template 617366 & 617874
  const templateData = {
    // 1. Zalo ZBS Template 617366 exact parameters
    _TEN_KHACH_HANG_: customerName.substring(0, 30),
    _TEN_SAN_PHAM_: productName.substring(0, 200),
    _ID_BAO_HANH_: cleanSerial.substring(0, 30),
    _NGAY_BAO_HANH_: expiryDateStr.substring(0, 30),

    // Template 617874 param
    _TEN_: customerName.substring(0, 30),

    // Aliases with underscore
    _SO_SERI_: cleanSerial.substring(0, 30),
    _NGAY_HET_BAO_HANH_: expiryDateStr.substring(0, 30),

    // 2. Uppercase without leading/trailing underscore
    TEN_KHACH_HANG: customerName,
    TEN_SAN_PHAM: productName,
    ID_BAO_HANH: cleanSerial,
    NGAY_BAO_HANH: expiryDateStr,
    SO_SERI: cleanSerial,
    NGAY_HET_BAO_HANH: expiryDateStr,

    // 3. PascalCase / TitleCase format
    Ten_Khach_Hang: customerName,
    Ten_San_Pham: productName,
    Id_Bao_Hanh: cleanSerial,
    Ngay_Bao_Hanh: expiryDateStr,
    So_Seri: cleanSerial,
    Ngay_Het_Bao_Hanh: expiryDateStr,

    // 4. snake_case vietnamese
    ten_khach_hang: customerName,
    ten_san_pham: productName,
    so_seri: cleanSerial,
    ngay_het_bao_hanh: expiryDateStr,

    // 5. English snake_case
    customer_name: customerName,
    product_name: productName,
    code: cleanSerial,
    serial_number: cleanSerial,
    expiry_date: expiryDateStr,
    time: expiryDateStr,
    date: expiryDateStr,

    // 6. English uppercase underscore format
    _CUSTOMER_NAME_: customerName,
    _PRODUCT_NAME_: productName,
    _CODE_: cleanSerial,
    _SERIAL_NUMBER_: cleanSerial,
    _EXPIRY_DATE_: expiryDateStr,
    _TIME_: expiryDateStr
  };

  // 2. Kiểm tra nếu có cấu hình cổng FNS (FPT Notification Service)
  const fnsAppId = process.env.FNS_APP_ID || '';
  const fnsSecretKey = process.env.FNS_SECRET_KEY || '';

  if (fnsAppId && fnsSecretKey) {
    const fnsPayload = {
      phone: formattedPhone,
      template_id: templateId,
      template_data: templateData,
      ref_id: `${cleanSerial}-${Date.now()}`
    };

    logger.info('Sending ZBS/ZNS warranty activation message via FNS API', { phone: formattedPhone, templateId, fnsAppId });
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
      if (data.code === 1) {
        const durationMs = Date.now() - startTime;
        logger.info('ZBS/ZNS message sent successfully via FNS API', { refId: fnsPayload.ref_id, messageId: data.data?.message_id, durationMs: `${durationMs}ms` });
        return data;
      }
      logger.warn('FNS send returned error code, falling back to Zalo Direct OpenAPI', { code: data.code, message: data.message });
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      logger.warn('Error sending ZBS/ZNS message via FNS API, falling back to Zalo Direct OpenAPI', { error: error.message, details: error.response?.data, durationMs: `${durationMs}ms` });
    }
  }

  // 3. Fallback / Direct: Lấy Access Token hợp lệ của Zalo trực tiếp nếu FNS không gửi được hoặc không dùng FNS
  const accessToken = await getValidAccessToken();

  // 4. Chuẩn bị dữ liệu gửi (Zalo Direct OpenAPI - Dùng cho Template 617366)
  const payload = {
    phone: formattedPhone,
    template_id: templateId || '617366',
    template_data: templateData,
    tracking_id: `${cleanSerial}-${Date.now()}`
  };

  logger.info('Sending ZBS/ZNS warranty activation message via Zalo Direct API', { phone: formattedPhone, templateId });
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

/**
 * Lấy danh sách bài viết truyền thông công khai từ Zalo OA của Truliva
 */
export async function getZaloOaArticles(): Promise<any[]> {
  try {
    const accessToken = await getValidAccessToken();
    const response = await axios.get('https://openapi.zalo.me/v2.0/oa/article/getslice?offset=0&limit=10&type=normal', {
      headers: {
        'access_token': accessToken
      }
    });

    const data = response.data;
    if (data.error === 0 && data.data && data.data.medias && data.data.medias.length > 0) {
      return data.data.medias.map((m: any) => {
        const dateStr = m.created_time 
          ? new Date(Number(m.created_time)).toLocaleDateString('vi-VN')
          : 'Mới đăng';
        return {
          id: m.id,
          title: m.title,
          date: dateStr,
          views: m.total_view || 150,
          image: m.thumb || m.cover?.photo_url || 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=60',
          summary: m.description || m.summary || '',
          url: m.url || `https://oa.zalo.me/detail/article/${m.id}`
        };
      });
    }
  } catch (err: any) {
    logger.warn('Could not fetch articles directly from Zalo OA API, returning curated Truliva articles', { error: err.message });
  }

  // Curated Approved Communication Templates from Truliva Zalo OA
  return [
    {
      id: 'zns-602994',
      templateId: '602994',
      title: 'THU CŨ ĐỔI MỚI – NÂNG CẤP MÁY LỌC NƯỚC',
      date: '13/07/2026',
      views: 1420,
      image: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80',
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
      image: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=600&auto=format&fit=crop&q=80',
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
      image: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80',
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
      image: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=600&auto=format&fit=crop&q=80',
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
      image: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&auto=format&fit=crop&q=80',
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
      image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=600&auto=format&fit=crop&q=80',
      summary: 'Chính sách chiết khấu hấp dẫn và hỗ trợ kỹ thuật toàn diện dành cho Đại lý, Trạm kỹ thuật và Cộng tác viên trên toàn quốc.',
      content: [
        'Truliva mở rộng mạng lưới phân phối và trạm dịch vụ kỹ thuật ủy quyền tại 63 tỉnh thành trên toàn quốc.',
        'Chính sách chiết khấu cao, đào tạo kỹ thuật chuyên sâu và cấp phát tài khoản phần mềm điều phối ca thông minh.',
        'Liên hệ ngay phòng phát triển đối tác qua Hotline 1900 638 463 để nhận hồ sơ và chính sách hợp tác chi tiết.'
      ],
      url: ''
    }
  ];
}

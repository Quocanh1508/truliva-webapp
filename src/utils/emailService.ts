import nodemailer from 'nodemailer';
import logger from './logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '587', 10) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Gửi email chứa link reset mật khẩu cho người dùng
 * @param to Địa chỉ email người nhận
 * @param resetLink Đường dẫn để reset mật khẩu
 * @param fullName Tên đầy đủ của người nhận
 */
export const sendPasswordResetEmail = async (
  to: string,
  resetLink: string,
  fullName: string
): Promise<boolean> => {
  try {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      logger.error('SMTP credentials are not configured in environment. Cannot send email.');
      return false;
    }

    const smtpFromName = process.env.SMTP_FROM_NAME || 'Truliva System';
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    
    // HTML email template
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff; color: #333333;">
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #1B3A6B; padding-bottom: 16px;">
          <img src="${appUrl}/logo.png" alt="Truliva Logo" style="height: 50px; margin-bottom: 10px; display: inline-block;" />
          <h2 style="color: #1B3A6B; margin: 0; font-size: 22px;">Hệ thống Quản lý Truliva</h2>
        </div>
        
        <p>Xin chào <strong>${fullName}</strong>,</p>
        
        <p>Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản của bạn trên hệ thống Truliva.</p>
        
        <p style="margin-bottom: 24px;">Để đặt lại mật khẩu mới, vui lòng nhấn vào nút dưới đây (liên kết này có hiệu lực trong vòng <strong>15 phút</strong>):</p>
        
        <div style="text-align: center; margin-bottom: 28px;">
          <a href="${resetLink}" style="display: inline-block; padding: 12px 28px; background-color: #1B3A6B; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(27, 58, 107, 0.2); transition: background-color 0.2s;">Đặt lại mật khẩu</a>
        </div>
        
        <p style="color: #555555; font-size: 14px; line-height: 1.5;">Nếu nút trên không hoạt động, bạn có thể copy và dán liên kết dưới đây vào trình duyệt của mình:</p>
        <p style="word-break: break-all; color: #1B3A6B; font-size: 14px; background-color: #f5f5f5; padding: 12px; border-radius: 4px; border: 1px solid #e0e0e0; font-family: monospace;">${resetLink}</p>
        
        <div style="margin-top: 32px; border-top: 1px solid #e0e0e0; padding-top: 16px; font-size: 12px; color: #777777; text-align: center;">
          <p style="margin: 0 0 8px 0;">Nếu bạn không yêu cầu thay đổi này, bạn có thể an tâm bỏ qua email này.</p>
          <p style="margin: 0;">© ${new Date().getFullYear()} Truliva. All rights reserved.</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"${smtpFromName}" <${smtpUser}>`,
      to,
      subject: 'Yêu cầu khôi phục mật khẩu - Truliva System',
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info('Reset password email sent successfully', { messageId: info.messageId, to });
    return true;
  } catch (error: any) {
    logger.error('Failed to send reset password email', { error: error.message, to });
    return false;
  }
};

export interface PancakeCircuitBreakerAlertData {
  failureCount: number;
  maxFailures: number;
  isLocked: boolean;
  errorMessage: string;
  errorCode?: number | string;
  nextRetrySeconds?: number;
  recipientEmail?: string;
}

/**
 * Gửi email cảnh báo sự cố API Key Pancake và trạng thái Circuit Breaker
 */
export const sendPancakeCircuitBreakerAlertEmail = async (
  data: PancakeCircuitBreakerAlertData
): Promise<boolean> => {
  try {
    const to = data.recipientEmail || 'quocanh0815@gmail.com';
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpUser || !smtpPass) {
      logger.warn('[CircuitBreaker] SMTP credentials are not configured. Skipping email alert.', { to });
      return false;
    }

    const smtpFromName = process.env.SMTP_FROM_NAME || 'Truliva System Monitor';
    const appUrl = process.env.APP_URL || 'https://trulivaofficial.com';
    const isLocked = data.isLocked;

    const subject = isLocked
      ? `🚨 [KHẨN CẤP] Pancake API đã bị KHÓA CẦU CHÌ - Cần cập nhật API Key ngay!`
      : `⚠️ [CẢNH BÁO] Pancake API Key gặp sự cố (Lần thử ${data.failureCount}/${data.maxFailures})`;

    const statusBadge = isLocked
      ? `<span style="background-color: #EF4444; color: #ffffff; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">🔒 ĐÃ KHÓA CẦU CHÌ HOÀN TOÀN (LOCKED)</span>`
      : `<span style="background-color: #F59E0B; color: #ffffff; padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block;">⏳ ĐANG GIÃN CÁCH THỬ LẠI (Lần ${data.failureCount}/${data.maxFailures})</span>`;

    const nextActionDesc = isLocked
      ? `Toàn bộ các tác vụ gọi nền sang Pancake POS đã <strong>TẠM DỪNG HOÀN TOÀN</strong> để bảo vệ địa chỉ IP máy chủ (VPS 221.132.21.42) không bị đối tác đưa vào danh sách đen. Hệ thống đang chờ bạn cập nhật API Key mới.`
      : `Hệ thống sẽ tạm hoãn và thử lại lần kế tiếp sau <strong>${Math.round((data.nextRetrySeconds || 60) / 60)} phút</strong> (hoặc ${data.nextRetrySeconds}s). Nếu tiếp tục thất bại đủ ${data.maxFailures} lần, cầu chì sẽ khóa hẳn.`;

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
        <div style="border-bottom: 2px solid #1B3A6B; padding-bottom: 16px; margin-bottom: 20px; text-align: center;">
          <h2 style="color: #1B3A6B; margin: 0 0 6px 0; font-size: 22px;">🛡️ TRULIVA SYSTEM MONITOR</h2>
          <p style="margin: 0; color: #64748b; font-size: 14px;">Giám sát & Bảo vệ Kết nối Pancake POS API</p>
        </div>

        <div style="margin-bottom: 20px; text-align: center;">
          ${statusBadge}
        </div>

        <p style="font-size: 15px; line-height: 1.6;">Xin chào <strong>Quản trị viên</strong>,</p>

        <p style="font-size: 15px; line-height: 1.6;">
          Hệ thống giám sát Truliva phát hiện yêu cầu gọi sang <strong>Pancake POS API</strong> bị từ chối xác thực liên tiếp:
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 14px;">
          <p style="margin: 4px 0;"><strong>• Mã lỗi:</strong> <span style="color: #dc2626; font-family: monospace; font-weight: bold;">HTTP 403 / Error Code 105 (API Key invalid / expired)</span></p>
          <p style="margin: 4px 0;"><strong>• Chi tiết:</strong> ${data.errorMessage || 'api_key is invalid'}</p>
          <p style="margin: 4px 0;"><strong>• Số lần thất bại:</strong> <span style="color: #dc2626; font-weight: bold;">${data.failureCount} / ${data.maxFailures}</span></p>
          <p style="margin: 4px 0;"><strong>• Thời điểm:</strong> ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (Giờ Việt Nam)</p>
          <p style="margin: 4px 0;"><strong>• Máy chủ:</strong> VPS Production (221.132.21.42)</p>
        </div>

        <div style="background-color: ${isLocked ? '#FEF2F2' : '#FFFBEB'}; border-left: 4px solid ${isLocked ? '#DC2626' : '#F59E0B'}; padding: 14px 16px; border-radius: 4px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 14px; line-height: 1.6; color: ${isLocked ? '#991B1B' : '#92400E'};">
            ${nextActionDesc}
          </p>
        </div>

        <h3 style="font-size: 16px; color: #1B3A6B; margin: 20px 0 10px 0;">Hướng dẫn xử lý:</h3>
        <ol style="font-size: 14px; line-height: 1.7; color: #334155; padding-left: 20px; margin: 0 0 24px 0;">
          <li>Đăng nhập trang quản trị <strong>Pancake POS</strong> của cửa hàng Truliva.</li>
          <li>Vào <strong>Cấu hình</strong> &rarr; <strong>Tích hợp API</strong> &rarr; Sao chép API Key mới.</li>
          <li>Cập nhật khóa mới vào file <code style="background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px;">.env</code> (biến <code style="background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px;">PANCAKE_API_KEY</code>) trên máy chủ.</li>
          <li>Khởi động lại backend hoặc gọi lệnh reset cầu chì để tiếp tục đồng bộ.</li>
        </ol>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${appUrl}/admin/orders" style="display: inline-block; padding: 12px 24px; background-color: #1B3A6B; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Truy cập Bảng Quản trị Truliva</a>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8; text-align: center;">
          <p style="margin: 0 0 4px 0;">Email tự động gửi từ Truliva Circuit Breaker Monitor tới ${to}.</p>
          <p style="margin: 0;">© ${new Date().getFullYear()} Truliva Ecosystem. All rights reserved.</p>
        </div>
      </div>
    `;

    const mailOptions = {
      from: `"${smtpFromName}" <${smtpUser}>`,
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info('[CircuitBreaker] Alert email sent successfully', { messageId: info.messageId, to, isLocked });
    return true;
  } catch (error: any) {
    logger.error('[CircuitBreaker] Failed to send alert email', { error: error.message });
    return false;
  }
};



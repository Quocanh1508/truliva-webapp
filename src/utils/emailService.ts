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
    
    // HTML email template
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #ffffff; color: #333333;">
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #1B3A6B; padding-bottom: 16px;">
          <h2 style="color: #1B3A6B; margin: 0; font-size: 24px;">Hệ thống Quản lý Truliva</h2>
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

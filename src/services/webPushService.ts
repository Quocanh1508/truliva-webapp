import webpush from 'web-push';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import logger from '../utils/logger';

let isWebPushInitialized = false;

try {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:quocanh0815@gmail.com';

  if (publicKey && privateKey) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    isWebPushInitialized = true;
    logger.info('Web Push service successfully initialized using VAPID keys.');
  } else {
    logger.warn(
      'Web Push (PWA Notifications) disabled: missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY in .env.'
    );
  }
} catch (error: any) {
  logger.error('Error initializing Web Push service', { error: error.message });
}

/**
 * Gửi thông báo đẩy PWA (Web Push) đến một người dùng dựa trên ID của họ
 * @param userId ID của người dùng cần gửi
 * @param title Tiêu đề thông báo
 * @param body Nội dung thông báo
 * @param data Dữ liệu kèm theo để điều hướng trong PWA
 */
export async function sendWebPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: any
): Promise<boolean> {
  try {
    if (!isWebPushInitialized) {
      logger.debug(`Cannot send Web Push to user ${userId}: Web Push service not initialized.`);
      return false;
    }

    // Lấy subscription của người dùng từ DB
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { webPushSubscription: true, fullName: true },
    });

    if (!user || !user.webPushSubscription) {
      logger.debug(`Skipping Web Push for user ${userId}: no Web Push subscription registered.`);
      return false;
    }

    // Cấu trúc payload
    const payload = JSON.stringify({
      notification: {
        title,
        body,
      },
      data: data || {},
    });

    // Ép kiểu subscription sang kiểu đối tượng của web-push
    const subscription = user.webPushSubscription as any;

    await webpush.sendNotification(subscription, payload);
    logger.info(`Web Push notification sent successfully to user ${user.fullName} (${userId})`);
    return true;
  } catch (error: any) {
    logger.error(`Failed to send Web Push notification to user ${userId}`, { error: error.message });

    // Nếu mã trạng thái là 410 (Gone) hoặc 404 (Not Found), subscription đã hết hạn hoặc bị hủy
    // Chúng ta tiến hành xóa subscription khỏi database của người dùng
    if (error.statusCode === 410 || error.statusCode === 404) {
      logger.info(`Cleaning up expired/invalid PWA Web Push subscription for user ${userId}`);
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { webPushSubscription: Prisma.DbNull },
        });
      } catch (cleanErr: any) {
        logger.error('Failed to clean up expired Web Push subscription', { error: cleanErr.message });
      }
    }
    return false;
  }
}

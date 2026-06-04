import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import prisma from '../config/database';
import logger from '../utils/logger';

let isFirebaseInitialized = false;

try {
  const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    // Sử dụng require để nạp dữ liệu JSON động
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    isFirebaseInitialized = true;
    logger.info('Firebase Admin successfully initialized using service account JSON file.');
  } else if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    isFirebaseInitialized = true;
    logger.info('Firebase Admin successfully initialized using environment variables.');
  } else {
    logger.warn(
      'Push notifications (Firebase) disabled: missing firebase-service-account.json or environment variables.'
    );
  }
} catch (error: any) {
  logger.error('Error initializing Firebase Admin SDK', { error: error.message });
}

/**
 * Gửi thông báo đẩy đến một người dùng dựa trên ID của họ
 * @param userId ID của người dùng cần gửi
 * @param title Tiêu đề thông báo
 * @param body Nội dung thông báo
 * @param data Dữ liệu kèm theo để điều hướng trong App
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<boolean> {
  try {
    if (!isFirebaseInitialized) {
      logger.debug(`Cannot send push notification to user ${userId}: Firebase not initialized.`);
      return false;
    }

    // Lấy token của người dùng
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true, fullName: true },
    });

    if (!user || !user.pushToken) {
      logger.debug(`Skipping push notification for user ${userId}: no push token registered.`);
      return false;
    }

    const message = {
      token: user.pushToken,
      notification: {
        title,
        body,
      },
      data: data || {},
      android: {
        notification: {
          sound: 'default',
          clickAction: 'FCM_PLUGIN_ACTIVITY',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    logger.info(`Push notification sent successfully to user ${user.fullName} (${userId})`, { response });
    return true;
  } catch (error: any) {
    logger.error(`Failed to send push notification to user ${userId}`, { error: error.message });
    
    // Nếu Token hết hạn hoặc không tồn tại trên Firebase, xóa token khỏi DB để dọn dẹp
    if (
      error.code === 'messaging/registration-token-not-registered' ||
      error.code === 'messaging/invalid-registration-token'
    ) {
      logger.info(`Cleaning up expired push token for user ${userId}`);
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { pushToken: null },
        });
      } catch (cleanErr: any) {
        logger.error('Failed to clean up expired push token', { error: cleanErr.message });
      }
    }
    return false;
  }
}

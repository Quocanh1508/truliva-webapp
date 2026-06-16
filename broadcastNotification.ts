import 'dotenv/config';
import prisma from './src/config/database';
import { sendPushNotification } from './src/services/notificationService';
import { sendWebPushNotification } from './src/services/webPushService';
import logger from './src/utils/logger';

async function main() {
  const title = '[Thông báo từ Dev] Khắc phục lỗi tự động đăng xuất trên iPhone (iOS)';
  const content = `Xin chào anh/chị,

Thời gian qua, một số thành viên sử dụng iPhone (hệ điều hành iOS) hoặc trình duyệt Safari gặp tình trạng bị tự động đăng xuất (phải đăng nhập lại liên tục khi đóng/mở ứng dụng hoặc khóa màn hình).

Đội ngũ Dev (Phát triển) đã xác định được nguyên nhân do chính sách xóa bộ nhớ đệm tự động của iOS và đã hoàn tất việc nâng cấp hệ thống để tự động duy trì phiên đăng nhập của anh/chị bằng cơ chế dự phòng mới (Cookie an toàn). 

Từ bây giờ, tài khoản của anh/chị sẽ được duy trì đăng nhập ổn định trên điện thoại và trình duyệt mà không cần phải đăng nhập lại nhiều lần nữa.

Nếu anh/chị vẫn gặp hiện tượng bị đăng xuất hoặc có góp ý nào khác, xin vui lòng gửi phản hồi tại mục "Đóng góp ý kiến" trong ứng dụng.

Trân trọng,
Đội ngũ Dev Truliva`;

  try {
    // Lấy tất cả tài khoản active (hoặc tất cả các user hiện có trong DB)
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        pushToken: true,
        webPushSubscription: true,
      }
    });

    console.log(`Bắt đầu gửi thông báo đến ${users.length} tài khoản active...`);

    let successCount = 0;
    let pushCount = 0;
    let webPushCount = 0;

    for (const user of users) {
      try {
        // 1. Tạo bản ghi thông báo trong Database
        await prisma.notification.create({
          data: {
            userId: user.id,
            title,
            content,
          }
        });
        successCount++;

        // 2. Gửi Push Notification qua App (FCM) nếu có pushToken
        if (user.pushToken) {
          const sent = await sendPushNotification(user.id, title, content, {
            type: 'SYSTEM_ANNOUNCEMENT',
          });
          if (sent) pushCount++;
        }

        // 3. Gửi Web Push (PWA) nếu có subscription
        if (user.webPushSubscription) {
          const sent = await sendWebPushNotification(user.id, title, content, {
            type: 'SYSTEM_ANNOUNCEMENT',
          });
          if (sent) webPushCount++;
        }

        console.log(`Đã xử lý thông báo cho user: ${user.fullName} (Quyền: ${user.role})`);
      } catch (userErr: any) {
        console.error(`Lỗi khi xử lý thông báo cho user ${user.fullName} (${user.id}):`, userErr.message);
      }
    }

    console.log(`--- KẾT QUẢ BROADCAST ---`);
    console.log(`- Đã tạo thông báo DB cho ${successCount}/${users.length} người dùng.`);
    console.log(`- Đã gửi FCM push cho ${pushCount} thiết bị.`);
    console.log(`- Đã gửi Web Push cho ${webPushCount} trình duyệt.`);

  } catch (err: any) {
    console.error('Lỗi khi chạy script broadcast:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

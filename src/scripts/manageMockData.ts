import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const FIRST_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Vũ', 'Hoàng', 'Phan', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const MIDDLE_NAMES = ['Văn', 'Thị', 'Minh', 'Hồng', 'Thanh', 'Đức', 'Quốc', 'Hoàng', 'Thành', 'Kim', 'Ngọc', 'Phương', 'Khánh'];
const LAST_NAMES = ['Anh', 'Bình', 'Chương', 'Dũng', 'Em', 'Giang', 'Hải', 'Hùng', 'Hạnh', 'Khánh', 'Linh', 'Nam', 'Phong', 'Quang', 'Sơn', 'Trang', 'Tuấn', 'Vy', 'Yến'];

function getRandomName(): string {
  const f = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const m = MIDDLE_NAMES[Math.floor(Math.random() * MIDDLE_NAMES.length)];
  const l = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${f} ${m} ${l}`;
}

function getRandomPhone(): string {
  return '09' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

async function main() {
  const action = process.argv[2];
  if (action !== 'seed' && action !== 'clean') {
    console.log('❌ Vui lòng cung cấp hành động hợp lệ: "seed" hoặc "clean".');
    console.log('   Ví dụ: npx tsx src/scripts/manageMockData.ts seed');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as any);

  try {
    if (action === 'clean') {
      console.log('🧹 Đang dọn dẹp dữ liệu demo mẫu...');
      
      const deletedReports = await prisma.serviceReport.deleteMany({
        where: { notes: 'DEMO_MOCK_DATA' }
      });
      console.log(`✅ Đã xóa ${deletedReports.count} báo cáo ca KTV mẫu.`);

      const deletedOrders = await prisma.order.deleteMany({
        where: { note: 'DEMO_MOCK_DATA' }
      });
      console.log(`✅ Đã xóa ${deletedOrders.count} đơn hàng mẫu.`);
      
      console.log('🎉 Hoàn tất dọn dẹp dữ liệu demo mẫu sạch sẽ!');
    } else if (action === 'seed') {
      console.log('🌱 Đang kiểm tra dữ liệu demo mẫu hiện tại...');
      const existingCount = await prisma.order.count({
        where: { note: 'DEMO_MOCK_DATA' }
      });

      if (existingCount > 0) {
        console.log(`⚠️  Đã có sẵn ${existingCount} đơn hàng demo trong DB. Vui lòng chạy lệnh clean trước nếu muốn tạo lại.`);
        return;
      }

      console.log('🔍 Đang lấy danh sách Kỹ thuật viên (KTV) đang hoạt động...');
      const ktvs = await prisma.user.findMany({
        where: { role: 'KTV', isActive: true },
        include: { techStation: true }
      });

      if (ktvs.length === 0) {
        console.log('❌ Không tìm thấy KTV nào đang hoạt động trong database. Vui lòng tạo KTV trước.');
        return;
      }

      console.log(`💡 Tìm thấy ${ktvs.length} KTV đang hoạt động. Bắt đầu tạo 200 đơn hàng mẫu...`);

      const WORK_TYPES = ['Giao hàng và Lắp đặt', 'Lắp đặt', 'Giao hàng', 'Thay lọc', 'Bảo hành', 'Sửa chữa'];
      let ordersCreatedCount = 0;
      let reportsCreatedCount = 0;

      for (let i = 0; i < 200; i++) {
        // Chọn ngẫu nhiên KTV và lấy thông tin trạm
        const ktv = ktvs[Math.floor(Math.random() * ktvs.length)];
        
        let province = 'Khác';
        if (ktv.techStation?.name) {
          province = ktv.techStation.name.split('(')[0].trim();
        }

        const workType = WORK_TYPES[Math.floor(Math.random() * WORK_TYPES.length)];

        // Tỷ lệ trạng thái: 70% hoàn thành, 20% đang thực hiện, 8% chờ xử lý, 2% hủy đơn
        const randStatus = Math.random();
        let adminStatus = 'hoàn thành';
        if (randStatus > 0.70 && randStatus <= 0.90) {
          adminStatus = 'đang thực hiện';
        } else if (randStatus > 0.90 && randStatus <= 0.98) {
          adminStatus = 'chờ xử lý';
        } else if (randStatus > 0.98) {
          adminStatus = 'hủy đơn';
        }

        // Tỷ lệ tháng hẹn khách: 85% trong tháng 5/2026, 10% trong tháng 4/2026, 5% trong tháng 6/2026
        const randMonth = Math.random();
        let appointmentTime = new Date();
        if (randMonth <= 0.85) {
          // Tháng 5/2026 (ngày 1 đến 31)
          const day = Math.floor(Math.random() * 31) + 1;
          const hour = Math.floor(Math.random() * 8) + 8; // 8h -> 16h
          appointmentTime = new Date(2026, 4, day, hour, 0, 0);
        } else if (randMonth > 0.85 && randMonth <= 0.95) {
          // Tháng 4/2026 (ngày 15 đến 30)
          const day = Math.floor(Math.random() * 16) + 15;
          const hour = Math.floor(Math.random() * 8) + 8;
          appointmentTime = new Date(2026, 3, day, hour, 0, 0);
        } else {
          // Tháng 6/2026 (ngày 1 đến 10)
          const day = Math.floor(Math.random() * 10) + 1;
          const hour = Math.floor(Math.random() * 8) + 8;
          appointmentTime = new Date(2026, 5, day, hour, 0, 0);
        }

        // Tạo đơn hàng
        const order = await prisma.order.create({
          data: {
            pancakeOrderId: 90000000 + i,
            billFullName: getRandomName(),
            billPhoneNumber: getRandomPhone(),
            shippingAddress: { province_name: province },
            note: 'DEMO_MOCK_DATA',
            appointmentTime,
            adminStatus,
            workType,
            assignedKtvId: ktv.id,
            techStationId: ktv.techStationId,
            mainStationId: ktv.techStation?.mainStationId || null
          }
        });
        ordersCreatedCount++;

        // Nếu trạng thái là 'hoàn thành', tạo ServiceReport
        if (adminStatus === 'hoàn thành') {
          // Quyết định đúng hay trễ hẹn: 80% đúng hẹn, 20% trễ hẹn
          const randOntime = Math.random();
          let reportCreatedAt = new Date(appointmentTime);
          
          if (randOntime <= 0.80) {
            // Đúng hẹn: hoàn thành trước hoặc trong ngày hẹn (trừ đi 1-12 tiếng)
            reportCreatedAt.setHours(reportCreatedAt.getHours() - Math.floor(Math.random() * 12));
          } else {
            // Trễ hẹn: hoàn thành sau ngày hẹn 1-4 ngày (cộng thêm 24-96 tiếng)
            reportCreatedAt.setHours(reportCreatedAt.getHours() + (Math.floor(Math.random() * 4) + 1) * 24);
          }

          await prisma.serviceReport.create({
            data: {
              month: `${appointmentTime.getMonth() + 1}/${appointmentTime.getFullYear()}`,
              ktvUserId: ktv.id,
              customerName: order.billFullName || 'Khách demo',
              customerPhone: order.billPhoneNumber || '',
              province: province,
              products: ['Máy lọc nước Truliva Premium'],
              serviceType: workType,
              workType: workType,
              imageUrls: ['https://res.cloudinary.com/truliva/image/upload/v1716382103/demo_mock.jpg'],
              notes: 'DEMO_MOCK_DATA',
              orderId: order.id,
              createdAt: reportCreatedAt
            }
          });
          reportsCreatedCount++;
        }
      }

      console.log(`✅ Thành công! Đã tạo ${ordersCreatedCount} đơn hàng demo và ${reportsCreatedCount} báo cáo ca KTV hoàn thành tương ứng.`);
      console.log('🎉 Toàn bộ dữ liệu mẫu đã sẵn sàng hiển thị sinh động trên các biểu đồ!');
    }
  } catch (error: any) {
    console.error('❌ Đã xảy ra lỗi:', error.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();

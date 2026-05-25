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

const REAL_PRODUCTS = [
  'Máy lọc nước Truliva Premium',
  'Máy nóng lạnh treo tường Truliva W6412',
  'Máy lọc nước Truliva UR61096H',
  'Máy lọc nước Truliva UR5676',
  'Máy lọc nước Truliva UR5840',
  'Máy lọc không khí Airplus KJ260',
  'Bộ lọc nước tại vòi Truliva O-O5111'
];

const ISSUE_TYPES = [
  'Rò rỉ nước',
  'Lỗi nguồn / Mạch điện',
  'Nước không nóng',
  'Nước không lạnh',
  'Bơm kêu to / Không hoạt động',
  'Chất lượng nước đầu ra không đạt (TDS cao)',
  'Khác (Chập cháy bên trong)'
];

const HANDLING_METHODS = [
  'Thay thế linh kiện phát sinh',
  'Sửa chữa mạch / Đường nước',
  'Căn chỉnh áp suất / Vệ sinh máy',
  'Hướng dẫn khách hàng sử dụng',
  'Khác (Thay thế linh kiện bảo hành)'
];

const SPARE_PARTS_POOL = [
  'Màng lọc RO',
  'Lõi lọc CTO',
  'Lõi lọc PGP',
  'Mạch điều khiển',
  'Bơm tăng áp',
  'Van điện từ',
  'Vòi nước cảm ứng'
];

const WATER_SOURCES = ['Nước máy trực tiếp', 'Nước máy bồn', 'Nước giếng', 'Nước mưa'];

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
        console.log(`⚠️ Đã có sẵn ${existingCount} đơn hàng demo trong DB. Vui lòng chạy lệnh clean trước nếu muốn tạo lại.`);
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

      // ── TẠO POOL MÁY VIRTUAL ĐỂ LIÊN KẾT PHÂN TÍCH VÒNG ĐỜI (LẮP ĐẶT -> HỎNG HÓC) ──
      const virtualMachines: { serial: string; product: string; installDate: Date; province: string }[] = [];
      const PROVINCES = ['Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Bình Dương', 'Đồng Nai', 'Cần Thơ', 'Hải Phòng', 'Nha Trang'];
      
      for (let j = 0; j < 60; j++) {
        const product = REAL_PRODUCTS[Math.floor(Math.random() * REAL_PRODUCTS.length)];
        const serial = `TRL-${100000 + j}`;
        
        // Ngày lắp đặt: ngẫu nhiên từ 15/04/2026 đến 15/05/2026 để khớp với bộ lọc tháng 5/2026 của Dashboard
        const start = new Date(2026, 3, 15).getTime();
        const end = new Date(2026, 4, 15).getTime();
        const installDate = new Date(start + Math.random() * (end - start));
        
        const randomKtv = ktvs[Math.floor(Math.random() * ktvs.length)];
        let province = PROVINCES[Math.floor(Math.random() * PROVINCES.length)];
        if (randomKtv.techStation?.name) {
          province = randomKtv.techStation.name.split('(')[0].trim();
        }

        virtualMachines.push({ serial, product, installDate, province });
      }

      let ordersCreatedCount = 0;
      let reportsCreatedCount = 0;

      // Phân chia 200 đơn hàng
      for (let i = 0; i < 200; i++) {
        const ktv = ktvs[Math.floor(Math.random() * ktvs.length)];
        let workType = 'Giao hàng';
        let serialNumber: string | null = null;
        let product = '';
        let province = 'Khác';
        let appointmentTime = new Date();

        if (ktv.techStation?.name) {
          province = ktv.techStation.name.split('(')[0].trim();
        }

        // Quyết định loại đơn dựa trên chỉ số i
        if (i < 60) {
          // Lắp đặt
          workType = Math.random() > 0.4 ? 'Lắp đặt' : 'Giao hàng và Lắp đặt';
          const vm = virtualMachines[i]; // Lấy máy tương ứng
          product = vm.product;
          serialNumber = vm.serial;
          province = vm.province;
          appointmentTime = new Date(vm.installDate);
        } else if (i >= 60 && i < 110) {
          // Bảo hành / Sửa chữa
          workType = Math.random() > 0.5 ? 'Bảo hành' : 'Sửa chữa';
          const vm = virtualMachines[Math.floor(Math.random() * virtualMachines.length)];
          product = vm.product;
          serialNumber = vm.serial;
          province = vm.province;
          
          // Ngày bảo hành = Ngày lắp đặt + ngẫu nhiên từ 5 đến 20 ngày (để rơi chủ yếu vào tháng 5/2026)
          const daysAfter = Math.floor(Math.random() * 15) + 5;
          appointmentTime = new Date(vm.installDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
        } else if (i >= 110 && i < 150) {
          // Thay lọc
          workType = 'Thay lọc';
          const vm = virtualMachines[Math.floor(Math.random() * virtualMachines.length)];
          product = vm.product;
          serialNumber = vm.serial;
          province = vm.province;
          
          // Ngày thay lọc = Ngày lắp đặt + ngẫu nhiên từ 10 đến 25 ngày (để rơi chủ yếu vào tháng 5/2026)
          const daysAfter = Math.floor(Math.random() * 15) + 10;
          appointmentTime = new Date(vm.installDate.getTime() + daysAfter * 24 * 60 * 60 * 1000);
        } else {
          // Giao hàng thuần túy
          workType = 'Giao hàng';
          product = REAL_PRODUCTS[Math.floor(Math.random() * REAL_PRODUCTS.length)];
          serialNumber = null;
          
          // Ngày giao hàng phân bổ: 85% tháng 5/2026, 10% tháng 4/2026, 5% tháng 6/2026
          const randMonth = Math.random();
          if (randMonth <= 0.85) {
            const day = Math.floor(Math.random() * 31) + 1;
            appointmentTime = new Date(2026, 4, day, 10, 0, 0);
          } else if (randMonth > 0.85 && randMonth <= 0.95) {
            const day = Math.floor(Math.random() * 15) + 15;
            appointmentTime = new Date(2026, 3, day, 10, 0, 0);
          } else {
            const day = Math.floor(Math.random() * 10) + 1;
            appointmentTime = new Date(2026, 5, day, 10, 0, 0);
          }
        }

        // Tỷ lệ trạng thái: 75% hoàn thành, 15% đang thực hiện, 8% chờ xử lý, 2% hủy đơn
        const randStatus = Math.random();
        let adminStatus = 'hoàn thành';
        if (randStatus > 0.75 && randStatus <= 0.90) {
          adminStatus = 'đang thực hiện';
        } else if (randStatus > 0.90 && randStatus <= 0.98) {
          adminStatus = 'chờ xử lý';
        } else if (randStatus > 0.98) {
          adminStatus = 'hủy đơn';
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

        // Tạo order items
        await prisma.orderItem.create({
          data: {
            orderId: order.id,
            productName: product,
            quantity: 1,
            price: 1500000,
            rawData: {}
          }
        });

        // Nếu trạng thái là 'hoàn thành', tạo ServiceReport
        if (adminStatus === 'hoàn thành') {
          const randOntime = Math.random();
          let reportCreatedAt = new Date(appointmentTime);
          
          if (randOntime <= 0.85) {
            reportCreatedAt.setHours(reportCreatedAt.getHours() - Math.floor(Math.random() * 8));
          } else {
            reportCreatedAt.setHours(reportCreatedAt.getHours() + (Math.floor(Math.random() * 3) + 1) * 24);
          }

          const hasTech = ['Thay lọc', 'Lắp đặt', 'Giao hàng và Lắp đặt', 'Bảo hành', 'Sửa chữa'].includes(workType);
          const hasIssue = ['Bảo hành', 'Sửa chữa'].includes(workType);
          const hasFilter = workType === 'Thay lọc';

          const issueType = hasIssue ? ISSUE_TYPES[Math.floor(Math.random() * ISSUE_TYPES.length)] : null;
          const handlingMethod = hasIssue ? HANDLING_METHODS[Math.floor(Math.random() * HANDLING_METHODS.length)] : null;
          
          let spareParts: string[] = [];
          if (hasIssue) {
            if (Math.random() > 0.3) {
              spareParts = [SPARE_PARTS_POOL[Math.floor(Math.random() * SPARE_PARTS_POOL.length)]];
              if (Math.random() > 0.7) {
                spareParts.push(SPARE_PARTS_POOL[Math.floor(Math.random() * SPARE_PARTS_POOL.length)]);
              }
            }
          } else if (hasFilter) {
            spareParts = ['Lõi lọc CTO', 'Lõi lọc PGP'];
            if (Math.random() > 0.5) spareParts.push('Màng lọc RO');
          }

          await prisma.serviceReport.create({
            data: {
              month: `${appointmentTime.getMonth() + 1}/${appointmentTime.getFullYear()}`,
              ktvUserId: ktv.id,
              customerName: order.billFullName || 'Khách demo',
              customerPhone: order.billPhoneNumber || '',
              province: province,
              products: [`${product} x1`],
              serviceType: workType,
              workType: workType,
              imageUrls: ['https://res.cloudinary.com/truliva/image/upload/v1716382103/demo_mock.jpg'],
              notes: 'DEMO_MOCK_DATA',
              serialNumber: serialNumber,
              orderId: order.id,
              createdAt: reportCreatedAt,
              waterSource: hasTech ? WATER_SOURCES[Math.floor(Math.random() * WATER_SOURCES.length)] : null,
              tdsIn: hasTech ? Math.floor(Math.random() * 200) + 100 : null,
              tdsOut: hasTech ? Math.floor(Math.random() * 15) + 5 : null,
              waterPressure: hasTech ? Math.floor(Math.random() * 30) + 15 : null,
              spareParts,
              issueType,
              handlingMethod
            }
          });
          reportsCreatedCount++;
        }
      }

      console.log(`✅ Thành công! Đã tạo ${ordersCreatedCount} đơn hàng demo và ${reportsCreatedCount} báo cáo ca KTV mẫu.`);
      console.log('🎉 Toàn bộ dữ liệu phân tích chất lượng sản phẩm mẫu đã sẵn sàng hiển thị sinh động trên các biểu đồ!');
    }
  } catch (error: any) {
    console.error('❌ Đã xảy ra lỗi:', error.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();

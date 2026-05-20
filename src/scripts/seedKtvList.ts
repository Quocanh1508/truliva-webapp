import 'dotenv/config';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

function getCellString(row: any, index: number): string {
  const cell = row.getCell(index);
  if (!cell || cell.value === null || cell.value === undefined) return '';
  
  if (typeof cell.value === 'object') {
    if (cell.value.richText) return cell.value.richText.map((rt: any) => rt.text).join('');
    if (cell.value.text) return String(cell.value.text);
    return JSON.stringify(cell.value);
  }
  return String(cell.value).trim();
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('c:/StudyZone/Project/Truliva/KTV flow/DS Trạm KT_KTV Truliva.xlsx');
    const sheet = workbook.worksheets[0];

    console.log('Bắt đầu đồng bộ danh sách Trạm và KTV từ Excel...');

    const defaultPasswordHash = await bcrypt.hash('Truliva@2025', 10);
    
    // Caches để tránh truy vấn DB lặp đi lặp lại
    const mainStationCache = new Map<string, string>(); // name -> id
    const techStationCache = new Map<string, string>(); // name_mainId -> id

    let mainStationsCreated = 0;
    let techStationsCreated = 0;
    let usersCreated = 0;
    let usersUpdated = 0;

    // Quét qua các trạm chính hiện có để cache
    const existingMain = await prisma.mainStation.findMany();
    existingMain.forEach(m => mainStationCache.set(m.name.toLowerCase().trim(), m.id));

    // Quét qua các trạm kỹ thuật hiện có để cache
    const existingTech = await prisma.techStation.findMany();
    existingTech.forEach(t => {
      const key = `${t.name.toLowerCase().trim()}_${t.mainStationId}`;
      techStationCache.set(key, t.id);
    });

    // Bắt đầu đọc dòng dữ liệu (dòng 1 là tiêu đề)
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      
      const mainStationName = getCellString(row, 1);
      const techStationName = getCellString(row, 2);
      const statusText = getCellString(row, 3);
      const ktvName = getCellString(row, 4);
      const phoneRaw = getCellString(row, 5);

      if (!mainStationName || !techStationName || !ktvName || !phoneRaw) {
        // Bỏ qua dòng trống hoặc thiếu thông tin tối thiểu
        continue;
      }

      // Chuẩn hóa số điện thoại làm username
      // Loại bỏ khoảng trắng, dấu chấm, dấu cộng, v.v.
      const phone = phoneRaw.replace(/[^0-9]/g, '');
      if (!phone) {
        console.warn(`[Cảnh báo] Dòng ${i}: Số điện thoại không hợp lệ "${phoneRaw}" cho KTV "${ktvName}"`);
        continue;
      }

      const isActive = statusText.toLowerCase() === 'hoạt động';

      // ── 1. Đảm bảo có MainStation ──
      const mainKey = mainStationName.toLowerCase().trim();
      let mainStationId = mainStationCache.get(mainKey);
      if (!mainStationId) {
        const newMain = await prisma.mainStation.create({
          data: { name: mainStationName.trim() }
        });
        mainStationId = newMain.id;
        mainStationCache.set(mainKey, mainStationId);
        mainStationsCreated++;
        console.log(`+ Tạo mới Trạm chính: ${mainStationName}`);
      }

      // ── 2. Đảm bảo có TechStation ──
      const techKey = `${techStationName.toLowerCase().trim()}_${mainStationId}`;
      let techStationId = techStationCache.get(techKey);
      if (!techStationId) {
        const newTech = await prisma.techStation.create({
          data: {
            name: techStationName.trim(),
            mainStationId: mainStationId,
            isActive: true
          }
        });
        techStationId = newTech.id;
        techStationCache.set(techKey, techStationId);
        techStationsCreated++;
        console.log(`  + Tạo mới Trạm kỹ thuật: ${techStationName} (Trạm chính: ${mainStationName})`);
      }

      // ── 3. Đồng bộ User KTV ──
      const username = phone;
      const existingUser = await prisma.user.findUnique({
        where: { username }
      });

      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            fullName: ktvName.trim(),
            phoneNumber: phone,
            techStationId: techStationId,
            isActive: isActive
          }
        });
        usersUpdated++;
      } else {
        await prisma.user.create({
          data: {
            username,
            passwordHash: defaultPasswordHash,
            fullName: ktvName.trim(),
            role: 'KTV',
            phoneNumber: phone,
            techStationId: techStationId,
            isActive: isActive
          }
        });
        usersCreated++;
        console.log(`    * Tạo KTV: ${ktvName} - SĐT: ${phone} (${isActive ? 'Hoạt động' : 'Ngưng HĐ'})`);
      }
    }

    console.log('\n=== KẾT QUẢ ĐỒNG BỘ ===');
    console.log(`- Trạm chính tạo mới: ${mainStationsCreated}`);
    console.log(`- Trạm kỹ thuật tạo mới: ${techStationsCreated}`);
    console.log(`- Tài khoản KTV tạo mới: ${usersCreated}`);
    console.log(`- Tài khoản KTV cập nhật: ${usersUpdated}`);
    console.log('========================');

  } catch (error) {
    console.error('Lỗi khi đồng bộ danh sách KTV:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

run();

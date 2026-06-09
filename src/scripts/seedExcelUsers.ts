import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import path from 'path';

// Ánh xạ chức vụ tiếng Việt từ Excel sang UserRole trong db
function mapRole(chucVu: string): UserRole {
  const normalized = (chucVu || '').trim().toLowerCase();
  if (normalized === 'sale supervisor') return 'SALE_SUPERVISOR';
  if (normalized === 'saler') return 'SALER';
  if (normalized === 'hotline') return 'HOTLINE';
  if (normalized === 'điều phối viên') return 'COORDINATOR';
  if (normalized === 'nhân viên') return 'STAFF';
  if (normalized === 'admin') return 'ADMIN';
  if (normalized === 'ktv' || normalized === 'kỹ thuật viên') return 'KTV';
  return 'KTV'; // mặc định
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const filePath = path.join(__dirname, '..', '..', 'KTV flow', 'Danh sách account webapp (admin).xlsx');
  console.log('Reading accounts from Excel:', filePath);
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const sheet = workbook.getWorksheet(1);
  if (!sheet) {
    throw new Error('Không tìm thấy sheet nào trong file excel');
  }

  let successCount = 0;
  let errorCount = 0;

  // Đọc từ dòng 2 (bỏ qua dòng tiêu đề)
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (!row || !row.values || row.values.length === 0) continue;

    // Lấy giá trị cell bằng helper để xử lý formula/hyperlink
    const getCellValue = (colIdx: number): string => {
      const cell = row.getCell(colIdx);
      if (!cell || cell.value === null || cell.value === undefined) return '';
      if (typeof cell.value === 'object') {
        if ('result' in cell.value && cell.value.result !== undefined) {
          return String(cell.value.result);
        }
        if ('text' in cell.value && cell.value.text !== undefined) {
          return String(cell.value.text);
        }
        return JSON.stringify(cell.value);
      }
      return String(cell.value);
    };

    const fullName = getCellValue(1).trim(); // Tên nhân viên
    const username = getCellValue(2).trim().toLowerCase(); // Email (User)
    const password = getCellValue(3).trim(); // Password
    const pancakeAccountName = getCellValue(4).trim(); // Tên account Pancake
    const group = getCellValue(5).trim(); // Nhóm
    const chucVu = getCellValue(6).trim(); // Chức vụ

    if (!fullName || !username) {
      // Bỏ qua các dòng trống
      continue;
    }

    const role = mapRole(chucVu);
    const passwordToHash = password || 'Truliva@2025';
    const passwordHash = await bcrypt.hash(passwordToHash, 10);

    try {
      // Upsert tài khoản
      const existingUser = await prisma.user.findUnique({
        where: { username }
      });

      if (existingUser) {
        // Cập nhật tài khoản hiện tại (giữ nguyên mật khẩu nếu đã đổi, trừ khi cần ghi đè)
        await prisma.user.update({
          where: { username },
          data: {
            fullName,
            role,
            pancakeAccountName: pancakeAccountName || null,
            group: group || null,
            isActive: true
          }
        });
        console.log(`✅ Cập nhật tài khoản: ${fullName} (${username}) | Vai trò: ${role} | Nhóm: ${group} | Pancake Account: ${pancakeAccountName}`);
      } else {
        // Tạo tài khoản mới
        await prisma.user.create({
          data: {
            username,
            passwordHash,
            fullName,
            role,
            pancakeAccountName: pancakeAccountName || null,
            group: group || null,
            isActive: true
          }
        });
        console.log(`🆕 Tạo tài khoản mới: ${fullName} (${username}) | Vai trò: ${role} | Nhóm: ${group} | Pancake Account: ${pancakeAccountName}`);
      }
      successCount++;
    } catch (err: any) {
      console.error(`❌ Lỗi khi xử lý dòng ${rowNumber} (${username}):`, err.message);
      errorCount++;
    }
  }

  console.log(`\n--- Hoàn tất seeding tài khoản ---`);
  console.log(`- Thành công: ${successCount}`);
  console.log(`- Thất bại: ${errorCount}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(console.error);

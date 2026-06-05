import 'dotenv/config';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import axios from 'axios';

const SHOP_ID = '1635300067';
const API_KEY = process.env.PANCAKE_API_KEY;

function getCellValue(row: any, index: number): any {
  const cell = row.getCell(index);
  if (!cell || cell.value === null || cell.value === undefined) return null;
  
  let val = cell.value;
  // Handle formula
  if (typeof val === 'object' && val !== null && 'formula' in val) {
    val = (val as any).result;
  }
  
  // Handle richText
  if (typeof val === 'object' && val !== null && (val as any).richText) {
    return (val as any).richText.map((rt: any) => rt.text).join('').trim();
  }
  
  // Handle hyperlink / object with text
  if (typeof val === 'object' && val !== null && 'text' in val) {
    val = (val as any).text;
  }
  
  return val;
}

function getCellStringFormatted(row: any, index: number): string | null {
  const val = getCellValue(row, index);
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str || null;
}

function getCellString(row: any, index: number): string {
  const str = getCellStringFormatted(row, index);
  return str || '';
}

async function fetchPancakeWarehouses(): Promise<any[]> {
  if (!API_KEY) {
    throw new Error('Missing PANCAKE_API_KEY in environment');
  }
  try {
    const response = await axios.get(`https://pos.pages.fm/api/v1/shops/${SHOP_ID}/warehouses`, {
      params: { api_key: API_KEY },
      timeout: 10000
    });
    if (response.data && response.data.success) {
      return response.data.data || response.data.warehouses || [];
    }
    return [];
  } catch (error: any) {
    console.error('Error fetching warehouses from Pancake POS:', error.message);
    return [];
  }
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('🔄 Fetching warehouses list from Pancake POS...');
    const pancakeWarehouses = await fetchPancakeWarehouses();
    console.log(`✅ Loaded ${pancakeWarehouses.length} active warehouses from Pancake.`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('c:/StudyZone/Project/Truliva/KTV flow/DS kho - KTV tương ứng.xlsx');
    const sheet = workbook.worksheets[0];

    console.log(`\n🔄 Reading Excel mapping sheets, row count: ${sheet.rowCount}...`);
    
    let matchedCount = 0;
    let warningCount = 0;

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      
      const warehouseName = getCellString(row, 1);
      const ktvName = getCellString(row, 2);
      const phoneRaw = getCellString(row, 3);
      const notes = getCellString(row, 4);

      if (!warehouseName) continue;

      if (notes.includes('Admin quản lý') || notes.includes('Khóa kho này') || !phoneRaw) {
        console.log(`[Bỏ qua] Dòng ${i}: "${warehouseName}" - Ghi chú: ${notes || 'Không có SĐT'}`);
        continue;
      }

      // Standardize phone number as username
      const phone = phoneRaw.replace(/[^0-9]/g, '');
      if (!phone) {
        console.warn(`[Cảnh báo] Dòng ${i}: SĐT không hợp lệ: "${phoneRaw}" cho KTV "${ktvName}"`);
        continue;
      }

      // 1. Find the user in database
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: phone },
            { phoneNumber: phone }
          ]
        }
      });

      if (!user) {
        console.warn(`⚠️ [Cảnh báo] Dòng ${i}: Không tìm thấy KTV trong database với SĐT: "${phone}" (Tên: ${ktvName})`);
        warningCount++;
        continue;
      }

      // 2. Find the Pancake Warehouse by name
      const cleanExcelWarehouseName = warehouseName.toLowerCase().replace(/\s+/g, ' ').trim();
      const matchedWarehouse = pancakeWarehouses.find(pw => {
        const cleanPancakeName = pw.name.toLowerCase().replace(/\s+/g, ' ').trim();
        return cleanPancakeName === cleanExcelWarehouseName;
      });

      if (!matchedWarehouse) {
        console.warn(`⚠️ [Cảnh báo] Dòng ${i}: Không tìm thấy kho trên Pancake khớp với tên: "${warehouseName}"`);
        warningCount++;
        continue;
      }

      // 3. Update the user
      await prisma.user.update({
        where: { id: user.id },
        data: {
          warehouseId: String(matchedWarehouse.id),
          warehouseName: String(matchedWarehouse.name)
        }
      });

      console.log(`✅ [Đã Mapped] KTV: "${user.fullName}" (${phone}) ➔ Kho: "${matchedWarehouse.name}" (ID: ${matchedWarehouse.id})`);
      matchedCount++;
    }

    console.log('\n=== KẾT QUẢ ĐỒNG BỘ KHO - KTV ===');
    console.log(`- Ánh xạ thành công: ${matchedCount} KTV`);
    console.log(`- Số cảnh báo lỗi khớp: ${warningCount}`);
    console.log('=================================');

  } catch (error) {
    console.error('Error during seeding:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

run();

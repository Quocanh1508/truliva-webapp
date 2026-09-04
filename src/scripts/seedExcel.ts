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
    if (cell.value.text) return String(cell.value.text); // hyperlink
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
    await workbook.xlsx.readFile('c:/StudyZone/Project/Truliva/KTV flow/Báo cáo hoàn thành ca - KTV Truliva (Câu trả lời).xlsx');
    const sheet = workbook.worksheets[0];

    // Find or create a mock KTV user for these reports
    let ktvUser = await prisma.user.findFirst({ where: { role: 'KTV', isActive: true } });
    if (!ktvUser) {
      const passwordHash = await bcrypt.hash('123456', 10);
      ktvUser = await prisma.user.create({
        data: {
          username: 'ktv_mock',
          fullName: 'KTV Mock Data',
          passwordHash,
          role: 'KTV',
        }
      });
      console.log('Đã tạo tài khoản KTV: ktv_mock / 123456');
    }

    let count = 0;
    
    // Row 1 is header, data starts at Row 2
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      
      const customerName = getCellString(row, 4);
      if (!customerName) continue; // Skip empty rows

      const month = getCellString(row, 1) || '5/2026';
      const customerPhone = getCellString(row, 5) || 'Chưa cập nhật';
      const province = getCellString(row, 6) || 'Chưa cập nhật';
      
      const productsText = getCellString(row, 7);
      const products = productsText ? productsText.split(',').map((s: string) => s.trim()) : [];
      
      const serviceType = getCellString(row, 8) || 'Khác';
      
      // Parse image URLs - handle richText, hyperlinks, and plain text
      const imageCell = row.getCell(9);
      let imageUrls: string[] = [];
      if (imageCell && imageCell.value) {
        let rawText = '';
        const cellVal = imageCell.value as any;
        if (typeof cellVal === 'string') {
          rawText = cellVal;
        } else if (cellVal.richText) {
          rawText = cellVal.richText.map((rt: any) => rt.text).join('');
        } else if (cellVal.text) {
          if (typeof cellVal.text === 'string') {
            rawText = cellVal.text;
          } else if (cellVal.text.richText) {
            rawText = cellVal.text.richText.map((rt: any) => rt.text).join('');
          }
        }
        // Extract all URLs using regex
        const urlMatches = rawText.match(/https?:\/\/[^\s,]+/g);
        if (urlMatches) {
          imageUrls = [...new Set(urlMatches.map((u: string) => u.trim()))]; // deduplicate
        }
      }
      
      const notes = getCellString(row, 10);
      const serialNumber = getCellString(row, 11);
      
      const distanceText = getCellString(row, 12);
      const distanceKm = distanceText && !isNaN(parseFloat(distanceText)) ? parseFloat(distanceText) : null;
      
      const isPaidText = getCellString(row, 13);
      const isPaid = isPaidText?.toLowerCase().includes('đã') || false;
      
      const serviceCostText = getCellString(row, 14);
      const serviceCost = serviceCostText && !isNaN(parseFloat(serviceCostText)) ? parseFloat(serviceCostText) : null;
      
      const additionalCostText = getCellString(row, 15);
      const additionalCost = additionalCostText && !isNaN(parseFloat(additionalCostText)) ? parseFloat(additionalCostText) : null;

      // Extract original KTV name into notes if we are merging them all under ktv_mock
      const originalKtvName = getCellString(row, 3);
      const finalNotes = originalKtvName ? `[KTV gốc: ${originalKtvName}] ${notes || ''}` : notes;

      await prisma.serviceReport.create({
        data: {
          month,
          ktvUserId: ktvUser.id,
          customerName,
          customerPhone,
          province,
          products,
          serviceType,
          imageUrls,
          notes: finalNotes,
          serialNumber,
          distanceKm,
          isPaid,
          serviceCost,
          additionalCost,
        }
      });
      count++;
    }
    
    console.log(`Đã import thành công ${count} báo cáo vào database làm mock data!`);
  } catch (error) {
    console.error('Lỗi khi import Excel:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

run();

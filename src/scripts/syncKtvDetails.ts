import dotenv from 'dotenv';
dotenv.config();

import ExcelJS from 'exceljs';
import path from 'path';
import prisma from '../config/database';
import logger from '../utils/logger';

async function run() {
  logger.info('Starting KTV details synchronization from Excel...');
  
  const workbook = new ExcelJS.Workbook();
  const filePath = path.resolve(__dirname, '../../KTV flow/DS Trạm KT_KTV Truliva.xlsx');
  
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (error: any) {
    logger.error('Failed to read Excel file', { path: filePath, error: error.message });
    process.exit(1);
  }

  const sheet = workbook.worksheets[0];
  let updateCount = 0;
  let skippedCount = 0;

  // We will loop through the rows starting from row 2
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const vals = row.values as any[];
    if (!vals || vals.length < 5) continue;

    const fullName = vals[4] ? String(vals[4]).trim() : null;
    const phone = vals[5] ? String(vals[5]).trim() : null;

    if (!fullName || !phone) {
      continue;
    }

    // Extract address
    const address = vals[6] ? String(vals[6]).trim() : null;

    // Extract CCCD number (handling numeric or string representation)
    const cccdNumber = vals[7] ? String(vals[7]).trim() : null;

    // Extract CCCD Date
    let cccdDate: string | null = null;
    const rawCccdDate = vals[8];
    if (rawCccdDate instanceof Date) {
      cccdDate = rawCccdDate.toISOString().split('T')[0];
    } else if (rawCccdDate) {
      cccdDate = String(rawCccdDate).trim();
    }

    // Extract CCCD Place
    const cccdPlace = vals[9] ? String(vals[9]).trim() : null;

    // Extract Bank Account
    const bankAccount = vals[10] ? String(vals[10]).trim() : null;

    // Extract Bank Name
    const bankName = vals[11] ? String(vals[11]).trim() : null;

    // Extract Email (handle exceljs hyperlink/formula object)
    let email: string | null = null;
    const rawEmail = vals[12];
    if (rawEmail) {
      if (typeof rawEmail === 'object') {
        const valObj = rawEmail as any;
        let emailStr: string = valObj.text || valObj.result || valObj.hyperlink || '';
        if (emailStr.startsWith('mailto:')) {
          emailStr = emailStr.substring(7);
        }
        email = emailStr;
      } else {
        email = String(rawEmail).trim();
      }
      email = email ? email.trim() : null;
      if (email === 'Không có' || email === 'n/a') {
        email = null;
      }
    }

    // Find KTV in Database by phone number
    const user = await prisma.user.findFirst({
      where: {
        phoneNumber: phone,
        role: 'KTV'
      }
    });

    if (user) {
      // Update KTV details in Database (match 100%)
      await prisma.user.update({
        where: { id: user.id },
        data: {
          address,
          cccdNumber,
          cccdDate,
          cccdPlace,
          bankAccount,
          bankName,
          email
        }
      });
      updateCount++;
      logger.info(`Synced details for KTV: ${fullName} (SĐT: ${phone})`);
    } else {
      skippedCount++;
      logger.warn(`KTV in Excel not found in database: ${fullName} (SĐT: ${phone})`);
    }
  }

  logger.info(`Synchronization completed successfully.`, {
    totalProcessed: updateCount + skippedCount,
    updated: updateCount,
    notFoundInDb: skippedCount
  });
}

run()
  .catch(e => {
    logger.error('KTV sync script failed', { error: e.message });
  })
  .finally(() => prisma.$disconnect());

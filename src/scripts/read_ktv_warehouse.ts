import 'dotenv/config';
import ExcelJS from 'exceljs';

async function run() {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('c:/StudyZone/Project/Truliva/KTV flow/DS kho - KTV tương ứng.xlsx');
    const sheet = workbook.worksheets[0];

    console.log(`Reading sheet: ${sheet.name}, rows: ${sheet.rowCount}`);
    for (let i = 1; i <= Math.min(sheet.rowCount, 100); i++) {
      const row = sheet.getRow(i);
      const cells: string[] = [];
      row.eachCell((cell, colNumber) => {
        let val = cell.value;
        if (typeof val === 'object' && val !== null && 'richText' in val) {
          val = (val as any).richText.map((rt: any) => rt.text).join('');
        }
        cells.push(`${colNumber}: ${val}`);
      });
      console.log(`Row ${i}:`, cells.join(' | '));
    }
  } catch (error) {
    console.error('Error reading excel:', error);
  }
}

run();

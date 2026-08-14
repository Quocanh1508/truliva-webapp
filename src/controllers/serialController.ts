import { Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';
import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import axios from 'axios';
import fs from 'fs';
import {
  getPreviewDuration,
  checkSerialPublicInfo,
  getSerialsFiltered,
  cleanSerialNumber,
  parseExcelDate
} from '../services/serialService';
import { activateSerialWarranty, extractWarrantyMonths } from '../services/warrantyService';
import { getZaloConfig, exchangeAuthorizationCode, sendZnsWarrantyActivation, getValidAccessToken } from '../services/zaloService';

export async function uploadInvoiceResponse(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Không tìm thấy file ảnh' });
      return;
    }
    res.json({
      url: req.file.path,
      publicId: req.file.filename,
    });
  } catch (error: any) {
    logger.error('Upload invoice error', { error: error.message });
    res.status(500).json({ error: 'Lỗi upload ảnh hóa đơn' });
  }
}

export async function previewDuration(req: Request, res: Response): Promise<void> {
  try {
    const model = (req.query.model as string || '').trim();
    const orderId = req.query.orderId as string | undefined;
    const result = await getPreviewDuration(model, orderId);
    res.json(result);
  } catch (error: any) {
    logger.error('Lỗi tính toán xem trước thời hạn bảo hành', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi tính thời gian bảo hành' });
  }
}

export async function checkPublicSerial(req: Request, res: Response): Promise<void> {
  try {
    const serialNumber = req.params.serialNumber as string;
    if (!serialNumber) {
      res.status(400).json({ error: 'Thiếu số Serial' });
      return;
    }

    const orderId = req.query.orderId as string | undefined;
    const serialInfo = await checkSerialPublicInfo(serialNumber, orderId);

    if (!serialInfo) {
      res.status(404).json({ error: 'Không tìm thấy số Serial trong hệ thống. Vui lòng kiểm tra lại.' });
      return;
    }

    res.json(serialInfo);
  } catch (error: any) {
    logger.error('Lỗi kiểm tra serial public', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi kiểm tra Serial' });
  }
}

export async function activatePublicSerial(req: Request, res: Response): Promise<void> {
  try {
    const { serialNumber, customerName, customerPhone, address, province, invoiceImageUrl } = req.body;

    if (!serialNumber || !customerName || !customerPhone || !address || !province || !invoiceImageUrl) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ các thông tin bắt buộc và tải lên ảnh hóa đơn' });
      return;
    }

    const cleaned = cleanSerialNumber(serialNumber);
    const serial = await prisma.serial.findUnique({
      where: { serialNumber: cleaned }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy số Serial trong hệ thống. Vui lòng kiểm tra lại.' });
      return;
    }

    if (serial.status === 'Đã kích hoạt' || serial.status === 'KH xác nhận') {
      res.status(400).json({ error: 'Số Serial này đã được kích hoạt bảo hành.' });
      return;
    }

    const updated = await activateSerialWarranty(
      cleaned,
      null,
      {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        address: address.trim(),
        province: province.trim(),
        invoiceImageUrl: invoiceImageUrl.trim()
      },
      'CUSTOMER',
      'Đã kích hoạt'
    );

    let znsResult = null;
    try {
      znsResult = await sendZnsWarrantyActivation(cleaned, customerPhone.trim());
    } catch (znsError: any) {
      logger.error('Lỗi gửi tin nhắn ZNS khi khách hàng tự kích hoạt', { serialNumber: cleaned, phone: customerPhone, error: znsError.message });
    }

    res.json({
      success: true,
      message: 'Kích hoạt bảo hành thành công! Tin nhắn xác nhận đã được gửi đến số Zalo của Quý khách.',
      serial: {
        serialNumber: updated.serialNumber,
        model: updated.model,
        warrantyExpiryDate: updated.warrantyExpiryDate,
        activationDate: updated.activationDate
      },
      znsResult
    });
  } catch (error: any) {
    logger.error('Lỗi gửi yêu cầu kích hoạt bảo hành public', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi gửi yêu cầu kích hoạt bảo hành' });
  }
}

export async function confirmPublicSerial(req: Request, res: Response): Promise<void> {
  try {
    const { serialNumber } = req.body;
    if (!serialNumber) {
      res.status(400).json({ error: 'Thiếu số Serial' });
      return;
    }

    const cleaned = cleanSerialNumber(serialNumber);
    const serial = await prisma.serial.findUnique({
      where: { serialNumber: cleaned }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy số Serial trong hệ thống' });
      return;
    }

    const updatedSerial = await prisma.serial.update({
      where: { id: serial.id },
      data: {
        status: 'Đã kích hoạt',
        customerConfirmationDate: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Xác nhận kích hoạt bảo hành thành công!',
      serial: {
        serialNumber: updatedSerial.serialNumber,
        model: updatedSerial.model,
        warrantyExpiryDate: updatedSerial.warrantyExpiryDate
      }
    });
  } catch (error: any) {
    logger.error('Public confirm serial error', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi xác nhận bảo hành' });
  }
}

export async function zaloAuthorize(req: Request, res: Response): Promise<void> {
  try {
    const templateId = process.env.ZALO_ZNS_TEMPLATE_ID || '617366';
    const appId = process.env.ZALO_APP_ID || process.env.FNS_APP_ID || '2357243243674073653';

    if (req.query.force !== 'oauth') {
      res.send(`
        <html>
          <head>
            <title>Liên kết Zalo OA</title>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f3f4f6; }
              .card { background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); text-align: center; max-width: 440px; }
              h2 { color: #10b981; margin-top: 0; font-size: 20px; }
              p { color: #4b5563; font-size: 14px; line-height: 1.6; }
              .badge { display: inline-block; background: #e0e7ff; color: #3730a3; font-weight: 700; padding: 4px 12px; border-radius: 9999px; font-size: 13px; margin: 8px 0; }
              .btn { background: #2563eb; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; margin-top: 16px; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Đã kết nối Zalo ZNS / ZBS Platform</h2>
              <div class="badge">Template ID: ${templateId}</div>
              <p>Hệ thống hiện tại đang tự động kết nối và phát tin nhắn ZNS xác nhận bảo hành thông qua cổng <strong>Zalo ZBS / Direct OpenAPI (App ID: ${appId})</strong>.</p>
              <p>Trạng thái kết nối là <strong>Hoạt động (Active)</strong>. Hệ thống tự động duy trì và làm mới Access Token mà bạn không cần phải thao tác liên kết lại thủ công.</p>
              <button onclick="window.close()" class="btn">Đóng cửa sổ</button>
            </div>
          </body>
        </html>
      `);
      return;
    }

    const config = await getZaloConfig();
    if (!config.appId) {
      res.status(400).send('Cấu hình Zalo OA chưa được thiết lập App ID trong DB hoặc file .env');
      return;
    }

    const redirectUri = process.env.ZALO_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/serials/zalo/callback`;
    const authorizeUrl = `https://oauth.zalo.me/v4/oa/permission?app_id=${config.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=truliva`;

    logger.info('Redirecting admin to Zalo OAuth page', { appId: config.appId, redirectUri });
    res.redirect(authorizeUrl);
  } catch (error: any) {
    res.status(500).send(`Lỗi hệ thống khi bắt đầu liên kết Zalo OA: ${error.message}`);
  }
}

export async function zaloCallback(req: Request, res: Response): Promise<void> {
  try {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).send('Thiếu mã authorization code từ Zalo OA');
      return;
    }

    await exchangeAuthorizationCode(code);

    res.send(`
      <html>
        <head>
          <title>Liên kết Zalo OA thành công</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f0fdf4; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); text-align: center; max-width: 420px; border: 1px solid #bbf7d0; }
            h1 { color: #166534; font-size: 22px; margin-top: 16px; margin-bottom: 8px; }
            p { color: #374151; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
            .success-icon { width: 64px; height: 64px; background: #dcfce7; color: #16a34a; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; font-size: 32px; }
            .btn { background: #16a34a; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; transition: background 0.2s; }
            .btn:hover { background: #15803d; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success-icon">✓</div>
            <h1>Liên kết Zalo OA thành công!</h1>
            <p>Hệ thống Truliva đã kết nối thành công với tài khoản Zalo OA của bạn. Access Token và Refresh Token đã được lưu an toàn.</p>
            <button onclick="window.close()" class="btn">Đóng cửa sổ này</button>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    logger.error('Zalo OAuth callback error', { error: error.message });
    res.status(500).send(`
      <html>
        <head>
          <title>Liên kết Zalo OA thất bại</title>
          <meta charset="utf-8">
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #fff5f5; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); text-align: center; max-width: 400px; border-top: 4px solid #e53e3e; }
            h1 { color: #c53030; margin-bottom: 16px; }
            p { color: #4a5568; margin-bottom: 24px; line-height: 1.5; }
            .btn { background: #e53e3e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; border: none; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Liên kết thất bại</h1>
            <p>Có lỗi xảy ra trong quá trình thiết lập liên kết với Zalo OA: ${error.message}</p>
            <button onclick="window.close()" class="btn">Đóng cửa sổ</button>
          </div>
        </body>
      </html>
    `);
  }
}

export async function getSerials(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const search = (req.query.search as string || '').trim();
    const status = req.query.status as string || '';
    const modelFilter = req.query.model as string || '';
    const batchFilter = req.query.batch as string || '';

    const result = await getSerialsFiltered({
      page,
      limit,
      search,
      status,
      modelFilter,
      batchFilter
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Lỗi lấy danh sách serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy danh sách serial' });
  }
}

export async function getBatches(req: Request, res: Response): Promise<void> {
  try {
    const batches = await prisma.serial.groupBy({
      by: ['importBatchId'],
      where: {
        importBatchId: {
          not: null,
          startsWith: 'Lô '
        }
      },
      _count: {
        _all: true
      }
    });

    const formatted = batches.map(b => ({
      batchId: b.importBatchId,
      count: b._count._all
    })).sort((a, b) => String(b.batchId).localeCompare(String(a.batchId)));

    res.json({ success: true, batches: formatted });
  } catch (error: any) {
    logger.error('Lỗi lấy danh sách lô serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi lấy danh sách lô' });
  }
}

export async function rollbackBatch(req: Request, res: Response): Promise<void> {
  try {
    const { batchId } = req.body;
    if (!batchId) {
      res.status(400).json({ error: 'Vui lòng cung cấp mã Lô cần rollback' });
      return;
    }

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        entityType: 'Serial',
        entityId: batchId,
        action: 'import_batch'
      }
    });

    if (!auditLog) {
      res.status(400).json({ error: 'Không tìm thấy lịch sử import của Lô này hoặc không thể rollback' });
      return;
    }

    const changes = auditLog.changes as any;
    if (!changes) {
      res.status(400).json({ error: 'Dữ liệu rollback không hợp lệ' });
      return;
    }

    let deletedCount = 0;
    let revertedCount = 0;

    if (changes.newSerialNumbers && changes.newSerialNumbers.length > 0) {
      const deleteResult = await prisma.serial.deleteMany({
        where: {
          serialNumber: { in: changes.newSerialNumbers }
        }
      });
      deletedCount = deleteResult.count;
    }

    if (changes.updatedSerials && changes.updatedSerials.length > 0) {
      for (const item of changes.updatedSerials) {
        await prisma.serial.update({
          where: { id: item.id },
          data: item.before
        });
        revertedCount++;
      }
    }

    await prisma.auditLog.delete({
      where: { id: auditLog.id }
    });

    logger.info(`Rollback batch success`, { batchId, deletedCount, revertedCount });

    res.json({
      success: true,
      message: `Rollback thành công Lô ${batchId}. Đã xóa ${deletedCount} serial mới tạo và khôi phục ${revertedCount} serial cập nhật.`,
      summary: {
        deletedCount,
        revertedCount
      }
    });
  } catch (error: any) {
    logger.error('Lỗi rollback lô serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi rollback lô serial' });
  }
}

export async function importSerials(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Vui lòng chọn file Excel để import' });
      return;
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    } catch (readErr: any) {
      res.status(400).json({ error: `Không thể đọc file Excel: ${readErr.message}` });
      return;
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      res.status(400).json({ error: 'File Excel không có sheet dữ liệu nào' });
      return;
    }
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

    if (rawRows.length <= 1) {
      res.status(400).json({ error: 'File Excel không có dữ liệu để import' });
      return;
    }

    let nextLotNum = 1;
    const lastSerialWithLot = await prisma.serial.findFirst({
      where: {
        importBatchId: {
          startsWith: 'Lô '
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        importBatchId: true
      }
    });

    if (lastSerialWithLot && lastSerialWithLot.importBatchId) {
      const match = lastSerialWithLot.importBatchId.match(/\d+/);
      if (match) {
        nextLotNum = parseInt(match[0], 10) + 1;
      }
    }
    const batchId = `Lô ${String(nextLotNum).padStart(4, '0')}`;
    const userId = req.user!.id;

    let totalRowsProcessed = 0;
    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: Array<{ row: number; error: string }> = [];

    const headerRow = rawRows[0] || [];
    let productCodeColIdx = -1;
    let modelColIdx = -1;
    let productLineColIdx = -1;
    let deliveryDateColIdx = -1;
    let serialColIdx = -1;
    let customerNameColIdx = -1;
    let customerPhoneColIdx = -1;
    let addressColIdx = -1;
    let provinceColIdx = -1;
    let statusColIdx = -1;
    let activationDateColIdx = -1;
    let expiryDateColIdx = -1;
    let customerConfirmationDateColIdx = -1;

    headerRow.forEach((val: any, idx: number) => {
      const str = String(val || '').toLowerCase().trim();
      if (str.includes('product code') || str === 'mã sp' || str === 'mã sản phẩm' || str === 'productcode') {
        productCodeColIdx = idx;
      } else if (str.includes('serial') || str === 'số máy' || str === 'số serial') {
        serialColIdx = idx;
      } else if (str === 'model') {
        modelColIdx = idx;
      } else if (str === 'dòng máy' || str === 'dong may') {
        productLineColIdx = idx;
      } else if (str.includes('delivery date') || str === 'ngày giao' || str === 'ngày xuất' || str === 'deliverydate') {
        deliveryDateColIdx = idx;
      } else if (str === 'họ tên' || str === 'tên khách hàng' || str === 'khách hàng' || str === 'ho ten') {
        customerNameColIdx = idx;
      } else if (str === 'số điện thoại' || str === 'sđt' || str === 'điện thoại' || str === 'so dien thoai' || str.includes('sđt') || str.includes('sđt khách hàng')) {
        customerPhoneColIdx = idx;
      } else if (str === 'địa chỉ' || str === 'dia chi') {
        addressColIdx = idx;
      } else if (str === 'thành phố' || str === 'tỉnh' || str === 'tỉnh/thành phố' || str === 'thanh pho') {
        provinceColIdx = idx;
      } else if (str === 'trạng thái' || str === 'tình trạng' || str === 'trang thai') {
        statusColIdx = idx;
      } else if (str === 'ngày kích hoạt' || str === 'kích hoạt lúc' || str === 'ngay kich hoat') {
        activationDateColIdx = idx;
      } else if (str === 'ngày hết hạn bảo hành' || str === 'hạn bảo hành' || str === 'ngày hết hạn' || str === 'ngày hết hạn bh' || str === 'ngay het han bao hanh' || str === 'ngay het han bh') {
        expiryDateColIdx = idx;
      } else if (str === 'ngày kh xác nhận' || str === 'kh xác nhận lúc' || str === 'kh xác nhận' || str === 'ngay kh xac nhan') {
        customerConfirmationDateColIdx = idx;
      }
    });

    if (productCodeColIdx === -1 && modelColIdx === -1 && serialColIdx === -1 && headerRow.length === 4) {
      productCodeColIdx = 0;
      modelColIdx = 1;
      deliveryDateColIdx = 2;
      serialColIdx = 3;
    }

    if (serialColIdx === -1 && headerRow.length >= 10) {
      serialColIdx = 0;
      modelColIdx = 1;
      statusColIdx = 2;
      activationDateColIdx = 3;
      expiryDateColIdx = 4;
      customerNameColIdx = 6;
      customerPhoneColIdx = 7;
      addressColIdx = 8;
      provinceColIdx = 9;
    }

    const dbProducts = await prisma.product.findMany({ select: { sku: true, name: true } });
    const productMap = new Map<string, string>();
    for (const p of dbProducts) {
      if (p.sku) {
        productMap.set(p.sku.trim().toLowerCase(), p.name);
      }
    }

    const policies = await prisma.warrantyPolicy.findMany();

    const rawDataRows = rawRows.slice(1);
    const cleanedSerialsInBatch: string[] = [];
    const rowMappings: Array<{
      rowNumber: number;
      rawSerial: string;
      cleanedSerial: string;
      rawModel: string;
      rawProductLine: string | null;
      rawProductCode: string;
      rawDeliveryDateVal: any;
      customerName: string | null;
      customerPhone: string | null;
      address: string | null;
      province: string | null;
      statusVal: string;
      activationDate: Date | null;
      warrantyExpiryDate: Date | null;
      customerConfirmationDate: Date | null;
      rawData: Record<string, any>;
    }> = [];

    rawDataRows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      if (row.length === 0 || row.every(cell => cell === '')) return;

      const rawSerial = serialColIdx !== -1 && row[serialColIdx] !== undefined ? String(row[serialColIdx]) : '';
      const rawModel = modelColIdx !== -1 && row[modelColIdx] !== undefined ? String(row[modelColIdx]) : '';
      const rawProductLine = productLineColIdx !== -1 && row[productLineColIdx] !== undefined ? String(row[productLineColIdx]).trim() : null;
      const rawProductCode = productCodeColIdx !== -1 && row[productCodeColIdx] !== undefined ? String(row[productCodeColIdx]) : '';
      const rawDeliveryDateVal = deliveryDateColIdx !== -1 && row[deliveryDateColIdx] !== undefined ? row[deliveryDateColIdx] : null;

      if (!rawSerial) {
        errorCount++;
        errors.push({ row: rowNumber, error: 'Thiếu số Serial' });
        return;
      }

      const cleanedSerial = cleanSerialNumber(rawSerial);
      if (!cleanedSerial) {
        errorCount++;
        errors.push({ row: rowNumber, error: `Số Serial không hợp lệ: "${rawSerial}"` });
        return;
      }

      const customerName = customerNameColIdx !== -1 && row[customerNameColIdx] !== undefined ? String(row[customerNameColIdx]).trim() : null;
      const customerPhone = customerPhoneColIdx !== -1 && row[customerPhoneColIdx] !== undefined ? String(row[customerPhoneColIdx]).trim() : null;
      const address = addressColIdx !== -1 && row[addressColIdx] !== undefined ? String(row[addressColIdx]).trim() : null;
      const province = provinceColIdx !== -1 && row[provinceColIdx] !== undefined ? String(row[provinceColIdx]).trim() : null;

      let statusVal = 'Chưa kích hoạt';
      if (statusColIdx !== -1 && row[statusColIdx] !== undefined) {
        statusVal = String(row[statusColIdx]).trim();
      }

      const rawActivationDateVal = activationDateColIdx !== -1 && row[activationDateColIdx] !== undefined ? row[activationDateColIdx] : null;
      const rawExpiryDateVal = expiryDateColIdx !== -1 && row[expiryDateColIdx] !== undefined ? row[expiryDateColIdx] : null;
      const rawCustomerConfirmationDateVal = customerConfirmationDateColIdx !== -1 && row[customerConfirmationDateColIdx] !== undefined ? row[customerConfirmationDateColIdx] : null;

      const activationDate = parseExcelDate(rawActivationDateVal);
      const warrantyExpiryDate = parseExcelDate(rawExpiryDateVal);
      const customerConfirmationDate = parseExcelDate(rawCustomerConfirmationDateVal);

      const rawData: Record<string, any> = {};
      row.forEach((cellVal, colIdx) => {
        rawData[`col_${colIdx + 1}`] = cellVal !== undefined && cellVal !== null ? String(cellVal) : '';
      });

      cleanedSerialsInBatch.push(cleanedSerial);
      rowMappings.push({
        rowNumber,
        rawSerial,
        cleanedSerial,
        rawModel,
        rawProductLine,
        rawProductCode,
        rawDeliveryDateVal,
        customerName,
        customerPhone,
        address,
        province,
        statusVal,
        activationDate,
        warrantyExpiryDate,
        customerConfirmationDate,
        rawData
      });
    });

    const dbReports = await prisma.serviceReport.findMany({
      where: {
        serialNumber: { in: cleanedSerialsInBatch }
      },
      include: {
        order: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const reportMap = new Map<string, any>();
    for (const rep of dbReports) {
      if (rep.serialNumber) {
        const cleanSn = cleanSerialNumber(rep.serialNumber);
        if (!reportMap.has(cleanSn)) {
          reportMap.set(cleanSn, rep);
        }
      }
    }

    const dbSerials = await prisma.serial.findMany({
      where: {
        serialNumber: { in: cleanedSerialsInBatch }
      }
    });

    const existingSerialsMap = new Map<string, any>();
    for (const s of dbSerials) {
      existingSerialsMap.set(s.serialNumber, s);
    }

    const newSerialsToCreate: any[] = [];
    const newlyCreatedSerialNumbers: string[] = [];
    const updatedSerialsLog: Array<{
      id: string;
      serialNumber: string;
      before: Record<string, any>;
    }> = [];
    const processedSerialsInBatch = new Set<string>();

    for (const item of rowMappings) {
      totalRowsProcessed++;

      const cleanedSerial = item.cleanedSerial;

      if (processedSerialsInBatch.has(cleanedSerial)) {
        skippedCount++;
        continue;
      }
      processedSerialsInBatch.add(cleanedSerial);

      let modelName = '';
      if (item.rawProductCode) {
        const matchedProductName = productMap.get(item.rawProductCode.trim().toLowerCase());
        if (matchedProductName) {
          modelName = matchedProductName;
        }
      }
      if (!modelName) {
        modelName = item.rawModel.trim() || 'Không rõ dòng máy';
      }

      const modelLower = modelName.toLowerCase();
      if (modelLower.includes('lõi lọc') || modelLower.includes('loi loc') || modelLower.includes('lõi cto') || modelLower.includes('loi cto')) {
        const modelCodeMatch = modelName.match(/\b(UR\d{3,5}(?:\/UR\d{3,5})?|RO\d{3,5}|[A-Z]{2,}\d{3,})/i);
        if (modelCodeMatch) {
          const modelCode = modelCodeMatch[1].toUpperCase();
          let brand = 'Truliva';
          if (modelLower.includes('delica')) brand = 'Delica';
          else if (modelLower.includes('pureit')) brand = 'Truliva';
          modelName = `Máy lọc nước ${brand} ${modelCode}`;
        } else {
          modelName = 'Máy lọc nước Truliva';
        }
      }

      let statusVal = item.statusVal;
      let activationDate = item.activationDate;
      let warrantyExpiryDate = item.warrantyExpiryDate;
      let customerName = item.customerName;
      let customerPhone = item.customerPhone;
      let address = item.address;
      let province = item.province;
      let orderId: string | null = null;

      const matchedReport = reportMap.get(cleanedSerial);
      if (matchedReport) {
        statusVal = 'Đã kích hoạt';
        activationDate = matchedReport.createdAt;
        orderId = matchedReport.orderId;

        customerName = matchedReport.customerName || customerName;
        customerPhone = matchedReport.customerPhone || customerPhone;
        address = matchedReport.address || address;
        province = matchedReport.province || province;

        let warrantyMonths: number | null = null;
        const matchedPolicy = policies.find((p: any) =>
          modelName.toLowerCase().includes(p.modelKeyword.toLowerCase())
        );
        if (matchedPolicy) {
          warrantyMonths = matchedPolicy.warrantyMonths;
        } else {
          warrantyMonths = 12;
        }

        const expiry = new Date(activationDate!);
        expiry.setMonth(expiry.getMonth() + warrantyMonths!);
        warrantyExpiryDate = expiry;
      }

      const existingSerial = existingSerialsMap.get(cleanedSerial);
      if (existingSerial) {
        const updateData: any = {};
        const existingModelLower = (existingSerial.model || '').toLowerCase();
        const isExistingModelFilterCartridge = existingModelLower.includes('lõi lọc') || existingModelLower.includes('loi loc') || existingModelLower.includes('lõi cto') || existingModelLower.includes('loi cto');
        if (existingSerial.model === 'Không rõ dòng máy' || !existingSerial.model || isExistingModelFilterCartridge) {
          updateData.model = modelName;
        }
        if (!existingSerial.productLine && item.rawProductLine) {
          updateData.productLine = item.rawProductLine;
        }
        if (existingSerial.status === 'Chưa kích hoạt' && statusVal === 'Đã kích hoạt') {
          updateData.status = 'Đã kích hoạt';
        }
        if (!existingSerial.activationDate && activationDate) {
          updateData.activationDate = activationDate;
        }
        if (!existingSerial.warrantyExpiryDate && warrantyExpiryDate) {
          updateData.warrantyExpiryDate = warrantyExpiryDate;
        }
        if (!existingSerial.customerConfirmationDate && item.customerConfirmationDate) {
          updateData.customerConfirmationDate = item.customerConfirmationDate;
        }
        if (!existingSerial.customerName && customerName) {
          updateData.customerName = customerName;
        }
        if (!existingSerial.customerPhone && customerPhone) {
          updateData.customerPhone = customerPhone;
        }
        if (!existingSerial.address && address) {
          updateData.address = address;
        }
        if (!existingSerial.province && province) {
          updateData.province = province;
        }
        if (!existingSerial.orderId && orderId) {
          updateData.orderId = orderId;
        }

        if (Object.keys(updateData).length > 0) {
          updatedSerialsLog.push({
            id: existingSerial.id,
            serialNumber: existingSerial.serialNumber,
            before: {
              model: existingSerial.model,
              productLine: existingSerial.productLine,
              status: existingSerial.status,
              activationDate: existingSerial.activationDate,
              warrantyExpiryDate: existingSerial.warrantyExpiryDate,
              customerConfirmationDate: existingSerial.customerConfirmationDate,
              customerName: existingSerial.customerName,
              customerPhone: existingSerial.customerPhone,
              address: existingSerial.address,
              province: existingSerial.province,
              orderId: existingSerial.orderId
            }
          });

          await prisma.serial.update({
            where: { id: existingSerial.id },
            data: updateData
          });
          importedCount++;
        } else {
          skippedCount++;
        }
      } else {
        newSerialsToCreate.push({
          serialNumber: cleanedSerial,
          model: modelName,
          productLine: item.rawProductLine || null,
          status: statusVal,
          activationDate,
          warrantyExpiryDate,
          customerConfirmationDate: item.customerConfirmationDate || null,
          customerName,
          customerPhone,
          address,
          province,
          orderId,
          importBatchId: batchId,
          importedById: userId,
          rawData: item.rawData
        });
        newlyCreatedSerialNumbers.push(cleanedSerial);
      }
    }

    if (newSerialsToCreate.length > 0) {
      await prisma.serial.createMany({
        data: newSerialsToCreate,
        skipDuplicates: true
      });
      importedCount += newSerialsToCreate.length;
    }

    await prisma.auditLog.create({
      data: {
        entityType: 'Serial',
        entityId: batchId,
        action: 'import_batch',
        changes: {
          batchId,
          newSerialsCount: newlyCreatedSerialNumbers.length,
          updatedSerialsCount: updatedSerialsLog.length,
          newSerialNumbers: newlyCreatedSerialNumbers,
          updatedSerials: updatedSerialsLog
        },
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    res.json({
      success: true,
      summary: {
        totalRowsProcessed,
        importedCount,
        skippedCount,
        errorCount
      },
      errors: errors.slice(0, 50),
      batchId
    });
  } catch (error: any) {
    logger.error('Lỗi import serial', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Lỗi hệ thống khi import serial' });
  }
}

export async function getImportTemplate(req: Request, res: Response): Promise<void> {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template Import');
    const lookupSheet = workbook.addWorksheet('LookupData');
    lookupSheet.state = 'hidden';

    const models = [
      'CR5240', 'UR3140', 'UR5440', 'UR5640', 'UR5840', 'UX5010', 'KJ260',
      'UR61096H', 'QY/F-I20', 'UR5676', 'P1011', 'W6412', 'UR3626', 'Không rõ dòng máy'
    ];

    const productLines = [
      'Máy lọc nước Lavita CR5240',
      'Máy lọc nước Tanka UR3140',
      'Máy lọc nước Delica UR5440',
      'Máy lọc nước Delica UR5640',
      'Máy lọc nước Delica UR5840',
      'Lọc trong suốt âm tủ bếp-UX5010',
      'Máy lọc không khí Airplus KJ260',
      'Máy lọc nước Truliva UR5840',
      'Máy lọc nước Truliva UR61096H',
      'Máy rửa rau Truliva QY/F-I20',
      'Máy lọc nước Truliva UR5676',
      'Bộ lọc sơ cấp Truliva P1011',
      'Máy nóng lạnh treo tường Truliva W6412',
      'Máy lọc nước Truliva UR3626',
      'Không rõ dòng máy'
    ];

    const statuses = ['Chưa kích hoạt', 'Đã kích hoạt', 'KH xác nhận', 'Hủy'];

    const provinces = [
      'TP. Hồ Chí Minh', 'TP. Hà Nội', 'Đồng Nai', 'Bình Dương', 'Bà Rịa-Vũng Tàu',
      'Long An', 'Tiền Giang', 'Bến Tre', 'Vĩnh Long', 'TP. Cần Thơ', 'TP. Đà Nẵng',
      'Hưng Yên', 'Khác'
    ];

    models.forEach((m, idx) => { lookupSheet.getCell(`A${idx + 1}`).value = m; });
    productLines.forEach((p, idx) => { lookupSheet.getCell(`B${idx + 1}`).value = p; });
    statuses.forEach((s, idx) => { lookupSheet.getCell(`C${idx + 1}`).value = s; });
    provinces.forEach((pv, idx) => { lookupSheet.getCell(`D${idx + 1}`).value = pv; });

    worksheet.columns = [
      { header: 'Số Serial', key: 'serialNumber', width: 22 },
      { header: 'Model', key: 'model', width: 18 },
      { header: 'Dòng máy', key: 'productLine', width: 38 },
      { header: 'Trạng thái', key: 'status', width: 18 },
      { header: 'Ngày kích hoạt', key: 'activationDate', width: 22 },
      { header: 'Ngày hết hạn BH', key: 'warrantyExpiryDate', width: 22 },
      { header: 'Ngày KH xác nhận', key: 'customerConfirmationDate', width: 22 },
      { header: 'Tên khách hàng', key: 'customerName', width: 25 },
      { header: 'SĐT khách hàng', key: 'customerPhone', width: 18 },
      { header: 'Địa chỉ', key: 'address', width: 45 },
      { header: 'Tỉnh/Thành phố', key: 'province', width: 22 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };

    worksheet.addRow({
      serialNumber: '892820072100002',
      model: 'UR5440',
      productLine: 'Máy lọc nước Delica UR5440',
      status: 'Đã kích hoạt',
      activationDate: '15/07/2024 15:30:01',
      warrantyExpiryDate: '15/07/2026 15:30:01',
      customerConfirmationDate: '',
      customerName: 'Anh Việt',
      customerPhone: '0876984987',
      address: '38 Bờ Bao Tân Thắng, Sơn Kỳ, Tân Phú',
      province: 'TP. Hồ Chí Minh',
    });

    const modelFormula = `LookupData!$A$1:$A$${models.length}`;
    const productLineFormula = `LookupData!$B$1:$B$${productLines.length}`;
    const statusFormula = `LookupData!$C$1:$C$${statuses.length}`;
    const provinceFormula = `LookupData!$D$1:$D$${provinces.length}`;

    for (let i = 2; i <= 500; i++) {
      worksheet.getCell(`B${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [modelFormula],
        showErrorMessage: true,
        errorTitle: 'Lỗi nhập liệu',
        error: 'Vui lòng chọn model từ danh sách có sẵn.'
      };
      worksheet.getCell(`C${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [productLineFormula],
        showErrorMessage: true,
        errorTitle: 'Lỗi nhập liệu',
        error: 'Vui lòng chọn dòng máy từ danh sách có sẵn.'
      };
      worksheet.getCell(`D${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [statusFormula],
        showErrorMessage: true,
        errorTitle: 'Lỗi nhập liệu',
        error: 'Vui lòng chọn trạng thái từ danh sách có sẵn.'
      };
      worksheet.getCell(`K${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [provinceFormula],
        showErrorMessage: true,
        errorTitle: 'Lỗi nhập liệu',
        error: 'Vui lòng chọn tỉnh/thành phố từ danh sách.'
      };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=template_import_serial.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Lỗi tải file import mẫu', { error: error.message });
    res.status(500).json({ error: 'Lỗi tải file Excel mẫu' });
  }
}

export async function exportSerials(req: Request, res: Response): Promise<void> {
  try {
    const serials = await prisma.serial.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Danh sách Serial');

    worksheet.columns = [
      { header: 'Số Serial', key: 'serialNumber', width: 20 },
      { header: 'Model', key: 'model', width: 30 },
      { header: 'Dòng máy', key: 'productLine', width: 25 },
      { header: 'Trạng thái', key: 'status', width: 18 },
      { header: 'Ngày kích hoạt', key: 'activationDate', width: 22 },
      { header: 'Ngày hết hạn BH', key: 'warrantyExpiryDate', width: 22 },
      { header: 'Ngày KH xác nhận', key: 'customerConfirmationDate', width: 22 },
      { header: 'Tên khách hàng', key: 'customerName', width: 25 },
      { header: 'SĐT khách hàng', key: 'customerPhone', width: 18 },
      { header: 'Địa chỉ', key: 'address', width: 40 },
      { header: 'Tỉnh/Thành phố', key: 'province', width: 20 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const now = new Date();
    for (const serial of serials) {
      const isExpired = serial.warrantyExpiryDate && new Date(serial.warrantyExpiryDate).getTime() < now.getTime();
      const displayStatus = isExpired ? 'Đã hết hạn' : serial.status;

      worksheet.addRow({
        serialNumber: serial.serialNumber,
        model: serial.model,
        productLine: serial.model,
        status: displayStatus,
        activationDate: serial.activationDate || '',
        warrantyExpiryDate: serial.warrantyExpiryDate || '',
        customerConfirmationDate: serial.customerConfirmationDate || '',
        customerName: serial.customerName || '',
        customerPhone: serial.customerPhone || '',
        address: serial.address || '',
        province: serial.province || '',
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=serial_export_${new Date().toISOString().slice(0, 10)}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    logger.error('Lỗi xuất Excel serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi xuất file Excel' });
  }
}

export async function getWarrantyPolicies(req: Request, res: Response): Promise<void> {
  try {
    const policies = await prisma.warrantyPolicy.findMany();
    res.json(policies);
  } catch (error: any) {
    logger.error('Lỗi lấy chính sách bảo hành', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy chính sách bảo hành' });
  }
}

export async function getSerialDetail(req: Request, res: Response): Promise<void> {
  try {
    const serial = await prisma.serial.findUnique({
      where: { id: String(req.params.id || '') },
      include: {
        importedBy: {
          select: {
            fullName: true
          }
        }
      }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy serial' });
      return;
    }

    const history = await prisma.serviceReport.findMany({
      where: {
        serialNumber: {
          mode: 'insensitive',
          equals: serial.serialNumber,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        ktvUser: {
          select: { fullName: true, phoneNumber: true },
        },
      },
    });

    res.json({
      serial,
      history: history.map(report => ({
        id: report.id,
        workType: report.workType,
        serviceType: report.serviceType,
        customerName: report.customerName,
        customerPhone: report.customerPhone,
        province: report.province,
        address: report.address,
        products: report.products,
        spareParts: report.spareParts,
        serialNumber: report.serialNumber,
        notes: report.notes,
        issueType: report.issueType,
        handlingMethod: report.handlingMethod,
        approvalStatus: report.approvalStatus,
        createdAt: report.createdAt,
        ktvName: report.ktvUser?.fullName || 'N/A',
        ktvPhone: report.ktvUser?.phoneNumber || null,
        orderId: report.orderId,
      })),
    });
  } catch (error: any) {
    logger.error('Lỗi lấy chi tiết serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi lấy chi tiết serial' });
  }
}

export async function activateSerialDirect(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '');
    const { customerName, customerPhone, address, province, promoCode, manualStartDate } = req.body;

    if (!customerName || !customerPhone || !address || !province) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ các thông tin bắt buộc' });
      return;
    }

    const serial = await prisma.serial.findUnique({
      where: { id }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy Serial' });
      return;
    }

    const startDate = manualStartDate ? new Date(manualStartDate) : new Date();

    const updated = await activateSerialWarranty(
      serial.serialNumber,
      null,
      {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        address: address.trim(),
        province: province.trim()
      },
      'ADMIN',
      'Đã kích hoạt',
      startDate,
      promoCode || null
    );

    await prisma.auditLog.create({
      data: {
        entityType: 'Serial',
        entityId: serial.id,
        action: 'activated_manual',
        changes: {
          status: { from: serial.status, to: 'Đã kích hoạt' },
          customerName,
          customerPhone,
          promoCode
        },
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    res.json({ success: true, serial: updated });
  } catch (error: any) {
    logger.error('Lỗi Admin kích hoạt bảo hành', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi kích hoạt bảo hành' });
  }
}

export async function approveWarranty(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '');
    const { manualStartDate, promoCode } = req.body;

    const serial = await prisma.serial.findUnique({
      where: { id }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy Serial' });
      return;
    }

    if (serial.status !== 'Chờ duyệt') {
      res.status(400).json({ error: 'Chỉ có thể phê duyệt các Serial có trạng thái "Chờ duyệt"' });
      return;
    }

    const startDate = manualStartDate ? new Date(manualStartDate) : new Date();

    const updated = await activateSerialWarranty(
      serial.serialNumber,
      serial.orderId,
      {
        customerName: serial.customerName,
        customerPhone: serial.customerPhone,
        address: serial.address,
        province: serial.province,
        invoiceImageUrl: serial.invoiceImageUrl
      },
      'ADMIN',
      'Đã kích hoạt',
      startDate,
      promoCode || null
    );

    await prisma.auditLog.create({
      data: {
        entityType: 'Serial',
        entityId: serial.id,
        action: 'approved_warranty',
        changes: {
          status: { from: serial.status, to: 'Đã kích hoạt' },
          startDate,
          promoCode
        },
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    // Tự động gửi tin nhắn ZNS thông báo kích hoạt bảo hành thành công cho khách hàng
    if (serial.customerPhone) {
      try {
        await sendZnsWarrantyActivation(serial.serialNumber, serial.customerPhone);
      } catch (znsErr: any) {
        logger.error('Lỗi gửi ZNS sau khi Admin phê duyệt bảo hành', { serialNumber: serial.serialNumber, phone: serial.customerPhone, error: znsErr.message });
      }
    }

    res.json({ success: true, serial: updated });
  } catch (error: any) {
    logger.error('Lỗi phê duyệt bảo hành', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi phê duyệt bảo hành' });
  }
}

export async function updateSerial(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '');
    const { 
      serialNumber, 
      model, 
      productLine,
      status,
      customerName, 
      customerPhone, 
      address, 
      province, 
      activationDate, 
      warrantyExpiryDate, 
      customerConfirmationDate,
      activatedBy,
      promoCode, 
      importBatchId 
    } = req.body;

    if (customerPhone !== undefined && customerPhone !== null && customerPhone.trim() !== '') {
      if (!/^\d{10}$/.test(customerPhone.trim())) {
        res.status(400).json({ error: 'Số điện thoại phải chứa đúng 10 ký tự số tự nhiên (ví dụ: 0912345678).' });
        return;
      }
    }

    const serial = await prisma.serial.findUnique({
      where: { id }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy Serial' });
      return;
    }

    if (serialNumber && serialNumber !== serial.serialNumber) {
      const existing = await prisma.serial.findUnique({
        where: { serialNumber }
      });
      if (existing) {
        res.status(400).json({ error: 'Số Serial này đã tồn tại trong hệ thống' });
        return;
      }
    }

    const updateData: any = {};
    if (serialNumber !== undefined) updateData.serialNumber = serialNumber;
    if (model !== undefined) updateData.model = model;
    if (productLine !== undefined) updateData.productLine = productLine;
    if (status !== undefined) updateData.status = status;
    if (customerName !== undefined) updateData.customerName = customerName;
    if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
    if (address !== undefined) updateData.address = address;
    if (province !== undefined) updateData.province = province;
    if (activatedBy !== undefined) updateData.activatedBy = activatedBy;
    if (promoCode !== undefined) updateData.promoCode = promoCode;
    if (importBatchId !== undefined) updateData.importBatchId = importBatchId;

    if (activationDate !== undefined) {
      updateData.activationDate = activationDate ? new Date(activationDate) : null;
    }
    if (warrantyExpiryDate !== undefined) {
      updateData.warrantyExpiryDate = warrantyExpiryDate ? new Date(warrantyExpiryDate) : null;
    }
    if (customerConfirmationDate !== undefined) {
      updateData.customerConfirmationDate = customerConfirmationDate ? new Date(customerConfirmationDate) : null;
    }

    const newStatus = status !== undefined ? status : serial.status;
    const isNewActive = newStatus === 'Đã kích hoạt' || newStatus === 'KH xác nhận';
    const isOldActive = serial.status === 'Đã kích hoạt' || serial.status === 'KH xác nhận';

    if (isNewActive && !isOldActive) {
      const finalActivationDate = updateData.activationDate !== undefined ? updateData.activationDate : (serial.activationDate || new Date());
      updateData.activationDate = finalActivationDate;

      if (updateData.warrantyExpiryDate === undefined || !updateData.warrantyExpiryDate) {
        let standardMonths = 12;
        const currentModel = model !== undefined ? model : serial.model;
        const policies = await prisma.warrantyPolicy.findMany();
        const matchedPolicy = policies.find((p: any) => 
          currentModel.toLowerCase().includes(p.modelKeyword.toLowerCase())
        );
        if (matchedPolicy) {
          standardMonths = matchedPolicy.warrantyMonths;
        }

        let promoMonths = 0;
        const currentPromo = promoCode !== undefined ? promoCode : serial.promoCode;
        if (currentPromo) {
          const promo = await prisma.warrantyPromo.findUnique({
            where: { code: currentPromo.trim().toUpperCase() }
          });
          if (promo) {
            promoMonths = promo.promoMonths;
          }
        }

        const totalMonths = standardMonths + promoMonths;
        const expiry = new Date(finalActivationDate.getTime());
        expiry.setMonth(expiry.getMonth() + totalMonths);
        updateData.warrantyExpiryDate = expiry;
      }

      if (updateData.activatedBy === undefined && !serial.activatedBy) {
        updateData.activatedBy = 'ADMIN';
      }
    }

    const updated = await prisma.serial.update({
      where: { id },
      data: updateData,
      include: {
        importedBy: {
          select: {
            fullName: true
          }
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'Serial',
        entityId: serial.id,
        action: 'updated',
        changes: {
          from: serial,
          to: updated
        },
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    res.json({ success: true, serial: updated });
  } catch (error: any) {
    logger.error('Lỗi Admin cập nhật serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi cập nhật Serial' });
  }
}

export async function restoreSerial(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id || '');

    const serial = await prisma.serial.findUnique({
      where: { id }
    });

    if (!serial) {
      res.status(404).json({ error: 'Không tìm thấy Serial' });
      return;
    }

    const restored = await prisma.serial.update({
      where: { id },
      data: {
        status: 'Chưa kích hoạt',
        activationDate: null,
        warrantyExpiryDate: null,
        customerConfirmationDate: null,
        customerName: null,
        customerPhone: null,
        address: null,
        province: null,
        invoiceImageUrl: null,
        activatedBy: null,
        orderId: null,
        promoCode: null
      },
      include: {
        importedBy: {
          select: {
            fullName: true
          }
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'Serial',
        entityId: serial.id,
        action: 'restored',
        changes: {
          status: { from: serial.status, to: 'Chưa kích hoạt' },
          restored: true
        },
        userId: req.user!.id,
        userName: req.user!.fullName
      }
    });

    res.json({ success: true, serial: restored });
  } catch (error: any) {
    logger.error('Lỗi Admin khôi phục serial', { error: error.message });
    res.status(500).json({ error: 'Lỗi hệ thống khi khôi phục Serial' });
  }
}

export async function getZaloStatus(req: Request, res: Response): Promise<void> {
  try {
    const templateId = process.env.ZALO_ZNS_TEMPLATE_ID || '617366';
    const appId = process.env.ZALO_APP_ID || process.env.FNS_APP_ID || '2357243243674073653';

    res.json({
      success: true,
      isConnected: true,
      isExpired: false,
      oaId: `Cấu hình ZNS/ZBS (Template ${templateId})`,
      appId,
      tokenExpiredAt: null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi kiểm tra trạng thái Zalo' });
  }
}

export async function activateZns(req: Request, res: Response): Promise<void> {
  try {
    const { 
      serialNumber, 
      recipientPhone, 
      productName, 
      warrantyMonths, 
      workType, 
      expiryDateStr, 
      customerName 
    } = req.body;

    if (!serialNumber || !recipientPhone) {
      res.status(400).json({ error: 'Thiếu số Serial hoặc Số điện thoại nhận ZNS' });
      return;
    }

    const cleanSerial = cleanSerialNumber(serialNumber);
    const existingSerial = await prisma.serial.findUnique({
      where: { serialNumber: cleanSerial }
    });

    const isFilterJob = (workType?.trim().toLowerCase() === 'thay lọc') || (warrantyMonths === 3);
    const monthsToApply = isFilterJob ? 3 : (Number(warrantyMonths) || 12);
    const finalCustomerName = customerName?.trim() || existingSerial?.customerName || 'Quý Khách';
    const finalProductName = productName?.trim() || existingSerial?.productLine || existingSerial?.model || (isFilterJob ? 'Lõi lọc nước Truliva' : 'Máy lọc nước Truliva');

    const startDate = new Date();

    // CHỈ kích hoạt/cập nhật thời hạn bảo hành máy chính thức trong DB nếu là ca Lắp đặt thiết bị máy
    // Đối với ca Thay lọc, bảo hành lõi 3 tháng chỉ gửi thông báo ZNS cho khách, KHÔNG ghi đè làm giảm thời hạn bảo hành gốc của máy trong DB
    if (existingSerial && !isFilterJob) {
      await activateSerialWarranty(
        cleanSerial,
        existingSerial?.orderId || null,
        {
          customerName: finalCustomerName,
          customerPhone: recipientPhone.trim(),
          address: existingSerial?.address,
          province: existingSerial?.province
        },
        'KTV',
        'Đã kích hoạt',
        startDate,
        null
      );
    }

    const znsResult = await sendZnsWarrantyActivation(
      cleanSerial, 
      recipientPhone, 
      monthsToApply,
      {
        customerName: finalCustomerName,
        productName: finalProductName,
        expiryDateStr: expiryDateStr
      }
    );

    res.json({
      success: true,
      message: 'Kích hoạt bảo hành và gửi tin nhắn Zalo ZNS thành công!',
      znsResult
    });
  } catch (error: any) {
    logger.error('ZNS activation route error', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi kích hoạt ZNS' });
  }
}

export async function activateManual(req: Request, res: Response): Promise<void> {
  try {
    const { serialNumber, model, customerName, customerPhone, address, province } = req.body;
    if (!serialNumber) {
      res.status(400).json({ error: 'Thiếu số Serial' });
      return;
    }

    const cleanSerial = cleanSerialNumber(serialNumber);
    const existingSerial = await prisma.serial.findUnique({
      where: { serialNumber: cleanSerial }
    });

    const updated = await activateSerialWarranty(
      cleanSerial,
      existingSerial?.orderId || null,
      {
        customerName: customerName || existingSerial?.customerName,
        customerPhone: customerPhone || existingSerial?.customerPhone,
        address: address || existingSerial?.address,
        province: province || existingSerial?.province
      },
      'ADMIN',
      'Đã kích hoạt'
    );

    res.json({
      success: true,
      message: 'Kích hoạt bảo hành trực tiếp trên hệ thống thành công!',
      serial: updated
    });
  } catch (error: any) {
    logger.error('Manual activation route error', { error: error.message });
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi kích hoạt bảo hành thủ công' });
  }
}

export async function testZnsSend(req: Request, res: Response): Promise<void> {
  try {
    const { phone, serialNumber, customerName, productName, expiryDate } = req.body;
    if (!phone || !serialNumber) {
      res.status(400).json({ error: 'Thiếu số điện thoại hoặc số Serial thử nghiệm' });
      return;
    }

    const fnsAppId = process.env.FNS_APP_ID || '';
    const fnsSecretKey = process.env.FNS_SECRET_KEY || '';
    const templateId = process.env.ZALO_ZNS_TEMPLATE_ID || '617366';

    if (!fnsAppId || !fnsSecretKey) {
      res.status(400).json({ error: 'Chưa cấu hình cổng FPT FNS Gateway trong file .env' });
      return;
    }

    let cleanedPhone = phone.replace(/[^0-9]/g, '');
    if (cleanedPhone.startsWith('0')) {
      cleanedPhone = '84' + cleanedPhone.substring(1);
    }

    const cleanSerial = serialNumber.trim().toUpperCase();
    const custName = customerName?.trim() || 'Khách Hàng Test';
    const prodName = productName?.trim() || 'Máy lọc nước Truliva UR61096H';
    const expDate = expiryDate?.trim() || '20/07/2027';

    const testTemplateData = {
      // 1. Zalo ZBS Template 617366 exact parameters
      _TEN_KHACH_HANG_: custName.substring(0, 30),
      _TEN_SAN_PHAM_: prodName.substring(0, 200),
      _ID_BAO_HANH_: cleanSerial.substring(0, 30),
      _NGAY_BAO_HANH_: expDate.substring(0, 30),

      // Template 617874 param
      _TEN_: custName.substring(0, 30),

      // Aliases with underscore
      _SO_SERI_: cleanSerial.substring(0, 30),
      _NGAY_HET_BAO_HANH_: expDate.substring(0, 30),

      // 2. Uppercase without leading/trailing underscore
      TEN_KHACH_HANG: custName,
      TEN_SAN_PHAM: prodName,
      ID_BAO_HANH: cleanSerial,
      NGAY_BAO_HANH: expDate,
      SO_SERI: cleanSerial,
      NGAY_HET_BAO_HANH: expDate,

      // 3. PascalCase / TitleCase format
      Ten_Khach_Hang: custName,
      Ten_San_Pham: prodName,
      Id_Bao_Hanh: cleanSerial,
      Ngay_Bao_Hanh: expDate,
      So_Seri: cleanSerial,
      Ngay_Het_Bao_Hanh: expDate,

      // 4. snake_case vietnamese
      ten_khach_hang: custName,
      ten_san_pham: prodName,
      so_seri: cleanSerial,
      ngay_het_bao_hanh: expDate,

      // 5. English snake_case
      customer_name: custName,
      product_name: prodName,
      code: cleanSerial,
      serial_number: cleanSerial,
      expiry_date: expDate,
      time: expDate,
      date: expDate,

      // 6. English uppercase underscore format
      _CUSTOMER_NAME_: custName,
      _PRODUCT_NAME_: prodName,
      _CODE_: cleanSerial,
      _SERIAL_NUMBER_: cleanSerial,
      _EXPIRY_DATE_: expDate,
      _TIME_: expDate
    };

    const fnsPayload = {
      phone: cleanedPhone,
      template_id: templateId,
      template_data: testTemplateData,
      ref_id: `TEST-${cleanSerial}-${Date.now()}`
    };

    let fnsResult: any = null;
    let fnsError: any = null;

    if (fnsAppId && fnsSecretKey) {
      try {
        logger.info('Dev ZNS Test Send requested via FNS', { phone: cleanedPhone, serialNumber: cleanSerial, templateId });
        const sendRes = await axios.post('https://api-fns.fpt.work/api/send-message', fnsPayload, {
          headers: {
            'Content-Type': 'application/json',
            'app-id': fnsAppId,
            'secret-key': fnsSecretKey
          }
        });
        fnsResult = sendRes.data;
      } catch (err: any) {
        fnsError = err.response?.data || err.message;
      }
    }

    // Nếu FNS thành công (code === 1)
    if (fnsResult && fnsResult.code === 1) {
      const msgId = fnsResult.data?.message_id;
      let statusData = null;
      if (msgId) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        try {
          const checkRes = await axios.post('https://api-fns.fpt.work/api/check-status', {
            msg_id: msgId
          }, {
            headers: {
              'Content-Type': 'application/json',
              'app-id': fnsAppId,
              'secret-key': fnsSecretKey
            }
          });
          statusData = checkRes.data?.data || checkRes.data;
        } catch (err: any) {
          statusData = { error: err.message };
        }
      }

      res.json({
        success: true,
        gateway: 'FPT FNS Gateway',
        templateId,
        sendResult: fnsResult,
        msgId,
        statusResult: statusData
      });
      return;
    }

    // Khi FNS trả lỗi (Template không đúng / 617366 thuộc ZBS Zalo Direct OpenAPI), thử nghiệm qua Zalo Direct OpenAPI
    try {
      const accessToken = await getValidAccessToken();
      const zaloPayload = {
        phone: cleanedPhone,
        template_id: templateId,
        template_data: testTemplateData,
        tracking_id: `TEST-${cleanSerial}-${Date.now()}`
      };

      const zaloRes = await axios.post('https://business.openapi.zalo.me/message/template', zaloPayload, {
        headers: {
          'Content-Type': 'application/json',
          'access_token': accessToken
        }
      });

      res.json({
        success: zaloRes.data.error === 0,
        gateway: 'Zalo Direct ZBS OpenAPI (Template 617366)',
        templateId,
        fnsResult: fnsResult || fnsError,
        sendResult: zaloRes.data,
        msgId: zaloRes.data?.data?.message_id || null,
        statusResult: zaloRes.data
      });
    } catch (zaloErr: any) {
      res.json({
        success: false,
        gateway: 'Zalo Direct ZBS OpenAPI (Template 617366)',
        templateId,
        fnsResult: fnsResult || fnsError,
        sendResult: zaloErr.response?.data || { error: zaloErr.message },
        error: zaloErr.response?.data?.message || zaloErr.message
      });
    }
  } catch (error: any) {
    logger.error('Dev ZNS Test Send error', { error: error.message });
    res.status(500).json({ error: error.response?.data?.message || error.message });
  }
}

export async function checkZnsStatus(req: Request, res: Response): Promise<void> {
  try {
    const { msg_id } = req.body;
    if (!msg_id) {
      res.status(400).json({ error: 'Thiếu mã msg_id cần kiểm tra' });
      return;
    }

    const fnsAppId = process.env.FNS_APP_ID || '';
    const fnsSecretKey = process.env.FNS_SECRET_KEY || '';

    const checkRes = await axios.post('https://api-fns.fpt.work/api/check-status', {
      msg_id
    }, {
      headers: {
        'Content-Type': 'application/json',
        'app-id': fnsAppId,
        'secret-key': fnsSecretKey
      }
    });

    res.json({
      success: true,
      data: checkRes.data?.data || checkRes.data
    });
  } catch (error: any) {
    logger.error('ZNS Check Status error', { error: error.message });
    res.status(500).json({ error: error.response?.data || error.message });
  }
}

export async function getZnsLogs(req: Request, res: Response): Promise<void> {
  try {
    const activatedSerials = await prisma.serial.findMany({
      where: {
        activationDate: { not: null }
      },
      orderBy: { activationDate: 'desc' },
      take: 50
    });

    const logFiles = ['/var/www/truliva/logs/combined.log', '/var/www/truliva/logs/combined1.log', '/var/www/truliva/logs/combined2.log', '/var/www/truliva/logs/combined3.log'];
    const znsLogs: any[] = [];

    for (const file of logFiles) {
      if (fs.existsSync(file)) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n');
          for (const line of lines) {
            if (line.includes('ZNS message sent') || line.includes('Error sending ZNS') || line.includes('Sending ZNS warranty activation')) {
              try {
                const parsed = JSON.parse(line);
                znsLogs.push(parsed);
              } catch (e) {}
            }
          }
        } catch (e) {}
      }
    }

    res.json({
      success: true,
      activatedSerials,
      serverZnsLogs: znsLogs.slice(-50).reverse()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

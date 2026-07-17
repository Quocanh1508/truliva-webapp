import prisma from '../config/database';
import logger from '../utils/logger';

export interface ActivationCustomerInfo {
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  province?: string | null;
  invoiceImageUrl?: string | null;
}

/**
 * Trích xuất thời gian bảo hành (số tháng) từ ghi chú/note.
 * Nhận diện các mẫu: "bảo hành 24 tháng", "bh 12 thang", "BH 24T", "bh 2 năm", "bao hanh 1 nam", "bh 3n"
 */
export function extractWarrantyMonths(note: string | null | undefined): number | null {
  if (!note) return null;
  const normalized = note.toLowerCase().trim();

  // 1. Matches "bảo hành X tháng", "bh X tháng", "bh Xt", "bh Xthang"
  const monthRegex = /(?:bảo hành|bao hanh|bh)\s*(\d+)\s*(?:tháng|thang|t)(?:\s|$|[^a-z])/i;
  const matchMonth = normalized.match(monthRegex);
  if (matchMonth) {
    const val = parseInt(matchMonth[1], 10);
    if (val > 0 && val <= 120) return val;
  }

  // 2. Matches "bảo hành X năm", "bh X năm", "bh Xn", "bh Xnam"
  const yearRegex = /(?:bảo hành|bao hanh|bh)\s*(\d+)\s*(?:năm|nam|n)(?:\s|$|[^a-z])/i;
  const matchYear = normalized.match(yearRegex);
  if (matchYear) {
    const val = parseInt(matchYear[1], 10);
    if (val > 0 && val <= 10) return val * 12;
  }

  return null;
}

/**
 * Kích hoạt hoặc chuyển trạng thái chờ duyệt bảo hành cho một số Serial
 * @param serialNumber Số serial cần kích hoạt
 * @param orderId ID đơn hàng liên kết (nếu có)
 * @param customerInfo Thông tin khách hàng
 * @param activatedBy Người thực hiện: "CUSTOMER" | "KTV" | "ADMIN"
 * @param forceStatus Trạng thái ép buộc (VD: "Chờ duyệt" cho khách hàng tự kích hoạt, hoặc "Đã kích hoạt")
 * @param manualStartDate Ngày bắt đầu bảo hành thủ công (nếu Admin tự chọn, mặc định là hôm nay)
 * @param manualPromoCode Mã khuyến mãi truyền trực tiếp (nếu có, VD: Admin áp mã trực tiếp)
 */
export async function activateSerialWarranty(
  serialNumber: string,
  orderId: string | null,
  customerInfo: ActivationCustomerInfo,
  activatedBy: 'CUSTOMER' | 'KTV' | 'ADMIN',
  forceStatus?: 'Chờ duyệt' | 'Đã kích hoạt',
  manualStartDate?: Date,
  manualPromoCode?: string | null
) {
  const cleanedSerial = serialNumber.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
  
  let existingSerial = await prisma.serial.findUnique({
    where: { serialNumber: cleanedSerial }
  });

  if (!existingSerial) {
    throw new Error(`Số Serial "${cleanedSerial}" không tồn tại trong hệ thống.`);
  }

  // Quyết định trạng thái
  const targetStatus = forceStatus || (activatedBy === 'CUSTOMER' ? 'Chờ duyệt' : 'Đã kích hoạt');

  const serialUpdate: any = {
    status: targetStatus,
    activatedBy,
  };

  // Cập nhật thông tin khách hàng nếu chưa có hoặc có truyền vào
  if (customerInfo.customerName) serialUpdate.customerName = customerInfo.customerName.trim();
  if (customerInfo.customerPhone) serialUpdate.customerPhone = customerInfo.customerPhone.trim();
  if (customerInfo.address) serialUpdate.address = customerInfo.address.trim();
  if (customerInfo.province) serialUpdate.province = customerInfo.province.trim();
  if (customerInfo.invoiceImageUrl) serialUpdate.invoiceImageUrl = customerInfo.invoiceImageUrl.trim();
  if (orderId) serialUpdate.orderId = orderId;

  // Nếu chuyển sang trạng thái "Đã kích hoạt" hoặc "Chờ duyệt", tiến hành tính toán thời hạn bảo hành
  if (targetStatus === 'Đã kích hoạt' || targetStatus === 'Chờ duyệt') {
    const startDate = manualStartDate || new Date();
    serialUpdate.activationDate = startDate;

    // 1. Tính toán thời gian bảo hành tiêu chuẩn (mặc định 12 tháng)
    let standardMonths = 12;
    let noteMonths: number | null = null;
    let finalOrderId = orderId;
    if (!finalOrderId && existingSerial.orderId) {
      finalOrderId = existingSerial.orderId;
    }

    if (finalOrderId) {
      const order = await prisma.order.findUnique({
        where: { id: finalOrderId },
        select: { note: true, rawData: true }
      });
      if (order) {
        noteMonths = extractWarrantyMonths(order.note);
        if (!noteMonths && order.rawData) {
          let rawJson: any = order.rawData;
          if (typeof rawJson === 'string') {
            try { rawJson = JSON.parse(rawJson); } catch (e) {}
          }
          if (rawJson) {
            noteMonths = extractWarrantyMonths(rawJson.note) || extractWarrantyMonths(rawJson.description) || extractWarrantyMonths(rawJson.customer_note);
          }
        }
      }
    }

    if (noteMonths !== null) {
      standardMonths = noteMonths;
      logger.info(`Extracted custom standard warranty of ${standardMonths} months from order notes`, { serialNumber: cleanedSerial });
    } else {
      const policies = await prisma.warrantyPolicy.findMany();
      const matchedPolicy = policies.find((p: any) => 
        existingSerial.model.toLowerCase().includes(p.modelKeyword.toLowerCase())
      );
      if (matchedPolicy) {
        standardMonths = matchedPolicy.warrantyMonths;
      }
    }

    // 2. Tính toán thời gian khuyến mãi cộng thêm từ mã khuyến mãi của Đơn hàng hoặc mã truyền tay
    let promoMonths = 0;
    let appliedPromoCode = manualPromoCode ? manualPromoCode.trim().toUpperCase() : null;

    if (!appliedPromoCode) {
      let finalOrderId = orderId;
      if (!finalOrderId && existingSerial.orderId) {
        finalOrderId = existingSerial.orderId;
      }

      if (finalOrderId) {
        const order = await prisma.order.findUnique({
          where: { id: finalOrderId },
          select: { promoCode: true }
        });
        if (order && order.promoCode) {
          appliedPromoCode = order.promoCode;
        }
      }
    }

    if (appliedPromoCode) {
      const promo = await prisma.warrantyPromo.findUnique({
        where: { code: appliedPromoCode }
      });

      if (promo && !promo.isLocked) {
        const now = new Date();
        const isStarted = !promo.startDate || now >= new Date(promo.startDate);
        const isNotExpired = !promo.endDate || now <= new Date(promo.endDate);
        const isModelApplicable = !promo.applicableModels || 
                                 promo.applicableModels.length === 0 || 
                                 promo.applicableModels.some(kw => 
                                   existingSerial.model.toLowerCase().includes(kw.toLowerCase())
                                 );

        if (isStarted && isNotExpired && isModelApplicable) {
          promoMonths = promo.promoMonths;
        } else {
          appliedPromoCode = null; // Không áp dụng nếu không thỏa mãn điều kiện
        }
      } else {
        appliedPromoCode = null; // Không áp dụng nếu mã bị khóa hoặc không tồn tại
      }
    }

    const totalMonths = standardMonths + promoMonths;
    const expiryDate = new Date(startDate);
    expiryDate.setMonth(expiryDate.getMonth() + totalMonths);

    serialUpdate.warrantyExpiryDate = expiryDate;
    serialUpdate.promoCode = appliedPromoCode; // Gán mã khuyến mãi (null nếu không áp dụng)
  }

  const updatedSerial = await prisma.serial.update({
    where: { id: existingSerial.id },
    data: serialUpdate
  });

  logger.info(`Serial warranty updated via ${activatedBy}`, {
    serialNumber: cleanedSerial,
    status: targetStatus,
    warrantyExpiryDate: serialUpdate.warrantyExpiryDate
  });

  return updatedSerial;
}

export async function syncSerialFromReport(
  serialNumber: string,
  orderId: string | null,
  customerInfo: {
    customerName?: string | null;
    customerPhone?: string | null;
    address?: string | null;
    province?: string | null;
  }
) {
  const cleanedSerial = serialNumber.trim().replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
  if (!cleanedSerial) return null;

  let existingSerial = await prisma.serial.findUnique({
    where: { serialNumber: cleanedSerial }
  });

  let model = 'Không rõ dòng máy';
  if (orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    });
    if (order && order.items && order.items.length > 0) {
      const productNames = order.items.map(i => i.productName).filter(Boolean) as string[];
      if (productNames.length > 0) {
        const deviceProduct = await prisma.product.findFirst({
          where: {
            name: { in: productNames },
            category: { contains: 'Device', mode: 'insensitive' }
          }
        });
        if (deviceProduct) {
          model = deviceProduct.name;
        }
      }
    }
  }

  const serialData: any = {};
  if (customerInfo.customerName) serialData.customerName = customerInfo.customerName.trim();
  if (customerInfo.customerPhone) serialData.customerPhone = customerInfo.customerPhone.trim();
  if (customerInfo.address) serialData.address = customerInfo.address.trim();
  if (customerInfo.province) serialData.province = customerInfo.province.trim();
  if (orderId) serialData.orderId = orderId;

  if (!existingSerial) {
    logger.warn('Skipping serial sync: serial number does not exist in system', { serialNumber: cleanedSerial });
    return null;
  } else {
    const dataToUpdate: any = {};
    if (!existingSerial.customerName && serialData.customerName) dataToUpdate.customerName = serialData.customerName;
    if (!existingSerial.customerPhone && serialData.customerPhone) dataToUpdate.customerPhone = serialData.customerPhone;
    if (!existingSerial.address && serialData.address) dataToUpdate.address = serialData.address;
    if (!existingSerial.province && serialData.province) dataToUpdate.province = serialData.province;
    if (!existingSerial.orderId && serialData.orderId) dataToUpdate.orderId = serialData.orderId;

    if (Object.keys(dataToUpdate).length > 0) {
      existingSerial = await prisma.serial.update({
        where: { id: existingSerial.id },
        data: dataToUpdate
      });
      logger.info('Updated existing Serial customer details from KTV report', { serialNumber: cleanedSerial });
    }
  }

  return existingSerial;
}

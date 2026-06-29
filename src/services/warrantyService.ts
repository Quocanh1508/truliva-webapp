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
  
  const existingSerial = await prisma.serial.findUnique({
    where: { serialNumber: cleanedSerial }
  });

  if (!existingSerial) {
    throw new Error(`Không tìm thấy số Serial "${serialNumber}" trong hệ thống.`);
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

  // Nếu chuyển sang trạng thái "Đã kích hoạt", tiến hành tính toán thời hạn bảo hành
  if (targetStatus === 'Đã kích hoạt') {
    const startDate = manualStartDate || new Date();
    serialUpdate.activationDate = startDate;

    // 1. Tính toán thời gian bảo hành tiêu chuẩn (mặc định 12 tháng)
    let standardMonths = 12;
    const policies = await prisma.warrantyPolicy.findMany();
    const matchedPolicy = policies.find((p: any) => 
      existingSerial.model.toLowerCase().includes(p.modelKeyword.toLowerCase())
    );
    if (matchedPolicy) {
      standardMonths = matchedPolicy.warrantyMonths;
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

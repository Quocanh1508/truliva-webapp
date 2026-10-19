import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import logger from '../utils/logger';
import { getNextManualOrderId } from '../services/orderService';

// ══════════════════════════════════════════════════════════════════════════
//  Shop & Legal Compliance Controller for Zalo Mini App
//  Tuân thủ Luật TMĐT 2025 & Nghị định 248/2026/NĐ-CP
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/zalo-miniapp/shop/products
 * Lấy danh sách sản phẩm bán hàng trực tiếp trên Mini App
 */
export async function getShopProducts(req: Request, res: Response): Promise<void> {
  try {
    const category = (req.query.category as string || 'ALL').trim().toUpperCase();
    const search = (req.query.search as string || '').trim();

    const where: any = { isActive: true };

    if (category && category !== 'ALL') {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { shortDesc: { contains: search, mode: 'insensitive' } }
      ];
    }

    const products = await prisma.shopProduct.findMany({
      where,
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (error: any) {
    logger.error('Error fetching shop products', { error: error.message });
    res.status(500).json({ success: false, error: 'Lỗi khi tải danh sách sản phẩm' });
  }
}

/**
 * GET /api/zalo-miniapp/shop/products/:slugOrId
 * Lấy chi tiết 1 sản phẩm theo slug, sku hoặc id
 */
export async function getShopProductDetail(req: Request, res: Response): Promise<void> {
  try {
    const slugOrId = String(req.params.slugOrId || '').trim();
    if (!slugOrId) {
      res.status(400).json({ success: false, error: 'Thiếu định danh sản phẩm' });
      return;
    }

    const product = await prisma.shopProduct.findFirst({
      where: {
        OR: [
          { id: slugOrId },
          { slug: slugOrId },
          { sku: slugOrId.toUpperCase() }
        ],
        isActive: true
      }
    });

    if (!product) {
      res.status(404).json({ success: false, error: 'Không tìm thấy sản phẩm' });
      return;
    }

    // Gợi ý các sản phẩm liên quan cùng danh mục
    const relatedProducts = await prisma.shopProduct.findMany({
      where: {
        category: product.category,
        id: { not: product.id },
        isActive: true
      },
      take: 4,
      orderBy: { sortOrder: 'asc' }
    });

    res.json({
      success: true,
      product,
      relatedProducts
    });
  } catch (error: any) {
    logger.error('Error fetching shop product detail', { error: error.message });
    res.status(500).json({ success: false, error: 'Lỗi khi tải chi tiết sản phẩm' });
  }
}

/**
 * GET /api/zalo-miniapp/shop/legal-docs
 * Lấy danh sách 8 văn bản pháp lý TMĐT
 */
export async function getLegalDocuments(req: Request, res: Response): Promise<void> {
  try {
    const docs = await prisma.legalDocument.findMany({
      select: {
        id: true,
        type: true,
        title: true,
        version: true,
        summary: true,
        effectiveDate: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      documents: docs
    });
  } catch (error: any) {
    logger.error('Error fetching legal documents', { error: error.message });
    res.status(500).json({ success: false, error: 'Lỗi khi tải tài liệu pháp lý' });
  }
}

/**
 * GET /api/zalo-miniapp/shop/legal-docs/:type
 * Lấy nội dung chi tiết 1 văn bản pháp lý theo Type
 */
export async function getLegalDocumentByType(req: Request, res: Response): Promise<void> {
  try {
    const docType = String(req.params.type || '').trim().toUpperCase();
    const doc = await prisma.legalDocument.findUnique({
      where: { type: docType }
    });

    if (!doc) {
      res.status(404).json({ success: false, error: 'Không tìm thấy văn bản pháp lý này' });
      return;
    }

    res.json({
      success: true,
      document: doc
    });
  } catch (error: any) {
    logger.error('Error fetching legal document detail', { error: error.message });
    res.status(500).json({ success: false, error: 'Lỗi khi tải nội dung pháp lý' });
  }
}

/**
 * POST /api/zalo-miniapp/shop/orders
 * Đặt hàng trên Zalo Mini App kèm lưu Legal Consent Audit Trail và Tự động tạo ca điều phối KTV
 */
export async function createShopOrder(req: Request, res: Response): Promise<void> {
  try {
    const {
      customerName,
      customerPhone,
      address,
      province,
      district,
      ward,
      note,
      items,
      voucherCode,
      paymentMethod = 'COD',
      consents // { termsAccepted: boolean, privacyAccepted: boolean }
    } = req.body;

    if (!customerName?.trim() || !customerPhone?.trim() || !address?.trim()) {
      res.status(400).json({ success: false, error: 'Vui lòng cung cấp đầy đủ Tên, Số điện thoại và Địa chỉ giao nhận' });
      return;
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'Giỏ hàng của bạn đang trống' });
      return;
    }

    // ⚖️ BẮT BUỘC THEO LUẬT TMĐT 2025: Kiểm tra sự chấp thuận Điều khoản & Bảo mật
    if (!consents || !consents.termsAccepted || !consents.privacyAccepted) {
      res.status(400).json({
        success: false,
        error: 'Quý khách vui lòng đọc và đồng ý với Điều khoản giao dịch và Chính sách bảo mật trước khi đặt hàng'
      });
      return;
    }

    const cleanPhone = customerPhone.trim();
    const ipAddress = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();

    // 1. Tính toán giá trị đơn hàng thực tế
    let totalAmount = 0;
    const validatedItems: Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    for (const item of items) {
      const product = await prisma.shopProduct.findUnique({
        where: { id: item.productId }
      });

      if (!product || !product.isActive) {
        res.status(400).json({ success: false, error: `Sản phẩm ${item.productName || ''} không còn khả dụng` });
        return;
      }

      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      const itemTotal = product.price * qty;
      totalAmount += itemTotal;

      validatedItems.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        unitPrice: product.price,
        totalPrice: itemTotal
      });
    }

    // 2. Tính giảm giá Voucher (nếu có)
    let discountAmount = 0;
    let appliedVoucherCode: string | null = null;
    if (voucherCode?.trim()) {
      const vCode = voucherCode.trim().toUpperCase();
      if (vCode === 'TRULIVA500' && totalAmount >= 10000000) {
        discountAmount = 500000;
        appliedVoucherCode = vCode;
      } else if (vCode === 'GIAM100K' && totalAmount >= 1000000) {
        discountAmount = 100000;
        appliedVoucherCode = vCode;
      } else if (vCode === '12THANGBH') {
        // Tặng thêm 12 tháng bảo hành
        appliedVoucherCode = vCode;
      }
    }

    const shippingFee = 0; // Miễn phí 100% giao hàng & lắp đặt
    const finalAmount = Math.max(0, totalAmount - discountAmount + shippingFee);

    // 3. Tạo mã đơn hàng duy nhất
    const datePrefix = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderCode = `TRU-${datePrefix}-${randomSuffix}`;

    // 4. Lấy các văn bản pháp lý đang có hiệu lực để lưu Consent
    const termsDoc = await prisma.legalDocument.findUnique({ where: { type: 'TERMS' } });
    const privacyDoc = await prisma.legalDocument.findUnique({ where: { type: 'PRIVACY' } });

    // 5. Thực thi Transaction tạo Đơn hàng Shop + Consent + Ca dịch vụ nội bộ
    const result = await prisma.$transaction(async (tx) => {
      // 5.1 Tạo ShopOrder
      const shopOrder = await tx.shopOrder.create({
        data: {
          orderCode,
          zaloUserId: (req as any).zaloUser?.id || null,
          customerName: customerName.trim(),
          customerPhone: cleanPhone,
          address: address.trim(),
          province: province?.trim() || null,
          district: district?.trim() || null,
          ward: ward?.trim() || null,
          note: note?.trim() || null,
          totalAmount,
          discountAmount,
          shippingFee,
          finalAmount,
          voucherCode: appliedVoucherCode,
          paymentMethod: paymentMethod.toUpperCase(),
          paymentStatus: 'PENDING',
          orderStatus: 'PENDING',
          items: {
            create: validatedItems.map(i => ({
              productId: i.productId,
              productName: i.productName,
              sku: i.sku,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              totalPrice: i.totalPrice
            }))
          }
        },
        include: {
          items: true
        }
      });

      // 5.2 Ghi nhận Legal Consent Audit Trail (Điều khoản giao dịch)
      if (termsDoc) {
        await tx.customerConsent.create({
          data: {
            phone: cleanPhone,
            customerName: customerName.trim(),
            legalDocumentId: termsDoc.id,
            documentType: 'TERMS',
            version: termsDoc.version,
            consentStatus: true,
            ipAddress,
            orderId: shopOrder.id
          }
        });
      }

      // 5.3 Ghi nhận Legal Consent Audit Trail (Chính sách bảo mật)
      if (privacyDoc) {
        await tx.customerConsent.create({
          data: {
            phone: cleanPhone,
            customerName: customerName.trim(),
            legalDocumentId: privacyDoc.id,
            documentType: 'PRIVACY',
            version: privacyDoc.version,
            consentStatus: true,
            ipAddress,
            orderId: shopOrder.id
          }
        });
      }

      // 5.4 Tự động tạo Ca Dịch Vụ Nội Bộ (Internal Order) trên Web Admin để Điều phối viên phân KTV
      try {
        const fullItemsText = validatedItems.map(i => `${i.productName} (x${i.quantity})`).join(', ');
        const internalPancakeId = await getNextManualOrderId(tx);
        const isVietQr = paymentMethod.toUpperCase() === 'VIETQR';
        const internalOrder = await tx.order.create({
          data: {
            pancakeOrderId: internalPancakeId,
            billFullName: customerName.trim(),
            billPhoneNumber: cleanPhone,
            shippingAddress: {
              full_address: address.trim(),
              province: province?.trim() || 'Hồ Chí Minh',
              district: district?.trim() || '',
              ward: ward?.trim() || ''
            },
            workType: 'Giao hàng và Lắp đặt',
            adminStatus: 'chờ xử lý',
            moneyToCollect: isVietQr ? 0 : finalAmount,
            totalPrice: finalAmount,
            promoCode: appliedVoucherCode,
            note: isVietQr 
              ? `[ĐƠN ZALO MINI APP - CHỜ CHUYỂN KHOẢN VIETQR: ${finalAmount.toLocaleString('vi-VN')}đ] | Mã: ${orderCode} | Mặt hàng: ${fullItemsText} | Ghi chú: ${note?.trim() || 'Không có'}`
              : `[ĐƠN ZALO MINI APP - COD THU TIỀN TẬN NƠI: ${finalAmount.toLocaleString('vi-VN')}đ] | Mã: ${orderCode} | Mặt hàng: ${fullItemsText} | Ghi chú: ${note?.trim() || 'Không có'}`
          }
        });

        await tx.shopOrder.update({
          where: { id: shopOrder.id },
          data: { internalOrderId: internalOrder.id }
        });
      } catch (err: any) {
        logger.warn('Could not create matching internal order for dispatch', { error: err.message });
      }

      return shopOrder;
    });

    // 6. Tạo thông tin Chuyển khoản VietQR nếu chọn hình thức chuyển khoản
    let vietQrInfo = null;
    if (paymentMethod.toUpperCase() === 'VIETQR') {
      const bankCode = process.env.BANK_CODE || 'TCB';
      const bankName = process.env.BANK_NAME || 'Techcombank';
      const accountNumber = process.env.BANK_ACCOUNT_NUMBER || '8318892577';
      const accountName = process.env.BANK_ACCOUNT_NAME || 'CT TNHH TM VA DV PURE VITA';
      const memo = orderCode;
      const qrUrl = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-compact2.png?amount=${finalAmount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;

      vietQrInfo = {
        bankCode,
        bankName,
        accountNumber,
        accountName,
        amount: finalAmount,
        memo,
        qrUrl
      };
    }

    logger.info('Shop Order created successfully on Zalo Mini App', {
      orderCode,
      customerPhone: cleanPhone,
      finalAmount,
      itemsCount: validatedItems.length
    });

    res.json({
      success: true,
      message: 'Đặt hàng thành công! Đội ngũ KTV Truliva sẽ liên hệ hẹn giờ giao lắp trong vòng 2 giờ.',
      order: result,
      vietQrInfo
    });
  } catch (error: any) {
    logger.error('Error creating shop order', { error: error.message });
    res.status(500).json({ success: false, error: error.message || 'Lỗi khi tạo đơn hàng' });
  }
}

/**
 * GET /api/zalo-miniapp/shop/my-orders
 * Lấy lịch sử đơn mua sắm của khách hàng
 */
export async function getMyShopOrders(req: Request, res: Response): Promise<void> {
  try {
    const phone = (req.query.phone as string || (req as any).zaloUser?.phoneNumber || '').trim();
    if (!phone) {
      res.json({ success: true, orders: [] });
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const searchPhones = [cleanPhone];
    if (cleanPhone.startsWith('84')) {
      searchPhones.push('0' + cleanPhone.slice(2));
    } else if (cleanPhone.startsWith('0')) {
      searchPhones.push('84' + cleanPhone.slice(1));
    }

    const orders = await prisma.shopOrder.findMany({
      where: {
        OR: searchPhones.map(p => ({ customerPhone: { contains: p } }))
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                images: true,
                badge: true,
                warrantyMonths: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      count: orders.length,
      orders
    });
  } catch (error: any) {
    logger.error('Error fetching my shop orders', { error: error.message });
    res.status(500).json({ success: false, error: 'Lỗi khi tải lịch sử đơn mua' });
  }
}

/**
 * GET /api/zalo-miniapp/shop/orders/:orderCodeOrId
 * Tra cứu chi tiết 1 đơn hàng
 */
export async function getShopOrderDetail(req: Request, res: Response): Promise<void> {
  try {
    const orderCodeOrId = String(req.params.orderCodeOrId || '').trim();
    if (!orderCodeOrId) {
      res.status(400).json({ success: false, error: 'Thiếu mã đơn hàng' });
      return;
    }

    const order = await prisma.shopOrder.findFirst({
      where: {
        OR: [
          { id: orderCodeOrId },
          { orderCode: orderCodeOrId }
        ]
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order) {
      res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng' });
      return;
    }

    res.json({
      success: true,
      order
    });
  } catch (error: any) {
    logger.error('Error fetching shop order detail', { error: error.message });
    res.status(500).json({ success: false, error: 'Lỗi khi tải chi tiết đơn hàng' });
  }
}

/**
 * POST /api/zalo-miniapp/shop/payment/webhook
 * Webhook nhận thông báo chuyển khoản Techcombank (Hỗ trợ SePAY, PayOS, Casso hoặc Open Banking)
 * BẮT BUỘC ĐỐI SOÁT: Token bảo mật + Đúng mã đơn TRU + Đúng và đủ số tiền (transferAmount >= finalAmount)
 */
export async function handlePaymentWebhook(req: Request, res: Response): Promise<void> {
  try {
    // 1. Kiểm tra Secret Token bảo vệ Webhook (Chống giả mạo request)
    const expectedSecret = (process.env.PAYMENT_WEBHOOK_SECRET || process.env.SEPAY_WEBHOOK_KEY || 'truliva_secure_pay_2026').trim();
    const authHeader = String(req.headers['authorization'] || '').trim();
    const secureTokenHeader = String(req.headers['secure-token'] || '').trim();
    const apiKeyHeader = String(req.headers['x-api-key'] || req.headers['api-key'] || '').trim();
    const querySecret = String(req.query.secret || req.query.token || '').trim();

    let providedSecret = secureTokenHeader || apiKeyHeader || querySecret;
    if (!providedSecret && authHeader) {
      if (authHeader.toLowerCase().startsWith('bearer ')) {
        providedSecret = authHeader.substring(7).trim();
      } else if (authHeader.toLowerCase().startsWith('apikey ')) {
        providedSecret = authHeader.substring(7).trim();
      } else {
        providedSecret = authHeader;
      }
    }

    if (expectedSecret && providedSecret !== expectedSecret) {
      logger.warn('Payment webhook received invalid secret token', {
        ip: req.ip || req.socket.remoteAddress,
        providedSecretPrefix: providedSecret ? providedSecret.substring(0, 4) + '***' : 'none'
      });
      res.status(401).json({ success: false, error: 'Unauthorized: Invalid payment webhook secret' });
      return;
    }

    const payload = req.body || {};
    logger.info('Received Payment Webhook notification', { payload });

    // 2. Chuẩn hóa danh sách giao dịch (Hỗ trợ Casso mảng data, PayOS object data, SePAY trực tiếp)
    let transactionList: any[] = [];
    if (Array.isArray(payload.data)) {
      transactionList = payload.data;
    } else if (payload.data && typeof payload.data === 'object') {
      transactionList = [payload.data];
    } else {
      transactionList = [payload];
    }

    let processedCount = 0;
    const results: any[] = [];

    for (const item of transactionList) {
      const content = String(
        item.content || 
        item.description || 
        item.transferContent || 
        item.msg || 
        payload.content || 
        payload.description || 
        ''
      );

      const transferAmount = Number(
        item.transferAmount || 
        item.amount || 
        payload.transferAmount || 
        payload.amount || 
        0
      );

      // Trích xuất mã đơn hàng TRU-... từ nội dung chuyển khoản
      const match = content.match(/TRU[-_]?[0-9A-Z-]+/i) || content.match(/TRU\s*[0-9A-Z-]+/i);
      let extractedOrderCode = match ? match[0].replace(/\s+/g, '-').toUpperCase() : '';

      if (!extractedOrderCode && (item.orderCode || payload.orderCode)) {
        extractedOrderCode = String(item.orderCode || payload.orderCode).toUpperCase();
      }

      if (!extractedOrderCode) {
        logger.warn('Payment transaction item has no matching TRU order code', { content });
        continue;
      }

      // Tìm đơn hàng trong DB
      const shopOrder = await prisma.shopOrder.findFirst({
        where: {
          OR: [
            { orderCode: extractedOrderCode },
            { orderCode: { contains: extractedOrderCode, mode: 'insensitive' } }
          ]
        }
      });

      if (!shopOrder) {
        logger.warn('ShopOrder not found for extracted order code', { extractedOrderCode });
        continue;
      }

      // Nếu đơn hàng đã được xác nhận thanh toán trước đó (Idempotency)
      if (shopOrder.paymentStatus === 'PAID') {
        logger.info('ShopOrder already PAID previously', { orderCode: shopOrder.orderCode });
        results.push({ orderCode: shopOrder.orderCode, status: 'ALREADY_PAID' });
        processedCount++;
        continue;
      }

      const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

      // 3. KIỂM TRA ĐỐI SOÁT SỐ TIỀN CHUYỂN KHOẢN (STRICT AMOUNT CHECK)
      if (transferAmount < shopOrder.finalAmount) {
        logger.warn('ShopOrder payment amount insufficient', {
          orderCode: shopOrder.orderCode,
          requiredAmount: shopOrder.finalAmount,
          receivedAmount: transferAmount,
          missingAmount: shopOrder.finalAmount - transferAmount
        });

        const missingAmount = shopOrder.finalAmount - transferAmount;
        const partialWarningNote = `\n[CẢNH BÁO CHUYỂN THIẾU TIỀN]: Nhận ${transferAmount.toLocaleString('vi-VN')}đ / Cần ${shopOrder.finalAmount.toLocaleString('vi-VN')}đ (Thiếu: ${missingAmount.toLocaleString('vi-VN')}đ) lúc ${timeStr}`;

        await prisma.shopOrder.update({
          where: { id: shopOrder.id },
          data: {
            paymentStatus: 'PARTIALLY_PAID',
            note: `${shopOrder.note || ''}${partialWarningNote}`
          }
        });

        if (shopOrder.internalOrderId) {
          try {
            const existingOrder = await prisma.order.findUnique({
              where: { id: shopOrder.internalOrderId },
              select: { note: true }
            });
            await prisma.order.update({
              where: { id: shopOrder.internalOrderId },
              data: {
                moneyToCollect: missingAmount,
                note: `${existingOrder?.note || ''} | [CHUYỂN THIẾU: Đã nhận ${transferAmount.toLocaleString('vi-VN')}đ, còn thiếu ${missingAmount.toLocaleString('vi-VN')}đ]`
              }
            });
          } catch (err: any) {
            logger.warn('Could not update internal order with partial payment note', { error: err.message });
          }
        }

        results.push({
          orderCode: shopOrder.orderCode,
          status: 'PARTIALLY_PAID',
          received: transferAmount,
          required: shopOrder.finalAmount,
          missing: missingAmount
        });
        processedCount++;
        continue;
      }

      // 4. SỐ TIỀN ĐỦ HOẶC THỪA (transferAmount >= finalAmount) -> XÁC NHẬN THANH TOÁN THÀNH CÔNG
      await prisma.shopOrder.update({
        where: { id: shopOrder.id },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: 'VIETQR',
          orderStatus: shopOrder.orderStatus === 'PENDING' ? 'CONFIRMED' : shopOrder.orderStatus,
          note: `${shopOrder.note || ''}\n[ĐÃ NHẬN TIỀN TECHCOMBANK: ${transferAmount.toLocaleString('vi-VN')}đ lúc ${timeStr}]`
        }
      });

      // Cập nhật đơn điều phối KTV nội bộ
      if (shopOrder.internalOrderId) {
        try {
          const existingOrder = await prisma.order.findUnique({
            where: { id: shopOrder.internalOrderId },
            select: { note: true }
          });
          await prisma.order.update({
            where: { id: shopOrder.internalOrderId },
            data: {
              adminStatus: 'chờ xử lý',
              moneyToCollect: 0, // Đã thanh toán đầy đủ, KTV không cần thu tiền mặt nữa
              note: `${existingOrder?.note || ''} | [ĐÃ THANH TOÁN TECHCOMBANK: ${transferAmount.toLocaleString('vi-VN')}đ lúc ${timeStr}]`
            }
          });
        } catch (err: any) {
          logger.warn('Could not update internal order with payment note', { error: err.message });
        }
      }

      logger.info('ShopOrder marked as PAID via Techcombank Webhook', {
        orderCode: shopOrder.orderCode,
        amount: transferAmount,
        finalAmount: shopOrder.finalAmount
      });

      results.push({ orderCode: shopOrder.orderCode, status: 'PAID', amount: transferAmount });
      processedCount++;
    }

    res.json({
      success: true,
      processedCount,
      results
    });
  } catch (error: any) {
    logger.error('Error handling payment webhook', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/zalo-miniapp/shop/orders/:orderCodeOrId/switch-to-cod
 * Chuyển phương thức thanh toán của đơn hàng sang COD (khi khách đổi ý hoặc không tiện chuyển khoản)
 */
export async function switchOrderToCod(req: Request, res: Response): Promise<void> {
  try {
    const orderCodeOrId = String(req.params.orderCodeOrId || '').trim();
    if (!orderCodeOrId) {
      res.status(400).json({ success: false, error: 'Thiếu mã đơn hàng' });
      return;
    }

    const order = await prisma.shopOrder.findFirst({
      where: {
        OR: [
          { orderCode: orderCodeOrId },
          { id: orderCodeOrId }
        ]
      }
    });

    if (!order) {
      res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng' });
      return;
    }

    if (order.paymentStatus === 'PAID') {
      res.status(400).json({ success: false, error: 'Đơn hàng đã được thanh toán, không thể chuyển sang COD' });
      return;
    }

    const updated = await prisma.shopOrder.update({
      where: { id: order.id },
      data: {
        paymentMethod: 'COD'
      }
    });

    if (order.internalOrderId) {
      try {
        await prisma.order.update({
          where: { id: order.internalOrderId },
          data: {
            moneyToCollect: order.finalAmount,
            note: `[ĐƠN ZALO MINI APP - ĐỔI SANG COD] Khách hàng chọn thanh toán khi nhận hàng & lắp đặt (COD)`
          }
        });
      } catch (err: any) {
        logger.warn('Could not update internal order for switch-to-cod', { error: err.message });
      }
    }

    logger.info('ShopOrder switched to COD', { orderCode: order.orderCode });

    res.json({
      success: true,
      message: 'Đã chuyển sang thanh toán khi nhận hàng (COD) thành công',
      order: updated
    });
  } catch (error: any) {
    logger.error('Error switching shop order to COD', { error: error.message });
    res.status(500).json({ success: false, error: 'Lỗi khi chuyển sang COD' });
  }
}

/**
 * POST /api/zalo-miniapp/shop/orders/:orderCodeOrId/confirm-payment
 * Xác nhận thanh toán thành công thủ công (Hỗ trợ Admin / Sandbox Testing)
 */
export async function confirmShopOrderPayment(req: Request, res: Response): Promise<void> {
  try {
    // Sandbox chạy trên port 3001 hoặc có cờ IS_SANDBOX=true. Port 3000 là Production.
    const isSandboxEnv = String(process.env.PORT || '3000') === '3001' || process.env.IS_SANDBOX === 'true';

    // Bảo mật: Trên Production (Port 3000), bắt buộc phải có phiên đăng nhập của ADMIN
    if (!isSandboxEnv) {
      let sessionToken = req.cookies?.session_token;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        sessionToken = authHeader.substring(7);
      }

      let isAdmin = false;
      const jwtSecret = process.env.JWT_SECRET;
      if (sessionToken && jwtSecret) {
        try {
          const decoded: any = jwt.verify(sessionToken, jwtSecret);
          if (decoded?.id) {
            const user = await prisma.user.findUnique({
              where: { id: decoded.id },
              select: { role: true, isActive: true }
            });
            if (user?.isActive && user.role === 'ADMIN') {
              isAdmin = true;
            }
          }
        } catch (e) {}
      }

      if (!isAdmin) {
        logger.warn('Unauthorized attempt to manually confirm payment in Production', {
          orderCodeOrId: req.params.orderCodeOrId,
          ip: req.ip || req.socket.remoteAddress
        });
        res.status(403).json({
          success: false,
          error: 'Chức năng xác nhận thanh toán thủ công chỉ dành cho Quản trị viên trên Production.'
        });
        return;
      }
    }

    const orderCodeOrId = String(req.params.orderCodeOrId || '').trim();
    if (!orderCodeOrId) {
      res.status(400).json({ success: false, error: 'Thiếu mã đơn hàng' });
      return;
    }

    const order = await prisma.shopOrder.findFirst({
      where: {
        OR: [
          { orderCode: orderCodeOrId },
          { id: orderCodeOrId }
        ]
      }
    });

    if (!order) {
      res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng' });
      return;
    }

    const updated = await prisma.shopOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'PAID',
        paymentMethod: 'VIETQR',
        orderStatus: order.orderStatus === 'PENDING' ? 'CONFIRMED' : order.orderStatus
      }
    });

    if (order.internalOrderId) {
      try {
        const timeStr = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const existingOrder = await prisma.order.findUnique({
          where: { id: order.internalOrderId },
          select: { note: true }
        });
        await prisma.order.update({
          where: { id: order.internalOrderId },
          data: {
            adminStatus: 'chờ xử lý',
            moneyToCollect: 0,
            note: `${existingOrder?.note || ''} | [ĐÃ XÁC NHẬN THANH TOÁN THỦ CÔNG: ${order.finalAmount.toLocaleString('vi-VN')}đ lúc ${timeStr}]`
          }
        });
      } catch (err: any) {
        logger.warn('Could not update internal order for confirm-payment', { error: err.message });
      }
    }

    logger.info('ShopOrder confirmed as PAID manually/test', { orderCode: order.orderCode });

    res.json({
      success: true,
      message: 'Đã xác nhận thanh toán thành công',
      order: updated
    });
  } catch (error: any) {
    logger.error('Error confirming shop order payment', { error: error.message });
    res.status(500).json({ success: false, error: 'Lỗi khi xác nhận thanh toán' });
  }
}


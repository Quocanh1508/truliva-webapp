import { Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../utils/logger';

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
        const internalPancakeId = -Math.floor(Date.now() / 1000);
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
            moneyToCollect: paymentMethod.toUpperCase() === 'COD' ? finalAmount : 0,
            totalPrice: finalAmount,
            promoCode: appliedVoucherCode,
            note: `[ĐƠN ZALO MINI APP] Mã: ${orderCode} | Mặt hàng: ${fullItemsText} | Ghi chú: ${note?.trim() || 'Không có'}`
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
      const bankCode = process.env.BANK_CODE || 'MB';
      const accountNumber = process.env.BANK_ACCOUNT_NUMBER || '0915185982';
      const accountName = process.env.BANK_ACCOUNT_NAME || 'CONG TY TRULIVA';
      const memo = orderCode;
      const qrUrl = `https://img.vietqr.io/image/${bankCode}-${accountNumber}-compact2.png?amount=${finalAmount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;

      vietQrInfo = {
        bankCode,
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

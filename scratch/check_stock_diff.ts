import 'dotenv/config';
import prisma from '../src/config/database';

async function checkStock() {
  try {
    // 1. Tìm KTV Khánh Bắc Ninh
    const ktv = await prisma.user.findFirst({
      where: {
        warehouseName: {
          contains: 'Khánh Bắc Ninh',
          mode: 'insensitive'
        }
      }
    });

    if (!ktv) {
      console.log('❌ Không tìm thấy KTV Khánh Bắc Ninh');
      return;
    }

    console.log(`📌 KTV: ${ktv.fullName}`);
    console.log(`📌 Warehouse ID: ${ktv.warehouseId}`);
    console.log(`📌 Warehouse Name: ${ktv.warehouseName}\n`);

    // 2. Tìm sản phẩm Máy lọc nước Truliva UR61096H
    const product = await prisma.product.findFirst({
      where: {
        sku: '104321-0002'
      }
    });

    if (!product) {
      console.log('❌ Không tìm thấy Máy lọc nước Truliva UR61096H');
      return;
    }

    console.log(`📦 Sản phẩm: ${product.name}`);
    console.log(`📦 SKU: ${product.sku}`);
    console.log(`📦 Pancake Product ID: ${product.pancakeProductId}`);
    
    // In rawData tồn kho của sản phẩm
    console.log('📦 Tồn kho rawData:', JSON.stringify(product.rawData, null, 2));

    // 3. Tìm các đơn hàng chứa sản phẩm này và thuộc kho KTV này mà ở trạng thái ACTIVE (hold hàng)
    const activeOrders = await prisma.order.findMany({
      where: {
        warehouseId: ktv.warehouseId,
        adminStatus: {
          notIn: ['hoàn thành', 'hủy đơn']
        },
        items: {
          some: {
            productName: product.name
          }
        }
      },
      include: {
        items: true
      }
    });

    console.log(`\n📋 Đơn hàng giữ hàng (HOLD) cục bộ Truliva: ${activeOrders.length}`);
    activeOrders.forEach((o: any) => {
      const item = o.items.find((i: any) => i.productName === product.name);
      console.log(`- Đơn #${o.pancakeOrderId} | adminStatus: ${o.adminStatus} | Số lượng giữ: ${item?.quantity}`);
    });

    // 4. Tìm các đơn hàng đã HOÀN THÀNH cục bộ Truliva
    const completedOrders = await prisma.order.findMany({
      where: {
        warehouseId: ktv.warehouseId,
        adminStatus: 'hoàn thành',
        items: {
          some: {
            productName: product.name
          }
        }
      },
      include: {
        items: true
      }
    });

    console.log(`\n📋 Đơn hàng đã hoàn thành cục bộ Truliva: ${completedOrders.length}`);
    completedOrders.forEach((o: any) => {
      const item = o.items.find((i: any) => i.productName === product.name);
      console.log(`- Đơn #${o.pancakeOrderId} | adminStatus: ${o.adminStatus} | Số lượng: ${item?.quantity}`);
    });

  } catch (error: any) {
    console.error('Lỗi:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkStock();

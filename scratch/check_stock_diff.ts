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

    // 2. Tìm tất cả sản phẩm liên quan
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: 'UR61096H', mode: 'insensitive' } },
          { sku: { contains: '104321-0002', mode: 'insensitive' } }
        ]
      }
    });

    console.log(`🔍 Tìm thấy ${products.length} sản phẩm liên quan:`);
    for (const p of products) {
      console.log(`- ID: ${p.id} | Name: ${p.name} | SKU: ${p.sku} | Active: ${p.isActive}`);
      const vw = (p.rawData as any)?.variations_warehouses || [];
      const targetVw = vw.find((v: any) => v.warehouse_id === ktv.warehouseId);
      console.log(`  -> Kho KTV Khánh Bắc Ninh:`, JSON.stringify(targetVw, null, 2));
    }

    if (products.length === 0) return;
    const product = products.find(p => p.sku === '104321-0002') || products[0]; // Chọn Máy lọc nước Truliva UR61096H
    console.log(`\nUsing product for orders check: ${product.name}`);

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

    // 5. Mô phỏng API /api/inventory/stock
    console.log('\n--- MÔ PHỎNG PHẢN HỒI API /stock ---');
    const rawData = (product.rawData as any) || {};
    const vwList = rawData.variations_warehouses || [];
    const stocks: Record<string, number> = {};
    const actualStocks: Record<string, number> = {};
    vwList.forEach((vw: any) => {
      if (vw.warehouse_id) {
        stocks[vw.warehouse_id] = Number(vw.remain_quantity) || 0;
        actualStocks[vw.warehouse_id] = Number(vw.actual_remain_quantity) || Number(vw.remain_quantity) || 0;
      }
    });

    console.log(`Sản phẩm: ${product.name}`);
    console.log(`- Có thể bán tại Kho KTV Khánh Bắc Ninh (stocks['e426...']):`, stocks[ktv.warehouseId || '']);
    console.log(`- Thực tế tại Kho KTV Khánh Bắc Ninh (actualStocks['e426...']):`, actualStocks[ktv.warehouseId || '']);

  } catch (error: any) {
    console.error('Lỗi:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkStock();

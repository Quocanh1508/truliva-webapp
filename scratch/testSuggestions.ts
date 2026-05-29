import 'dotenv/config';
import prisma from '../src/config/database';

// Simple accent removal to mimic removeAccents
function removeAccents(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const cleanLoc = (str: string) => {
  if (!str) return '';
  let clean = removeAccents(str);
  return clean
    .toLowerCase()
    .replace(/^(tp\.?|thanh pho|tinh|quan|huyen|phuong|xa)\b/g, '')
    .replace(/[().-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

async function main() {
  try {
    const orders = await prisma.order.findMany({
      take: 10,
      include: { customer: true }
    });
    
    const stations = await prisma.mainStation.findMany({
      include: { techStations: true }
    });

    console.log(`Found ${orders.length} orders and ${stations.length} main stations.`);

    for (const order of orders) {
      const shippingAddress = order.shippingAddress as any;
      const province = shippingAddress?.province_name || order.customer?.provinceName || '';
      const district = shippingAddress?.district_name || order.customer?.districtName || '';
      const fullAddress = shippingAddress?.full_address || order.customer?.fullAddress || '';

      const cleanProvince = cleanLoc(province);
      const cleanDistrict = cleanLoc(district);
      const cleanFullAddress = cleanLoc(fullAddress);

      let bestScore = 0;
      let matchedTech: any = null;
      let matchedMain: any = null;

      for (const main of stations) {
        if (main.techStations) {
          for (const tech of main.techStations) {
            const baseTechName = tech.name.split('(')[0].trim();
            const cleanTech = cleanLoc(baseTechName);

            if (!cleanTech) continue;

            let score = 0;
            if (cleanFullAddress && cleanFullAddress.includes(cleanTech)) {
              score = 10;
            } else if (cleanProvince && (cleanProvince.includes(cleanTech) || cleanTech.includes(cleanProvince))) {
              score = 8;
            } else if (cleanDistrict && (cleanDistrict.includes(cleanTech) || cleanTech.includes(cleanDistrict))) {
              score = 6;
            }

            if (score > bestScore) {
              bestScore = score;
              matchedTech = tech;
              matchedMain = main;
            }
          }
        }
      }

      console.log(`Order #${order.pancakeOrderId}:`);
      console.log(`  Address: "${fullAddress}", Province: "${province}", District: "${district}"`);
      if (matchedTech) {
        console.log(`  -> SUGGESTION: Main "${matchedMain.name}", Tech "${matchedTech.name}" (Score: ${bestScore})`);
      } else {
        console.log(`  -> SUGGESTION: None`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

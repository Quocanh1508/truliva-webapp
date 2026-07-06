import 'dotenv/config';
import prisma from '../config/database';

async function main() {
  console.log('Checking/creating "Đơn vị vận chuyển" MainStation...');

  const existing = await prisma.mainStation.findUnique({
    where: { name: 'Đơn vị vận chuyển' }
  });

  if (existing) {
    console.log(`MainStation "Đơn vị vận chuyển" already exists with ID: ${existing.id}`);
  } else {
    const created = await prisma.mainStation.create({
      data: {
        name: 'Đơn vị vận chuyển',
        isActive: true
      }
    });
    console.log(`✅ Successfully created MainStation "Đơn vị vận chuyển" with ID: ${created.id}`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });

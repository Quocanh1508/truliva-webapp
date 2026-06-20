import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  const users = await prisma.user.findMany({
    where: {
      fullName: {
        contains: 'Vũ'
      }
    }
  });

  console.log('Users found with name containing "Vũ":', JSON.stringify(users, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());

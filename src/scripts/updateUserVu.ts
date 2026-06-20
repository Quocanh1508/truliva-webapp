import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  const userId = 'e701fc33-2c9e-433b-a0fa-f641aa476f1e';

  // Check if username '0919097743' already exists
  const existing = await prisma.user.findUnique({
    where: { username: '0919097743' }
  });

  if (existing) {
    console.error(`Error: User with username "0919097743" already exists! Details:`, JSON.stringify(existing, null, 2));
    return;
  }

  console.log(`Updating user ${userId}...`);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      username: '0919097743',
      phoneNumber: '0919097743'
    }
  });

  console.log('Successfully updated user details:', JSON.stringify(updated, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());

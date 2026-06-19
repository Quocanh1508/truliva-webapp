import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../.env') });

import prisma from '../config/database';

async function run() {
  const showTimezone = await prisma.$queryRawUnsafe('SHOW TIMEZONE;');
  const selectNow = await prisma.$queryRawUnsafe('SELECT NOW(), NOW() AT TIME ZONE \'UTC\' as utc_now;');
  
  console.log('Database SHOW TIMEZONE result:', showTimezone);
  console.log('Database SELECT NOW() result:', selectNow);
  console.log('Node.js Process Timezone:', process.env.TZ || 'not set');
  console.log('Node.js new Date().toString():', new Date().toString());
  console.log('Node.js new Date().toISOString():', new Date().toISOString());
}

run().catch(console.error).finally(() => prisma.$disconnect());

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

if (!process.env.DATABASE_URL) {
  const vpsEnv = '/var/www/truliva/.env';
  if (fs.existsSync(vpsEnv)) {
    dotenv.config({ path: vpsEnv });
  } else {
    dotenv.config();
  }
}

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import logger from '../utils/logger';

// ── Khởi tạo Prisma Client với PG adapter ──
const dbUrl = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: dbUrl });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ],
});

// ── Log các query chậm trong development ──
prisma.$on('query' as never, (e: { query: string; duration: number }) => {
  if (e.duration > 500) {
    logger.warn('Slow query detected', {
      query: e.query,
      duration: `${e.duration}ms`,
    });
  }
});

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error('Prisma error', { message: e.message });
});

export default prisma;

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

async function seedDev() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const username = 'dev';
  const password = 'dev123';
  const fullName = 'Developer Truliva';

  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      console.log('⚠️  Tài khoản dev đã tồn tại, bỏ qua.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const dev = await prisma.user.create({
      data: {
        username,
        passwordHash,
        fullName,
        role: 'DEV',
      },
    });

    console.log('✅ Tạo tài khoản DEV thành công!');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log(`   ID: ${dev.id}`);
  } catch (error: any) {
    console.error('❌ Lỗi:', error.message);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seedDev();

import dotenv from 'dotenv';
dotenv.config();
import prisma from '../src/config/database';
import jwt from 'jsonwebtoken';
import axios from 'axios';

async function test() {
  const admin = await prisma.user.findUnique({
    where: { username: 'admin' }
  });
  if (!admin) {
    console.error('Admin user not found');
    return;
  }

  const jwtSecret = process.env.JWT_SECRET || 'jwt_prod_secret_key_8493108';
  const token = jwt.sign({ id: admin.id }, jwtSecret, { expiresIn: '1d' });

  const url = 'http://127.0.0.1:3000/api/orders?page=1&limit=20&sortBy=createdAt&sortOrder=desc&dateType=createdAt';
  console.log('Fetching URL:', url);
  console.log('With Token:', token.substring(0, 15) + '...');

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  console.log('Response orders count:', response.data.orders?.length);
  console.log('First 5 order details:');
  response.data.orders.slice(0, 5).forEach((o: any) => {
    console.log(`pancakeOrderId: ${o.pancakeOrderId}, pancakeCreatedAt: ${o.pancakeCreatedAt}, createdAt: ${o.createdAt}, adminStatus: ${o.adminStatus}`);
  });
}

test().catch(console.error).finally(() => prisma.$disconnect());

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

  const url = 'http://127.0.0.1:3000/api/orders?search=3135';
  console.log('Fetching URL:', url);

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const order = response.data.orders?.[0];
  if (!order) {
    console.log('Order 3135 not found in response');
    return;
  }

  console.log('Order 3135 from API Response:');
  console.log('pancakeOrderId:', order.pancakeOrderId);
  console.log('pancakeCreatedAt (JSON string):', order.pancakeCreatedAt);
}

test().catch(console.error).finally(() => prisma.$disconnect());

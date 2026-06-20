import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function list() {
  const apiKey = process.env.PANCAKE_API_KEY || 'a9c9fc5111a1450487b09a5a01e38746';
  const shopId = '1635300067';
  try {
    const response = await axios.get(`https://pos.pages.fm/api/v1/shops/${shopId}/warehouses`, {
      params: { api_key: apiKey }
    });
    const whs = response.data?.data || response.data?.warehouses || [];
    console.log('Warehouses count:', whs.length);
    whs.forEach((w: any) => {
      console.log(`- ID: ${w.id} | Name: ${w.name}`);
    });
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

list();

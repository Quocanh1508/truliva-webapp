import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  const apiKey = process.env.PANCAKE_API_KEY;
  const shopId = '1635300067';
  
  if (!apiKey) {
    console.error('❌ Thiếu PANCAKE_API_KEY trong file .env');
    return;
  }

  // Let's test with 'items' key instead of 'products'
  const payload = {
    customer: {
      full_name: 'Test Items Key Manual Order',
      phone_number: '0988888889'
    },
    shipping_address: {
      full_name: 'Test Items Key Manual Order',
      phone_number: '0988888889',
      address: '123 Test Street 2'
    },
    items: [
      {
        variation_id: 'e82f687d-95a9-4666-b10c-8ec1a18da887',
        quantity: 1,
        price: 800000
      }
    ],
    warehouse_id: 'eb100632-fb88-4887-8385-f70434ccb0d5',
    note: 'Đơn test tạo từ Truliva system với items key',
    status: 1
  };

  try {
    console.log('🔄 Calling Pancake POS API with items key...');
    const response = await axios.post(`https://pos.pages.fm/api/v1/shops/${shopId}/orders?api_key=${apiKey}`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('❌ Error creating order:', error.response?.data || error.message);
  }
}

run();

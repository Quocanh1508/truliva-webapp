const axios = require('axios');
require('dotenv').config();

async function testPatch() {
  const apiKey = process.env.PANCAKE_API_KEY;
  const shopId = '1635300067';
  const testPancakeOrderId = 3269;
  
  if (!apiKey) {
    console.error('Missing PANCAKE_API_KEY');
    return;
  }

  const payloadProducts = {
    products: [
      {
        variation_id: 'fe3f0e8f-7c15-46ee-bc00-6cb5db740ad6',
        quantity: 1,
        price: 605000
      },
      {
        variation_id: '0e200b7a-7993-453e-95ea-d127e3ae1aec',
        quantity: 1,
        price: 800000
      }
    ],
    warehouse_id: '684bc108-b7e2-4c08-9404-a95673cc80c6'
  };

  const payloadItems = {
    items: [
      {
        variation_id: 'fe3f0e8f-7c15-46ee-bc00-6cb5db740ad6',
        quantity: 1,
        price: 605000
      },
      {
        variation_id: '0e200b7a-7993-453e-95ea-d127e3ae1aec',
        quantity: 1,
        price: 800000
      }
    ],
    warehouse_id: '684bc108-b7e2-4c08-9404-a95673cc80c6'
  };

  console.log('--- TEST 1: Sending products key ---');
  try {
    const res = await axios.patch(
      `https://pos.pages.fm/api/v1/shops/${shopId}/orders/${testPancakeOrderId}`,
      payloadProducts,
      {
        params: { api_key: apiKey },
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    console.log('SUCCESS:', res.data);
  } catch (error) {
    console.error('FAILED:', error.response?.data || error.message);
  }

  console.log('\n--- TEST 2: Sending items key ---');
  try {
    const res = await axios.patch(
      `https://pos.pages.fm/api/v1/shops/${shopId}/orders/${testPancakeOrderId}`,
      payloadItems,
      {
        params: { api_key: apiKey },
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    console.log('SUCCESS:', res.data);
  } catch (error) {
    console.error('FAILED:', error.response?.data || error.message);
  }
}

testPatch();

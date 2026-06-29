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

  const payloadStatus = {
    status: 3 // Đã nhận / Hoàn thành
  };

  console.log('--- TEST 3: Sending status = 3 ---');
  try {
    const res = await axios.patch(
      `https://pos.pages.fm/api/v1/shops/${shopId}/orders/${testPancakeOrderId}`,
      payloadStatus,
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

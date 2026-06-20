import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testPatch() {
  const apiKey = process.env.PANCAKE_API_KEY || 'a9c9fc5111a1450487b09a5a01e38746';
  const shopId = '1635300067';
  
  // Let's find an order ID to test. We can use a real one or just print some.
  // We will try to patch a test order.
  const testPancakeOrderId = 2797; // replace with a valid test order ID if needed
  
  try {
    console.log('Fetching order details first...');
    const response = await axios.patch(
      `https://pos.pages.fm/api/v1/shops/${shopId}/orders/${testPancakeOrderId}`,
      {
        warehouse_id: ""
      },
      {
        params: { api_key: apiKey },
        headers: { 'Content-Type': 'application/json' }
      }
    );
    console.log('Patch with null result:', response.data);
  } catch (error: any) {
    console.error('Error patching order:', error.response?.data || error.message);
  }
}

testPatch();

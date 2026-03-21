import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

async function testSearch() {
  console.log('--- Testing Product Search ---');
  try {
    // 1. Search by name
    console.log('Testing search by name...');
    const res1 = await axios.get(`${API_URL}/products?search=mesa`);
    console.log('Status:', res1.status);
    console.log('Results count:', res1.data.products?.length);

    // 2. Search by ID (assuming we have one from previous result)
    if (res1.data.products?.length > 0) {
      const id = res1.data.products[0]._id;
      console.log(`Testing search by ID: ${id}...`);
      const res2 = await axios.get(`${API_URL}/products?search=${id}`);
      console.log('Status:', res2.status);
      console.log('Found ID match:', res2.data.products?.some((p: any) => p._id === id));
    }

    // 3. Search with special characters
    console.log('Testing search with special characters "(mesa)"...');
    const res3 = await axios.get(`${API_URL}/products?search=(mesa)`);
    console.log('Status (should be 200, not 500):', res3.status);

    console.log('\n--- Testing Service Search ---');
    const res4 = await axios.get(`${API_URL}/services?search=mantenimiento`);
    console.log('Status:', res4.status);
    console.log('Results count:', res4.data.data?.length);

  } catch (error: any) {
    console.error('Test failed with error:', error.response?.status, error.response?.data || error.message);
  }
}

testSearch();

import axios from 'axios';

async function testLimit() {
    const largeData = 'A'.repeat(15 * 1024 * 1024); // 15MB
    try {
        const response = await axios.post('http://localhost:3000/api/test-limit', { data: largeData });
        console.log('Response:', response.status);
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Error status:', error.response?.status);
            console.error('Error message:', error.response?.data);
        } else {
            console.error('Error:', error);
        }
    }
}

testLimit();

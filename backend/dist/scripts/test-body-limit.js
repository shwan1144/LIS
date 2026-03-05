"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
async function testLimit() {
    const largeData = 'A'.repeat(15 * 1024 * 1024);
    try {
        const response = await axios_1.default.post('http://localhost:3000/api/test-limit', { data: largeData });
        console.log('Response:', response.status);
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            console.error('Error status:', error.response?.status);
            console.error('Error message:', error.response?.data);
        }
        else {
            console.error('Error:', error);
        }
    }
}
testLimit();
//# sourceMappingURL=test-body-limit.js.map
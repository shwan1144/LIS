const fs = require('fs');
const http = require('http');

console.log('Reading test.pdf...');
const pdf = fs.readFileSync('test.pdf').toString('base64');
const data = JSON.stringify({
    pdfBase64: pdf,
    printerName: 'Microsoft Print to PDF',
    jobName: 'Test-Job'
});

console.log('Sending request to port 17881...');
const req = http.request({
    hostname: 'localhost',
    port: 17881,
    path: '/local/print',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
}, (res) => {
    console.log('Response Status:', res.statusCode);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log('Response Body:', chunk);
    });
});

req.on('error', (e) => {
    console.error('Request Error:', e.message);
});

req.write(data);
req.end();
console.log('Request sent.');

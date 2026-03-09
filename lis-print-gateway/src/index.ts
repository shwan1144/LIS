import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getPrinters, print as printPdf } from 'pdf-to-printer';

const PORT = process.env.PORT || 17881;

const server = http.createServer(async (req, res) => {
    // Basic CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

        if (req.method === 'GET' && url.pathname === '/local/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', service: 'lis-print-gateway' }));
            return;
        }

        if (req.method === 'GET' && url.pathname === '/local/printers') {
            const printers = await getPrinters();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ printers: printers.map(p => p.name) }));
            return;
        }

        if (req.method === 'POST' && url.pathname === '/local/print') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const { printerName, pdfBase64 } = data;

                    if (!pdfBase64) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'pdfBase64 is required' }));
                        return;
                    }

                    const tempDir = os.tmpdir();
                    const tempFile = path.join(tempDir, `print_${Date.now()}.pdf`);
                    fs.writeFileSync(tempFile, Buffer.from(pdfBase64, 'base64'));

                    const options: any = {};
                    if (printerName) {
                        options.printer = printerName;
                    }

                    await printPdf(tempFile, options);

                    // Cleanup temp file after a short delay
                    setTimeout(() => {
                        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
                    }, 5000);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'success' }));
                } catch (err: any) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
});

server.listen(PORT, () => {
    console.log(`LIS Print Gateway running on port ${PORT}`);
});

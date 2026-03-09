import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { print as printPdf, getPrinters } from 'pdf-to-printer';
import 'dotenv/config';

const PORT = process.env.PORT || 17881;

// Path to SumatraPDF inside the pkg snapshot
const snapshotSumatraPath = path.join(__dirname, '../node_modules/pdf-to-printer/dist/SumatraPDF-3.4.6-32.exe');

// Path to SumatraPDF on the real filesystem (temp folder)
const tempSumatraPath = path.join(os.tmpdir(), 'SumatraPDF-3.4.6-32.exe');

/**
 * Extracts SumatraPDF from the pkg snapshot to the real filesystem if needed.
 * This is necessary because child_process.spawn cannot execute files directly from the snapshot.
 */
function ensureSumatraBinary() {
    try {
        if (fs.existsSync(snapshotSumatraPath)) {
            console.log(`Extracting SumatraPDF from snapshot: ${snapshotSumatraPath} -> ${tempSumatraPath}`);
            const binary = fs.readFileSync(snapshotSumatraPath);
            fs.writeFileSync(tempSumatraPath, binary);
            // Ensure it's executable (though on Windows this is usually not an issue)
            try { fs.chmodSync(tempSumatraPath, 0o755); } catch (e) { }
            console.log('SumatraPDF extracted successfully.');
        } else {
            console.warn(`Snapshot SumatraPDF not found at ${snapshotSumatraPath}. Printing might fail if not installed system-wide.`);
        }
    } catch (err) {
        console.error('Failed to extract SumatraPDF binary:', err);
    }
}

// Prepare binary on startup
ensureSumatraBinary();

const server = http.createServer(async (req, res) => {
    // Enable CORS
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
            console.log('GET /local/status');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', service: 'lis-print-gateway' }));
            return;
        }

        if (req.method === 'GET' && url.pathname === '/local/printers') {
            console.log('GET /local/printers');
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
                    const { printerName, pdfBase64, jobName } = data;
                    console.log(`POST /local/print - Printer: ${printerName || 'Default'}, Job: ${jobName || 'Unknown'}`);

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

                    // Use the extracted SumatraPDF if it exists
                    if (fs.existsSync(tempSumatraPath)) {
                        options.sumatraPdfPath = tempSumatraPath;
                    }

                    try {
                        await printPdf(tempFile, options);
                        console.log(`Print successful: ${tempFile}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'success' }));
                    } catch (printErr: any) {
                        console.error('Print command failed:', printErr);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: printErr.message || 'Print failed' }));
                    }

                    // Cleanup temp file after a short delay
                    setTimeout(() => {
                        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
                    }, 10000);
                } catch (err: any) {
                    console.error('Request parsing failed:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }

        res.writeHead(404);
        res.end();
    } catch (err: any) {
        console.error('Global server error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
    }
});

server.listen(PORT, () => {
    console.log(`LIS Print Gateway running on port ${PORT}`);
});

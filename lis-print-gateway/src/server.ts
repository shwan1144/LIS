import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { print as printPdf, getPrinters } from 'pdf-to-printer';
import 'dotenv/config';

const PORT = process.env.PORT || 17881;

export interface ServerEvent {
    type: 'log' | 'status';
    data: any;
}

export class PrintServer {
    private server: http.Server | null = null;
    private onEvent: (event: ServerEvent) => void;
    private tempSumatraPath = path.join(os.tmpdir(), 'SumatraPDF-3.4.6-32.exe');

    constructor(onEvent: (event: ServerEvent) => void) {
        this.onEvent = onEvent;
    }

    private log(text: string, type: 'info' | 'error' | 'success' = 'info') {
        console.log(`[Server] ${text}`);
        this.onEvent({ type: 'log', data: { text, type } });
    }

    private ensureSumatraBinary() {
        // In Electron, __dirname is different. We need to find SumatraPDF.
        // During dev, it might be in node_modules. During prod, it's relative to app.GetAppPath() or similar.
        // For simplicity, we'll try to find it in common locations.
        const possiblePaths = [
            path.join(__dirname, '../node_modules/pdf-to-printer/dist/SumatraPDF-3.4.6-32.exe'),
            path.join(process.resourcesPath || '', 'app.asar.unpacked/node_modules/pdf-to-printer/dist/SumatraPDF-3.4.6-32.exe'),
            path.join(process.resourcesPath || '', 'node_modules/pdf-to-printer/dist/SumatraPDF-3.4.6-32.exe')
        ];

        let foundPath = '';
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                foundPath = p;
                break;
            }
        }

        if (foundPath) {
            try {
                this.log(`Extracting SumatraPDF to temp: ${this.tempSumatraPath}`);
                fs.writeFileSync(this.tempSumatraPath, fs.readFileSync(foundPath));
                fs.chmodSync(this.tempSumatraPath, 0o755);
            } catch (err: any) {
                this.log(`Failed to extract SumatraPDF: ${err.message}`, 'error');
            }
        } else {
            this.log('SumatraPDF binary not found in expected locations. Local printing might fail.', 'error');
        }
    }

    async getPrinterCount(): Promise<number> {
        try {
            const printers = await getPrinters();
            return printers.length;
        } catch (e) {
            return 0;
        }
    }

    start() {
        this.ensureSumatraBinary();

        this.server = http.createServer(async (req, res) => {
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
                            const { printerName, pdfBase64, jobName } = data;
                            this.log(`Print Request: ${jobName || 'Reciept'} -> ${printerName || 'Default'}`);

                            if (!pdfBase64) {
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'pdfBase64 is required' }));
                                return;
                            }

                            const tempFile = path.join(os.tmpdir(), `print_${Date.now()}.pdf`);
                            fs.writeFileSync(tempFile, Buffer.from(pdfBase64, 'base64'));

                            const options: any = {};
                            if (printerName) options.printer = printerName;
                            if (fs.existsSync(this.tempSumatraPath)) options.sumatraPdfPath = this.tempSumatraPath;

                            try {
                                await printPdf(tempFile, options);
                                this.log(`Print successful: ${jobName || 'Reciept'}`, 'success');
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ status: 'success' }));
                            } catch (printErr: any) {
                                this.log(`Print failed: ${printErr.message}`, 'error');
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: printErr.message || 'Print failed' }));
                            }

                            setTimeout(() => {
                                try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) { }
                            }, 10000);
                        } catch (err: any) {
                            this.log(`Request Error: ${err.message}`, 'error');
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: err.message }));
                        }
                    });
                    return;
                }

                res.writeHead(404);
                res.end();
            } catch (err: any) {
                this.log(`Global Error: ${err.message}`, 'error');
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });

        this.server.listen(PORT, () => {
            this.log(`Server listening on port ${PORT}`, 'success');
            this.onEvent({ type: 'status', data: { port: PORT } });
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.log('Server stopped');
        }
    }
}

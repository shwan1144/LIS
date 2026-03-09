"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrintServer = void 0;
const http_1 = __importDefault(require("http"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdf_to_printer_1 = require("pdf-to-printer");
require("dotenv/config");
const PORT = process.env.PORT || 17881;
class PrintServer {
    constructor(onEvent) {
        this.server = null;
        this.tempSumatraPath = path_1.default.join(os_1.default.tmpdir(), 'SumatraPDF-3.4.6-32.exe');
        this.onEvent = onEvent;
    }
    log(text, type = 'info') {
        console.log(`[Server] ${text}`);
        this.onEvent({ type: 'log', data: { text, type } });
    }
    ensureSumatraBinary() {
        // In Electron, __dirname is different. We need to find SumatraPDF.
        // During dev, it might be in node_modules. During prod, it's relative to app.GetAppPath() or similar.
        // For simplicity, we'll try to find it in common locations.
        const possiblePaths = [
            path_1.default.join(__dirname, '../node_modules/pdf-to-printer/dist/SumatraPDF-3.4.6-32.exe'),
            path_1.default.join(process.resourcesPath || '', 'app.asar.unpacked/node_modules/pdf-to-printer/dist/SumatraPDF-3.4.6-32.exe'),
            path_1.default.join(process.resourcesPath || '', 'node_modules/pdf-to-printer/dist/SumatraPDF-3.4.6-32.exe')
        ];
        let foundPath = '';
        for (const p of possiblePaths) {
            if (fs_1.default.existsSync(p)) {
                foundPath = p;
                break;
            }
        }
        if (foundPath) {
            try {
                this.log(`Extracting SumatraPDF to temp: ${this.tempSumatraPath}`);
                fs_1.default.writeFileSync(this.tempSumatraPath, fs_1.default.readFileSync(foundPath));
                fs_1.default.chmodSync(this.tempSumatraPath, 0o755);
            }
            catch (err) {
                this.log(`Failed to extract SumatraPDF: ${err.message}`, 'error');
            }
        }
        else {
            this.log('SumatraPDF binary not found in expected locations. Local printing might fail.', 'error');
        }
    }
    async getPrinterCount() {
        try {
            const printers = await (0, pdf_to_printer_1.getPrinters)();
            return printers.length;
        }
        catch (e) {
            return 0;
        }
    }
    start() {
        this.ensureSumatraBinary();
        this.server = http_1.default.createServer(async (req, res) => {
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
                    const printers = await (0, pdf_to_printer_1.getPrinters)();
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
                            const tempFile = path_1.default.join(os_1.default.tmpdir(), `print_${Date.now()}.pdf`);
                            fs_1.default.writeFileSync(tempFile, Buffer.from(pdfBase64, 'base64'));
                            const options = {};
                            if (printerName)
                                options.printer = printerName;
                            if (fs_1.default.existsSync(this.tempSumatraPath))
                                options.sumatraPdfPath = this.tempSumatraPath;
                            try {
                                await (0, pdf_to_printer_1.print)(tempFile, options);
                                this.log(`Print successful: ${jobName || 'Reciept'}`, 'success');
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ status: 'success' }));
                            }
                            catch (printErr) {
                                this.log(`Print failed: ${printErr.message}`, 'error');
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: printErr.message || 'Print failed' }));
                            }
                            setTimeout(() => {
                                try {
                                    if (fs_1.default.existsSync(tempFile))
                                        fs_1.default.unlinkSync(tempFile);
                                }
                                catch (e) { }
                            }, 10000);
                        }
                        catch (err) {
                            this.log(`Request Error: ${err.message}`, 'error');
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: err.message }));
                        }
                    });
                    return;
                }
                res.writeHead(404);
                res.end();
            }
            catch (err) {
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
exports.PrintServer = PrintServer;

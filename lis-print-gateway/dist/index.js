"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const dotenv = __importStar(require("dotenv"));
const pdf_to_printer_1 = require("pdf-to-printer");
dotenv.config();
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
                    const { printerName, pdfBase64 } = data;
                    if (!pdfBase64) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'pdfBase64 is required' }));
                        return;
                    }
                    const tempDir = os.tmpdir();
                    const tempFile = path.join(tempDir, `print_${Date.now()}.pdf`);
                    fs.writeFileSync(tempFile, Buffer.from(pdfBase64, 'base64'));
                    const options = {};
                    if (printerName) {
                        options.printer = printerName;
                    }
                    await (0, pdf_to_printer_1.print)(tempFile, options);
                    // Cleanup temp file after a short delay
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(tempFile))
                                fs.unlinkSync(tempFile);
                        }
                        catch (e) { }
                    }, 5000);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'success' }));
                }
                catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
            return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
    catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
    }
});
server.listen(PORT, () => {
    console.log(`LIS Print Gateway running on port ${PORT}`);
});

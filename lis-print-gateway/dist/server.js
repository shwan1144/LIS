"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrintServer = void 0;
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const pdf_to_printer_1 = require("pdf-to-printer");
require("dotenv/config");
const SERVICE_NAME = 'lis-print-gateway';
const DEFAULT_PORT = 17881;
const MAX_REQUEST_BYTES = 40 * 1024 * 1024;
const SUMATRA_BINARY_NAME = 'SumatraPDF-3.4.6-32.exe';
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
    }
}
function parsePort(value) {
    const parsed = Number.parseInt(value ?? '', 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
        return parsed;
    }
    return DEFAULT_PORT;
}
class PrintServer {
    constructor(onEvent, version = 'unknown') {
        this.port = parsePort(process.env.PORT);
        this.pdfPrintEngine = this.resolvePdfPrintEngine();
        this.startedAt = new Date().toISOString();
        this.tempSumatraPath = path_1.default.join(os_1.default.tmpdir(), SERVICE_NAME, SUMATRA_BINARY_NAME);
        this.server = null;
        this.onEvent = onEvent;
        this.version = version;
    }
    async getStatusSnapshot() {
        let printers = [];
        try {
            printers = await this.listPrinters();
        }
        catch {
            printers = [];
        }
        return {
            port: this.port,
            printerCount: printers.length,
            printers,
            service: SERVICE_NAME,
            startedAt: this.startedAt,
            status: 'ok',
            version: this.version,
        };
    }
    start() {
        if (this.server) {
            this.log(`Gateway already running on port ${this.port}.`);
            return;
        }
        this.ensureSumatraBinary();
        this.server = http_1.default.createServer((req, res) => {
            void this.handleRequest(req, res);
        });
        this.server.on('error', (error) => {
            this.log(`Gateway server error: ${error.message}`, 'error');
        });
        this.server.listen(this.port, () => {
            this.log(`Gateway listening on http://localhost:${this.port}`, 'success');
            this.log(`PDF print engine preference: ${this.pdfPrintEngine}.`);
            void this.notifyStatus();
        });
    }
    stop() {
        if (!this.server) {
            return;
        }
        const activeServer = this.server;
        this.server = null;
        activeServer.close(() => {
            this.log('Gateway server stopped.');
        });
    }
    async handlePrintRequest(res, payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new HttpError(400, 'Request body must be a JSON object.');
        }
        const requestStartedAt = Date.now();
        const body = payload;
        const jobName = this.normalizeOptionalText(body.jobName, 'jobName') ?? 'LIS Print Job';
        const requestedPrinterName = this.normalizeOptionalText(body.printerName, 'printerName');
        const pdfBuffer = this.decodeBase64Pdf(body.pdfBase64);
        const printerName = await this.resolvePrinterName(requestedPrinterName);
        const tempDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), `${SERVICE_NAME}-`));
        const tempFilePath = path_1.default.join(tempDir, `${(0, crypto_1.randomUUID)()}.pdf`);
        this.log(`Print request received for ${jobName}${printerName ? ` on ${printerName}` : ' on default printer'}.`);
        try {
            fs_1.default.writeFileSync(tempFilePath, pdfBuffer);
            const options = {};
            if (printerName) {
                options.printer = printerName;
            }
            this.applyRequestedPrintOptions(body.printOptions, options);
            if (fs_1.default.existsSync(this.tempSumatraPath)) {
                options.sumatraPdfPath = this.tempSumatraPath;
            }
            this.respondJson(res, 202, {
                jobName,
                printerName: printerName ?? null,
                status: 'accepted',
            });
            const acceptedMs = Date.now() - requestStartedAt;
            this.log(`Accepted ${jobName}${printerName ? ` on ${printerName}` : ''} in ${acceptedMs} ms. Printer completion will continue in background.`);
            void this.runQueuedPdfPrintJob({
                jobName,
                pdfSizeBytes: pdfBuffer.length,
                printerName,
                requestStartedAt,
                tempDir,
                tempFilePath,
                options,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Print failed.';
            this.log(`Print failed: ${message}`, 'error');
            setTimeout(() => {
                fs_1.default.rmSync(tempDir, { force: true, recursive: true });
            }, 10000);
            throw new HttpError(500, message);
        }
    }
    async runQueuedPdfPrintJob(input) {
        try {
            const engineUsed = await this.printPdfWithPreferredEngine({
                options: input.options,
                pdfPath: input.tempFilePath,
                printerName: input.printerName,
            });
            const durationMs = Date.now() - input.requestStartedAt;
            this.log(`Printed ${input.jobName}${input.printerName ? ` on ${input.printerName}` : ''} in ${durationMs} ms (${input.pdfSizeBytes} bytes) via ${engineUsed}.`, 'success');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Print failed.';
            this.log(`Print failed for ${input.jobName}: ${message}`, 'error');
        }
        finally {
            setTimeout(() => {
                fs_1.default.rmSync(input.tempDir, { force: true, recursive: true });
            }, 10000);
            void this.notifyStatus();
        }
    }
    resolvePdfPrintEngine() {
        const raw = String(process.env.LIS_GATEWAY_PDF_PRINT_ENGINE
            ?? process.env.PDF_PRINT_ENGINE
            ?? 'auto')
            .trim()
            .toLowerCase();
        if (raw === 'adobe' || raw === 'shell' || raw === 'sumatra') {
            return raw;
        }
        return 'auto';
    }
    async printPdfWithPreferredEngine(input) {
        const attempt = async (engine) => {
            if (engine === 'adobe') {
                if (!input.printerName) {
                    throw new Error('Adobe Reader print requires an explicit printer name.');
                }
                await this.printPdfViaAdobeReader(input.pdfPath, input.printerName);
                return engine;
            }
            if (engine === 'shell') {
                await this.printPdfViaWindowsShell(input.pdfPath, input.printerName);
                return engine;
            }
            await (0, pdf_to_printer_1.print)(input.pdfPath, input.options);
            return engine;
        };
        const engines = this.pdfPrintEngine === 'adobe'
            ? ['adobe', 'sumatra']
            : this.pdfPrintEngine === 'shell'
                ? ['shell', 'sumatra']
                : this.pdfPrintEngine === 'sumatra'
                    ? ['sumatra']
                    : ['sumatra', 'adobe', 'shell'];
        let lastError;
        for (const engine of engines) {
            try {
                return await attempt(engine);
            }
            catch (error) {
                lastError = error;
                const message = this.getCommandErrorMessage(error, `PDF print failed via ${engine}.`);
                this.log(`PDF print engine ${engine} failed${input.printerName ? ` for ${input.printerName}` : ''}: ${message}`, 'error');
            }
        }
        throw lastError instanceof Error ? lastError : new Error('All PDF print engines failed.');
    }
    getPossibleAdobeReaderPaths() {
        const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
        return [
            path_1.default.join(programFiles, 'Adobe', 'Acrobat DC', 'Acrobat', 'Acrobat.exe'),
            path_1.default.join(programFiles, 'Adobe', 'Acrobat Reader DC', 'Reader', 'AcroRd32.exe'),
            path_1.default.join(programFiles, 'Adobe', 'Acrobat Reader', 'Reader', 'AcroRd32.exe'),
            path_1.default.join(programFilesX86, 'Adobe', 'Acrobat Reader DC', 'Reader', 'AcroRd32.exe'),
            path_1.default.join(programFilesX86, 'Adobe', 'Acrobat Reader', 'Reader', 'AcroRd32.exe'),
        ];
    }
    resolveAdobeReaderPath() {
        for (const candidate of this.getPossibleAdobeReaderPaths()) {
            if (fs_1.default.existsSync(candidate)) {
                return candidate;
            }
        }
        return null;
    }
    async getPrinterSpoolIdentity(printerName) {
        const escapedPrinterName = printerName.replace(/'/g, "''");
        const command = [
            `$printer = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq '${escapedPrinterName}' } | Select-Object -First 1 Name, DriverName, PortName;`,
            'if (-not $printer) { throw "Printer metadata not found." }',
            '$printer | ConvertTo-Json -Compress',
        ].join(' ');
        try {
            const { stdout } = await execFileAsync('Powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true });
            const raw = stdout.trim();
            if (!raw) {
                throw new Error('Printer metadata command returned no data.');
            }
            const parsed = JSON.parse(raw);
            const resolvedName = typeof parsed.Name === 'string' ? parsed.Name.trim() : '';
            const driverName = typeof parsed.DriverName === 'string' ? parsed.DriverName.trim() : '';
            const portName = typeof parsed.PortName === 'string' ? parsed.PortName.trim() : '';
            if (!resolvedName || !driverName || !portName) {
                throw new Error('Incomplete printer metadata returned from PowerShell.');
            }
            return {
                driverName,
                name: resolvedName,
                portName,
            };
        }
        catch (error) {
            const message = this.getCommandErrorMessage(error, 'Failed to read printer metadata.');
            throw new Error(message);
        }
    }
    async printPdfViaAdobeReader(pdfPath, printerName) {
        const adobeReaderPath = this.resolveAdobeReaderPath();
        if (!adobeReaderPath) {
            throw new Error('Adobe Reader executable was not found.');
        }
        const printer = await this.getPrinterSpoolIdentity(printerName);
        try {
            await execFileAsync(adobeReaderPath, ['/t', pdfPath, printer.name, printer.driverName, printer.portName], { windowsHide: true });
        }
        catch (error) {
            const message = this.getCommandErrorMessage(error, 'Adobe Reader print command failed.');
            throw new Error(message);
        }
    }
    async printPdfViaWindowsShell(pdfPath, printerName) {
        const escapedPdfPath = pdfPath.replace(/'/g, "''");
        let command;
        if (printerName) {
            const printer = await this.getPrinterSpoolIdentity(printerName);
            const escapedPrinterName = printer.name.replace(/'/g, "''");
            const escapedDriverName = printer.driverName.replace(/'/g, "''");
            const escapedPortName = printer.portName.replace(/'/g, "''");
            command = [
                `$process = Start-Process -FilePath '${escapedPdfPath}' -Verb PrintTo -ArgumentList @('${escapedPrinterName}', '${escapedDriverName}', '${escapedPortName}') -PassThru -WindowStyle Hidden;`,
                '$process.WaitForExit();',
                'if ($process.ExitCode -ne 0) { exit $process.ExitCode }',
            ].join(' ');
        }
        else {
            command = [
                `$process = Start-Process -FilePath '${escapedPdfPath}' -Verb Print -PassThru -WindowStyle Hidden;`,
                '$process.WaitForExit();',
                'if ($process.ExitCode -ne 0) { exit $process.ExitCode }',
            ].join(' ');
        }
        try {
            await execFileAsync('Powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true });
        }
        catch (error) {
            const message = this.getCommandErrorMessage(error, 'Windows shell PDF print failed.');
            throw new Error(message);
        }
    }
    async handleRawPrintRequest(res, payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new HttpError(400, 'Request body must be a JSON object.');
        }
        const requestStartedAt = Date.now();
        const body = payload;
        const jobName = this.normalizeOptionalText(body.jobName, 'jobName') ?? 'LIS Raw Print Job';
        const requestedPrinterName = this.normalizeOptionalText(body.printerName, 'printerName');
        const contentType = this.normalizeOptionalText(body.contentType, 'contentType') ?? 'zpl';
        if (contentType !== 'zpl') {
            throw new HttpError(400, 'contentType must be zpl.');
        }
        const printerName = await this.resolvePrinterName(requestedPrinterName);
        if (!printerName) {
            throw new HttpError(400, 'printerName is required for raw printing.');
        }
        const rawBuffer = this.decodeBase64Buffer(body.rawBase64, 'rawBase64');
        this.log(`Raw print request received for ${jobName} on ${printerName}.`);
        try {
            await this.printRawBuffer(printerName, jobName, rawBuffer);
            const durationMs = Date.now() - requestStartedAt;
            this.log(`Printed raw ${contentType} job ${jobName} on ${printerName} in ${durationMs} ms (${rawBuffer.length} bytes).`, 'success');
            this.respondJson(res, 200, {
                contentType,
                jobName,
                printerName,
                status: 'success',
            });
            void this.notifyStatus();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Raw print failed.';
            this.log(`Raw print failed: ${message}`, 'error');
            throw new HttpError(500, message);
        }
    }
    async handleRequest(req, res) {
        this.applyCorsHeaders(req, res);
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        try {
            const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);
            if (req.method === 'GET' && url.pathname === '/local/status') {
                this.respondJson(res, 200, await this.getStatusSnapshot());
                return;
            }
            if (req.method === 'GET' && url.pathname === '/local/printers') {
                const printers = await this.listPrinters();
                this.respondJson(res, 200, { printers });
                return;
            }
            if (req.method === 'GET' && url.pathname === '/local/printer-config') {
                const requestedPrinterName = this.normalizeRequiredText(url.searchParams.get('printerName'), 'printerName');
                const printerConfig = await this.getPrinterConfig(requestedPrinterName);
                this.respondJson(res, 200, printerConfig);
                return;
            }
            if (req.method === 'POST' && url.pathname === '/local/print') {
                const payload = await this.readJsonBody(req);
                await this.handlePrintRequest(res, payload);
                return;
            }
            // Keep backward compatibility with older desktop clients and cached bundles.
            if (req.method === 'POST' &&
                (url.pathname === '/local/print-raw' ||
                    url.pathname === '/local/printer-raw' ||
                    url.pathname === '/print-raw' ||
                    url.pathname === '/printer-raw')) {
                const payload = await this.readJsonBody(req);
                await this.handleRawPrintRequest(res, payload);
                return;
            }
            throw new HttpError(404, 'Route not found.');
        }
        catch (error) {
            const statusCode = error instanceof HttpError ? error.statusCode : 500;
            const message = error instanceof Error ? error.message : 'Unexpected gateway error.';
            if (statusCode >= 500) {
                this.log(message, 'error');
            }
            this.respondJson(res, statusCode, {
                error: message,
                message,
            });
        }
    }
    applyCorsHeaders(req, res) {
        const requestedHeaders = req.headers['access-control-request-headers'];
        const requestedPrivateNetwork = req.headers['access-control-request-private-network'];
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', typeof requestedHeaders === 'string' && requestedHeaders.trim().length > 0
            ? requestedHeaders
            : 'Content-Type');
        res.setHeader('Vary', 'Access-Control-Request-Headers, Access-Control-Request-Private-Network');
        if (requestedPrivateNetwork === 'true') {
            res.setHeader('Access-Control-Allow-Private-Network', 'true');
        }
    }
    decodeBase64Pdf(value) {
        const buffer = this.decodeBase64Buffer(value, 'pdfBase64');
        const fileSignature = buffer.subarray(0, 4).toString('ascii');
        if (fileSignature !== '%PDF') {
            throw new HttpError(400, 'pdfBase64 must contain a valid PDF document.');
        }
        return buffer;
    }
    decodeBase64Buffer(value, fieldName) {
        const raw = this.normalizeRequiredText(value, fieldName);
        const withoutPrefix = raw.replace(/^data:[^;]+;base64,/i, '');
        const normalized = withoutPrefix.replace(/\s+/g, '');
        if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) {
            throw new HttpError(400, `${fieldName} must contain base64-encoded data.`);
        }
        const buffer = Buffer.from(normalized, 'base64');
        if (buffer.length === 0) {
            throw new HttpError(400, `${fieldName} could not be decoded.`);
        }
        return buffer;
    }
    ensureSumatraBinary() {
        const sourcePath = this.getPossibleSumatraPaths().find((candidate) => fs_1.default.existsSync(candidate));
        if (!sourcePath) {
            this.log('SumatraPDF binary was not found. Gateway printing may fail.', 'error');
            return;
        }
        try {
            fs_1.default.mkdirSync(path_1.default.dirname(this.tempSumatraPath), { recursive: true });
            fs_1.default.copyFileSync(sourcePath, this.tempSumatraPath);
            this.log(`Prepared SumatraPDF at ${this.tempSumatraPath}.`, 'success');
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown extraction error.';
            this.log(`Failed to prepare SumatraPDF: ${message}`, 'error');
        }
    }
    getPossibleSumatraPaths() {
        const electronProcess = process;
        const resourcesPath = electronProcess.resourcesPath;
        return [
            path_1.default.join(__dirname, '../node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
            path_1.default.join(process.cwd(), 'node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
            path_1.default.join(process.cwd(), 'lis-print-gateway/node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
            ...(resourcesPath
                ? [
                    path_1.default.join(resourcesPath, 'app.asar.unpacked/node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
                    path_1.default.join(resourcesPath, 'node_modules/pdf-to-printer/dist', SUMATRA_BINARY_NAME),
                ]
                : []),
        ];
    }
    async listPrinters() {
        const printers = await (0, pdf_to_printer_1.getPrinters)();
        return Array.from(new Set(printers
            .map((printer) => printer.name.trim())
            .filter((printerName) => printerName.length > 0))).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
    }
    async getPrinterConfig(requestedPrinterName) {
        const printerName = await this.resolvePrinterName(requestedPrinterName);
        if (!printerName) {
            throw new HttpError(400, 'printerName is required.');
        }
        const escapedPrinterName = printerName.replace(/'/g, "''");
        const command = [
            `$cfg = Get-PrintConfiguration -PrinterName '${escapedPrinterName}';`,
            'if (-not $cfg) { throw "Printer configuration not found." }',
            '$cfg | Select-Object PaperSize, PrintCapabilitiesXML | ConvertTo-Json -Compress -Depth 4',
        ].join(' ');
        try {
            const { stdout } = await execFileAsync('Powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true });
            const raw = stdout.trim();
            if (!raw) {
                throw new Error('Printer configuration command returned no data.');
            }
            const parsed = JSON.parse(raw);
            const xml = typeof parsed.PrintCapabilitiesXML === 'string'
                ? parsed.PrintCapabilitiesXML
                : '';
            const widthMatch = xml.match(/MediaSizeWidth"><psf:Value[^>]*>(\d+)<\/psf:Value>/i);
            const heightMatch = xml.match(/MediaSizeHeight"><psf:Value[^>]*>(\d+)<\/psf:Value>/i);
            const orientationMatch = xml.match(/Feature name="psk:PageOrientation"><psf:Option name="psk:(Portrait|Landscape)"/i);
            const resolutionXMatch = xml.match(/ResolutionX"><psf:Value[^>]*>([\d.]+)<\/psf:Value>/i)
                ?? xml.match(/PageResolutionX"><psf:Value[^>]*>([\d.]+)<\/psf:Value>/i);
            const resolutionYMatch = xml.match(/ResolutionY"><psf:Value[^>]*>([\d.]+)<\/psf:Value>/i)
                ?? xml.match(/PageResolutionY"><psf:Value[^>]*>([\d.]+)<\/psf:Value>/i);
            return {
                mediaHeightMm: heightMatch ? Number(heightMatch[1]) / 1000 : null,
                mediaWidthMm: widthMatch ? Number(widthMatch[1]) / 1000 : null,
                orientation: orientationMatch
                    ? orientationMatch[1].toLowerCase()
                    : null,
                paperSize: typeof parsed.PaperSize === 'string' && parsed.PaperSize.trim()
                    ? parsed.PaperSize.trim()
                    : null,
                printerName,
                resolutionXDpi: resolutionXMatch ? Math.round(Number(resolutionXMatch[1])) : null,
                resolutionYDpi: resolutionYMatch ? Math.round(Number(resolutionYMatch[1])) : null,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to read printer configuration.';
            throw new HttpError(500, `Failed to read printer configuration: ${message}`);
        }
    }
    async printRawBuffer(printerName, jobName, rawBuffer) {
        const tempDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), `${SERVICE_NAME}-raw-`));
        const payloadPath = path_1.default.join(tempDir, `${(0, crypto_1.randomUUID)()}.raw`);
        const scriptPath = path_1.default.join(tempDir, 'send-raw.ps1');
        try {
            fs_1.default.writeFileSync(payloadPath, rawBuffer);
            fs_1.default.writeFileSync(scriptPath, this.buildRawPrintScript(), 'utf8');
            await execFileAsync('Powershell.exe', [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-File',
                scriptPath,
                '-PrinterName',
                printerName,
                '-JobName',
                jobName,
                '-PayloadPath',
                payloadPath,
            ], { windowsHide: true });
        }
        catch (error) {
            const message = this.getCommandErrorMessage(error, 'RAW print command failed.');
            throw new Error(message);
        }
        finally {
            setTimeout(() => {
                fs_1.default.rmSync(tempDir, { force: true, recursive: true });
            }, 10000);
        }
    }
    buildRawPrintScript() {
        return [
            'param(',
            '    [Parameter(Mandatory = $true)][string]$PrinterName,',
            '    [Parameter(Mandatory = $true)][string]$JobName,',
            '    [Parameter(Mandatory = $true)][string]$PayloadPath',
            ')',
            "$ErrorActionPreference = 'Stop'",
            'Add-Type -TypeDefinition @"',
            'using System;',
            'using System.Runtime.InteropServices;',
            '',
            '[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
            'public class DOCINFO',
            '{',
            '    [MarshalAs(UnmanagedType.LPWStr)]',
            '    public string pDocName;',
            '    [MarshalAs(UnmanagedType.LPWStr)]',
            '    public string pOutputFile;',
            '    [MarshalAs(UnmanagedType.LPWStr)]',
            '    public string pDataType;',
            '}',
            '',
            'public static class RawPrinterNative',
            '{',
            '    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]',
            '    public static extern bool OpenPrinter(string printerName, out IntPtr printerHandle, IntPtr defaults);',
            '',
            '    [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]',
            '    public static extern int StartDocPrinter(IntPtr printerHandle, int level, [In] DOCINFO docInfo);',
            '',
            '    [DllImport("winspool.drv", SetLastError = true)]',
            '    public static extern bool EndDocPrinter(IntPtr printerHandle);',
            '',
            '    [DllImport("winspool.drv", SetLastError = true)]',
            '    public static extern bool StartPagePrinter(IntPtr printerHandle);',
            '',
            '    [DllImport("winspool.drv", SetLastError = true)]',
            '    public static extern bool EndPagePrinter(IntPtr printerHandle);',
            '',
            '    [DllImport("winspool.drv", SetLastError = true)]',
            '    public static extern bool WritePrinter(IntPtr printerHandle, byte[] bytes, int count, out int written);',
            '',
            '    [DllImport("winspool.drv", SetLastError = true)]',
            '    public static extern bool ClosePrinter(IntPtr printerHandle);',
            '}',
            '"@',
            '$bytes = [System.IO.File]::ReadAllBytes($PayloadPath)',
            'if (-not $bytes -or $bytes.Length -eq 0) {',
            "    throw 'Payload is empty.'",
            '}',
            '$printerHandle = [IntPtr]::Zero',
            '$docStarted = $false',
            '$pageStarted = $false',
            'if (-not [RawPrinterNative]::OpenPrinter($PrinterName, [ref]$printerHandle, [IntPtr]::Zero)) {',
            '    throw "OpenPrinter failed with Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."',
            '}',
            'try {',
            '    $docInfo = New-Object DOCINFO',
            '    $docInfo.pDocName = $JobName',
            "    $docInfo.pDataType = 'RAW'",
            '    $jobId = [RawPrinterNative]::StartDocPrinter($printerHandle, 1, $docInfo)',
            '    if ($jobId -eq 0) {',
            '        throw "StartDocPrinter failed with Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."',
            '    }',
            '    $docStarted = $true',
            '    if (-not [RawPrinterNative]::StartPagePrinter($printerHandle)) {',
            '        throw "StartPagePrinter failed with Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."',
            '    }',
            '    $pageStarted = $true',
            '    $written = 0',
            '    if (-not [RawPrinterNative]::WritePrinter($printerHandle, $bytes, $bytes.Length, [ref]$written)) {',
            '        throw "WritePrinter failed with Win32 error $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."',
            '    }',
            '    if ($written -ne $bytes.Length) {',
            '        throw "WritePrinter wrote $written of $($bytes.Length) bytes."',
            '    }',
            '} finally {',
            '    if ($pageStarted) {',
            '        [void][RawPrinterNative]::EndPagePrinter($printerHandle)',
            '    }',
            '    if ($docStarted) {',
            '        [void][RawPrinterNative]::EndDocPrinter($printerHandle)',
            '    }',
            '    if ($printerHandle -ne [IntPtr]::Zero) {',
            '        [void][RawPrinterNative]::ClosePrinter($printerHandle)',
            '    }',
            '}',
        ].join('\n');
    }
    getCommandErrorMessage(error, fallback) {
        if (error && typeof error === 'object') {
            const stderr = 'stderr' in error ? String(error.stderr ?? '').trim() : '';
            const stdout = 'stdout' in error ? String(error.stdout ?? '').trim() : '';
            if (stderr) {
                return stderr;
            }
            if (stdout) {
                return stdout;
            }
        }
        return error instanceof Error && error.message.trim() ? error.message : fallback;
    }
    log(text, type = 'info') {
        const timestamp = new Date().toISOString();
        const message = {
            text,
            timestamp,
            type,
        };
        console.log(`[Gateway:${type}] ${text}`);
        this.onEvent({ data: message, type: 'log' });
    }
    normalizeOptionalText(value, fieldName) {
        if (value == null) {
            return undefined;
        }
        if (typeof value !== 'string') {
            throw new HttpError(400, `${fieldName} must be a string.`);
        }
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    normalizeRequiredText(value, fieldName) {
        const normalized = this.normalizeOptionalText(value, fieldName);
        if (!normalized) {
            throw new HttpError(400, `${fieldName} is required.`);
        }
        return normalized;
    }
    async notifyStatus() {
        this.onEvent({ data: await this.getStatusSnapshot(), type: 'status' });
    }
    applyRequestedPrintOptions(value, options) {
        if (value == null) {
            return;
        }
        if (typeof value !== 'object' || Array.isArray(value)) {
            throw new HttpError(400, 'printOptions must be an object.');
        }
        const orientation = this.normalizeOptionalText(value.orientation, 'printOptions.orientation');
        if (orientation) {
            if (orientation !== 'portrait' && orientation !== 'landscape') {
                throw new HttpError(400, 'printOptions.orientation must be portrait or landscape.');
            }
            options.orientation = orientation;
        }
        const scale = this.normalizeOptionalText(value.scale, 'printOptions.scale');
        if (scale) {
            if (scale !== 'noscale' && scale !== 'shrink' && scale !== 'fit') {
                throw new HttpError(400, 'printOptions.scale must be noscale, shrink, or fit.');
            }
            options.scale = scale;
        }
        const paperSize = this.normalizeOptionalText(value.paperSize, 'printOptions.paperSize');
        if (paperSize) {
            options.paperSize = paperSize;
        }
    }
    async readJsonBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let receivedBytes = 0;
            let settled = false;
            req.on('data', (chunk) => {
                if (settled) {
                    return;
                }
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                receivedBytes += buffer.length;
                if (receivedBytes > MAX_REQUEST_BYTES) {
                    settled = true;
                    reject(new HttpError(413, 'Request body exceeded the 40 MB limit.'));
                    return;
                }
                chunks.push(buffer);
            });
            req.on('end', () => {
                if (settled) {
                    return;
                }
                const rawBody = Buffer.concat(chunks).toString('utf8').trim();
                if (!rawBody) {
                    reject(new HttpError(400, 'Request body is required.'));
                    return;
                }
                try {
                    resolve(JSON.parse(rawBody));
                }
                catch {
                    reject(new HttpError(400, 'Request body must be valid JSON.'));
                }
            });
            req.on('aborted', () => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(new HttpError(400, 'Request was aborted before completion.'));
            });
            req.on('error', (error) => {
                if (settled) {
                    return;
                }
                settled = true;
                reject(error);
            });
        });
    }
    respondJson(res, statusCode, payload) {
        if (res.writableEnded) {
            return;
        }
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(payload));
    }
    async resolvePrinterName(requestedPrinterName) {
        if (!requestedPrinterName) {
            return undefined;
        }
        const printers = await this.listPrinters();
        const normalizedRequest = requestedPrinterName.toLocaleLowerCase();
        const exactMatch = printers.find((printerName) => printerName.toLocaleLowerCase() === normalizedRequest);
        if (exactMatch) {
            return exactMatch;
        }
        const containsMatch = printers.find((printerName) => {
            const normalizedPrinterName = printerName.toLocaleLowerCase();
            return (normalizedPrinterName.includes(normalizedRequest) ||
                normalizedRequest.includes(normalizedPrinterName));
        });
        if (containsMatch) {
            return containsMatch;
        }
        throw new HttpError(400, `Printer "${requestedPrinterName}" was not found on this machine.`);
    }
}
exports.PrintServer = PrintServer;

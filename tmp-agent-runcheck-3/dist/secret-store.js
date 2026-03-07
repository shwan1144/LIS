"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptSecret = encryptSecret;
exports.decryptSecret = decryptSecret;
const child_process_1 = require("child_process");
const logger_1 = require("./logger");
function encodeBase64(input) {
    return Buffer.from(input, 'utf8').toString('base64');
}
function decodeBase64(input) {
    return Buffer.from(input, 'base64').toString('utf8');
}
function runPowershell(script, env) {
    const result = (0, child_process_1.spawnSync)('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        env: {
            ...process.env,
            ...env,
        },
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || result.stdout?.trim() || 'PowerShell DPAPI failed');
    }
    return (result.stdout || '').trim();
}
function encryptSecret(rawValue) {
    if (process.platform !== 'win32') {
        return `plain:${encodeBase64(rawValue)}`;
    }
    try {
        const encrypted = runPowershell('$bytes = [Text.Encoding]::UTF8.GetBytes($env:LIS_GATEWAY_SECRET); ' +
            '$enc = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::LocalMachine); ' +
            '[Convert]::ToBase64String($enc)', { LIS_GATEWAY_SECRET: rawValue });
        return `dpapi:${encrypted}`;
    }
    catch (error) {
        logger_1.logger.warn(`DPAPI encrypt failed, using local fallback: ${error instanceof Error ? error.message : String(error)}`, 'Security');
        return `plain:${encodeBase64(rawValue)}`;
    }
}
function decryptSecret(storedValue) {
    if (!storedValue)
        return '';
    if (storedValue.startsWith('plain:')) {
        return decodeBase64(storedValue.slice('plain:'.length));
    }
    if (storedValue.startsWith('dpapi:') && process.platform === 'win32') {
        const encrypted = storedValue.slice('dpapi:'.length);
        try {
            return runPowershell('$enc = [Convert]::FromBase64String($env:LIS_GATEWAY_SECRET); ' +
                '$dec = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [System.Security.Cryptography.DataProtectionScope]::LocalMachine); ' +
                '[Text.Encoding]::UTF8.GetString($dec)', { LIS_GATEWAY_SECRET: encrypted });
        }
        catch (error) {
            throw new Error(`Unable to decrypt DPAPI secret: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return decodeBase64(storedValue);
}

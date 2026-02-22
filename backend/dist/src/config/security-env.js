"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProductionEnv = isProductionEnv;
exports.requireSecret = requireSecret;
exports.assertRequiredProductionEnv = assertRequiredProductionEnv;
const warnedDevFallbacks = new Set();
function isProductionEnv() {
    return (process.env.NODE_ENV || '').toLowerCase() === 'production';
}
function warnDevFallback(envName, source) {
    const key = `${source}:${envName}`;
    if (warnedDevFallbacks.has(key)) {
        return;
    }
    warnedDevFallbacks.add(key);
    console.warn(`[SECURITY WARNING] ${source} is using a development fallback for ${envName}. ` +
        `Set ${envName} in environment variables before production deployment.`);
}
function requireSecret(envName, devFallback, source) {
    const value = process.env[envName]?.trim();
    if (value) {
        return value;
    }
    if (isProductionEnv()) {
        throw new Error(`[SECURITY] Missing required environment variable "${envName}" in production (${source}).`);
    }
    warnDevFallback(envName, source);
    return devFallback;
}
function assertRequiredProductionEnv(envNames, source) {
    if (!isProductionEnv()) {
        return;
    }
    const missing = envNames.filter((name) => !process.env[name]?.trim());
    if (missing.length > 0) {
        throw new Error(`[SECURITY] Missing required environment variables in production (${source}): ${missing.join(', ')}`);
    }
}
//# sourceMappingURL=security-env.js.map
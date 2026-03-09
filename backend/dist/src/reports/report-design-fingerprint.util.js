"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReportDesignFingerprint = buildReportDesignFingerprint;
const crypto_1 = require("crypto");
function stableJsonStringify(value) {
    const seen = new WeakSet();
    const normalize = (input) => {
        if (input === null || typeof input !== 'object') {
            return input;
        }
        if (input instanceof Date) {
            return input.toISOString();
        }
        if (Array.isArray(input)) {
            return input.map((item) => normalize(item));
        }
        if (seen.has(input)) {
            return '[Circular]';
        }
        seen.add(input);
        const source = input;
        const normalized = {};
        for (const key of Object.keys(source).sort()) {
            normalized[key] = normalize(source[key]);
        }
        return normalized;
    };
    try {
        return JSON.stringify(normalize(value));
    }
    catch {
        return '';
    }
}
function buildReportDesignFingerprint(input) {
    const reportBranding = input.reportBranding ?? {};
    const rawDesignPayload = [
        reportBranding.bannerDataUrl ?? '',
        reportBranding.footerDataUrl ?? '',
        reportBranding.logoDataUrl ?? '',
        reportBranding.watermarkDataUrl ?? '',
        stableJsonStringify(input.reportStyle ?? null),
    ].join('::');
    return (0, crypto_1.createHash)('sha1').update(rawDesignPayload).digest('hex');
}
//# sourceMappingURL=report-design-fingerprint.util.js.map
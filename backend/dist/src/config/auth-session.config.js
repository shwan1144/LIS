"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_ACCESS_TOKEN_TTL_MINUTES = exports.LAB_ACCESS_TOKEN_TTL_MINUTES = exports.REFRESH_TOKEN_TTL_DAYS = exports.PLATFORM_ACCESS_TOKEN_TTL_SECONDS = exports.LAB_ACCESS_TOKEN_TTL_SECONDS = void 0;
function parsePositiveInteger(input, fallback) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.floor(parsed);
}
exports.LAB_ACCESS_TOKEN_TTL_SECONDS = parsePositiveInteger(process.env.JWT_ACCESS_TTL, 900);
exports.PLATFORM_ACCESS_TOKEN_TTL_SECONDS = parsePositiveInteger(process.env.PLATFORM_JWT_ACCESS_TTL, 900);
exports.REFRESH_TOKEN_TTL_DAYS = parsePositiveInteger(process.env.REFRESH_TOKEN_TTL_DAYS, 30);
exports.LAB_ACCESS_TOKEN_TTL_MINUTES = Math.max(1, Math.ceil(exports.LAB_ACCESS_TOKEN_TTL_SECONDS / 60));
exports.PLATFORM_ACCESS_TOKEN_TTL_MINUTES = Math.max(1, Math.ceil(exports.PLATFORM_ACCESS_TOKEN_TTL_SECONDS / 60));
//# sourceMappingURL=auth-session.config.js.map
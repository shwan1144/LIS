"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeRetryDelayMs = computeRetryDelayMs;
function computeRetryDelayMs(attemptNumber, baseMs, maxMs, jitterFactor) {
    const safeAttempt = Math.max(1, attemptNumber);
    const exponentialDelay = Math.min(maxMs, Math.round(baseMs * Math.pow(2, safeAttempt - 1)));
    if (jitterFactor <= 0) {
        return exponentialDelay;
    }
    const jitterSpan = exponentialDelay * jitterFactor;
    const jitterOffset = (Math.random() * (jitterSpan * 2)) - jitterSpan;
    const withJitter = Math.round(exponentialDelay + jitterOffset);
    return Math.max(baseMs, Math.min(maxMs, withJitter));
}

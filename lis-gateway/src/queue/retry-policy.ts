export function computeRetryDelayMs(
    attemptNumber: number,
    baseMs: number,
    maxMs: number,
    jitterFactor: number,
): number {
    const safeAttempt = Math.max(1, attemptNumber);
    const exponentialDelay = Math.min(
        maxMs,
        Math.round(baseMs * Math.pow(2, safeAttempt - 1)),
    );

    if (jitterFactor <= 0) {
        return exponentialDelay;
    }

    const jitterSpan = exponentialDelay * jitterFactor;
    const jitterOffset = (Math.random() * (jitterSpan * 2)) - jitterSpan;
    const withJitter = Math.round(exponentialDelay + jitterOffset);

    return Math.max(baseMs, Math.min(maxMs, withJitter));
}

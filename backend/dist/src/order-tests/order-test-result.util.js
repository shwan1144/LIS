"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasMeaningfulOrderTestResult = hasMeaningfulOrderTestResult;
function hasMeaningfulOrderTestResult(orderTest) {
    if (!orderTest || typeof orderTest !== 'object') {
        return false;
    }
    if (orderTest.resultValue !== null && orderTest.resultValue !== undefined) {
        return true;
    }
    if (typeof orderTest.resultText === 'string' && orderTest.resultText.trim().length > 0) {
        return true;
    }
    if (orderTest.resultParameters &&
        typeof orderTest.resultParameters === 'object' &&
        !Array.isArray(orderTest.resultParameters)) {
        return Object.values(orderTest.resultParameters).some((value) => String(value ?? '').trim().length > 0);
    }
    return false;
}
//# sourceMappingURL=order-test-result.util.js.map
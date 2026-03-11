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
    if (orderTest.cultureResult && typeof orderTest.cultureResult === 'object') {
        const payload = orderTest.cultureResult;
        if (payload.noGrowth === true) {
            return true;
        }
        if (typeof payload.notes === 'string' && payload.notes.trim().length > 0) {
            return true;
        }
        if (Array.isArray(payload.isolates) && payload.isolates.length > 0) {
            return payload.isolates.some((isolate) => {
                if (!isolate || typeof isolate !== 'object')
                    return false;
                const isolateObj = isolate;
                const hasOrganism = typeof isolateObj.organism === 'string' &&
                    isolateObj.organism.trim().length > 0;
                const hasAntibiotics = Array.isArray(isolateObj.antibiotics) &&
                    isolateObj.antibiotics.some((row) => {
                        if (!row || typeof row !== 'object')
                            return false;
                        const interpretation = row.interpretation;
                        return (typeof interpretation === 'string' &&
                            interpretation.trim().length > 0);
                    });
                return hasOrganism && hasAntibiotics;
            });
        }
    }
    return false;
}
//# sourceMappingURL=order-test-result.util.js.map
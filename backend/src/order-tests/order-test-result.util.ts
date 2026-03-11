type OrderTestResultSnapshot = {
  resultValue?: unknown;
  resultText?: unknown;
  resultParameters?: unknown;
  cultureResult?: unknown;
};

export function hasMeaningfulOrderTestResult(
  orderTest: OrderTestResultSnapshot | null | undefined,
): boolean {
  if (!orderTest || typeof orderTest !== 'object') {
    return false;
  }

  if (orderTest.resultValue !== null && orderTest.resultValue !== undefined) {
    return true;
  }

  if (typeof orderTest.resultText === 'string' && orderTest.resultText.trim().length > 0) {
    return true;
  }

  if (
    orderTest.resultParameters &&
    typeof orderTest.resultParameters === 'object' &&
    !Array.isArray(orderTest.resultParameters)
  ) {
    return Object.values(orderTest.resultParameters as Record<string, unknown>).some(
      (value) => String(value ?? '').trim().length > 0,
    );
  }

  if (orderTest.cultureResult && typeof orderTest.cultureResult === 'object') {
    const payload = orderTest.cultureResult as {
      noGrowth?: unknown;
      notes?: unknown;
      isolates?: unknown;
    };
    if (payload.noGrowth === true) {
      return true;
    }
    if (typeof payload.notes === 'string' && payload.notes.trim().length > 0) {
      return true;
    }
    if (Array.isArray(payload.isolates) && payload.isolates.length > 0) {
      return payload.isolates.some((isolate) => {
        if (!isolate || typeof isolate !== 'object') return false;
        const isolateObj = isolate as {
          organism?: unknown;
          antibiotics?: unknown;
        };
        const hasOrganism =
          typeof isolateObj.organism === 'string' &&
          isolateObj.organism.trim().length > 0;
        const hasAntibiotics =
          Array.isArray(isolateObj.antibiotics) &&
          isolateObj.antibiotics.some((row) => {
            if (!row || typeof row !== 'object') return false;
            const interpretation = (row as { interpretation?: unknown }).interpretation;
            return (
              typeof interpretation === 'string' &&
              interpretation.trim().length > 0
            );
          });
        return hasOrganism && hasAntibiotics;
      });
    }
  }

  return false;
}

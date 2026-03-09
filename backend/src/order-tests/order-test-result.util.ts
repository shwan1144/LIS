type OrderTestResultSnapshot = {
  resultValue?: unknown;
  resultText?: unknown;
  resultParameters?: unknown;
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

  return false;
}

import { hasMeaningfulOrderTestResult } from './order-test-result.util';

describe('hasMeaningfulOrderTestResult', () => {
  it('returns false when all result fields are blank', () => {
    expect(
      hasMeaningfulOrderTestResult({
        resultValue: null,
        resultText: '   ',
        resultParameters: {
          color: ' ',
        },
      }),
    ).toBe(false);
  });

  it('treats numeric zero as a real result', () => {
    expect(
      hasMeaningfulOrderTestResult({
        resultValue: 0,
        resultText: null,
        resultParameters: null,
      }),
    ).toBe(true);
  });

  it('treats non-empty parameter values as a real result', () => {
    expect(
      hasMeaningfulOrderTestResult({
        resultValue: null,
        resultText: null,
        resultParameters: {
          appearance: 'clear',
        },
      }),
    ).toBe(true);
  });

  it('treats no-growth culture result as a real result', () => {
    expect(
      hasMeaningfulOrderTestResult({
        resultValue: null,
        resultText: null,
        resultParameters: null,
        cultureResult: {
          noGrowth: true,
          isolates: [],
        },
      }),
    ).toBe(true);
  });

  it('treats isolate rows with interpretation as a real culture result', () => {
    expect(
      hasMeaningfulOrderTestResult({
        cultureResult: {
          noGrowth: false,
          isolates: [
            {
              isolateKey: 'iso-1',
              organism: 'E. coli',
              antibiotics: [{ interpretation: 'S' }],
            },
          ],
        },
      }),
    ).toBe(true);
  });
});

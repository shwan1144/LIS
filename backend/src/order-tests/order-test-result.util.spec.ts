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
});

import { ResultFlag } from '../entities/order-test.entity';
import { normalizeOrderTestFlag } from './order-test-flag.util';

describe('normalizeOrderTestFlag', () => {
  it('collapses critical flags to directional flags', () => {
    expect(normalizeOrderTestFlag(ResultFlag.CRITICAL_HIGH)).toBe(ResultFlag.HIGH);
    expect(normalizeOrderTestFlag(ResultFlag.CRITICAL_LOW)).toBe(ResultFlag.LOW);
    expect(normalizeOrderTestFlag('HH')).toBe(ResultFlag.HIGH);
    expect(normalizeOrderTestFlag('LL')).toBe(ResultFlag.LOW);
  });

  it('keeps supported non-critical flags unchanged', () => {
    expect(normalizeOrderTestFlag('N')).toBe(ResultFlag.NORMAL);
    expect(normalizeOrderTestFlag('H')).toBe(ResultFlag.HIGH);
    expect(normalizeOrderTestFlag('L')).toBe(ResultFlag.LOW);
    expect(normalizeOrderTestFlag('POS')).toBe(ResultFlag.POSITIVE);
    expect(normalizeOrderTestFlag('NEG')).toBe(ResultFlag.NEGATIVE);
    expect(normalizeOrderTestFlag('ABN')).toBe(ResultFlag.ABNORMAL);
  });

  it('returns null for blank and unsupported values', () => {
    expect(normalizeOrderTestFlag('')).toBeNull();
    expect(normalizeOrderTestFlag(null)).toBeNull();
    expect(normalizeOrderTestFlag('UNKNOWN')).toBeNull();
  });
});

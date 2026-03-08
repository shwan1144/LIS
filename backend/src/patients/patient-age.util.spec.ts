import { formatPatientAgeDisplay } from './patient-age.util';

describe('formatPatientAgeDisplay', () => {
  it('formats newborn age in days', () => {
    expect(
      formatPatientAgeDisplay('2026-03-04', '2026-03-09T10:00:00.000Z'),
    ).toBe('5 days');
  });

  it('formats infant age in months', () => {
    expect(
      formatPatientAgeDisplay('2025-09-09', '2026-03-09T10:00:00.000Z'),
    ).toBe('6 months');
  });

  it('formats older age in years', () => {
    expect(
      formatPatientAgeDisplay('2023-03-09', '2026-03-09T10:00:00.000Z'),
    ).toBe('3 years');
  });

  it('returns zero days on the birth date', () => {
    expect(
      formatPatientAgeDisplay('2026-03-09', '2026-03-09T10:00:00.000Z'),
    ).toBe('0 days');
  });

  it('returns null for invalid or future dates', () => {
    expect(formatPatientAgeDisplay('bad-date', '2026-03-09T10:00:00.000Z')).toBeNull();
    expect(formatPatientAgeDisplay('2026-03-10', '2026-03-09T10:00:00.000Z')).toBeNull();
  });
});

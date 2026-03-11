type DateInput = Date | string | null | undefined;

type UtcDateParts = {
  year: number;
  month: number;
  day: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateInput(value: DateInput): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number.parseInt(dateOnlyMatch[1], 10);
    const month = Number.parseInt(dateOnlyMatch[2], 10);
    const day = Number.parseInt(dateOnlyMatch[3], 10);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toUtcDateParts(value: DateInput): UtcDateParts | null {
  const parsed = parseDateInput(value);
  if (!parsed) return null;
  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth(),
    day: parsed.getUTCDate(),
  };
}

function compareUtcDates(left: UtcDateParts, right: UtcDateParts): number {
  if (left.year !== right.year) return left.year - right.year;
  if (left.month !== right.month) return left.month - right.month;
  return left.day - right.day;
}

function completedYears(dob: UtcDateParts, reference: UtcDateParts): number {
  let years = reference.year - dob.year;
  if (
    reference.month < dob.month ||
    (reference.month === dob.month && reference.day < dob.day)
  ) {
    years -= 1;
  }
  return years;
}

function completedMonths(dob: UtcDateParts, reference: UtcDateParts): number {
  let months = (reference.year - dob.year) * 12 + (reference.month - dob.month);
  if (reference.day < dob.day) {
    months -= 1;
  }
  return months;
}

function completedDays(dob: UtcDateParts, reference: UtcDateParts): number {
  const dobUtc = Date.UTC(dob.year, dob.month, dob.day);
  const referenceUtc = Date.UTC(reference.year, reference.month, reference.day);
  return Math.floor((referenceUtc - dobUtc) / MS_PER_DAY);
}

function formatUnit(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? '' : 's'}`;
}

function formatCompactUnit(value: number, suffix: string): string {
  return `${value}${suffix}`;
}

export function formatPatientAgeDisplay(
  dateOfBirth: DateInput,
  referenceDate: DateInput = new Date(),
): string | null {
  const dob = toUtcDateParts(dateOfBirth);
  const reference = toUtcDateParts(referenceDate);
  if (!dob || !reference) return null;
  if (compareUtcDates(reference, dob) < 0) return null;

  const years = completedYears(dob, reference);
  if (years >= 1) {
    return formatUnit(years, 'year');
  }

  const months = completedMonths(dob, reference);
  if (months >= 1) {
    return formatUnit(months, 'month');
  }

  return formatUnit(Math.max(0, completedDays(dob, reference)), 'day');
}

export function formatPatientAgeCompactDisplay(
  dateOfBirth: DateInput,
  referenceDate: DateInput = new Date(),
): string | null {
  const dob = toUtcDateParts(dateOfBirth);
  const reference = toUtcDateParts(referenceDate);
  if (!dob || !reference) return null;
  if (compareUtcDates(reference, dob) < 0) return null;

  const years = completedYears(dob, reference);
  if (years >= 1) {
    return formatCompactUnit(years, 'Y');
  }

  const months = completedMonths(dob, reference);
  if (months >= 1) {
    return formatCompactUnit(months, 'M');
  }

  return formatCompactUnit(Math.max(0, completedDays(dob, reference)), 'D');
}

export type AgeUnit = 'year' | 'month' | 'day';

export function calculateDobFromAge(
  age: number,
  unit: AgeUnit,
  referenceDate: Date = new Date(),
): string {
  const date = new Date(referenceDate.getTime());
  if (unit === 'year') {
    date.setFullYear(date.getFullYear() - age);
  } else if (unit === 'month') {
    date.setMonth(date.getMonth() - age);
  } else {
    date.setDate(date.getDate() - age);
  }
  return date.toISOString().slice(0, 10);
}

export function getAgeFromDob(
  dateOfBirth: DateInput,
  referenceDate: DateInput = new Date(),
): { value: number; unit: AgeUnit } | null {
  const dob = toUtcDateParts(dateOfBirth);
  const reference = toUtcDateParts(referenceDate);
  if (!dob || !reference) return null;
  if (compareUtcDates(reference, dob) < 0) return { value: 0, unit: 'year' };

  const years = completedYears(dob, reference);
  if (years >= 1) {
    return { value: years, unit: 'year' };
  }

  const months = completedMonths(dob, reference);
  if (months >= 1) {
    return { value: months, unit: 'month' };
  }

  return { value: Math.max(0, completedDays(dob, reference)), unit: 'day' };
}

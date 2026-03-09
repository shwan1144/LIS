const DEFAULT_LAB_TIME_ZONE = 'UTC';

type DateOnlyParts = {
  year: number;
  month: number;
  day: number;
};

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dateFormatterCache.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  dateFormatterCache.set(timeZone, formatter);
  return formatter;
}

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value ?? '';
  return parseInt(value, 10);
}

function getDateParts(date: Date, timeZone: string): DateOnlyParts {
  const parts = getDateFormatter(timeZone).formatToParts(date);
  return {
    year: readPart(parts, 'year'),
    month: readPart(parts, 'month'),
    day: readPart(parts, 'day'),
  };
}

export function normalizeLabTimeZone(rawTimeZone: string | null | undefined): string {
  const candidate = rawTimeZone?.trim() || DEFAULT_LAB_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_LAB_TIME_ZONE;
  }
}

export function formatDateKeyForTimeZone(
  date: Date,
  rawTimeZone: string | null | undefined,
): string {
  const timeZone = normalizeLabTimeZone(rawTimeZone);
  const parts = getDateParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

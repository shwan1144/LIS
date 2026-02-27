const DEFAULT_LAB_TIME_ZONE = 'UTC';

type DateOnlyParts = {
  year: number;
  month: number;
  day: number;
};

type DateTimeParts = DateOnlyParts & {
  hour: number;
  minute: number;
  second: number;
};

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

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

function getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dateTimeFormatterCache.get(timeZone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  dateTimeFormatterCache.set(timeZone, formatter);
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

function getDateTimeParts(date: Date, timeZone: string): DateTimeParts {
  const parts = getDateTimeFormatter(timeZone).formatToParts(date);
  return {
    year: readPart(parts, 'year'),
    month: readPart(parts, 'month'),
    day: readPart(parts, 'day'),
    hour: readPart(parts, 'hour'),
    minute: readPart(parts, 'minute'),
    second: readPart(parts, 'second'),
  };
}

function parseDateKey(dateKey: string): DateOnlyParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) {
    return null;
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function shiftDateParts(parts: DateOnlyParts, dayOffset: number): DateOnlyParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  const parts = getDateTimeParts(date, timeZone);
  const utcTimestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getUTCMilliseconds(),
  );
  return utcTimestamp - date.getTime();
}

function zonedDateTimeToUtc(
  parts: DateOnlyParts,
  timeZone: string,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    minute,
    second,
    millisecond,
  );

  const firstOffset = getTimeZoneOffsetMilliseconds(new Date(utcGuess), timeZone);
  let timestamp = utcGuess - firstOffset;
  const secondOffset = getTimeZoneOffsetMilliseconds(new Date(timestamp), timeZone);
  if (secondOffset !== firstOffset) {
    timestamp = utcGuess - secondOffset;
  }

  return new Date(timestamp);
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

export function formatDateKeyForTimeZone(date: Date, rawTimeZone: string | null | undefined): string {
  const timeZone = normalizeLabTimeZone(rawTimeZone);
  const parts = getDateParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function formatOrderDatePrefixForTimeZone(
  date: Date,
  rawTimeZone: string | null | undefined,
): string {
  const timeZone = normalizeLabTimeZone(rawTimeZone);
  const parts = getDateParts(date, timeZone);
  const yy = String(parts.year % 100).padStart(2, '0');
  return `${yy}${pad2(parts.month)}${pad2(parts.day)}`;
}

export function addDaysToDateKey(dateKey: string, dayOffset: number): string {
  const parts = parseDateKey(dateKey);
  if (!parts) {
    throw new Error(`Invalid date value "${dateKey}". Expected YYYY-MM-DD.`);
  }
  const shifted = shiftDateParts(parts, dayOffset);
  return `${shifted.year}-${pad2(shifted.month)}-${pad2(shifted.day)}`;
}

export function getUtcRangeForLabDate(
  dateKey: string,
  rawTimeZone: string | null | undefined,
): { startDate: Date; endDate: Date; endExclusive: Date } {
  const parts = parseDateKey(dateKey);
  if (!parts) {
    throw new Error(`Invalid date value "${dateKey}". Expected YYYY-MM-DD.`);
  }

  const timeZone = normalizeLabTimeZone(rawTimeZone);
  const nextDay = shiftDateParts(parts, 1);
  const startDate = zonedDateTimeToUtc(parts, timeZone, 0, 0, 0, 0);
  const endExclusive = zonedDateTimeToUtc(nextDay, timeZone, 0, 0, 0, 0);
  const endDate = new Date(endExclusive.getTime() - 1);

  return { startDate, endDate, endExclusive };
}

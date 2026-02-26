"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeLabTimeZone = normalizeLabTimeZone;
exports.formatDateKeyForTimeZone = formatDateKeyForTimeZone;
exports.formatOrderDatePrefixForTimeZone = formatOrderDatePrefixForTimeZone;
exports.addDaysToDateKey = addDaysToDateKey;
exports.getUtcRangeForLabDate = getUtcRangeForLabDate;
const DEFAULT_LAB_TIME_ZONE = 'UTC';
const dateFormatterCache = new Map();
const dateTimeFormatterCache = new Map();
function pad2(value) {
    return String(value).padStart(2, '0');
}
function getDateFormatter(timeZone) {
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
function getDateTimeFormatter(timeZone) {
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
function readPart(parts, type) {
    const value = parts.find((part) => part.type === type)?.value ?? '';
    return parseInt(value, 10);
}
function getDateParts(date, timeZone) {
    const parts = getDateFormatter(timeZone).formatToParts(date);
    return {
        year: readPart(parts, 'year'),
        month: readPart(parts, 'month'),
        day: readPart(parts, 'day'),
    };
}
function getDateTimeParts(date, timeZone) {
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
function parseDateKey(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
    if (!match) {
        return null;
    }
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year ||
        probe.getUTCMonth() + 1 !== month ||
        probe.getUTCDate() !== day) {
        return null;
    }
    return { year, month, day };
}
function shiftDateParts(parts, dayOffset) {
    const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset));
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
}
function getTimeZoneOffsetMilliseconds(date, timeZone) {
    const parts = getDateTimeParts(date, timeZone);
    const utcTimestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, date.getUTCMilliseconds());
    return utcTimestamp - date.getTime();
}
function zonedDateTimeToUtc(parts, timeZone, hour, minute, second, millisecond) {
    const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second, millisecond);
    const firstOffset = getTimeZoneOffsetMilliseconds(new Date(utcGuess), timeZone);
    let timestamp = utcGuess - firstOffset;
    const secondOffset = getTimeZoneOffsetMilliseconds(new Date(timestamp), timeZone);
    if (secondOffset !== firstOffset) {
        timestamp = utcGuess - secondOffset;
    }
    return new Date(timestamp);
}
function normalizeLabTimeZone(rawTimeZone) {
    const candidate = rawTimeZone?.trim() || DEFAULT_LAB_TIME_ZONE;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate });
        return candidate;
    }
    catch {
        return DEFAULT_LAB_TIME_ZONE;
    }
}
function formatDateKeyForTimeZone(date, rawTimeZone) {
    const timeZone = normalizeLabTimeZone(rawTimeZone);
    const parts = getDateParts(date, timeZone);
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}
function formatOrderDatePrefixForTimeZone(date, rawTimeZone) {
    const timeZone = normalizeLabTimeZone(rawTimeZone);
    const parts = getDateParts(date, timeZone);
    const yy = String(parts.year % 100).padStart(2, '0');
    return `${yy}${pad2(parts.month)}${pad2(parts.day)}`;
}
function addDaysToDateKey(dateKey, dayOffset) {
    const parts = parseDateKey(dateKey);
    if (!parts) {
        throw new Error(`Invalid date value "${dateKey}". Expected YYYY-MM-DD.`);
    }
    const shifted = shiftDateParts(parts, dayOffset);
    return `${shifted.year}-${pad2(shifted.month)}-${pad2(shifted.day)}`;
}
function getUtcRangeForLabDate(dateKey, rawTimeZone) {
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
//# sourceMappingURL=lab-timezone.util.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPatientAgeDisplay = formatPatientAgeDisplay;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function parseDateInput(value) {
    if (!value)
        return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
        const year = Number.parseInt(dateOnlyMatch[1], 10);
        const month = Number.parseInt(dateOnlyMatch[2], 10);
        const day = Number.parseInt(dateOnlyMatch[3], 10);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        if (parsed.getUTCFullYear() !== year ||
            parsed.getUTCMonth() !== month - 1 ||
            parsed.getUTCDate() !== day) {
            return null;
        }
        return parsed;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function toUtcDateParts(value) {
    const parsed = parseDateInput(value);
    if (!parsed)
        return null;
    return {
        year: parsed.getUTCFullYear(),
        month: parsed.getUTCMonth(),
        day: parsed.getUTCDate(),
    };
}
function compareUtcDates(left, right) {
    if (left.year !== right.year)
        return left.year - right.year;
    if (left.month !== right.month)
        return left.month - right.month;
    return left.day - right.day;
}
function completedYears(dob, reference) {
    let years = reference.year - dob.year;
    if (reference.month < dob.month ||
        (reference.month === dob.month && reference.day < dob.day)) {
        years -= 1;
    }
    return years;
}
function completedMonths(dob, reference) {
    let months = (reference.year - dob.year) * 12 + (reference.month - dob.month);
    if (reference.day < dob.day) {
        months -= 1;
    }
    return months;
}
function completedDays(dob, reference) {
    const dobUtc = Date.UTC(dob.year, dob.month, dob.day);
    const referenceUtc = Date.UTC(reference.year, reference.month, reference.day);
    return Math.floor((referenceUtc - dobUtc) / MS_PER_DAY);
}
function formatUnit(value, singular) {
    return `${value} ${singular}${value === 1 ? '' : 's'}`;
}
function formatPatientAgeDisplay(dateOfBirth, referenceDate = new Date()) {
    const dob = toUtcDateParts(dateOfBirth);
    const reference = toUtcDateParts(referenceDate);
    if (!dob || !reference)
        return null;
    if (compareUtcDates(reference, dob) < 0)
        return null;
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
//# sourceMappingURL=patient-age.util.js.map
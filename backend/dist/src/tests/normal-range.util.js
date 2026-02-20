"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePatientSex = normalizePatientSex;
exports.resolveNumericRange = resolveNumericRange;
function toNullableNumber(value) {
    if (value === null || value === undefined || value === '')
        return null;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function normalizePatientSex(value) {
    if (!value)
        return null;
    const upper = value.trim().toUpperCase();
    if (upper === 'M' || upper === 'MALE')
        return 'M';
    if (upper === 'F' || upper === 'FEMALE')
        return 'F';
    return null;
}
function normalizeAgeRange(range) {
    const sex = (range.sex || 'ANY').toUpperCase();
    const normalizedSex = sex === 'M' || sex === 'F' ? sex : 'ANY';
    return {
        sex: normalizedSex,
        minAgeYears: toNullableNumber(range.minAgeYears),
        maxAgeYears: toNullableNumber(range.maxAgeYears),
        normalMin: toNullableNumber(range.normalMin),
        normalMax: toNullableNumber(range.normalMax),
    };
}
function ageMatches(range, patientAgeYears) {
    const minAge = toNullableNumber(range.minAgeYears);
    const maxAge = toNullableNumber(range.maxAgeYears);
    if (patientAgeYears === null) {
        return minAge === null && maxAge === null;
    }
    if (minAge !== null && patientAgeYears < minAge)
        return false;
    if (maxAge !== null && patientAgeYears > maxAge)
        return false;
    return true;
}
function sexMatches(rangeSex, patientSex) {
    if (rangeSex === 'ANY')
        return true;
    if (!patientSex)
        return false;
    return rangeSex === patientSex;
}
function getRangeSpecificityScore(range, patientSex, patientAgeYears) {
    let score = 0;
    if (patientSex && range.sex === patientSex)
        score += 100;
    else if (range.sex === 'ANY')
        score += 50;
    const minAge = toNullableNumber(range.minAgeYears);
    const maxAge = toNullableNumber(range.maxAgeYears);
    if (minAge !== null && maxAge !== null) {
        score += 30;
    }
    else if (minAge !== null || maxAge !== null) {
        score += 15;
    }
    if (patientAgeYears !== null) {
        const span = minAge !== null && maxAge !== null
            ? Math.max(0, maxAge - minAge)
            : Number.POSITIVE_INFINITY;
        if (Number.isFinite(span)) {
            score += Math.max(0, 20 - Math.min(20, span));
        }
    }
    return score;
}
function resolveAgeSpecificRange(test, patientSex, patientAgeYears) {
    const ranges = (test.numericAgeRanges ?? [])
        .map(normalizeAgeRange)
        .filter((range) => {
        const min = toNullableNumber(range.normalMin);
        const max = toNullableNumber(range.normalMax);
        if (min === null && max === null)
            return false;
        if (!sexMatches(range.sex, patientSex))
            return false;
        return ageMatches(range, patientAgeYears);
    });
    if (!ranges.length)
        return null;
    ranges.sort((a, b) => {
        const scoreA = getRangeSpecificityScore(a, patientSex, patientAgeYears);
        const scoreB = getRangeSpecificityScore(b, patientSex, patientAgeYears);
        if (scoreA !== scoreB)
            return scoreB - scoreA;
        const minA = toNullableNumber(a.minAgeYears);
        const minB = toNullableNumber(b.minAgeYears);
        if (minA !== minB) {
            if (minA === null)
                return 1;
            if (minB === null)
                return -1;
            return minB - minA;
        }
        const maxA = toNullableNumber(a.maxAgeYears);
        const maxB = toNullableNumber(b.maxAgeYears);
        if (maxA !== maxB) {
            if (maxA === null)
                return 1;
            if (maxB === null)
                return -1;
            return maxA - maxB;
        }
        return 0;
    });
    const best = ranges[0];
    return {
        normalMin: toNullableNumber(best.normalMin),
        normalMax: toNullableNumber(best.normalMax),
    };
}
function resolveNumericRange(test, patientSexRaw, patientAgeYears) {
    const patientSex = normalizePatientSex(patientSexRaw);
    const ageSpecific = resolveAgeSpecificRange(test, patientSex, patientAgeYears);
    if (ageSpecific) {
        return {
            normalMin: ageSpecific.normalMin,
            normalMax: ageSpecific.normalMax,
            source: 'age',
        };
    }
    const baseGeneralMin = toNullableNumber(test.normalMin);
    const baseGeneralMax = toNullableNumber(test.normalMax);
    if (patientSex === 'M') {
        const maleMin = toNullableNumber(test.normalMinMale);
        const maleMax = toNullableNumber(test.normalMaxMale);
        if (maleMin !== null || maleMax !== null) {
            return {
                normalMin: maleMin ?? baseGeneralMin,
                normalMax: maleMax ?? baseGeneralMax,
                source: 'sex',
            };
        }
    }
    if (patientSex === 'F') {
        const femaleMin = toNullableNumber(test.normalMinFemale);
        const femaleMax = toNullableNumber(test.normalMaxFemale);
        if (femaleMin !== null || femaleMax !== null) {
            return {
                normalMin: femaleMin ?? baseGeneralMin,
                normalMax: femaleMax ?? baseGeneralMax,
                source: 'sex',
            };
        }
    }
    if (baseGeneralMin !== null || baseGeneralMax !== null) {
        return {
            normalMin: baseGeneralMin,
            normalMax: baseGeneralMax,
            source: 'general',
        };
    }
    return {
        normalMin: null,
        normalMax: null,
        source: 'none',
    };
}
//# sourceMappingURL=normal-range.util.js.map
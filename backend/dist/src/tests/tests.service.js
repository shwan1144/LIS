"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const test_entity_1 = require("../entities/test.entity");
const antibiotic_entity_1 = require("../entities/antibiotic.entity");
const pricing_entity_1 = require("../entities/pricing.entity");
const test_component_entity_1 = require("../entities/test-component.entity");
const test_antibiotic_entity_1 = require("../entities/test-antibiotic.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const department_entity_1 = require("../entities/department.entity");
const normal_range_util_1 = require("./normal-range.util");
const order_test_flag_util_1 = require("../order-tests/order-test-flag.util");
let TestsService = class TestsService {
    constructor(testRepo, pricingRepo, testComponentRepo, testAntibioticRepo, antibioticRepo, orderTestRepo, departmentRepo) {
        this.testRepo = testRepo;
        this.pricingRepo = pricingRepo;
        this.testComponentRepo = testComponentRepo;
        this.testAntibioticRepo = testAntibioticRepo;
        this.antibioticRepo = antibioticRepo;
        this.orderTestRepo = orderTestRepo;
        this.departmentRepo = departmentRepo;
    }
    async findAll(labId, activeOnly = true) {
        const where = activeOnly ? { labId, isActive: true } : { labId };
        const tests = await this.testRepo.find({
            where,
            order: { sortOrder: 'ASC', code: 'ASC' },
        });
        const withComponents = await this.attachPanelComponents(tests.map((test) => this.normalizeTestForOutput(test)));
        const withCultureAntibioticIds = await this.attachCultureAntibioticIds(withComponents);
        return this.attachDefaultPrices(withCultureAntibioticIds, labId);
    }
    async findOne(id, labId) {
        const test = await this.testRepo.findOne({ where: { id, labId } });
        if (!test) {
            throw new common_1.NotFoundException('Test not found');
        }
        const [withComponents] = await this.attachPanelComponents([
            this.normalizeTestForOutput(test),
        ]);
        const [withCultureAntibioticIds] = await this.attachCultureAntibioticIds([
            withComponents ?? test,
        ]);
        return withCultureAntibioticIds ?? test;
    }
    async findByCode(code, labId) {
        return this.testRepo.findOne({ where: { code, labId } });
    }
    async create(labId, dto) {
        const normalizedCode = dto.code.toUpperCase().trim();
        const normalizedAbbreviation = dto.abbreviation.toUpperCase().trim();
        const existing = await this.findByCode(normalizedCode, labId);
        if (existing) {
            throw new common_1.ConflictException(`Test with code "${normalizedCode}" already exists`);
        }
        await this.ensureDepartmentBelongsToLab(dto.departmentId ?? null, labId);
        const resultEntryType = this.normalizeResultEntryType(dto.resultEntryType);
        const resultTextOptions = resultEntryType === 'QUALITATIVE' || resultEntryType === 'TEXT'
            ? this.normalizeResultTextOptions(dto.resultTextOptions)
            : null;
        const allowCustomResultText = resultEntryType === 'QUALITATIVE' || resultEntryType === 'TEXT'
            ? dto.allowCustomResultText ?? false
            : false;
        const allowPanelSaveWithChildDefaults = dto.allowPanelSaveWithChildDefaults ?? false;
        const showPanelUnitColumnInReport = (dto.type || test_entity_1.TestType.SINGLE) === test_entity_1.TestType.PANEL
            ? dto.showPanelUnitColumnInReport ?? true
            : true;
        const cultureConfig = this.normalizeCultureConfig(dto.cultureConfig, resultEntryType);
        this.validateResultEntryConfig(resultEntryType, resultTextOptions, allowCustomResultText, allowPanelSaveWithChildDefaults, cultureConfig, dto.type || test_entity_1.TestType.SINGLE);
        const test = this.testRepo.create({
            labId,
            code: normalizedCode,
            name: dto.name.trim(),
            abbreviation: normalizedAbbreviation,
            type: dto.type || test_entity_1.TestType.SINGLE,
            tubeType: dto.tubeType || test_entity_1.TubeType.SERUM,
            unit: dto.unit?.trim() || null,
            normalMin: dto.normalMin ?? null,
            normalMax: dto.normalMax ?? null,
            normalMinMale: dto.normalMinMale ?? null,
            normalMaxMale: dto.normalMaxMale ?? null,
            normalMinFemale: dto.normalMinFemale ?? null,
            normalMaxFemale: dto.normalMaxFemale ?? null,
            normalText: this.toNullableRawText(dto.normalText),
            normalTextMale: this.toNullableRawText(dto.normalTextMale),
            normalTextFemale: this.toNullableRawText(dto.normalTextFemale),
            resultEntryType,
            resultTextOptions,
            allowCustomResultText,
            allowPanelSaveWithChildDefaults,
            showPanelUnitColumnInReport,
            cultureConfig,
            numericAgeRanges: this.normalizeNumericAgeRanges(dto.numericAgeRanges),
            description: dto.description?.trim() || null,
            childTestIds: dto.childTestIds?.trim() || null,
            parameterDefinitions: this.normalizeParameterDefinitions(dto.parameterDefinitions),
            departmentId: dto.departmentId ?? null,
            category: dto.category?.trim() || null,
            isActive: dto.isActive ?? true,
            sortOrder: dto.sortOrder ?? 0,
            expectedCompletionMinutes: dto.expectedCompletionMinutes ?? null,
        });
        const saved = await this.testRepo.save(test);
        await this.syncPanelComponentsForTest(saved, dto, labId);
        await this.syncCultureAntibioticsForTest(saved.id, labId, dto.cultureAntibioticIds ?? [], resultEntryType);
        const [withComponents] = await this.attachPanelComponents([
            this.normalizeTestForOutput(saved),
        ]);
        const [withCultureAntibioticIds] = await this.attachCultureAntibioticIds([
            withComponents ?? saved,
        ]);
        return withCultureAntibioticIds ?? saved;
    }
    async update(id, labId, dto) {
        const test = await this.findOne(id, labId);
        if (dto.code && dto.code !== test.code) {
            const normalizedCode = dto.code.toUpperCase().trim();
            const existing = await this.findByCode(normalizedCode, labId);
            if (existing) {
                throw new common_1.ConflictException(`Test with code "${normalizedCode}" already exists`);
            }
        }
        if (dto.code !== undefined)
            test.code = dto.code.toUpperCase().trim();
        if (dto.name !== undefined)
            test.name = dto.name.trim();
        if (dto.abbreviation !== undefined)
            test.abbreviation = dto.abbreviation.toUpperCase().trim();
        const previousResultEntryType = test.resultEntryType ?? 'NUMERIC';
        const previousType = test.type ?? test_entity_1.TestType.SINGLE;
        if (dto.type !== undefined)
            test.type = dto.type;
        if (dto.tubeType !== undefined)
            test.tubeType = dto.tubeType;
        if (dto.unit !== undefined)
            test.unit = dto.unit?.trim() || null;
        if (dto.normalMin !== undefined)
            test.normalMin = dto.normalMin;
        if (dto.normalMax !== undefined)
            test.normalMax = dto.normalMax;
        if (dto.normalMinMale !== undefined)
            test.normalMinMale = dto.normalMinMale;
        if (dto.normalMaxMale !== undefined)
            test.normalMaxMale = dto.normalMaxMale;
        if (dto.normalMinFemale !== undefined)
            test.normalMinFemale = dto.normalMinFemale;
        if (dto.normalMaxFemale !== undefined)
            test.normalMaxFemale = dto.normalMaxFemale;
        if (dto.normalText !== undefined)
            test.normalText = this.toNullableRawText(dto.normalText);
        if (dto.normalTextMale !== undefined)
            test.normalTextMale = this.toNullableRawText(dto.normalTextMale);
        if (dto.normalTextFemale !== undefined)
            test.normalTextFemale = this.toNullableRawText(dto.normalTextFemale);
        if (dto.numericAgeRanges !== undefined) {
            test.numericAgeRanges = this.normalizeNumericAgeRanges(dto.numericAgeRanges);
        }
        if (dto.description !== undefined)
            test.description = dto.description?.trim() || null;
        if (dto.childTestIds !== undefined)
            test.childTestIds = dto.childTestIds?.trim() || null;
        if (dto.parameterDefinitions !== undefined)
            test.parameterDefinitions = this.normalizeParameterDefinitions(dto.parameterDefinitions);
        if (dto.departmentId !== undefined) {
            await this.ensureDepartmentBelongsToLab(dto.departmentId ?? null, labId);
            test.departmentId = dto.departmentId ?? null;
        }
        if (dto.category !== undefined)
            test.category = dto.category?.trim() || null;
        if (dto.isActive !== undefined)
            test.isActive = dto.isActive;
        if (dto.sortOrder !== undefined)
            test.sortOrder = dto.sortOrder;
        if (dto.expectedCompletionMinutes !== undefined)
            test.expectedCompletionMinutes = dto.expectedCompletionMinutes ?? null;
        const nextResultEntryType = dto.resultEntryType !== undefined
            ? this.normalizeResultEntryType(dto.resultEntryType)
            : (test.resultEntryType ?? 'NUMERIC');
        const nextResultTextOptions = nextResultEntryType === 'QUALITATIVE' || nextResultEntryType === 'TEXT'
            ? dto.resultTextOptions !== undefined
                ? this.normalizeResultTextOptions(dto.resultTextOptions)
                : (test.resultTextOptions ?? null)
            : null;
        const nextAllowCustomResultText = nextResultEntryType === 'QUALITATIVE' || nextResultEntryType === 'TEXT'
            ? dto.allowCustomResultText !== undefined
                ? dto.allowCustomResultText
                : (test.allowCustomResultText ?? false)
            : false;
        const nextAllowPanelSaveWithChildDefaults = dto.allowPanelSaveWithChildDefaults !== undefined
            ? dto.allowPanelSaveWithChildDefaults
            : (test.allowPanelSaveWithChildDefaults ?? false);
        const nextShowPanelUnitColumnInReport = (test.type ?? previousType) === test_entity_1.TestType.PANEL
            ? (dto.showPanelUnitColumnInReport !== undefined
                ? dto.showPanelUnitColumnInReport
                : (test.showPanelUnitColumnInReport ?? true))
            : true;
        const nextCultureConfig = dto.cultureConfig !== undefined
            ? this.normalizeCultureConfig(dto.cultureConfig, nextResultEntryType)
            : this.normalizeCultureConfig(test.cultureConfig, nextResultEntryType);
        this.validateResultEntryConfig(nextResultEntryType, nextResultTextOptions, nextAllowCustomResultText, nextAllowPanelSaveWithChildDefaults, nextCultureConfig, test.type ?? previousType);
        test.resultEntryType = nextResultEntryType;
        test.resultTextOptions = nextResultTextOptions;
        test.allowCustomResultText = nextAllowCustomResultText;
        test.allowPanelSaveWithChildDefaults = nextAllowPanelSaveWithChildDefaults;
        test.showPanelUnitColumnInReport = nextShowPanelUnitColumnInReport;
        test.cultureConfig = nextCultureConfig;
        const saved = await this.testRepo.save(test);
        await this.syncPanelComponentsForTest(saved, dto, labId);
        if (nextResultEntryType !== 'CULTURE_SENSITIVITY') {
            await this.syncCultureAntibioticsForTest(saved.id, labId, [], nextResultEntryType);
        }
        else if (dto.cultureAntibioticIds !== undefined) {
            await this.syncCultureAntibioticsForTest(saved.id, labId, dto.cultureAntibioticIds ?? [], nextResultEntryType);
        }
        else if (previousResultEntryType !== 'CULTURE_SENSITIVITY') {
            await this.syncCultureAntibioticsForTest(saved.id, labId, [], nextResultEntryType);
        }
        const [withComponents] = await this.attachPanelComponents([
            this.normalizeTestForOutput(saved),
        ]);
        const [withCultureAntibioticIds] = await this.attachCultureAntibioticIds([
            withComponents ?? saved,
        ]);
        return withCultureAntibioticIds ?? saved;
    }
    normalizeNumericAgeRanges(ranges) {
        if (!ranges || !Array.isArray(ranges))
            return null;
        const normalized = ranges
            .map((range) => {
            const sex = (range.sex || 'ANY').toUpperCase();
            const normalizedSex = sex === 'M' || sex === 'F' ? sex : 'ANY';
            const ageUnitRaw = typeof range.ageUnit === 'string' && range.ageUnit.trim().length > 0
                ? range.ageUnit.trim().toUpperCase()
                : 'YEAR';
            const ageUnit = ageUnitRaw === 'DAY' || ageUnitRaw === 'MONTH' ? ageUnitRaw : 'YEAR';
            const minAge = range.minAge === undefined || range.minAge === null
                ? range.minAgeYears === undefined || range.minAgeYears === null
                    ? null
                    : Number(range.minAgeYears)
                : Number(range.minAge);
            const maxAge = range.maxAge === undefined || range.maxAge === null
                ? range.maxAgeYears === undefined || range.maxAgeYears === null
                    ? null
                    : Number(range.maxAgeYears)
                : Number(range.maxAge);
            const normalMin = range.normalMin === undefined || range.normalMin === null
                ? null
                : Number(range.normalMin);
            const normalMax = range.normalMax === undefined || range.normalMax === null
                ? null
                : Number(range.normalMax);
            if (minAge !== null &&
                maxAge !== null &&
                minAge > maxAge) {
                throw new common_1.BadRequestException('Invalid numeric age range: min age cannot be greater than max age');
            }
            if (normalMin !== null &&
                normalMax !== null &&
                normalMin > normalMax) {
                throw new common_1.BadRequestException('Invalid numeric age range: normal min cannot be greater than normal max');
            }
            return {
                sex: normalizedSex,
                ageUnit,
                minAge,
                maxAge,
                normalMin,
                normalMax,
            };
        })
            .filter((range) => range.normalMin !== null || range.normalMax !== null);
        if (!normalized.length)
            return null;
        normalized.sort((a, b) => {
            const weight = (sex) => sex === 'ANY' ? 1 : 0;
            const weightDiff = weight(a.sex) - weight(b.sex);
            if (weightDiff !== 0)
                return weightDiff;
            const unitWeight = (unit) => unit === 'DAY' ? 0 : unit === 'MONTH' ? 1 : 2;
            const rangeUnitDiff = unitWeight(a.ageUnit) - unitWeight(b.ageUnit);
            if (rangeUnitDiff !== 0)
                return rangeUnitDiff;
            const minA = a.minAge ?? Number.NEGATIVE_INFINITY;
            const minB = b.minAge ?? Number.NEGATIVE_INFINITY;
            if (minA !== minB)
                return minA - minB;
            const maxA = a.maxAge ?? Number.POSITIVE_INFINITY;
            const maxB = b.maxAge ?? Number.POSITIVE_INFINITY;
            return maxA - maxB;
        });
        return normalized;
    }
    toNullableRawText(value) {
        if (value === null || value === undefined)
            return null;
        return value.length > 0 ? value : null;
    }
    normalizeResultEntryType(value) {
        const normalized = (value || 'NUMERIC').toUpperCase();
        if (normalized === 'NUMERIC' ||
            normalized === 'QUALITATIVE' ||
            normalized === 'TEXT' ||
            normalized === 'CULTURE_SENSITIVITY' ||
            normalized === 'PDF_UPLOAD') {
            return normalized;
        }
        throw new common_1.BadRequestException('Invalid resultEntryType. Allowed values: NUMERIC, QUALITATIVE, TEXT, CULTURE_SENSITIVITY, PDF_UPLOAD');
    }
    normalizeCultureConfig(value, resultEntryType) {
        if (resultEntryType !== 'CULTURE_SENSITIVITY') {
            return null;
        }
        const rawOptions = Array.isArray(value?.interpretationOptions)
            ? value.interpretationOptions
            : ['S', 'I', 'R'];
        const seen = new Set();
        const interpretationOptions = [];
        for (const option of rawOptions) {
            const normalized = String(option ?? '').trim().toUpperCase();
            if (!normalized || seen.has(normalized))
                continue;
            seen.add(normalized);
            interpretationOptions.push(normalized);
        }
        const micUnitRaw = typeof value?.micUnit === 'string' ? value.micUnit.trim() : '';
        return {
            interpretationOptions: interpretationOptions.length
                ? interpretationOptions
                : ['S', 'I', 'R'],
            micUnit: micUnitRaw.length > 0 ? micUnitRaw : null,
        };
    }
    normalizeParameterDefinitions(definitions) {
        if (!definitions || !Array.isArray(definitions))
            return null;
        const seen = new Set();
        const normalized = [];
        for (const definition of definitions) {
            const code = String(definition?.code ?? '').trim();
            const label = String(definition?.label ?? '').trim();
            if (!code || !label)
                continue;
            const dedupeKey = code.toLowerCase();
            if (seen.has(dedupeKey))
                continue;
            seen.add(dedupeKey);
            const type = definition?.type === 'select' ? 'select' : 'text';
            const options = type === 'select'
                ? (definition?.options ?? [])
                    .map((option) => String(option ?? '').trim())
                    .filter(Boolean)
                : undefined;
            const normalOptions = type === 'select'
                ? (definition?.normalOptions ?? [])
                    .map((option) => String(option ?? '').trim())
                    .filter(Boolean)
                : undefined;
            const defaultValue = typeof definition?.defaultValue === 'string' && definition.defaultValue.trim().length > 0
                ? definition.defaultValue.trim()
                : undefined;
            const unit = typeof definition?.unit === 'string' && definition.unit.trim().length > 0
                ? definition.unit.trim()
                : null;
            normalized.push({
                code,
                label,
                type,
                options: options?.length ? options : undefined,
                normalOptions: normalOptions?.length ? normalOptions : undefined,
                defaultValue,
                unit,
            });
        }
        return normalized.length ? normalized : null;
    }
    normalizeResultTextOptions(options) {
        if (!options || !Array.isArray(options))
            return null;
        const seen = new Set();
        let defaultAssigned = false;
        const normalized = [];
        for (const option of options) {
            const value = option?.value?.trim();
            if (!value)
                continue;
            const dedupeKey = value.toLowerCase();
            if (seen.has(dedupeKey))
                continue;
            seen.add(dedupeKey);
            const normalizedFlag = this.normalizeResultFlag(option?.flag);
            const isDefault = Boolean(option?.isDefault) && !defaultAssigned;
            if (isDefault)
                defaultAssigned = true;
            normalized.push({
                value,
                flag: normalizedFlag,
                isDefault,
            });
        }
        return normalized.length ? normalized : null;
    }
    normalizeResultFlag(flag) {
        if (flag === null || flag === undefined || String(flag).trim() === '') {
            return null;
        }
        const normalized = (0, order_test_flag_util_1.normalizeOrderTestFlag)(flag);
        const allowed = ['N', 'H', 'L', 'POS', 'NEG', 'ABN'];
        if (!normalized || !allowed.includes(normalized)) {
            throw new common_1.BadRequestException(`Invalid result option flag "${flag}". Allowed: ${allowed.join(', ')}`);
        }
        return normalized;
    }
    normalizeTestForOutput(test) {
        return Object.assign(test, {
            numericAgeRanges: (0, normal_range_util_1.normalizeNumericAgeRanges)(test.numericAgeRanges)?.map((range) => ({
                sex: range.sex,
                ageUnit: range.ageUnit,
                minAge: range.minAge,
                maxAge: range.maxAge,
                normalMin: range.normalMin,
                normalMax: range.normalMax,
            })) ?? null,
            resultTextOptions: test.resultTextOptions?.map((option) => ({
                value: option.value,
                flag: (0, order_test_flag_util_1.normalizeOrderTestFlag)(option.flag ?? null),
                isDefault: Boolean(option.isDefault),
            })) ?? null,
            parameterDefinitions: this.normalizeParameterDefinitions(test.parameterDefinitions) ?? null,
            cultureConfig: test.cultureConfig && typeof test.cultureConfig === 'object'
                ? this.normalizeCultureConfig(test.cultureConfig, (test.resultEntryType ?? 'NUMERIC'))
                : null,
            showPanelUnitColumnInReport: Boolean(test.showPanelUnitColumnInReport ?? true),
        });
    }
    validateResultEntryConfig(resultEntryType, resultTextOptions, allowCustomResultText, allowPanelSaveWithChildDefaults, cultureConfig, testType) {
        if (resultEntryType === 'CULTURE_SENSITIVITY' && testType !== test_entity_1.TestType.SINGLE) {
            throw new common_1.BadRequestException('CULTURE_SENSITIVITY entry mode is only supported for single tests');
        }
        if (resultEntryType === 'PDF_UPLOAD' && testType !== test_entity_1.TestType.SINGLE) {
            throw new common_1.BadRequestException('PDF_UPLOAD entry mode is only supported for single tests');
        }
        if (resultEntryType === 'NUMERIC' && resultTextOptions?.length) {
            throw new common_1.BadRequestException('resultTextOptions are only valid for QUALITATIVE or TEXT result entry type');
        }
        if (resultEntryType === 'QUALITATIVE' && !resultTextOptions?.length) {
            throw new common_1.BadRequestException('QUALITATIVE result entry type requires at least one result text option');
        }
        if (resultEntryType === 'NUMERIC' && allowCustomResultText) {
            throw new common_1.BadRequestException('allowCustomResultText can only be enabled for QUALITATIVE or TEXT tests');
        }
        if (resultEntryType === 'PDF_UPLOAD' && allowCustomResultText) {
            throw new common_1.BadRequestException('allowCustomResultText is not valid for PDF_UPLOAD tests');
        }
        if (allowPanelSaveWithChildDefaults && testType !== test_entity_1.TestType.PANEL) {
            throw new common_1.BadRequestException('allowPanelSaveWithChildDefaults can only be enabled for panel tests');
        }
        if (resultEntryType !== 'CULTURE_SENSITIVITY' && cultureConfig) {
            throw new common_1.BadRequestException('cultureConfig is only valid for CULTURE_SENSITIVITY result entry type');
        }
        if (resultEntryType === 'PDF_UPLOAD') {
            if (resultTextOptions?.length) {
                throw new common_1.BadRequestException('resultTextOptions are not valid for PDF_UPLOAD tests');
            }
            if (allowPanelSaveWithChildDefaults) {
                throw new common_1.BadRequestException('allowPanelSaveWithChildDefaults cannot be enabled for PDF_UPLOAD tests');
            }
            if (cultureConfig) {
                throw new common_1.BadRequestException('cultureConfig is not valid for PDF_UPLOAD tests');
            }
        }
        if (resultEntryType === 'CULTURE_SENSITIVITY') {
            if (resultTextOptions?.length) {
                throw new common_1.BadRequestException('resultTextOptions are not valid for CULTURE_SENSITIVITY tests');
            }
            if (allowCustomResultText) {
                throw new common_1.BadRequestException('allowCustomResultText cannot be enabled for CULTURE_SENSITIVITY tests');
            }
            if (allowPanelSaveWithChildDefaults) {
                throw new common_1.BadRequestException('allowPanelSaveWithChildDefaults cannot be enabled for CULTURE_SENSITIVITY tests');
            }
            if (!cultureConfig || !cultureConfig.interpretationOptions.length) {
                throw new common_1.BadRequestException('CULTURE_SENSITIVITY tests require at least one interpretation option');
            }
        }
    }
    isUuid(value) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    }
    async resolvePanelComponentTestIds(test, dto, labId) {
        const explicitComponents = dto.panelComponents;
        if (Array.isArray(explicitComponents)) {
            if (explicitComponents.length === 0)
                return [];
            const ordered = explicitComponents.map((component, index) => ({
                childTestId: component.childTestId,
                required: component.required ?? true,
                sortOrder: component.sortOrder ?? index + 1,
                reportSection: component.reportSection?.trim() || null,
                reportGroup: component.reportGroup?.trim() || null,
            }));
            return this.validatePanelComponents(ordered, test.id, labId);
        }
        const explicitIds = dto.panelComponentTestIds;
        if (Array.isArray(explicitIds)) {
            const ordered = explicitIds
                .map((childTestId, index) => ({
                childTestId: childTestId.trim(),
                required: true,
                sortOrder: index + 1,
                reportSection: null,
                reportGroup: null,
            }))
                .filter((component) => component.childTestId.length > 0);
            return this.validatePanelComponents(ordered, test.id, labId);
        }
        if (dto.childTestIds !== undefined) {
            const tokens = (dto.childTestIds || '')
                .split(',')
                .map((token) => token.trim())
                .filter((token) => token.length > 0);
            if (tokens.length === 0)
                return [];
            const uuidTokens = tokens.filter((token) => this.isUuid(token));
            const codeTokens = tokens
                .filter((token) => !this.isUuid(token))
                .map((token) => token.toUpperCase());
            const qb = this.testRepo
                .createQueryBuilder('test')
                .where('test.labId = :labId', { labId });
            if (uuidTokens.length && codeTokens.length) {
                qb.andWhere('(test.id IN (:...uuidTokens) OR UPPER(test.code) IN (:...codeTokens))', {
                    uuidTokens,
                    codeTokens,
                });
            }
            else if (uuidTokens.length) {
                qb.andWhere('test.id IN (:...uuidTokens)', { uuidTokens });
            }
            else {
                qb.andWhere('UPPER(test.code) IN (:...codeTokens)', { codeTokens });
            }
            const matches = await qb.getMany();
            const byId = new Map(matches.map((matched) => [matched.id, matched]));
            const byCode = new Map(matches.map((matched) => [matched.code.toUpperCase(), matched]));
            const resolved = tokens.map((token, index) => {
                const child = byId.get(token) ??
                    byCode.get(token.toUpperCase()) ??
                    null;
                if (!child) {
                    throw new common_1.BadRequestException(`Panel component "${token}" was not found in this lab`);
                }
                return {
                    childTestId: child.id,
                    required: true,
                    sortOrder: index + 1,
                    reportSection: null,
                    reportGroup: null,
                };
            });
            return this.validatePanelComponents(resolved, test.id, labId);
        }
        return null;
    }
    async validatePanelComponents(components, panelTestId, labId) {
        const deduped = new Map();
        for (const component of components) {
            if (component.childTestId === panelTestId) {
                throw new common_1.BadRequestException('A panel cannot include itself as a component');
            }
            deduped.set(component.childTestId, component);
        }
        const normalized = Array.from(deduped.values()).sort((a, b) => a.sortOrder - b.sortOrder);
        if (!normalized.length)
            return [];
        const childIds = normalized.map((component) => component.childTestId);
        const childTests = await this.testRepo.find({
            where: childIds.map((id) => ({ id, labId })),
            select: ['id', 'type'],
        });
        if (childTests.length !== childIds.length) {
            throw new common_1.BadRequestException('One or more panel component tests were not found in this lab');
        }
        if (childTests.some((child) => child.type === test_entity_1.TestType.PANEL)) {
            throw new common_1.BadRequestException('Nested panels are not supported');
        }
        return normalized;
    }
    async syncPanelComponentsForTest(test, dto, labId) {
        if (test.type !== test_entity_1.TestType.PANEL) {
            await this.testComponentRepo.delete({ panelTestId: test.id });
            return;
        }
        const resolvedComponents = await this.resolvePanelComponentTestIds(test, dto, labId);
        if (resolvedComponents === null) {
            return;
        }
        const existing = await this.testComponentRepo.find({
            where: { panelTestId: test.id },
        });
        const existingByChild = new Map(existing.map((component) => [component.childTestId, component]));
        const desiredChildIds = new Set(resolvedComponents.map((component) => component.childTestId));
        for (const component of resolvedComponents) {
            const current = existingByChild.get(component.childTestId);
            if (!current) {
                const created = this.testComponentRepo.create({
                    panelTestId: test.id,
                    childTestId: component.childTestId,
                    required: component.required,
                    sortOrder: component.sortOrder,
                    reportSection: component.reportSection,
                    reportGroup: component.reportGroup,
                });
                await this.testComponentRepo.save(created);
                continue;
            }
            current.required = component.required;
            current.sortOrder = component.sortOrder;
            current.reportSection = component.reportSection;
            current.reportGroup = component.reportGroup;
            await this.testComponentRepo.save(current);
        }
        const staleIds = existing
            .filter((component) => !desiredChildIds.has(component.childTestId))
            .map((component) => component.childTestId);
        if (staleIds.length > 0) {
            await this.testComponentRepo
                .createQueryBuilder()
                .delete()
                .from(test_component_entity_1.TestComponent)
                .where('panelTestId = :panelTestId', { panelTestId: test.id })
                .andWhere('childTestId IN (:...childIds)', { childIds: staleIds })
                .execute();
        }
    }
    async attachPanelComponents(tests) {
        if (!tests.length)
            return [];
        const panelIds = tests
            .filter((test) => test.type === test_entity_1.TestType.PANEL)
            .map((test) => test.id);
        if (!panelIds.length)
            return tests;
        const components = await this.testComponentRepo
            .createQueryBuilder('component')
            .innerJoinAndSelect('component.childTest', 'childTest')
            .where('component.panelTestId IN (:...panelIds)', { panelIds })
            .orderBy('component.panelTestId', 'ASC')
            .addOrderBy('component.sortOrder', 'ASC')
            .addOrderBy('childTest.code', 'ASC')
            .getMany();
        const grouped = new Map();
        for (const component of components) {
            const mapped = {
                childTestId: component.childTestId,
                required: component.required,
                sortOrder: component.sortOrder,
                reportSection: component.reportSection ?? null,
                reportGroup: component.reportGroup ?? null,
                childTest: {
                    id: component.childTest.id,
                    code: component.childTest.code,
                    name: component.childTest.name,
                    type: component.childTest.type,
                    unit: component.childTest.unit,
                    isActive: component.childTest.isActive,
                },
            };
            const current = grouped.get(component.panelTestId) ?? [];
            current.push(mapped);
            grouped.set(component.panelTestId, current);
        }
        return tests.map((test) => {
            if (test.type !== test_entity_1.TestType.PANEL)
                return test;
            return Object.assign(test, {
                panelComponents: grouped.get(test.id) ?? [],
            });
        });
    }
    async attachCultureAntibioticIds(tests) {
        if (!tests.length)
            return tests;
        const testIds = tests.map((test) => test.id);
        const mappings = await this.testAntibioticRepo.find({
            where: { testId: (0, typeorm_2.In)(testIds) },
            order: { sortOrder: 'ASC', createdAt: 'ASC' },
        });
        const grouped = new Map();
        for (const mapping of mappings) {
            const list = grouped.get(mapping.testId) ?? [];
            list.push(mapping.antibioticId);
            grouped.set(mapping.testId, list);
        }
        return tests.map((test) => Object.assign(test, {
            cultureAntibioticIds: grouped.get(test.id) ?? [],
        }));
    }
    async syncCultureAntibioticsForTest(testId, labId, antibioticIds, resultEntryType) {
        if (resultEntryType !== 'CULTURE_SENSITIVITY') {
            await this.testAntibioticRepo.delete({ testId });
            return;
        }
        const normalizedIds = Array.from(new Set((antibioticIds ?? [])
            .map((id) => String(id || '').trim())
            .filter((id) => id.length > 0)));
        if (normalizedIds.length === 0) {
            await this.testAntibioticRepo.delete({ testId });
            return;
        }
        const antibiotics = await this.antibioticRepo.find({
            where: {
                labId,
                id: (0, typeorm_2.In)(normalizedIds),
                isActive: true,
            },
            select: ['id'],
        });
        if (antibiotics.length !== normalizedIds.length) {
            throw new common_1.BadRequestException('One or more selected culture antibiotics are missing or inactive');
        }
        await this.testAntibioticRepo.delete({ testId });
        const rows = normalizedIds.map((antibioticId, index) => this.testAntibioticRepo.create({
            testId,
            antibioticId,
            sortOrder: index + 1,
            isDefault: index === 0,
        }));
        await this.testAntibioticRepo.save(rows);
    }
    async attachDefaultPrices(tests, labId) {
        if (!tests.length)
            return [];
        const pricingRows = await this.pricingRepo.find({
            where: {
                labId,
                testId: (0, typeorm_2.In)(tests.map((test) => test.id)),
                shiftId: (0, typeorm_2.IsNull)(),
                patientType: (0, typeorm_2.IsNull)(),
                isActive: true,
            },
        });
        const defaultPriceByTestId = new Map();
        for (const row of pricingRows) {
            defaultPriceByTestId.set(row.testId, parseFloat(row.price.toString()));
        }
        return tests.map((test) => ({
            ...test,
            defaultPrice: defaultPriceByTestId.get(test.id) ?? null,
        }));
    }
    async delete(id, labId) {
        const test = await this.findOne(id, labId);
        const orderTestCount = await this.orderTestRepo.count({ where: { testId: id, labId } });
        if (orderTestCount > 0) {
            throw new common_1.ConflictException(`Cannot delete test "${test.code}" because it is used in ${orderTestCount} order(s). ` +
                'Deactivate the test instead (toggle Active off) to hide it from new orders while preserving history.');
        }
        const componentCount = await this.testComponentRepo.count({
            where: [{ panelTestId: id }, { childTestId: id }],
        });
        if (componentCount > 0) {
            throw new common_1.ConflictException(`Cannot delete test "${test.code}" because it is part of a panel. ` +
                'Remove it from the panel first, or deactivate the panel.');
        }
        await this.testRepo.remove(test);
    }
    async toggleActive(id, labId) {
        const test = await this.findOne(id, labId);
        test.isActive = !test.isActive;
        return this.testRepo.save(test);
    }
    async getPricingForTest(testId, labId) {
        await this.findOne(testId, labId);
        const rows = await this.pricingRepo.find({
            where: { testId, labId, patientType: (0, typeorm_2.IsNull)() },
            relations: ['shift'],
        });
        return rows.map((r) => ({
            shiftId: r.shiftId,
            shiftCode: r.shift?.code,
            price: parseFloat(r.price.toString()),
        }));
    }
    async setPricingForTest(testId, labId, prices) {
        await this.findOne(testId, labId);
        await this.pricingRepo.delete({ testId, labId, patientType: (0, typeorm_2.IsNull)() });
        for (const p of prices) {
            if (p.price < 0)
                continue;
            const pricing = this.pricingRepo.create({
                labId,
                testId,
                shiftId: p.shiftId,
                patientType: null,
                price: p.price,
                isActive: true,
            });
            await this.pricingRepo.save(pricing);
        }
    }
    async ensureDepartmentBelongsToLab(departmentId, labId) {
        if (!departmentId)
            return;
        const department = await this.departmentRepo.findOne({
            where: { id: departmentId, labId },
            select: ['id'],
        });
        if (!department) {
            throw new common_1.BadRequestException('Selected department does not belong to this lab');
        }
    }
    async seedCBCTests(labId) {
        const subtests = [
            { code: 'WBC', name: 'White Blood Cell Count', unit: '10^9/L', normalMin: 4.0, normalMax: 11.0, normalMinMale: 4.5, normalMaxMale: 11.0, normalMinFemale: 4.0, normalMaxFemale: 10.0, sortOrder: 10 },
            { code: 'RBC', name: 'Red Blood Cell Count', unit: '10^12/L', normalMin: 4.0, normalMax: 5.5, normalMinMale: 4.5, normalMaxMale: 5.5, normalMinFemale: 4.0, normalMaxFemale: 5.0, sortOrder: 11 },
            { code: 'HGB', name: 'Hemoglobin', unit: 'g/dL', normalMin: 12.0, normalMax: 17.0, normalMinMale: 13.5, normalMaxMale: 17.5, normalMinFemale: 12.0, normalMaxFemale: 16.0, sortOrder: 12 },
            { code: 'HCT', name: 'Hematocrit', unit: '%', normalMin: 36, normalMax: 50, normalMinMale: 40, normalMaxMale: 50, normalMinFemale: 36, normalMaxFemale: 44, sortOrder: 13 },
            { code: 'MCV', name: 'Mean Corpuscular Volume', unit: 'fL', normalMin: 80, normalMax: 100, sortOrder: 14 },
            { code: 'MCH', name: 'Mean Corpuscular Hemoglobin', unit: 'pg', normalMin: 27, normalMax: 33, sortOrder: 15 },
            { code: 'MCHC', name: 'Mean Corpuscular Hemoglobin Concentration', unit: 'g/dL', normalMin: 32, normalMax: 36, sortOrder: 16 },
            { code: 'RDW', name: 'Red Cell Distribution Width', unit: '%', normalMin: 11.5, normalMax: 14.5, sortOrder: 17 },
            { code: 'PLT', name: 'Platelet Count', unit: '10^9/L', normalMin: 150, normalMax: 400, sortOrder: 20 },
            { code: 'MPV', name: 'Mean Platelet Volume', unit: 'fL', normalMin: 7.5, normalMax: 11.5, sortOrder: 21 },
            { code: 'NEU%', name: 'Neutrophils %', unit: '%', normalMin: 40, normalMax: 70, sortOrder: 30 },
            { code: 'LYM%', name: 'Lymphocytes %', unit: '%', normalMin: 20, normalMax: 40, sortOrder: 31 },
            { code: 'MONO%', name: 'Monocytes %', unit: '%', normalMin: 2, normalMax: 8, sortOrder: 32 },
            { code: 'EOS%', name: 'Eosinophils %', unit: '%', normalMin: 1, normalMax: 4, sortOrder: 33 },
            { code: 'BASO%', name: 'Basophils %', unit: '%', normalMin: 0, normalMax: 1, sortOrder: 34 },
            { code: 'NEU#', name: 'Neutrophils Absolute', unit: '10^9/L', normalMin: 2.0, normalMax: 7.0, sortOrder: 40 },
            { code: 'LYM#', name: 'Lymphocytes Absolute', unit: '10^9/L', normalMin: 1.0, normalMax: 3.0, sortOrder: 41 },
            { code: 'MONO#', name: 'Monocytes Absolute', unit: '10^9/L', normalMin: 0.2, normalMax: 0.8, sortOrder: 42 },
            { code: 'EOS#', name: 'Eosinophils Absolute', unit: '10^9/L', normalMin: 0.04, normalMax: 0.4, sortOrder: 43 },
            { code: 'BASO#', name: 'Basophils Absolute', unit: '10^9/L', normalMin: 0.0, normalMax: 0.1, sortOrder: 44 },
            { code: 'NRBC', name: 'Nucleated Red Blood Cells', unit: '/100 WBC', normalMin: 0, normalMax: 0, normalText: '0', sortOrder: 50 },
            { code: 'ESR', name: 'Erythrocyte Sedimentation Rate', unit: 'mm/hr', normalMin: 0, normalMax: 20, normalMinMale: 0, normalMaxMale: 15, normalMinFemale: 0, normalMaxFemale: 20, sortOrder: 51 },
            { code: 'RETIC', name: 'Reticulocyte Count', unit: '%', normalMin: 0.5, normalMax: 2.5, sortOrder: 52 },
        ];
        let created = 0;
        let skipped = 0;
        const createdTests = [];
        const childIds = [];
        for (const data of subtests) {
            try {
                let test = await this.findByCode(data.code, labId);
                if (test) {
                    skipped++;
                    test.name = data.name;
                    test.unit = data.unit ?? test.unit;
                    test.normalMin = data.normalMin ?? test.normalMin;
                    test.normalMax = data.normalMax ?? test.normalMax;
                    test.normalMinMale = data.normalMinMale ?? test.normalMinMale;
                    test.normalMaxMale = data.normalMaxMale ?? test.normalMaxMale;
                    test.normalMinFemale = data.normalMinFemale ?? test.normalMinFemale;
                    test.normalMaxFemale = data.normalMaxFemale ?? test.normalMaxFemale;
                    test.normalText = data.normalText ?? test.normalText;
                    test.sortOrder = data.sortOrder ?? test.sortOrder;
                    test.type = test_entity_1.TestType.SINGLE;
                    test.tubeType = test_entity_1.TubeType.WHOLE_BLOOD;
                    test.labId = labId;
                    test.isActive = false;
                    test = await this.testRepo.save(test);
                }
                else {
                    test = this.testRepo.create({
                        labId,
                        code: data.code,
                        name: data.name,
                        unit: data.unit ?? null,
                        normalMin: data.normalMin ?? null,
                        normalMax: data.normalMax ?? null,
                        normalMinMale: data.normalMinMale ?? null,
                        normalMaxMale: data.normalMaxMale ?? null,
                        normalMinFemale: data.normalMinFemale ?? null,
                        normalMaxFemale: data.normalMaxFemale ?? null,
                        normalText: data.normalText ?? null,
                        sortOrder: data.sortOrder ?? 0,
                        type: test_entity_1.TestType.SINGLE,
                        tubeType: test_entity_1.TubeType.WHOLE_BLOOD,
                        isActive: false,
                    });
                    test = await this.testRepo.save(test);
                    created++;
                    createdTests.push(data.code);
                }
                childIds.push(test.id);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`Failed to seed CBC subtest ${data.code}: ${msg}`);
            }
        }
        try {
            let panel = await this.findByCode('CBC', labId);
            if (panel) {
                panel.type = test_entity_1.TestType.PANEL;
                panel.tubeType = test_entity_1.TubeType.WHOLE_BLOOD;
                panel.labId = labId;
                panel.isActive = true;
                panel.childTestIds = null;
                panel.sortOrder = 1;
                panel.description =
                    panel.description ||
                        'CBC panel - includes WBC, RBC, HGB, HCT, indices, platelets, and differential as reported by analyzer.';
                panel = await this.testRepo.save(panel);
            }
            else {
                panel = this.testRepo.create({
                    labId,
                    code: 'CBC',
                    name: 'Complete Blood Count',
                    type: test_entity_1.TestType.PANEL,
                    tubeType: test_entity_1.TubeType.WHOLE_BLOOD,
                    childTestIds: null,
                    description: 'CBC panel - includes WBC, RBC, HGB, HCT, indices, platelets, and differential as reported by analyzer.',
                    isActive: true,
                    sortOrder: 1,
                });
                panel = await this.testRepo.save(panel);
                created++;
                createdTests.push('CBC');
            }
            await this.syncPanelComponentsForTest(panel, {
                panelComponents: childIds.map((childId, index) => {
                    const subtestData = subtests[index];
                    return {
                        childTestId: childId,
                        required: true,
                        sortOrder: subtestData?.sortOrder ?? index + 1,
                        reportSection: subtestData
                            ? this.getReportSection(subtestData.code)
                            : null,
                        reportGroup: subtestData
                            ? this.getReportGroup(subtestData.code)
                            : null,
                    };
                }),
            }, labId);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to seed CBC panel: ${msg}`);
        }
        return { created, skipped, tests: createdTests };
    }
    getReportSection(code) {
        if (['WBC', 'RBC', 'HGB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW'].includes(code)) {
            return 'Basic';
        }
        if (['PLT', 'MPV'].includes(code)) {
            return 'Platelets';
        }
        if (code.includes('%')) {
            return 'Differential %';
        }
        if (code.includes('#')) {
            return 'Differential Absolute';
        }
        return 'Additional';
    }
    getReportGroup(code) {
        if (['WBC', 'NEU%', 'LYM%', 'MONO%', 'EOS%', 'BASO%', 'NEU#', 'LYM#', 'MONO#', 'EOS#', 'BASO#'].includes(code)) {
            return 'WBC';
        }
        if (['RBC', 'HGB', 'HCT', 'MCV', 'MCH', 'MCHC', 'RDW'].includes(code)) {
            return 'RBC';
        }
        if (['PLT', 'MPV'].includes(code)) {
            return 'Platelets';
        }
        return null;
    }
    async seedUrinalysisTests(labId) {
        const subtests = [
            {
                code: 'UCOL',
                name: 'Urine Color',
                resultEntryType: 'QUALITATIVE',
                resultTextOptions: [
                    { value: 'Colorless', flag: 'N' },
                    { value: 'Yellow', flag: 'N', isDefault: true },
                    { value: 'Deep Yellow', flag: 'ABN' },
                    { value: 'Amber', flag: 'ABN' },
                    { value: 'Red', flag: 'ABN' },
                    { value: 'Brown', flag: 'ABN' },
                ],
                sortOrder: 10,
                reportSection: 'Physical',
                reportGroup: 'Macroscopic',
            },
            {
                code: 'UAPP',
                name: 'Urine Appearance',
                resultEntryType: 'QUALITATIVE',
                resultTextOptions: [
                    { value: 'Clear', flag: 'N', isDefault: true },
                    { value: 'Slightly Cloudy', flag: 'ABN' },
                    { value: 'Cloudy', flag: 'ABN' },
                    { value: 'Turbid', flag: 'ABN' },
                ],
                sortOrder: 11,
                reportSection: 'Physical',
                reportGroup: 'Macroscopic',
            },
            {
                code: 'USG',
                name: 'Urine Specific Gravity',
                resultEntryType: 'NUMERIC',
                unit: '',
                normalMin: 1.005,
                normalMax: 1.03,
                sortOrder: 20,
                reportSection: 'Chemical',
                reportGroup: 'Dipstick',
            },
            {
                code: 'UPH',
                name: 'Urine pH',
                resultEntryType: 'NUMERIC',
                unit: '',
                normalMin: 5,
                normalMax: 8,
                sortOrder: 21,
                reportSection: 'Chemical',
                reportGroup: 'Dipstick',
            },
            {
                code: 'UPRO',
                name: 'Urine Protein',
                resultEntryType: 'QUALITATIVE',
                resultTextOptions: [
                    { value: 'Negative', flag: 'N', isDefault: true },
                    { value: 'Trace', flag: 'ABN' },
                    { value: '+', flag: 'H' },
                    { value: '++', flag: 'H' },
                    { value: '+++', flag: 'H' },
                ],
                sortOrder: 22,
                reportSection: 'Chemical',
                reportGroup: 'Dipstick',
            },
            {
                code: 'UGLU',
                name: 'Urine Glucose',
                resultEntryType: 'QUALITATIVE',
                resultTextOptions: [
                    { value: 'Negative', flag: 'N', isDefault: true },
                    { value: 'Trace', flag: 'ABN' },
                    { value: '+', flag: 'H' },
                    { value: '++', flag: 'H' },
                    { value: '+++', flag: 'H' },
                ],
                sortOrder: 23,
                reportSection: 'Chemical',
                reportGroup: 'Dipstick',
            },
            {
                code: 'UKET',
                name: 'Urine Ketone',
                resultEntryType: 'QUALITATIVE',
                resultTextOptions: [
                    { value: 'Negative', flag: 'N', isDefault: true },
                    { value: 'Trace', flag: 'ABN' },
                    { value: '+', flag: 'H' },
                    { value: '++', flag: 'H' },
                    { value: '+++', flag: 'H' },
                ],
                sortOrder: 24,
                reportSection: 'Chemical',
                reportGroup: 'Dipstick',
            },
            {
                code: 'UNIT',
                name: 'Urine Nitrite',
                resultEntryType: 'QUALITATIVE',
                resultTextOptions: [
                    { value: 'Negative', flag: 'N', isDefault: true },
                    { value: 'Positive', flag: 'POS' },
                ],
                sortOrder: 25,
                reportSection: 'Chemical',
                reportGroup: 'Dipstick',
            },
            {
                code: 'ULEU',
                name: 'Urine Leukocyte Esterase',
                resultEntryType: 'QUALITATIVE',
                resultTextOptions: [
                    { value: 'Negative', flag: 'N', isDefault: true },
                    { value: 'Trace', flag: 'ABN' },
                    { value: '+', flag: 'H' },
                    { value: '++', flag: 'H' },
                ],
                sortOrder: 26,
                reportSection: 'Chemical',
                reportGroup: 'Dipstick',
            },
            {
                code: 'URBC',
                name: 'Urine RBC / HPF',
                resultEntryType: 'NUMERIC',
                unit: '/HPF',
                normalMin: 0,
                normalMax: 2,
                sortOrder: 30,
                reportSection: 'Microscopic',
                reportGroup: 'Cells',
            },
            {
                code: 'UWBC',
                name: 'Urine WBC / HPF',
                resultEntryType: 'NUMERIC',
                unit: '/HPF',
                normalMin: 0,
                normalMax: 5,
                sortOrder: 31,
                reportSection: 'Microscopic',
                reportGroup: 'Cells',
            },
        ];
        let created = 0;
        let skipped = 0;
        const createdTests = [];
        const childIds = [];
        for (const data of subtests) {
            let test = await this.findByCode(data.code, labId);
            if (test) {
                skipped++;
                test.name = data.name;
                test.type = test_entity_1.TestType.SINGLE;
                test.tubeType = test_entity_1.TubeType.URINE;
                test.resultEntryType = data.resultEntryType;
                test.resultTextOptions = data.resultTextOptions ?? null;
                test.allowCustomResultText = data.allowCustomResultText ?? false;
                test.allowPanelSaveWithChildDefaults = false;
                test.unit = data.unit ?? null;
                test.normalMin = data.normalMin ?? null;
                test.normalMax = data.normalMax ?? null;
                test.sortOrder = data.sortOrder;
                test.isActive = false;
                test = await this.testRepo.save(test);
            }
            else {
                test = this.testRepo.create({
                    labId,
                    code: data.code,
                    name: data.name,
                    type: test_entity_1.TestType.SINGLE,
                    tubeType: test_entity_1.TubeType.URINE,
                    resultEntryType: data.resultEntryType,
                    resultTextOptions: data.resultTextOptions ?? null,
                    allowCustomResultText: data.allowCustomResultText ?? false,
                    allowPanelSaveWithChildDefaults: false,
                    unit: data.unit ?? null,
                    normalMin: data.normalMin ?? null,
                    normalMax: data.normalMax ?? null,
                    sortOrder: data.sortOrder,
                    isActive: false,
                });
                test = await this.testRepo.save(test);
                created++;
                createdTests.push(data.code);
            }
            childIds.push(test.id);
        }
        let panel = await this.findByCode('GUE', labId);
        if (panel) {
            panel.type = test_entity_1.TestType.PANEL;
            panel.tubeType = test_entity_1.TubeType.URINE;
            panel.isActive = true;
            panel.allowPanelSaveWithChildDefaults = true;
            panel.childTestIds = null;
            panel.sortOrder = 2;
            panel.description =
                panel.description ||
                    'General Urine Examination panel with physical, chemical, and microscopic subtests.';
            panel = await this.testRepo.save(panel);
        }
        else {
            panel = this.testRepo.create({
                labId,
                code: 'GUE',
                name: 'General Urine Examination',
                type: test_entity_1.TestType.PANEL,
                tubeType: test_entity_1.TubeType.URINE,
                allowPanelSaveWithChildDefaults: true,
                childTestIds: null,
                description: 'General Urine Examination panel with physical, chemical, and microscopic subtests.',
                isActive: true,
                sortOrder: 2,
            });
            panel = await this.testRepo.save(panel);
            created++;
            createdTests.push('GUE');
        }
        await this.syncPanelComponentsForTest(panel, {
            panelComponents: childIds.map((childId, index) => ({
                childTestId: childId,
                required: true,
                sortOrder: subtests[index]?.sortOrder ?? index + 1,
                reportSection: subtests[index]?.reportSection ?? null,
                reportGroup: subtests[index]?.reportGroup ?? null,
            })),
        }, labId);
        return { created, skipped, tests: createdTests };
    }
    async seedChemistryTests(labId) {
        const chemTests = [
            { code: 'GLU', name: 'Glucose', unit: 'mg/dL', normalMin: 70, normalMax: 100, sortOrder: 100 },
            { code: 'BUN', name: 'Blood Urea Nitrogen', unit: 'mg/dL', normalMin: 7, normalMax: 20, sortOrder: 101 },
            { code: 'CREAT', name: 'Creatinine', unit: 'mg/dL', normalMin: 0.7, normalMax: 1.3, normalMinMale: 0.7, normalMaxMale: 1.3, normalMinFemale: 0.6, normalMaxFemale: 1.1, sortOrder: 102 },
            { code: 'NA', name: 'Sodium', unit: 'mEq/L', normalMin: 136, normalMax: 145, sortOrder: 103 },
            { code: 'K', name: 'Potassium', unit: 'mEq/L', normalMin: 3.5, normalMax: 5.0, sortOrder: 104 },
            { code: 'CL', name: 'Chloride', unit: 'mEq/L', normalMin: 98, normalMax: 106, sortOrder: 105 },
            { code: 'CO2', name: 'Carbon Dioxide', unit: 'mEq/L', normalMin: 23, normalMax: 29, sortOrder: 106 },
            { code: 'CA', name: 'Calcium', unit: 'mg/dL', normalMin: 8.5, normalMax: 10.5, sortOrder: 107 },
            { code: 'ALT', name: 'Alanine Aminotransferase', unit: 'U/L', normalMin: 7, normalMax: 56, sortOrder: 110 },
            { code: 'AST', name: 'Aspartate Aminotransferase', unit: 'U/L', normalMin: 10, normalMax: 40, sortOrder: 111 },
            { code: 'ALP', name: 'Alkaline Phosphatase', unit: 'U/L', normalMin: 44, normalMax: 147, sortOrder: 112 },
            { code: 'GGT', name: 'Gamma-Glutamyl Transferase', unit: 'U/L', normalMin: 9, normalMax: 48, sortOrder: 113 },
            { code: 'TBIL', name: 'Total Bilirubin', unit: 'mg/dL', normalMin: 0.1, normalMax: 1.2, sortOrder: 114 },
            { code: 'DBIL', name: 'Direct Bilirubin', unit: 'mg/dL', normalMin: 0.0, normalMax: 0.3, sortOrder: 115 },
            { code: 'ALB', name: 'Albumin', unit: 'g/dL', normalMin: 3.5, normalMax: 5.0, sortOrder: 116 },
            { code: 'TP', name: 'Total Protein', unit: 'g/dL', normalMin: 6.0, normalMax: 8.3, sortOrder: 117 },
            { code: 'CHOL', name: 'Total Cholesterol', unit: 'mg/dL', normalMin: 0, normalMax: 200, normalText: '<200 desirable', sortOrder: 120 },
            { code: 'TRIG', name: 'Triglycerides', unit: 'mg/dL', normalMin: 0, normalMax: 150, normalText: '<150 desirable', sortOrder: 121 },
            { code: 'HDL', name: 'HDL Cholesterol', unit: 'mg/dL', normalMin: 40, normalMax: 999, normalText: '>40', sortOrder: 122 },
            { code: 'LDL', name: 'LDL Cholesterol', unit: 'mg/dL', normalMin: 0, normalMax: 100, normalText: '<100 optimal', sortOrder: 123 },
            { code: 'VLDL', name: 'VLDL Cholesterol', unit: 'mg/dL', normalMin: 5, normalMax: 40, sortOrder: 124 },
            { code: 'TSH', name: 'Thyroid Stimulating Hormone', unit: 'mIU/L', normalMin: 0.4, normalMax: 4.0, sortOrder: 130 },
            { code: 'FT4', name: 'Free T4', unit: 'ng/dL', normalMin: 0.8, normalMax: 1.8, sortOrder: 131 },
            { code: 'FT3', name: 'Free T3', unit: 'pg/mL', normalMin: 2.3, normalMax: 4.2, sortOrder: 132 },
            { code: 'T4', name: 'Total T4', unit: 'ug/dL', normalMin: 4.5, normalMax: 12.0, sortOrder: 133 },
            { code: 'T3', name: 'Total T3', unit: 'ng/dL', normalMin: 80, normalMax: 200, sortOrder: 134 },
            { code: 'EGFR', name: 'Estimated GFR', unit: 'mL/min/1.73m2', normalMin: 90, normalMax: 999, normalText: '>90', sortOrder: 140 },
            { code: 'URIC', name: 'Uric Acid', unit: 'mg/dL', normalMin: 3.5, normalMax: 7.2, normalMinMale: 4.0, normalMaxMale: 8.5, normalMinFemale: 2.5, normalMaxFemale: 7.0, sortOrder: 141 },
            { code: 'PT', name: 'Prothrombin Time', unit: 'seconds', normalMin: 11.0, normalMax: 13.5, sortOrder: 150 },
            { code: 'INR', name: 'International Normalized Ratio', unit: '', normalMin: 0.8, normalMax: 1.2, sortOrder: 151 },
            { code: 'PTT', name: 'Partial Thromboplastin Time', unit: 'seconds', normalMin: 25, normalMax: 35, sortOrder: 152 },
            { code: 'FIB', name: 'Fibrinogen', unit: 'mg/dL', normalMin: 200, normalMax: 400, sortOrder: 153 },
        ];
        let created = 0;
        let skipped = 0;
        const createdTests = [];
        for (const testData of chemTests) {
            try {
                const existing = await this.findByCode(testData.code, labId);
                if (existing) {
                    skipped++;
                    continue;
                }
                const test = this.testRepo.create({
                    labId,
                    code: testData.code,
                    name: testData.name,
                    unit: testData.unit ?? null,
                    normalMin: testData.normalMin ?? null,
                    normalMax: testData.normalMax ?? null,
                    normalMinMale: testData.normalMinMale ?? null,
                    normalMaxMale: testData.normalMaxMale ?? null,
                    normalMinFemale: testData.normalMinFemale ?? null,
                    normalMaxFemale: testData.normalMaxFemale ?? null,
                    normalText: testData.normalText ?? null,
                    sortOrder: testData.sortOrder ?? 0,
                    type: test_entity_1.TestType.SINGLE,
                    tubeType: test_entity_1.TubeType.SERUM,
                    isActive: true,
                });
                await this.testRepo.save(test);
                created++;
                createdTests.push(testData.code);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`Failed to seed Chemistry test ${testData.code}: ${msg}`);
            }
        }
        return { created, skipped, tests: createdTests };
    }
};
exports.TestsService = TestsService;
exports.TestsService = TestsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(test_entity_1.Test)),
    __param(1, (0, typeorm_1.InjectRepository)(pricing_entity_1.Pricing)),
    __param(2, (0, typeorm_1.InjectRepository)(test_component_entity_1.TestComponent)),
    __param(3, (0, typeorm_1.InjectRepository)(test_antibiotic_entity_1.TestAntibiotic)),
    __param(4, (0, typeorm_1.InjectRepository)(antibiotic_entity_1.Antibiotic)),
    __param(5, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(6, (0, typeorm_1.InjectRepository)(department_entity_1.Department)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], TestsService);
//# sourceMappingURL=tests.service.js.map
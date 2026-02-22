import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Test, TestType, TubeType } from '../entities/test.entity';
import type {
  TestNumericAgeRange,
  TestParameterDefinition,
  TestResultEntryType,
  TestResultTextOption,
} from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Department } from '../entities/department.entity';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';

interface TestPanelComponentView {
  childTestId: string;
  required: boolean;
  sortOrder: number;
  reportSection: string | null;
  reportGroup: string | null;
  childTest: {
    id: string;
    code: string;
    name: string;
    type: TestType;
    unit: string | null;
    isActive: boolean;
  };
}

type TestWithPanelComponents = Test & {
  panelComponents?: TestPanelComponentView[];
};

@Injectable()
export class TestsService {
  constructor(
    @InjectRepository(Test)
    private readonly testRepo: Repository<Test>,
    @InjectRepository(Pricing)
    private readonly pricingRepo: Repository<Pricing>,
    @InjectRepository(TestComponent)
    private readonly testComponentRepo: Repository<TestComponent>,
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
  ) {}

  async findAll(
    labId: string,
    activeOnly: boolean = true,
  ): Promise<Test[]> {
    const where = activeOnly ? { labId, isActive: true } : { labId };
    const tests = await this.testRepo.find({
      where,
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
    return this.attachPanelComponents(tests);
  }

  async findOne(id: string, labId: string): Promise<Test> {
    const test = await this.testRepo.findOne({ where: { id, labId } });
    if (!test) {
      throw new NotFoundException('Test not found');
    }
    const [withComponents] = await this.attachPanelComponents([test]);
    return withComponents ?? test;
  }

  async findByCode(code: string, labId: string): Promise<Test | null> {
    return this.testRepo.findOne({ where: { code, labId } });
  }

  async create(labId: string, dto: CreateTestDto): Promise<Test> {
    const normalizedCode = dto.code.toUpperCase().trim();
    // Check for duplicate code
    const existing = await this.findByCode(normalizedCode, labId);
    if (existing) {
      throw new ConflictException(`Test with code "${normalizedCode}" already exists`);
    }
    await this.ensureDepartmentBelongsToLab(dto.departmentId ?? null, labId);
    const resultEntryType = this.normalizeResultEntryType(dto.resultEntryType);
    const resultTextOptions = this.normalizeResultTextOptions(dto.resultTextOptions);
    const allowCustomResultText = dto.allowCustomResultText ?? false;
    this.validateResultEntryConfig(
      resultEntryType,
      resultTextOptions,
      allowCustomResultText,
    );

    const test = this.testRepo.create({
      labId,
      code: normalizedCode,
      name: dto.name.trim(),
      type: dto.type || TestType.SINGLE,
      tubeType: dto.tubeType || TubeType.SERUM,
      unit: dto.unit?.trim() || null,
      normalMin: dto.normalMin ?? null,
      normalMax: dto.normalMax ?? null,
      normalMinMale: dto.normalMinMale ?? null,
      normalMaxMale: dto.normalMaxMale ?? null,
      normalMinFemale: dto.normalMinFemale ?? null,
      normalMaxFemale: dto.normalMaxFemale ?? null,
      normalText: dto.normalText?.trim() || null,
      resultEntryType,
      resultTextOptions,
      allowCustomResultText,
      numericAgeRanges: this.normalizeNumericAgeRanges(dto.numericAgeRanges),
      description: dto.description?.trim() || null,
      childTestIds: dto.childTestIds?.trim() || null,
      parameterDefinitions: (dto.parameterDefinitions as TestParameterDefinition[]) ?? null,
      departmentId: dto.departmentId ?? null,
      category: dto.category?.trim() || null,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
      expectedCompletionMinutes: dto.expectedCompletionMinutes ?? null,
    });
    const saved = await this.testRepo.save(test);
    await this.syncPanelComponentsForTest(saved, dto, labId);
    const [withComponents] = await this.attachPanelComponents([saved]);
    return withComponents ?? saved;
  }

  async update(id: string, labId: string, dto: UpdateTestDto): Promise<Test> {
    const test = await this.findOne(id, labId);

    // Check for duplicate code if changing
    if (dto.code && dto.code !== test.code) {
      const normalizedCode = dto.code.toUpperCase().trim();
      const existing = await this.findByCode(normalizedCode, labId);
      if (existing) {
        throw new ConflictException(`Test with code "${normalizedCode}" already exists`);
      }
    }

    if (dto.code !== undefined) test.code = dto.code.toUpperCase().trim();
    if (dto.name !== undefined) test.name = dto.name.trim();
    if (dto.type !== undefined) test.type = dto.type;
    if (dto.tubeType !== undefined) test.tubeType = dto.tubeType;
    if (dto.unit !== undefined) test.unit = dto.unit?.trim() || null;
    if (dto.normalMin !== undefined) test.normalMin = dto.normalMin;
    if (dto.normalMax !== undefined) test.normalMax = dto.normalMax;
    if (dto.normalMinMale !== undefined) test.normalMinMale = dto.normalMinMale;
    if (dto.normalMaxMale !== undefined) test.normalMaxMale = dto.normalMaxMale;
    if (dto.normalMinFemale !== undefined) test.normalMinFemale = dto.normalMinFemale;
    if (dto.normalMaxFemale !== undefined) test.normalMaxFemale = dto.normalMaxFemale;
    if (dto.normalText !== undefined) test.normalText = dto.normalText?.trim() || null;
    if (dto.numericAgeRanges !== undefined) {
      test.numericAgeRanges = this.normalizeNumericAgeRanges(dto.numericAgeRanges);
    }
    if (dto.description !== undefined) test.description = dto.description?.trim() || null;
    if (dto.childTestIds !== undefined) test.childTestIds = dto.childTestIds?.trim() || null;
    if (dto.parameterDefinitions !== undefined)
      test.parameterDefinitions = (dto.parameterDefinitions as TestParameterDefinition[]) ?? null;
    if (dto.departmentId !== undefined) {
      await this.ensureDepartmentBelongsToLab(dto.departmentId ?? null, labId);
      test.departmentId = dto.departmentId ?? null;
    }
    if (dto.category !== undefined) test.category = dto.category?.trim() || null;
    if (dto.isActive !== undefined) test.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) test.sortOrder = dto.sortOrder;
    if (dto.expectedCompletionMinutes !== undefined) test.expectedCompletionMinutes = dto.expectedCompletionMinutes ?? null;

    const nextResultEntryType =
      dto.resultEntryType !== undefined
        ? this.normalizeResultEntryType(dto.resultEntryType)
        : (test.resultEntryType ?? 'NUMERIC');
    const nextResultTextOptions =
      dto.resultTextOptions !== undefined
        ? this.normalizeResultTextOptions(dto.resultTextOptions)
        : (test.resultTextOptions ?? null);
    const nextAllowCustomResultText =
      dto.allowCustomResultText !== undefined
        ? dto.allowCustomResultText
        : (test.allowCustomResultText ?? false);

    this.validateResultEntryConfig(
      nextResultEntryType,
      nextResultTextOptions,
      nextAllowCustomResultText,
    );

    test.resultEntryType = nextResultEntryType;
    test.resultTextOptions = nextResultTextOptions;
    test.allowCustomResultText = nextAllowCustomResultText;

    const saved = await this.testRepo.save(test);
    await this.syncPanelComponentsForTest(saved, dto, labId);
    const [withComponents] = await this.attachPanelComponents([saved]);
    return withComponents ?? saved;
  }

  private normalizeNumericAgeRanges(
    ranges: CreateTestDto['numericAgeRanges'] | undefined,
  ): TestNumericAgeRange[] | null {
    if (!ranges || !Array.isArray(ranges)) return null;

    const normalized = ranges
      .map((range) => {
        const sex = (range.sex || 'ANY').toUpperCase();
        const normalizedSex: TestNumericAgeRange['sex'] =
          sex === 'M' || sex === 'F' ? sex : 'ANY';
        const minAgeYears =
          range.minAgeYears === undefined || range.minAgeYears === null
            ? null
            : Number(range.minAgeYears);
        const maxAgeYears =
          range.maxAgeYears === undefined || range.maxAgeYears === null
            ? null
            : Number(range.maxAgeYears);
        const normalMin =
          range.normalMin === undefined || range.normalMin === null
            ? null
            : Number(range.normalMin);
        const normalMax =
          range.normalMax === undefined || range.normalMax === null
            ? null
            : Number(range.normalMax);

        if (
          minAgeYears !== null &&
          maxAgeYears !== null &&
          minAgeYears > maxAgeYears
        ) {
          throw new BadRequestException(
            'Invalid numeric age range: min age cannot be greater than max age',
          );
        }

        if (
          normalMin !== null &&
          normalMax !== null &&
          normalMin > normalMax
        ) {
          throw new BadRequestException(
            'Invalid numeric age range: normal min cannot be greater than normal max',
          );
        }

        return {
          sex: normalizedSex,
          minAgeYears,
          maxAgeYears,
          normalMin,
          normalMax,
        };
      })
      .filter((range) => range.normalMin !== null || range.normalMax !== null);

    if (!normalized.length) return null;

    normalized.sort((a, b) => {
      const weight = (sex: TestNumericAgeRange['sex']) =>
        sex === 'ANY' ? 1 : 0;
      const weightDiff = weight(a.sex) - weight(b.sex);
      if (weightDiff !== 0) return weightDiff;

      const minA = a.minAgeYears ?? Number.NEGATIVE_INFINITY;
      const minB = b.minAgeYears ?? Number.NEGATIVE_INFINITY;
      if (minA !== minB) return minA - minB;

      const maxA = a.maxAgeYears ?? Number.POSITIVE_INFINITY;
      const maxB = b.maxAgeYears ?? Number.POSITIVE_INFINITY;
      return maxA - maxB;
    });

    return normalized;
  }

  private normalizeResultEntryType(
    value: CreateTestDto['resultEntryType'] | undefined,
  ): TestResultEntryType {
    const normalized = (value || 'NUMERIC').toUpperCase();
    if (
      normalized === 'NUMERIC' ||
      normalized === 'QUALITATIVE' ||
      normalized === 'TEXT'
    ) {
      return normalized;
    }
    throw new BadRequestException(
      'Invalid resultEntryType. Allowed values: NUMERIC, QUALITATIVE, TEXT',
    );
  }

  private normalizeResultTextOptions(
    options: CreateTestDto['resultTextOptions'] | undefined | null,
  ): TestResultTextOption[] | null {
    if (!options || !Array.isArray(options)) return null;

    const seen = new Set<string>();
    let defaultAssigned = false;
    const normalized: TestResultTextOption[] = [];

    for (const option of options) {
      const value = option?.value?.trim();
      if (!value) continue;

      const dedupeKey = value.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const normalizedFlag = this.normalizeResultFlag(option?.flag);
      const isDefault = Boolean(option?.isDefault) && !defaultAssigned;
      if (isDefault) defaultAssigned = true;

      normalized.push({
        value,
        flag: normalizedFlag,
        isDefault,
      });
    }

    return normalized.length ? normalized : null;
  }

  private normalizeResultFlag(
    flag: string | null | undefined,
  ): TestResultTextOption['flag'] {
    if (flag === null || flag === undefined || String(flag).trim() === '') {
      return null;
    }
    const normalized = String(flag).trim().toUpperCase();
    const allowed = ['N', 'H', 'L', 'HH', 'LL', 'POS', 'NEG', 'ABN'];
    if (!allowed.includes(normalized)) {
      throw new BadRequestException(
        `Invalid result option flag "${flag}". Allowed: ${allowed.join(', ')}`,
      );
    }
    return normalized as TestResultTextOption['flag'];
  }

  private validateResultEntryConfig(
    resultEntryType: TestResultEntryType,
    resultTextOptions: TestResultTextOption[] | null,
    allowCustomResultText: boolean,
  ): void {
    if (resultEntryType === 'NUMERIC' && resultTextOptions?.length) {
      throw new BadRequestException(
        'resultTextOptions are only valid for QUALITATIVE or TEXT result entry type',
      );
    }

    if (resultEntryType === 'QUALITATIVE' && !resultTextOptions?.length) {
      throw new BadRequestException(
        'QUALITATIVE result entry type requires at least one result text option',
      );
    }

    if (resultEntryType === 'NUMERIC' && allowCustomResultText) {
      throw new BadRequestException(
        'allowCustomResultText can only be enabled for QUALITATIVE or TEXT tests',
      );
    }
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private async resolvePanelComponentTestIds(
    test: Test,
    dto: CreateTestDto | UpdateTestDto,
    labId: string,
  ): Promise<
    | Array<{
        childTestId: string;
        required: boolean;
        sortOrder: number;
        reportSection: string | null;
        reportGroup: string | null;
      }>
    | null
  > {
    const explicitComponents = dto.panelComponents;
    if (Array.isArray(explicitComponents)) {
      if (explicitComponents.length === 0) return [];
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

      if (tokens.length === 0) return [];

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
      } else if (uuidTokens.length) {
        qb.andWhere('test.id IN (:...uuidTokens)', { uuidTokens });
      } else {
        qb.andWhere('UPPER(test.code) IN (:...codeTokens)', { codeTokens });
      }

      const matches = await qb.getMany();
      const byId = new Map(matches.map((matched) => [matched.id, matched]));
      const byCode = new Map(
        matches.map((matched) => [matched.code.toUpperCase(), matched]),
      );

      const resolved = tokens.map((token, index) => {
        const child =
          byId.get(token) ??
          byCode.get(token.toUpperCase()) ??
          null;
        if (!child) {
          throw new BadRequestException(
            `Panel component "${token}" was not found in this lab`,
          );
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

  private async validatePanelComponents(
    components: Array<{
      childTestId: string;
      required: boolean;
      sortOrder: number;
      reportSection: string | null;
      reportGroup: string | null;
    }>,
    panelTestId: string,
    labId: string,
  ) {
    const deduped = new Map<string, (typeof components)[number]>();
    for (const component of components) {
      if (component.childTestId === panelTestId) {
        throw new BadRequestException('A panel cannot include itself as a component');
      }
      deduped.set(component.childTestId, component);
    }
    const normalized = Array.from(deduped.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    if (!normalized.length) return [];

    const childIds = normalized.map((component) => component.childTestId);
    const childTests = await this.testRepo.find({
      where: childIds.map((id) => ({ id, labId })),
      select: ['id', 'type'],
    });
    if (childTests.length !== childIds.length) {
      throw new BadRequestException(
        'One or more panel component tests were not found in this lab',
      );
    }
    if (childTests.some((child) => child.type === TestType.PANEL)) {
      throw new BadRequestException('Nested panels are not supported');
    }

    return normalized;
  }

  private async syncPanelComponentsForTest(
    test: Test,
    dto: CreateTestDto | UpdateTestDto,
    labId: string,
  ): Promise<void> {
    if (test.type !== TestType.PANEL) {
      await this.testComponentRepo.delete({ panelTestId: test.id });
      return;
    }

    const resolvedComponents = await this.resolvePanelComponentTestIds(
      test,
      dto,
      labId,
    );
    if (resolvedComponents === null) {
      return;
    }

    const existing = await this.testComponentRepo.find({
      where: { panelTestId: test.id },
    });
    const existingByChild = new Map(
      existing.map((component) => [component.childTestId, component]),
    );
    const desiredChildIds = new Set(
      resolvedComponents.map((component) => component.childTestId),
    );

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
        .from(TestComponent)
        .where('panelTestId = :panelTestId', { panelTestId: test.id })
        .andWhere('childTestId IN (:...childIds)', { childIds: staleIds })
        .execute();
    }
  }

  private async attachPanelComponents(
    tests: Test[],
  ): Promise<TestWithPanelComponents[]> {
    if (!tests.length) return [];
    const panelIds = tests
      .filter((test) => test.type === TestType.PANEL)
      .map((test) => test.id);
    if (!panelIds.length) return tests;

    const components = await this.testComponentRepo
      .createQueryBuilder('component')
      .innerJoinAndSelect('component.childTest', 'childTest')
      .where('component.panelTestId IN (:...panelIds)', { panelIds })
      .orderBy('component.panelTestId', 'ASC')
      .addOrderBy('component.sortOrder', 'ASC')
      .addOrderBy('childTest.code', 'ASC')
      .getMany();

    const grouped = new Map<string, TestPanelComponentView[]>();
    for (const component of components) {
      const mapped: TestPanelComponentView = {
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
      if (test.type !== TestType.PANEL) return test;
      return Object.assign(test, {
        panelComponents: grouped.get(test.id) ?? [],
      });
    });
  }

  async delete(id: string, labId: string): Promise<void> {
    const test = await this.findOne(id, labId);

    // Check if test is used in any orders
    const orderTestCount = await this.orderTestRepo.count({ where: { testId: id, labId } });
    if (orderTestCount > 0) {
      throw new ConflictException(
        `Cannot delete test "${test.code}" because it is used in ${orderTestCount} order(s). ` +
        'Deactivate the test instead (toggle Active off) to hide it from new orders while preserving history.',
      );
    }

    // Check if test is a panel component
    const componentCount = await this.testComponentRepo.count({
      where: [{ panelTestId: id }, { childTestId: id }],
    });
    if (componentCount > 0) {
      throw new ConflictException(
        `Cannot delete test "${test.code}" because it is part of a panel. ` +
        'Remove it from the panel first, or deactivate the panel.',
      );
    }

    await this.testRepo.remove(test);
  }

  async toggleActive(id: string, labId: string): Promise<Test> {
    const test = await this.findOne(id, labId);
    test.isActive = !test.isActive;
    return this.testRepo.save(test);
  }

  async getPricingForTest(testId: string, labId: string): Promise<{ shiftId: string | null; shiftCode?: string; price: number }[]> {
    await this.findOne(testId, labId);
    const rows = await this.pricingRepo.find({
      where: { testId, labId, patientType: IsNull() },
      relations: ['shift'],
    });
    return rows.map((r) => ({
      shiftId: r.shiftId,
      shiftCode: r.shift?.code,
      price: parseFloat(r.price.toString()),
    }));
  }

  async setPricingForTest(
    testId: string,
    labId: string,
    prices: { shiftId: string | null; price: number }[],
  ): Promise<void> {
    await this.findOne(testId, labId);
    await this.pricingRepo.delete({ testId, labId, patientType: IsNull() });
    for (const p of prices) {
      if (p.price < 0) continue;
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

  private async ensureDepartmentBelongsToLab(
    departmentId: string | null,
    labId: string,
  ): Promise<void> {
    if (!departmentId) return;
    const department = await this.departmentRepo.findOne({
      where: { id: departmentId, labId },
      select: ['id'],
    });
    if (!department) {
      throw new BadRequestException('Selected department does not belong to this lab');
    }
  }

  /**
   * Seed CBC panel and its subtests.
   *
   * - Creates individual CBC subtests (WBC, RBC, HGB, etc.) as SINGLE tests.
   * - Marks subtests as inactive so they don't appear in normal test list (used mainly for instrument mapping).
   * - Ensures a CBC panel test exists with normalized panel components.
   */
  async seedCBCTests(labId: string): Promise<{ created: number; skipped: number; tests: string[] }> {
    const subtests = [
      // Basic CBC
      { code: 'WBC', name: 'White Blood Cell Count', unit: '10^9/L', normalMin: 4.0, normalMax: 11.0, normalMinMale: 4.5, normalMaxMale: 11.0, normalMinFemale: 4.0, normalMaxFemale: 10.0, sortOrder: 10 },
      { code: 'RBC', name: 'Red Blood Cell Count', unit: '10^12/L', normalMin: 4.0, normalMax: 5.5, normalMinMale: 4.5, normalMaxMale: 5.5, normalMinFemale: 4.0, normalMaxFemale: 5.0, sortOrder: 11 },
      { code: 'HGB', name: 'Hemoglobin', unit: 'g/dL', normalMin: 12.0, normalMax: 17.0, normalMinMale: 13.5, normalMaxMale: 17.5, normalMinFemale: 12.0, normalMaxFemale: 16.0, sortOrder: 12 },
      { code: 'HCT', name: 'Hematocrit', unit: '%', normalMin: 36, normalMax: 50, normalMinMale: 40, normalMaxMale: 50, normalMinFemale: 36, normalMaxFemale: 44, sortOrder: 13 },
      { code: 'MCV', name: 'Mean Corpuscular Volume', unit: 'fL', normalMin: 80, normalMax: 100, sortOrder: 14 },
      { code: 'MCH', name: 'Mean Corpuscular Hemoglobin', unit: 'pg', normalMin: 27, normalMax: 33, sortOrder: 15 },
      { code: 'MCHC', name: 'Mean Corpuscular Hemoglobin Concentration', unit: 'g/dL', normalMin: 32, normalMax: 36, sortOrder: 16 },
      { code: 'RDW', name: 'Red Cell Distribution Width', unit: '%', normalMin: 11.5, normalMax: 14.5, sortOrder: 17 },

      // Platelets
      { code: 'PLT', name: 'Platelet Count', unit: '10^9/L', normalMin: 150, normalMax: 400, sortOrder: 20 },
      { code: 'MPV', name: 'Mean Platelet Volume', unit: 'fL', normalMin: 7.5, normalMax: 11.5, sortOrder: 21 },

      // Differential - Percentages
      { code: 'NEU%', name: 'Neutrophils %', unit: '%', normalMin: 40, normalMax: 70, sortOrder: 30 },
      { code: 'LYM%', name: 'Lymphocytes %', unit: '%', normalMin: 20, normalMax: 40, sortOrder: 31 },
      { code: 'MONO%', name: 'Monocytes %', unit: '%', normalMin: 2, normalMax: 8, sortOrder: 32 },
      { code: 'EOS%', name: 'Eosinophils %', unit: '%', normalMin: 1, normalMax: 4, sortOrder: 33 },
      { code: 'BASO%', name: 'Basophils %', unit: '%', normalMin: 0, normalMax: 1, sortOrder: 34 },

      // Differential - Absolute counts
      { code: 'NEU#', name: 'Neutrophils Absolute', unit: '10^9/L', normalMin: 2.0, normalMax: 7.0, sortOrder: 40 },
      { code: 'LYM#', name: 'Lymphocytes Absolute', unit: '10^9/L', normalMin: 1.0, normalMax: 3.0, sortOrder: 41 },
      { code: 'MONO#', name: 'Monocytes Absolute', unit: '10^9/L', normalMin: 0.2, normalMax: 0.8, sortOrder: 42 },
      { code: 'EOS#', name: 'Eosinophils Absolute', unit: '10^9/L', normalMin: 0.04, normalMax: 0.4, sortOrder: 43 },
      { code: 'BASO#', name: 'Basophils Absolute', unit: '10^9/L', normalMin: 0.0, normalMax: 0.1, sortOrder: 44 },

      // Additional
      { code: 'NRBC', name: 'Nucleated Red Blood Cells', unit: '/100 WBC', normalMin: 0, normalMax: 0, normalText: '0', sortOrder: 50 },
      { code: 'ESR', name: 'Erythrocyte Sedimentation Rate', unit: 'mm/hr', normalMin: 0, normalMax: 20, normalMinMale: 0, normalMaxMale: 15, normalMinFemale: 0, normalMaxFemale: 20, sortOrder: 51 },
      { code: 'RETIC', name: 'Reticulocyte Count', unit: '%', normalMin: 0.5, normalMax: 2.5, sortOrder: 52 },
    ];

    let created = 0;
    let skipped = 0;
    const createdTests: string[] = [];
    const childIds: string[] = [];

    // Ensure subtests exist (inactive, used for instrument mapping and worklist)
    for (const data of subtests) {
      try {
        let test = await this.findByCode(data.code, labId);
        if (test) {
          skipped++;
          // Update key fields in case they changed
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
          test.type = TestType.SINGLE;
          test.tubeType = TubeType.WHOLE_BLOOD;
          test.labId = labId;
          // Hide subtests from normal ordering; they live under the CBC panel
          test.isActive = false;
          test = await this.testRepo.save(test);
        } else {
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
            type: TestType.SINGLE,
            tubeType: TubeType.WHOLE_BLOOD,
            isActive: false,
          });
          test = await this.testRepo.save(test);
          created++;
          createdTests.push(data.code);
        }
        childIds.push(test.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to seed CBC subtest ${data.code}: ${msg}`);
      }
    }

    // Ensure CBC panel exists
    try {
      let panel = await this.findByCode('CBC', labId);
      if (panel) {
        panel.type = TestType.PANEL;
        panel.tubeType = TubeType.WHOLE_BLOOD;
        panel.labId = labId;
        panel.isActive = true;
        panel.childTestIds = null;
        panel.sortOrder = 1;
        panel.description =
          panel.description ||
          'CBC panel - includes WBC, RBC, HGB, HCT, indices, platelets, and differential as reported by analyzer.';
        panel = await this.testRepo.save(panel);
      } else {
        panel = this.testRepo.create({
          labId,
          code: 'CBC',
          name: 'Complete Blood Count',
          type: TestType.PANEL,
          tubeType: TubeType.WHOLE_BLOOD,
          childTestIds: null, // No longer used; use TestComponent table
          description:
            'CBC panel - includes WBC, RBC, HGB, HCT, indices, platelets, and differential as reported by analyzer.',
          isActive: true,
          sortOrder: 1,
        });
        panel = await this.testRepo.save(panel);
        created++;
        createdTests.push('CBC');
      }

      await this.syncPanelComponentsForTest(
        panel,
        {
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
        } as CreateTestDto,
        labId,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to seed CBC panel: ${msg}`);
    }

    return { created, skipped, tests: createdTests };
  }

  /**
   * Helper: Get report section for CBC subtest
   */
  private getReportSection(code: string): string | null {
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

  /**
   * Helper: Get report group for CBC subtest
   */
  private getReportGroup(code: string): string | null {
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

  /**
   * Seed GUE (General Urine Examination) as a panel with explicit subtests.
   */
  async seedUrinalysisTests(
    labId: string,
  ): Promise<{ created: number; skipped: number; tests: string[] }> {
    const subtests: Array<{
      code: string;
      name: string;
      resultEntryType: TestResultEntryType;
      resultTextOptions?: TestResultTextOption[] | null;
      allowCustomResultText?: boolean;
      unit?: string | null;
      normalMin?: number | null;
      normalMax?: number | null;
      sortOrder: number;
      reportSection: string;
      reportGroup: string;
    }> = [
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
          { value: '++', flag: 'HH' },
          { value: '+++', flag: 'HH' },
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
          { value: '++', flag: 'HH' },
          { value: '+++', flag: 'HH' },
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
          { value: '++', flag: 'HH' },
          { value: '+++', flag: 'HH' },
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
          { value: '++', flag: 'HH' },
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
    const createdTests: string[] = [];
    const childIds: string[] = [];

    for (const data of subtests) {
      let test = await this.findByCode(data.code, labId);
      if (test) {
        skipped++;
        test.name = data.name;
        test.type = TestType.SINGLE;
        test.tubeType = TubeType.URINE;
        test.resultEntryType = data.resultEntryType;
        test.resultTextOptions = data.resultTextOptions ?? null;
        test.allowCustomResultText = data.allowCustomResultText ?? false;
        test.unit = data.unit ?? null;
        test.normalMin = data.normalMin ?? null;
        test.normalMax = data.normalMax ?? null;
        test.sortOrder = data.sortOrder;
        test.isActive = false;
        test = await this.testRepo.save(test);
      } else {
        test = this.testRepo.create({
          labId,
          code: data.code,
          name: data.name,
          type: TestType.SINGLE,
          tubeType: TubeType.URINE,
          resultEntryType: data.resultEntryType,
          resultTextOptions: data.resultTextOptions ?? null,
          allowCustomResultText: data.allowCustomResultText ?? false,
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
      panel.type = TestType.PANEL;
      panel.tubeType = TubeType.URINE;
      panel.isActive = true;
      panel.childTestIds = null;
      panel.sortOrder = 2;
      panel.description =
        panel.description ||
        'General Urine Examination panel with physical, chemical, and microscopic subtests.';
      panel = await this.testRepo.save(panel);
    } else {
      panel = this.testRepo.create({
        labId,
        code: 'GUE',
        name: 'General Urine Examination',
        type: TestType.PANEL,
        tubeType: TubeType.URINE,
        childTestIds: null,
        description:
          'General Urine Examination panel with physical, chemical, and microscopic subtests.',
        isActive: true,
        sortOrder: 2,
      });
      panel = await this.testRepo.save(panel);
      created++;
      createdTests.push('GUE');
    }

    await this.syncPanelComponentsForTest(
      panel,
      {
        panelComponents: childIds.map((childId, index) => ({
          childTestId: childId,
          required: true,
          sortOrder: subtests[index]?.sortOrder ?? index + 1,
          reportSection: subtests[index]?.reportSection ?? null,
          reportGroup: subtests[index]?.reportGroup ?? null,
        })),
      } as CreateTestDto,
      labId,
    );

    return { created, skipped, tests: createdTests };
  }

  /**
   * Seed Chemistry tests with normal ranges
   */
  async seedChemistryTests(labId: string): Promise<{ created: number; skipped: number; tests: string[] }> {
    const chemTests = [
      // Basic Metabolic Panel
      { code: 'GLU', name: 'Glucose', unit: 'mg/dL', normalMin: 70, normalMax: 100, sortOrder: 100 },
      { code: 'BUN', name: 'Blood Urea Nitrogen', unit: 'mg/dL', normalMin: 7, normalMax: 20, sortOrder: 101 },
      { code: 'CREAT', name: 'Creatinine', unit: 'mg/dL', normalMin: 0.7, normalMax: 1.3, normalMinMale: 0.7, normalMaxMale: 1.3, normalMinFemale: 0.6, normalMaxFemale: 1.1, sortOrder: 102 },
      { code: 'NA', name: 'Sodium', unit: 'mEq/L', normalMin: 136, normalMax: 145, sortOrder: 103 },
      { code: 'K', name: 'Potassium', unit: 'mEq/L', normalMin: 3.5, normalMax: 5.0, sortOrder: 104 },
      { code: 'CL', name: 'Chloride', unit: 'mEq/L', normalMin: 98, normalMax: 106, sortOrder: 105 },
      { code: 'CO2', name: 'Carbon Dioxide', unit: 'mEq/L', normalMin: 23, normalMax: 29, sortOrder: 106 },
      { code: 'CA', name: 'Calcium', unit: 'mg/dL', normalMin: 8.5, normalMax: 10.5, sortOrder: 107 },
      
      // Liver Function
      { code: 'ALT', name: 'Alanine Aminotransferase', unit: 'U/L', normalMin: 7, normalMax: 56, sortOrder: 110 },
      { code: 'AST', name: 'Aspartate Aminotransferase', unit: 'U/L', normalMin: 10, normalMax: 40, sortOrder: 111 },
      { code: 'ALP', name: 'Alkaline Phosphatase', unit: 'U/L', normalMin: 44, normalMax: 147, sortOrder: 112 },
      { code: 'GGT', name: 'Gamma-Glutamyl Transferase', unit: 'U/L', normalMin: 9, normalMax: 48, sortOrder: 113 },
      { code: 'TBIL', name: 'Total Bilirubin', unit: 'mg/dL', normalMin: 0.1, normalMax: 1.2, sortOrder: 114 },
      { code: 'DBIL', name: 'Direct Bilirubin', unit: 'mg/dL', normalMin: 0.0, normalMax: 0.3, sortOrder: 115 },
      { code: 'ALB', name: 'Albumin', unit: 'g/dL', normalMin: 3.5, normalMax: 5.0, sortOrder: 116 },
      { code: 'TP', name: 'Total Protein', unit: 'g/dL', normalMin: 6.0, normalMax: 8.3, sortOrder: 117 },
      
      // Lipid Panel
      { code: 'CHOL', name: 'Total Cholesterol', unit: 'mg/dL', normalMin: 0, normalMax: 200, normalText: '<200 desirable', sortOrder: 120 },
      { code: 'TRIG', name: 'Triglycerides', unit: 'mg/dL', normalMin: 0, normalMax: 150, normalText: '<150 desirable', sortOrder: 121 },
      { code: 'HDL', name: 'HDL Cholesterol', unit: 'mg/dL', normalMin: 40, normalMax: 999, normalText: '>40', sortOrder: 122 },
      { code: 'LDL', name: 'LDL Cholesterol', unit: 'mg/dL', normalMin: 0, normalMax: 100, normalText: '<100 optimal', sortOrder: 123 },
      { code: 'VLDL', name: 'VLDL Cholesterol', unit: 'mg/dL', normalMin: 5, normalMax: 40, sortOrder: 124 },
      
      // Thyroid
      { code: 'TSH', name: 'Thyroid Stimulating Hormone', unit: 'mIU/L', normalMin: 0.4, normalMax: 4.0, sortOrder: 130 },
      { code: 'FT4', name: 'Free T4', unit: 'ng/dL', normalMin: 0.8, normalMax: 1.8, sortOrder: 131 },
      { code: 'FT3', name: 'Free T3', unit: 'pg/mL', normalMin: 2.3, normalMax: 4.2, sortOrder: 132 },
      { code: 'T4', name: 'Total T4', unit: 'ug/dL', normalMin: 4.5, normalMax: 12.0, sortOrder: 133 },
      { code: 'T3', name: 'Total T3', unit: 'ng/dL', normalMin: 80, normalMax: 200, sortOrder: 134 },
      
      // Renal
      { code: 'EGFR', name: 'Estimated GFR', unit: 'mL/min/1.73m2', normalMin: 90, normalMax: 999, normalText: '>90', sortOrder: 140 },
      { code: 'URIC', name: 'Uric Acid', unit: 'mg/dL', normalMin: 3.5, normalMax: 7.2, normalMinMale: 4.0, normalMaxMale: 8.5, normalMinFemale: 2.5, normalMaxFemale: 7.0, sortOrder: 141 },
      
      // Coagulation
      { code: 'PT', name: 'Prothrombin Time', unit: 'seconds', normalMin: 11.0, normalMax: 13.5, sortOrder: 150 },
      { code: 'INR', name: 'International Normalized Ratio', unit: '', normalMin: 0.8, normalMax: 1.2, sortOrder: 151 },
      { code: 'PTT', name: 'Partial Thromboplastin Time', unit: 'seconds', normalMin: 25, normalMax: 35, sortOrder: 152 },
      { code: 'FIB', name: 'Fibrinogen', unit: 'mg/dL', normalMin: 200, normalMax: 400, sortOrder: 153 },
    ];

    let created = 0;
    let skipped = 0;
    const createdTests: string[] = [];

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
          type: TestType.SINGLE,
          tubeType: TubeType.SERUM,
          isActive: true,
        });
        await this.testRepo.save(test);
        created++;
        createdTests.push(testData.code);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to seed Chemistry test ${testData.code}: ${msg}`);
      }
    }

    return { created, skipped, tests: createdTests };
  }
}

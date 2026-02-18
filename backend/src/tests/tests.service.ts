import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Test, TestType, TubeType } from '../entities/test.entity';
import type { TestParameterDefinition } from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { OrderTest } from '../entities/order-test.entity';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';

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
  ) {}

  async findAll(activeOnly: boolean = true): Promise<Test[]> {
    const where = activeOnly ? { isActive: true } : {};
    return this.testRepo.find({
      where,
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Test> {
    const test = await this.testRepo.findOne({ where: { id } });
    if (!test) {
      throw new NotFoundException('Test not found');
    }
    return test;
  }

  async findByCode(code: string): Promise<Test | null> {
    return this.testRepo.findOne({ where: { code } });
  }

  async create(dto: CreateTestDto): Promise<Test> {
    // Check for duplicate code
    const existing = await this.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(`Test with code "${dto.code}" already exists`);
    }

    const test = this.testRepo.create({
      code: dto.code.toUpperCase().trim(),
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
      description: dto.description?.trim() || null,
      childTestIds: dto.childTestIds?.trim() || null,
      parameterDefinitions: (dto.parameterDefinitions as TestParameterDefinition[]) ?? null,
      departmentId: dto.departmentId ?? null,
      category: dto.category?.trim() || null,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
      expectedCompletionMinutes: dto.expectedCompletionMinutes ?? null,
    });

    return this.testRepo.save(test);
  }

  async update(id: string, dto: UpdateTestDto): Promise<Test> {
    const test = await this.findOne(id);

    // Check for duplicate code if changing
    if (dto.code && dto.code !== test.code) {
      const existing = await this.findByCode(dto.code);
      if (existing) {
        throw new ConflictException(`Test with code "${dto.code}" already exists`);
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
    if (dto.description !== undefined) test.description = dto.description?.trim() || null;
    if (dto.childTestIds !== undefined) test.childTestIds = dto.childTestIds?.trim() || null;
    if (dto.parameterDefinitions !== undefined)
      test.parameterDefinitions = (dto.parameterDefinitions as TestParameterDefinition[]) ?? null;
    if (dto.departmentId !== undefined) test.departmentId = dto.departmentId ?? null;
    if (dto.category !== undefined) test.category = dto.category?.trim() || null;
    if (dto.isActive !== undefined) test.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) test.sortOrder = dto.sortOrder;
    if (dto.expectedCompletionMinutes !== undefined) test.expectedCompletionMinutes = dto.expectedCompletionMinutes ?? null;

    return this.testRepo.save(test);
  }

  async delete(id: string): Promise<void> {
    const test = await this.findOne(id);

    // Check if test is used in any orders
    const orderTestCount = await this.orderTestRepo.count({ where: { testId: id } });
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

  async toggleActive(id: string): Promise<Test> {
    const test = await this.findOne(id);
    test.isActive = !test.isActive;
    return this.testRepo.save(test);
  }

  async getPricingForTest(testId: string, labId: string): Promise<{ shiftId: string | null; shiftCode?: string; price: number }[]> {
    await this.findOne(testId);
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
    await this.findOne(testId);
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

  /**
   * Seed CBC panel and its subtests.
   *
   * - Creates individual CBC subtests (WBC, RBC, HGB, etc.) as SINGLE tests.
   * - Marks subtests as inactive so they don't appear in normal test list (used mainly for instrument mapping).
   * - Ensures a CBC panel test exists with childTestIds pointing to the subtests.
   */
  async seedCBCTests(): Promise<{ created: number; skipped: number; tests: string[] }> {
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
        let test = await this.findByCode(data.code);
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
          // Hide subtests from normal ordering; they live under the CBC panel
          test.isActive = false;
          test = await this.testRepo.save(test);
        } else {
          test = this.testRepo.create({
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
      let panel = await this.findByCode('CBC');
      if (panel) {
        panel.type = TestType.PANEL;
        panel.tubeType = TubeType.WHOLE_BLOOD;
        panel.isActive = true;
        panel.sortOrder = 1;
        panel.description =
          panel.description ||
          'CBC panel - includes WBC, RBC, HGB, HCT, indices, platelets, and differential as reported by analyzer.';
        panel = await this.testRepo.save(panel);
      } else {
        panel = this.testRepo.create({
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

      // Create TestComponent rows for panel
      const existingComponents = await this.testComponentRepo.find({
        where: { panelTestId: panel.id },
      });
      const existingChildIds = new Set(existingComponents.map(c => c.childTestId));

      for (let i = 0; i < childIds.length; i++) {
        const childId = childIds[i];
        const subtestData = subtests[i];

        if (!existingChildIds.has(childId)) {
          const component = this.testComponentRepo.create({
            panelTestId: panel.id,
            childTestId: childId,
            required: true,
            sortOrder: subtestData.sortOrder,
            reportSection: this.getReportSection(subtestData.code),
            reportGroup: this.getReportGroup(subtestData.code),
          });
          await this.testComponentRepo.save(component);
        }
      }
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
   * Seed Chemistry tests with normal ranges
   */
  async seedChemistryTests(): Promise<{ created: number; skipped: number; tests: string[] }> {
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
        const existing = await this.findByCode(testData.code);
        if (existing) {
          skipped++;
          continue;
        }

        const test = this.testRepo.create({
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

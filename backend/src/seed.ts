/**
 * Seed: run with npm run seed from backend folder.
 * Creates: one lab, one shift, one user (admin / password), user-lab assignment.
 */
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '..', '.env') });

import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Lab } from './entities/lab.entity';
import { Shift } from './entities/shift.entity';
import { User } from './entities/user.entity';
import { UserLabAssignment } from './entities/user-lab-assignment.entity';
import { Test, TestType } from './entities/test.entity';
import { Pricing } from './entities/pricing.entity';
import { PatientType } from './entities/order.entity';
import { IsNull } from 'typeorm';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'lis',
  entities: [Lab, Shift, User, UserLabAssignment, Test, Pricing],
  synchronize: false,
});

async function seed() {
  await dataSource.initialize();

  const labRepo = dataSource.getRepository(Lab);
  const shiftRepo = dataSource.getRepository(Shift);
  const userRepo = dataSource.getRepository(User);
  const assignmentRepo = dataSource.getRepository(UserLabAssignment);

  let lab = await labRepo.findOne({ where: { code: 'LAB01' } });
  if (!lab) {
    lab = labRepo.create({
      code: 'LAB01',
      name: 'Main Lab',
      timezone: 'UTC',
      isActive: true,
    });
    await labRepo.save(lab);
    console.log('Created lab:', lab.name);
  }

  let shift = await shiftRepo.findOne({
    where: { labId: lab.id, code: 'DAY' },
  });
  if (!shift) {
    shift = shiftRepo.create({
      labId: lab.id,
      code: 'DAY',
      name: 'Day Shift',
      startTime: '08:00',
      endTime: '14:00',
      isEmergency: false,
    });
    await shiftRepo.save(shift);
    console.log('Created shift:', shift.name);
  } else if (!shift.startTime) {
    shift.startTime = '08:00';
    shift.endTime = '14:00';
    await shiftRepo.save(shift);
  }

  let user = await userRepo.findOne({ where: { username: 'admin' } });
  if (!user) {
    const passwordHash = await bcrypt.hash('password', 10);
    user = userRepo.create({
      username: 'admin',
      passwordHash,
      fullName: 'Lab Admin',
      role: 'LAB_ADMIN',
      defaultLabId: lab.id,
      isActive: true,
    });
    await userRepo.save(user);
    console.log('Created user: admin / password');
  }

  const existing = await assignmentRepo.findOne({
    where: { userId: user.id, labId: lab.id },
  });
  if (!existing) {
    await assignmentRepo.save({
      userId: user.id,
      labId: lab.id,
    });
    console.log('Assigned admin to Main Lab');
  }

  // Seed Tests
  const testRepo = dataSource.getRepository(Test);
  const tests = [
    { code: 'CBC', name: 'Complete Blood Count', type: TestType.PANEL },
    { code: 'LFT', name: 'Liver Function Test', type: TestType.PANEL },
    { code: 'RFT', name: 'Renal Function Test', type: TestType.PANEL },
    { code: 'GLU', name: 'Glucose', type: TestType.SINGLE },
    { code: 'HB', name: 'Hemoglobin', type: TestType.SINGLE },
    { code: 'WBC', name: 'White Blood Cell Count', type: TestType.SINGLE },
    { code: 'PLT', name: 'Platelet Count', type: TestType.SINGLE },
    { code: 'ALT', name: 'Alanine Aminotransferase', type: TestType.SINGLE },
    { code: 'AST', name: 'Aspartate Aminotransferase', type: TestType.SINGLE },
    { code: 'CREA', name: 'Creatinine', type: TestType.SINGLE },
    { code: 'UREA', name: 'Urea', type: TestType.SINGLE },
  ];

  const createdTests: Test[] = [];
  for (const testData of tests) {
    let test = await testRepo.findOne({ where: { code: testData.code } });
    if (!test) {
      test = testRepo.create({
        code: testData.code,
        name: testData.name,
        type: testData.type,
        isActive: true,
      });
      test = await testRepo.save(test);
      console.log(`Created test: ${test.code} - ${test.name}`);
    }
    createdTests.push(test);
  }

  // Seed Pricing
  const pricingRepo = dataSource.getRepository(Pricing);
  
  // Base prices for each test (walk-in, day shift)
  const basePrices: Record<string, number> = {
    CBC: 25.00,
    LFT: 30.00,
    RFT: 28.00,
    GLU: 5.00,
    HB: 8.00,
    WBC: 10.00,
    PLT: 10.00,
    ALT: 8.00,
    AST: 8.00,
    CREA: 6.00,
    UREA: 6.00,
  };

  for (const test of createdTests) {
    const basePrice = basePrices[test.code] || 10.00;
    
    // Create pricing for walk-in, day shift (base price)
    let pricing = await pricingRepo.findOne({
      where: {
        labId: lab.id,
        testId: test.id,
        shiftId: shift.id,
        patientType: PatientType.WALK_IN,
      },
    });
    if (!pricing) {
      pricing = pricingRepo.create({
        labId: lab.id,
        testId: test.id,
        shiftId: shift.id,
        patientType: PatientType.WALK_IN,
        price: basePrice,
        isActive: true,
      });
      await pricingRepo.save(pricing);
      console.log(`Created pricing: ${test.code} - Walk-in/Day - $${basePrice}`);
    }

    // Create pricing for hospital (20% discount)
    pricing = await pricingRepo.findOne({
      where: {
        labId: lab.id,
        testId: test.id,
        shiftId: shift.id,
        patientType: PatientType.HOSPITAL,
      },
    });
    if (!pricing) {
      pricing = pricingRepo.create({
        labId: lab.id,
        testId: test.id,
        shiftId: shift.id,
        patientType: PatientType.HOSPITAL,
        price: basePrice * 0.8,
        isActive: true,
      });
      await pricingRepo.save(pricing);
      console.log(`Created pricing: ${test.code} - Hospital/Day - $${(basePrice * 0.8).toFixed(2)}`);
    }

    // Create default pricing (no shift, no patient type - fallback)
    pricing = await pricingRepo.findOne({
      where: {
        labId: lab.id,
        testId: test.id,
        shiftId: IsNull(),
        patientType: IsNull(),
      },
    });
    if (!pricing) {
      pricing = pricingRepo.create({
        labId: lab.id,
        testId: test.id,
        shiftId: null,
        patientType: null,
        price: basePrice,
        isActive: true,
      });
      await pricingRepo.save(pricing);
      console.log(`Created default pricing: ${test.code} - $${basePrice}`);
    }
  }

  await dataSource.destroy();
  console.log('Seed done.');
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});

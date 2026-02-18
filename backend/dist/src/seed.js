"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const path_1 = require("path");
(0, dotenv_1.config)({ path: (0, path_1.join)(__dirname, '..', '.env') });
const typeorm_1 = require("typeorm");
const bcrypt = require("bcrypt");
const lab_entity_1 = require("./entities/lab.entity");
const shift_entity_1 = require("./entities/shift.entity");
const user_entity_1 = require("./entities/user.entity");
const user_lab_assignment_entity_1 = require("./entities/user-lab-assignment.entity");
const test_entity_1 = require("./entities/test.entity");
const pricing_entity_1 = require("./entities/pricing.entity");
const order_entity_1 = require("./entities/order.entity");
const typeorm_2 = require("typeorm");
const dataSource = new typeorm_1.DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'lis',
    entities: [lab_entity_1.Lab, shift_entity_1.Shift, user_entity_1.User, user_lab_assignment_entity_1.UserLabAssignment, test_entity_1.Test, pricing_entity_1.Pricing],
    synchronize: false,
});
async function seed() {
    await dataSource.initialize();
    const labRepo = dataSource.getRepository(lab_entity_1.Lab);
    const shiftRepo = dataSource.getRepository(shift_entity_1.Shift);
    const userRepo = dataSource.getRepository(user_entity_1.User);
    const assignmentRepo = dataSource.getRepository(user_lab_assignment_entity_1.UserLabAssignment);
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
    }
    else if (!shift.startTime) {
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
    const testRepo = dataSource.getRepository(test_entity_1.Test);
    const tests = [
        { code: 'CBC', name: 'Complete Blood Count', type: test_entity_1.TestType.PANEL },
        { code: 'LFT', name: 'Liver Function Test', type: test_entity_1.TestType.PANEL },
        { code: 'RFT', name: 'Renal Function Test', type: test_entity_1.TestType.PANEL },
        { code: 'GLU', name: 'Glucose', type: test_entity_1.TestType.SINGLE },
        { code: 'HB', name: 'Hemoglobin', type: test_entity_1.TestType.SINGLE },
        { code: 'WBC', name: 'White Blood Cell Count', type: test_entity_1.TestType.SINGLE },
        { code: 'PLT', name: 'Platelet Count', type: test_entity_1.TestType.SINGLE },
        { code: 'ALT', name: 'Alanine Aminotransferase', type: test_entity_1.TestType.SINGLE },
        { code: 'AST', name: 'Aspartate Aminotransferase', type: test_entity_1.TestType.SINGLE },
        { code: 'CREA', name: 'Creatinine', type: test_entity_1.TestType.SINGLE },
        { code: 'UREA', name: 'Urea', type: test_entity_1.TestType.SINGLE },
    ];
    const createdTests = [];
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
    const pricingRepo = dataSource.getRepository(pricing_entity_1.Pricing);
    const basePrices = {
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
        let pricing = await pricingRepo.findOne({
            where: {
                labId: lab.id,
                testId: test.id,
                shiftId: shift.id,
                patientType: order_entity_1.PatientType.WALK_IN,
            },
        });
        if (!pricing) {
            pricing = pricingRepo.create({
                labId: lab.id,
                testId: test.id,
                shiftId: shift.id,
                patientType: order_entity_1.PatientType.WALK_IN,
                price: basePrice,
                isActive: true,
            });
            await pricingRepo.save(pricing);
            console.log(`Created pricing: ${test.code} - Walk-in/Day - $${basePrice}`);
        }
        pricing = await pricingRepo.findOne({
            where: {
                labId: lab.id,
                testId: test.id,
                shiftId: shift.id,
                patientType: order_entity_1.PatientType.HOSPITAL,
            },
        });
        if (!pricing) {
            pricing = pricingRepo.create({
                labId: lab.id,
                testId: test.id,
                shiftId: shift.id,
                patientType: order_entity_1.PatientType.HOSPITAL,
                price: basePrice * 0.8,
                isActive: true,
            });
            await pricingRepo.save(pricing);
            console.log(`Created pricing: ${test.code} - Hospital/Day - $${(basePrice * 0.8).toFixed(2)}`);
        }
        pricing = await pricingRepo.findOne({
            where: {
                labId: lab.id,
                testId: test.id,
                shiftId: (0, typeorm_2.IsNull)(),
                patientType: (0, typeorm_2.IsNull)(),
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
//# sourceMappingURL=seed.js.map
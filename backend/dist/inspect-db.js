"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./src/app.module");
const typeorm_1 = require("@nestjs/typeorm");
const lab_entity_1 = require("./src/entities/lab.entity");
const test_entity_1 = require("./src/entities/test.entity");
async function bootstrap() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    const labRepo = app.get((0, typeorm_1.getRepositoryToken)(lab_entity_1.Lab));
    const testRepo = app.get((0, typeorm_1.getRepositoryToken)(test_entity_1.Test));
    try {
        const labs = await labRepo.find();
        console.log('--- LABS ---');
        labs.forEach(l => console.log(`ID: ${l.id}, Name: ${l.name}`));
        if (labs.length > 0) {
            const labId = labs[0].id;
            const tests = await testRepo.find({ where: { labId } });
            console.log(`\n--- TESTS for Lab ${labId} ---`);
            tests.forEach(t => console.log(`Code: ${t.code}, Name: ${t.name}`));
        }
    }
    catch (err) {
        console.error('Error during inspection:', err);
    }
    finally {
        await app.close();
    }
}
bootstrap();
//# sourceMappingURL=inspect-db.js.map
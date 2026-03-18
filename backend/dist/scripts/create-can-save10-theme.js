"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const lab_entity_1 = require("../src/entities/lab.entity");
const report_theme_entity_1 = require("../src/entities/report-theme.entity");
const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.join(__dirname, '../.env') });
const dataSource = new typeorm_1.DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'lis',
    entities: [lab_entity_1.Lab, report_theme_entity_1.ReportTheme],
    synchronize: false,
});
async function run() {
    await dataSource.initialize();
    console.log('Database initialized');
    const labRepo = dataSource.getRepository(lab_entity_1.Lab);
    const themeRepo = dataSource.getRepository(report_theme_entity_1.ReportTheme);
    const labs = await labRepo.find();
    if (labs.length === 0) {
        console.error('No labs found');
        await dataSource.destroy();
        return;
    }
    for (const lab of labs) {
        console.log(`Processing lab: ${lab.name} (${lab.code})`);
        const existing = await themeRepo.findOne({
            where: { labId: lab.id, name: 'can save10' }
        });
        if (existing) {
            console.log(`Theme "can save10" already exists for lab ${lab.code}, updating...`);
            existing.reportStyle = lab.reportStyle;
            existing.reportBranding = {
                bannerDataUrl: lab.reportBannerDataUrl,
                footerDataUrl: lab.reportFooterDataUrl,
                logoDataUrl: lab.reportLogoDataUrl,
                watermarkDataUrl: lab.reportWatermarkDataUrl,
            };
            existing.onlineResultWatermarkDataUrl = lab.onlineResultWatermarkDataUrl;
            existing.onlineResultWatermarkText = lab.onlineResultWatermarkText;
            await themeRepo.save(existing);
        }
        else {
            console.log(`Creating theme "can save10" for lab ${lab.code}`);
            const theme = themeRepo.create({
                labId: lab.id,
                name: 'can save10',
                reportStyle: lab.reportStyle,
                reportBranding: {
                    bannerDataUrl: lab.reportBannerDataUrl,
                    footerDataUrl: lab.reportFooterDataUrl,
                    logoDataUrl: lab.reportLogoDataUrl,
                    watermarkDataUrl: lab.reportWatermarkDataUrl,
                },
                onlineResultWatermarkDataUrl: lab.onlineResultWatermarkDataUrl,
                onlineResultWatermarkText: lab.onlineResultWatermarkText,
            });
            await themeRepo.save(theme);
        }
    }
    console.log('Themes created successfully');
    await dataSource.destroy();
}
run().catch((err) => {
    console.error('Error running script:', err);
    process.exit(1);
});
//# sourceMappingURL=create-can-save10-theme.js.map
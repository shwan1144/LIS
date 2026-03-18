import { DataSource } from 'typeorm';
import { Lab } from '../src/entities/lab.entity';
import { ReportTheme } from '../src/entities/report-theme.entity';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'lis',
  entities: [Lab, ReportTheme],
  synchronize: false,
});

async function run() {
  await dataSource.initialize();
  console.log('Database initialized');

  const labRepo = dataSource.getRepository(Lab);
  const themeRepo = dataSource.getRepository(ReportTheme);

  const labs = await labRepo.find();
  if (labs.length === 0) {
    console.error('No labs found');
    await dataSource.destroy();
    return;
  }

  for (const lab of labs) {
    console.log(`Processing lab: ${lab.name} (${lab.code})`);
    
    // Check if theme already exists
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
    } else {
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

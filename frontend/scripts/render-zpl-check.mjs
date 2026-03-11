import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { ready } from 'zpl-renderer-js';

async function main() {
  const inputPath = process.argv[2];
  const outputDir = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.resolve(process.cwd(), 'dist-zpl-check');

  if (!inputPath) {
    console.error('Usage: npm run render:zpl-check -- <input.zpl> [output-dir]');
    process.exit(1);
  }

  const absoluteInputPath = path.resolve(inputPath);
  const zpl = await fs.readFile(absoluteInputPath, 'utf8');
  const { api } = await ready;
  const rendered = await api.zplToBase64MultipleAsync(zpl, 50, 25, 8);
  const images = Array.isArray(rendered) ? rendered : [rendered];

  await fs.mkdir(outputDir, { recursive: true });
  for (const [index, image] of images.entries()) {
    const base64 = String(image).replace(/^data:image\/png;base64,/i, '');
    const outputPath = path.join(outputDir, `label-${String(index + 1).padStart(2, '0')}.png`);
    await fs.writeFile(outputPath, Buffer.from(base64, 'base64'));
  }

  console.log(`Rendered ${images.length} label image(s) to ${outputDir}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

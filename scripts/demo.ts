import * as dotenv from 'dotenv';
dotenv.config();

import fs from 'fs/promises';
import path from 'path';

import { getBrandProfile } from '../src/brandProfiles';
import { searchCreators } from '../src/searchCreators';

const DEFAULT_QUERY = 'Affordable home decor for small apartments';
const DEFAULT_BRAND = 'brand_smart_home';
const DEFAULT_TOP = 10;

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function toFileSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

async function main(): Promise<void> {
  const query = readArg('--query') ?? DEFAULT_QUERY;
  const brandId = readArg('--brand') ?? DEFAULT_BRAND;
  const top = Number(readArg('--top') ?? DEFAULT_TOP);
  const brandProfile = getBrandProfile(brandId);

  const results = await searchCreators(query, brandProfile);
  const topResults = results.slice(0, top);

  const payload = {
    query,
    brand_profile: brandId,
    embedding_provider: process.env.EMBEDDING_PROVIDER ?? 'openai',
    vector_backend: process.env.VECTOR_BACKEND ?? 'postgres',
    generated_at: new Date().toISOString(),
    results: topResults,
  };

  const outputDirectory = path.resolve(__dirname, '..', 'output');
  const outputFileName =
    brandId === DEFAULT_BRAND && query === DEFAULT_QUERY && top === DEFAULT_TOP
      ? 'brand_smart_home_top10.json'
      : `${toFileSlug(brandId)}_${toFileSlug(query)}_top${top}.json`;
  const outputPath = path.join(outputDirectory, outputFileName);

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(payload, null, 2));
  console.log(`\nWrote results to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import * as dotenv from 'dotenv';
dotenv.config();

import { buildCreatorSearchDocument, loadCreators } from '../src/creators';
import { embedTexts } from '../src/embeddings';
import {
  getVectorBackend,
  hasUsableDatabaseUrl,
  upsertEmbeddedCreators,
  type EmbeddedCreator,
} from '../src/vectorStore';

const BATCH_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function main(): Promise<void> {
  const backend = getVectorBackend();
  if (backend === 'memory' || !hasUsableDatabaseUrl(process.env.DATABASE_URL)) {
    throw new Error(
      'npm run ingest requires a real DATABASE_URL and VECTOR_BACKEND=postgres (or auto with a working Postgres URL).'
    );
  }

  const creators = await loadCreators();
  const documents = creators.map(buildCreatorSearchDocument);
  const embeddedCreators: EmbeddedCreator[] = [];

  for (const [batchIndex, documentBatch] of chunk(documents, BATCH_SIZE).entries()) {
    const start = batchIndex * BATCH_SIZE;
    const creatorsBatch = creators.slice(start, start + documentBatch.length);
    const embeddings = await embedTexts(documentBatch);

    for (let index = 0; index < creatorsBatch.length; index += 1) {
      embeddedCreators.push({
        creator: creatorsBatch[index],
        searchDocument: documentBatch[index],
        embedding: embeddings[index],
      });
    }

    console.log(
      `Embedded batch ${batchIndex + 1}/${Math.ceil(documents.length / BATCH_SIZE)} (${embeddedCreators.length}/${creators.length} creators)`
    );
  }

  await upsertEmbeddedCreators(embeddedCreators);
  console.log(`Ingestion complete. Stored ${embeddedCreators.length} creators.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

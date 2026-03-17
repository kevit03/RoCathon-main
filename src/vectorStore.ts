import { Pool } from 'pg';

import { cosineSimilarity, EMBEDDING_DIMENSION } from './embeddings';
import type { Creator } from './types';

export type VectorBackend = 'postgres' | 'memory' | 'auto';

export interface EmbeddedCreator {
  creator: Creator;
  searchDocument: string;
  embedding: number[];
}

export interface SearchHit {
  creator: Creator;
  semanticScore: number;
}

export function getVectorBackend(): VectorBackend {
  const backend = (process.env.VECTOR_BACKEND ?? 'postgres').toLowerCase();
  if (backend !== 'postgres' && backend !== 'memory' && backend !== 'auto') {
    throw new Error(
      `Unsupported VECTOR_BACKEND "${process.env.VECTOR_BACKEND}". Use "postgres", "memory", or "auto".`
    );
  }

  return backend;
}

export function hasUsableDatabaseUrl(databaseUrl: string | undefined): databaseUrl is string {
  if (!databaseUrl) {
    return false;
  }

  return !databaseUrl.includes('[password]') && !databaseUrl.includes('[host]');
}

function toPgVector(values: number[]): string {
  return `[${values.map((value) => Number(value.toFixed(8))).join(',')}]`;
}

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!hasUsableDatabaseUrl(databaseUrl)) {
    throw new Error(
      'DATABASE_URL is missing or still uses the placeholder value. Set a real Postgres connection string or switch VECTOR_BACKEND=memory.'
    );
  }

  return new Pool({ connectionString: databaseUrl });
}

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS creators (
      username TEXT PRIMARY KEY,
      bio TEXT NOT NULL,
      content_style_tags TEXT[] NOT NULL,
      projected_score INTEGER NOT NULL,
      metrics JSONB NOT NULL,
      search_document TEXT NOT NULL,
      embedding vector(${EMBEDDING_DIMENSION}) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS creators_embedding_idx
    ON creators
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  `);
}

export async function upsertEmbeddedCreators(records: EmbeddedCreator[]): Promise<void> {
  const pool = createPool();

  try {
    await ensureSchema(pool);

    for (const record of records) {
      const { creator, embedding, searchDocument } = record;
      await pool.query(
        `
          INSERT INTO creators (
            username,
            bio,
            content_style_tags,
            projected_score,
            metrics,
            search_document,
            embedding
          ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::vector)
          ON CONFLICT (username) DO UPDATE SET
            bio = EXCLUDED.bio,
            content_style_tags = EXCLUDED.content_style_tags,
            projected_score = EXCLUDED.projected_score,
            metrics = EXCLUDED.metrics,
            search_document = EXCLUDED.search_document,
            embedding = EXCLUDED.embedding,
            updated_at = NOW()
        `,
        [
          creator.username,
          creator.bio,
          creator.content_style_tags,
          creator.projected_score,
          JSON.stringify(creator.metrics),
          searchDocument,
          toPgVector(embedding),
        ]
      );
    }

    await pool.query('ANALYZE creators;');
  } finally {
    await pool.end();
  }
}

export async function searchPostgres(embedding: number[], limit: number): Promise<SearchHit[]> {
  const pool = createPool();

  try {
    const result = await pool.query<{
      username: string;
      bio: string;
      content_style_tags: string[];
      projected_score: number;
      metrics: Creator['metrics'];
      semantic_score: number;
    }>(
      `
        SELECT
          username,
          bio,
          content_style_tags,
          projected_score,
          metrics,
          1 - (embedding <=> $1::vector) AS semantic_score
        FROM creators
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `,
      [toPgVector(embedding), limit]
    );

    return result.rows.map((row) => ({
      creator: {
        username: row.username,
        bio: row.bio,
        content_style_tags: row.content_style_tags as Creator['content_style_tags'],
        projected_score: row.projected_score,
        metrics: row.metrics,
      },
      semanticScore: Number(row.semantic_score),
    }));
  } finally {
    await pool.end();
  }
}

export function searchMemory(records: EmbeddedCreator[], embedding: number[], limit: number): SearchHit[] {
  return records
    .map((record) => ({
      creator: record.creator,
      semanticScore: cosineSimilarity(record.embedding, embedding),
    }))
    .sort((left, right) => right.semanticScore - left.semanticScore)
    .slice(0, limit);
}

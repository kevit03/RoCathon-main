# RoC Hackathon - Semantic Projected Score Engine

This submission implements a hybrid creator search pipeline that balances:

- semantic relevance from embeddings
- commercial viability from RoC's `projected_score`

The result is a ranker that can surface creators who are both contextually aligned with a query and likely to convert.

## Architecture

The project is split into four layers:

1. `creators.json`
   Raw creator dataset with bios, content tags, performance metrics, and RoC-provided `projected_score`.

2. `scripts/ingest.ts`
   Reads creators, builds searchable text, generates embeddings, and stores them in Postgres with `pgvector`.

3. `src/searchCreators.ts`
   Embeds the incoming query + brand profile, retrieves semantic candidates from the vector store, and reranks them with a convex-combination hybrid scoring formula.

4. `scripts/demo.ts`
   Runs the required challenge query and writes the top results to `output/brand_smart_home_top10.json`.

## Retrieval + Ranking Design

### Search document used for each creator

Each creator is embedded using a single searchable document composed from:

- username
- bio
- content tags
- follower count
- 30-day GMV
- 30-day average views
- engagement rate
- GPM
- audience gender
- audience age ranges

This keeps the vector representation grounded in both style and commercial context.

### Query document

The search query is expanded with the brand profile:

- raw natural-language query
- brand industries
- target audience gender
- target audience age ranges
- brand GMV

That means semantic retrieval is aware of the business context before reranking starts.

### Hybrid scoring formula

For the top semantic candidates, the final score is:

```text
projected_normalized = (projected_score - 60) / 40

final_score =
  100 * (
    alpha * semantic_score +
    (1 - alpha) * projected_normalized
  )
```

This follows the standard convex-combination fusion pattern for hybrid retrieval. In this implementation, `alpha` is derived from the `brandProfile` to slightly shift the balance between semantic discovery and commercial conservatism:

- `semantic_score`
  Cosine similarity between the query embedding and the creator embedding.

- `projected_normalized`
  RoC's `projected_score` normalized from the provided `60-100` range to `0-1`.

- `alpha`
  A brand-aware fusion weight clamped to `[0.55, 0.80]`.

It is computed from:

- brand GMV: higher GMV brands lean slightly more toward commercial conservatism
- industry breadth: multi-industry brands lean slightly more toward semantic exploration
- audience breadth: broader target-age coverage leans slightly more toward semantic exploration

This keeps the final score academically clean while still letting the brand profile influence retrieval behavior.

## Vector Database Schema

The schema lives in `sql/schema.sql`.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS creators (
  username TEXT PRIMARY KEY,
  bio TEXT NOT NULL,
  content_style_tags TEXT[] NOT NULL,
  projected_score INTEGER NOT NULL,
  metrics JSONB NOT NULL,
  search_document TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Similarity search uses `pgvector` cosine distance and an IVFFlat index.

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then set:

- `OPENAI_API_KEY`
- `DATABASE_URL`

Recommended submission settings:

```env
EMBEDDING_PROVIDER=openai
VECTOR_BACKEND=postgres
```

### 3. Enable `pgvector`

Use either:

- Supabase Postgres with `CREATE EXTENSION IF NOT EXISTS vector;`
- local Postgres/Docker with `pgvector`

### 4. Ingest creators

```bash
npm run ingest
```

This will:

- create the schema if needed
- generate embeddings for all creators
- upsert them into the `creators` table

### 5. Run the challenge demo

```bash
npm run demo
```

This runs the required query:

```text
Affordable home decor for small apartments
```

against the `brand_smart_home` profile and writes:

```text
output/brand_smart_home_top10.json
```

## Local Fallback Mode

For local development without Postgres, the project also supports:

```env
EMBEDDING_PROVIDER=local
VECTOR_BACKEND=memory
```

This uses a deterministic hashed embedding fallback and in-memory cosine search. It is convenient for smoke testing, but the intended submission path is still `OpenAI + Postgres/pgvector`.

## Commands

```bash
npm run typecheck
npm run ingest
npm run demo
npm run dashboard
```

Optional demo flags:

```bash
npm run demo -- --brand brand_smart_home --top 10
```

To present the results in the executive dashboard:

```bash
npm run dashboard
```

Then open `http://localhost:4173`.

## Files of Interest

- `src/searchCreators.ts` - hybrid retrieval and convex-combination reranking
- `src/embeddings.ts` - OpenAI + local embedding providers
- `src/vectorStore.ts` - Postgres/pgvector and in-memory search backends
- `src/brandProfiles.ts` - brand profile fixtures including `brand_smart_home`
- `scripts/ingest.ts` - ingestion pipeline
- `scripts/demo.ts` - reproducible demo runner
- `scripts/dashboard.ts` - lightweight local server for the executive presentation UI
- `sql/schema.sql` - database schema
- `dashboard/` - Atlas Brief presentation layer

## Notes

- The local embedding path exists for reproducibility, but OpenAI embeddings are the highest-accuracy option available in this implementation.

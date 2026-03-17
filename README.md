# RoC Hackathon
## Atlas Brief: Semantic Creator Match Intelligence

This project implements a hybrid creator discovery system for the RoC hackathon challenge. It blends semantic relevance from embeddings with RoC's commercial `projected_score` to produce a ranked shortlist of creators that are both contextually aligned and commercially credible.

The repo also includes **Atlas Brief**, a polished executive dashboard designed to present the final recommendations in a CEO-ready format.

## Executive Summary

The ranking engine is built around a simple idea:

- use embeddings to understand meaning, not just keywords
- preserve RoC's business signal instead of discarding it
- combine both with a convex fusion formula that is easy to explain and defend

This makes the system appropriate for brand-side decision making, where "creative fit" and "commercial confidence" both matter.

## Quick Start

### Fastest local demo

If you just want to run the project locally without OpenAI or Postgres:

```bash
npm install
env EMBEDDING_PROVIDER=local VECTOR_BACKEND=memory npm run demo
npm run dashboard
```

Then open:

```text
http://127.0.0.1:4173
```

This will:

- generate the top 10 recommendation set
- write the results to `output/brand_smart_home_top10.json`
- launch the Atlas Brief presentation dashboard

## How To Run The Dashboard

The dashboard reads from the generated output JSON, so run the demo first and then start the dashboard server.

```bash
env EMBEDDING_PROVIDER=local VECTOR_BACKEND=memory npm run demo
npm run dashboard
```

Open:

```text
http://127.0.0.1:4173
```

If you already generated the output file earlier, you only need:

```bash
npm run dashboard
```

## Submission-Grade Setup

For the intended challenge path using OpenAI embeddings and Postgres with `pgvector`:

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Then configure:

```env
OPENAI_API_KEY=your_real_key
EMBEDDING_PROVIDER=openai
VECTOR_BACKEND=postgres
DATABASE_URL=your_real_postgres_url
```

### 3. Enable `pgvector`

Use either:

- Supabase Postgres with `CREATE EXTENSION IF NOT EXISTS vector;`
- local Postgres with the `pgvector` extension installed

### 4. Ingest the creator dataset

```bash
npm run ingest
```

### 5. Generate the challenge output

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

### 6. Present the results

```bash
npm run dashboard
```

## What Atlas Brief Shows

Atlas Brief is the executive presentation layer for the search engine. It includes:

- a refined title and presentation identity
- headline KPI cards
- a featured top recommendation
- an executive readout of the shortlist
- category distribution analysis
- a polished ranked-candidate view with score breakdowns
- the underlying scoring formula and runtime metadata

The goal is to make the technical output feel presentation-ready instead of raw JSON.

## Ranking Methodology

### Retrieval

Each creator is embedded using a search document composed from:

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

The incoming search query is expanded with the brand profile:

- brand industries
- target audience gender
- target audience age ranges
- brand GMV

This makes retrieval aware of both semantic intent and business context before reranking.

### Fusion Formula

The final ranking uses a convex combination:

```text
projected_normalized = (projected_score - 60) / 40

final_score =
  100 * (
    alpha * semantic_score +
    (1 - alpha) * projected_normalized
  )
```

Where:

- `semantic_score` is cosine similarity between the query embedding and creator embedding
- `projected_normalized` rescales RoC's `projected_score` from `60-100` to `0-1`
- `alpha` is a brand-aware weight derived from the `brandProfile`

The result is a scoring system that stays explainable while still allowing the brand context to influence how aggressively the system prioritizes semantic discovery versus commercial conservatism.

## Architecture

The project is organized into four layers:

1. **Dataset**
   `creators.json` stores the creator corpus and RoC's structured business metrics.

2. **Embedding + Storage**
   `scripts/ingest.ts`, `src/embeddings.ts`, and `src/vectorStore.ts` generate embeddings and store them in Postgres with `pgvector`.

3. **Search + Ranking**
   `src/searchCreators.ts` retrieves semantic candidates and applies the convex fusion formula.

4. **Presentation**
   `scripts/demo.ts` writes the challenge output JSON, and `dashboard/` renders the Atlas Brief executive dashboard.

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

Similarity search uses cosine distance through `pgvector` and an IVFFlat index.

## Commands

```bash
npm run typecheck
npm run ingest
npm run demo
npm run dashboard
```

Optional demo arguments:

```bash
npm run demo -- --brand brand_smart_home --top 10
```

## Repository Guide

- `src/searchCreators.ts` - core hybrid search and ranking logic
- `src/embeddings.ts` - OpenAI and local embedding providers
- `src/vectorStore.ts` - Postgres/pgvector and in-memory retrieval backends
- `src/brandProfiles.ts` - brand fixtures including `brand_smart_home`
- `scripts/ingest.ts` - ingestion pipeline
- `scripts/demo.ts` - reproducible challenge runner
- `scripts/dashboard.ts` - local server for Atlas Brief
- `dashboard/` - executive presentation frontend
- `sql/schema.sql` - Postgres schema
- `output/brand_smart_home_top10.json` - generated challenge result set

## Notes

- The local mode exists for easy testing and presentation without external services.
- The highest-accuracy path is still `OpenAI + Postgres/pgvector`.
- Run the demo again whenever you want to refresh the data shown in Atlas Brief.

# Atlas Brief
## Semantic Creator Match Intelligence for the RoC Hackathon

Atlas Brief is a hybrid creator-screening system built for the RoC challenge. It combines:

- semantic relevance from embeddings
- RoC's business-side `projected_score`
- a clean product experience with a guided home page, interactive demo, and compact methodology appendix

Instead of dropping reviewers straight into a dashboard, Atlas now opens with a product-style walkthrough that explains what the system is, what terms like `GMV` mean, and how the scoring works before users enter the live demo.

## Product Flow

Atlas Brief is now split into three surfaces:

1. `Home`
   A guided landing page that explains Atlas, defines the core industry terms, and introduces the walkthrough.

2. `Demo`
   The live analytics console where users filter creators, inspect the Atlas Score, open charts, and run the campaign advisor.

3. `Method`
   A shorter methodology appendix with expandable details for reviewers who want the formulas and research rationale.

![Atlas flow](dashboard/atlas-flow.svg)

## Quick Start

### Fastest local path

If you want the full experience locally without OpenAI or Postgres:

```bash
npm install
env EMBEDDING_PROVIDER=local VECTOR_BACKEND=memory npm run demo
npm run dashboard
```

Then open:

- `http://127.0.0.1:4173/` for the guided home page
- `http://127.0.0.1:4173/demo.html` for the live demo
- `http://127.0.0.1:4173/methodology.html` for the methodology page

This path:

- generates the challenge output JSON
- launches the Atlas Brief web experience
- avoids external API and database setup

## What The Reviewer Sees

### Home page

The landing page explains:

- what Atlas is
- what `GMV`, `projected score`, `semantic fit`, and `audience fit` mean
- what happens inside the demo

### Demo

The demo includes:

- brand-profile switching
- creator filtering by type and industry
- a selected-creator Atlas Score breakdown
- a 2x2 analytics grid
- hover magnification and click-to-pin chart expansion
- a three-question campaign advisor

### Methodology

The methodology page keeps the math out of the main product and presents:

- the official challenge formula
- the Atlas screening formula
- short research-backed explanations
- expandable long-form details only when needed

## How To Run The Dashboard

Atlas Brief reads from the generated challenge output, so the demo data should exist first.

```bash
env EMBEDDING_PROVIDER=local VECTOR_BACKEND=memory npm run demo
npm run dashboard
```

If the output JSON already exists, you can just run:

```bash
npm run dashboard
```

## Submission-Grade Setup

For the intended production-style path using OpenAI embeddings and Postgres with `pgvector`:

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

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

### 4. Ingest creators

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

### 6. Open Atlas Brief

```bash
npm run dashboard
```

## Ranking Overview

### Official challenge ranker

The required challenge formula uses a convex combination:

```text
projected_normalized = (projected_score - 60) / 40

final_score =
  100 * (
    alpha * semantic_score +
    (1 - alpha) * projected_normalized
  )
```

Why this matters:

- semantic relevance captures meaning, not just keywords
- `projected_score` preserves RoC's existing business signal
- convex fusion keeps the score explainable and defensible

### Atlas Score

The live demo uses a separate screening score for exploring the full creator universe:

- `38%` profile fit
- `27%` query overlap
- `15%` audience fit
- `20%` commercial quality

That score is for exploration and explanation. The official challenge ranker remains preserved separately.

## Architecture

The project is organized into four layers:

1. `Dataset`
   `creators.json` stores the creator corpus and structured business metrics.

2. `Embedding + storage`
   `scripts/ingest.ts`, `src/embeddings.ts`, and `src/vectorStore.ts` generate embeddings and store them in Postgres with `pgvector`.

3. `Search + ranking`
   `src/searchCreators.ts` retrieves semantic candidates and applies the challenge scoring logic.

4. `Presentation`
   `scripts/demo.ts` generates the challenge output JSON and `dashboard/` serves the Atlas Brief product frontend.

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

- `src/searchCreators.ts` - hybrid search and ranking logic
- `src/embeddings.ts` - OpenAI and local embedding providers
- `src/vectorStore.ts` - Postgres/pgvector and in-memory retrieval backends
- `src/brandProfiles.ts` - brand fixtures including `brand_smart_home`
- `scripts/ingest.ts` - ingestion pipeline
- `scripts/demo.ts` - reproducible challenge runner
- `scripts/dashboard.ts` - local Atlas Brief server
- `dashboard/index.html` - guided product landing page
- `dashboard/demo.html` - live analytics console
- `dashboard/methodology.html` - methodology appendix
- `dashboard/atlas-hero.svg` - branded hero visual
- `dashboard/atlas-flow.svg` - system flow visual
- `sql/schema.sql` - Postgres schema
- `output/brand_smart_home_top10.json` - generated challenge result set

## Notes

- The local mode exists for easy review and presentation without external services.
- The highest-accuracy path is still `OpenAI + Postgres/pgvector`.
- Re-run `npm run demo` whenever you want to refresh the data shown in Atlas Brief.

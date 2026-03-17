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

CREATE INDEX IF NOT EXISTS creators_embedding_idx
ON creators
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

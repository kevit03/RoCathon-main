import * as dotenv from 'dotenv';
dotenv.config();

import { buildBrandSearchDocument, buildCreatorSearchDocument, loadCreators } from './creators';
import { embedText, embedTexts } from './embeddings';
import type { BrandProfile, Creator, RankedCreator } from './types';
import { getVectorBackend, hasUsableDatabaseUrl, searchMemory, searchPostgres } from './vectorStore';

const SEMANTIC_CANDIDATE_LIMIT = 50;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4): number {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

function normalizeProjectedScore(projectedScore: number): number {
  return clamp((projectedScore - 60) / 40);
}

function deriveAlpha(brandProfile: BrandProfile): number {
  const gmvRatio = clamp(Math.log1p(Math.max(brandProfile.gmv, 1)) / Math.log1p(1_000_000));
  const industryBreadthBoost = brandProfile.industries.length > 1 ? 0.05 : 0;
  const audienceBreadthBoost =
    brandProfile.target_audience.age_ranges.length > 2 ? 0.03 : 0;

  return clamp(0.72 - 0.12 * gmvRatio + industryBreadthBoost + audienceBreadthBoost, 0.55, 0.8);
}

async function fetchSemanticCandidates(
  queryEmbedding: number[]
): Promise<Array<{ creator: Creator; semanticScore: number }>> {
  const backend = getVectorBackend();
  const shouldUsePostgres =
    backend === 'postgres' ||
    (backend === 'auto' && hasUsableDatabaseUrl(process.env.DATABASE_URL));

  if (shouldUsePostgres) {
    const hits = await searchPostgres(queryEmbedding, SEMANTIC_CANDIDATE_LIMIT);
    return hits.map((hit) => ({
      creator: hit.creator,
      semanticScore: clamp(hit.semanticScore),
    }));
  }

  const creators = await loadCreators();
  const documents = creators.map(buildCreatorSearchDocument);
  const embeddings = await embedTexts(documents);
  const hits = searchMemory(
    creators.map((creator, index) => ({
      creator,
      searchDocument: documents[index],
      embedding: embeddings[index],
    })),
    queryEmbedding,
    SEMANTIC_CANDIDATE_LIMIT
  );

  return hits.map((hit) => ({
    creator: hit.creator,
    semanticScore: clamp((hit.semanticScore + 1) / 2),
  }));
}

/**
 * Search and rank creators for a given natural-language query and brand profile.
 *
 * Your implementation should:
 * 1. Embed the query using a vector embedding model (OpenAI or local)
 * 2. Retrieve the top-N most semantically similar creators from your vector DB
 * 3. Combine semantic_score with projected_score (and any other signals you choose)
 *    to produce a final_score
 * 4. Return the ranked list with scores attached
 *
 * The brandProfile gives you context about the brand's target audience and category.
 * How you use it (or don't) is part of your design.
 */
export async function searchCreators(
  query: string,
  brandProfile: BrandProfile
): Promise<RankedCreator[]> {
  const semanticQuery = buildBrandSearchDocument(query, brandProfile);
  const queryEmbedding = await embedText(semanticQuery);
  const candidates = await fetchSemanticCandidates(queryEmbedding);
  const alpha = deriveAlpha(brandProfile);

  return candidates
    .map(({ creator, semanticScore }) => {
      const rankedCreator: RankedCreator = {
        ...creator,
        scores: {
          semantic_score: round(semanticScore),
          projected_score: creator.projected_score,
          final_score: 0,
        },
      };

      const projectedScore = normalizeProjectedScore(creator.projected_score);
      const finalScore = 100 * clamp(alpha * semanticScore + (1 - alpha) * projectedScore);

      rankedCreator.scores.final_score = round(finalScore, 2);
      return rankedCreator;
    })
    .sort((left, right) => right.scores.final_score - left.scores.final_score);
}

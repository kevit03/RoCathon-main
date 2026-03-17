import OpenAI from 'openai';

export type EmbeddingProvider = 'openai' | 'local';

export const EMBEDDING_DIMENSION = 1536;
const LOCAL_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'with',
]);

let openAIClient: OpenAI | null = null;

function getEmbeddingProvider(): EmbeddingProvider {
  const provider = (process.env.EMBEDDING_PROVIDER ?? 'openai').toLowerCase();
  if (provider !== 'openai' && provider !== 'local') {
    throw new Error(
      `Unsupported EMBEDDING_PROVIDER "${process.env.EMBEDDING_PROVIDER}". Use "openai" or "local".`
    );
  }

  return provider;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai.');
  }

  if (!openAIClient) {
    openAIClient = new OpenAI({ apiKey });
  }

  return openAIClient;
}

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return values;
  }

  return values.map((value) => value / magnitude);
}

function hashToken(token: string, seed: number): number {
  let hash = 2166136261 ^ seed;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  return normalized
    .split(' ')
    .filter((token) => token.length > 1 && !LOCAL_STOP_WORDS.has(token));
}

function buildFeatureTokens(text: string): string[] {
  const tokens = tokenize(text);
  const features = [...tokens];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    features.push(`${tokens[index]}_${tokens[index + 1]}`);
  }

  const compact = text.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let index = 0; index < compact.length - 2; index += 1) {
    const trigram = compact.slice(index, index + 3);
    if (trigram.includes(' ')) {
      continue;
    }
    features.push(`tri:${trigram}`);
  }

  return features;
}

function embedLocally(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const features = buildFeatureTokens(text);

  for (const feature of features) {
    const bucket = hashToken(feature, 17) % EMBEDDING_DIMENSION;
    const sign = (hashToken(feature, 29) & 1) === 0 ? 1 : -1;
    const weight = feature.startsWith('tri:') ? 0.25 : feature.includes('_') ? 1.35 : 1;
    vector[bucket] += sign * weight;
  }

  return normalizeVector(vector);
}

async function embedWithOpenAI(texts: string[]): Promise<number[][]> {
  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });

  return response.data.map((item) => item.embedding);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const provider = getEmbeddingProvider();
  if (provider === 'local') {
    return texts.map((text) => embedLocally(text));
  }

  return embedWithOpenAI(texts);
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  let sum = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    sum += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return sum / Math.sqrt(leftMagnitude * rightMagnitude);
}

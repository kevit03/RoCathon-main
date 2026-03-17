import fs from 'fs/promises';
import path from 'path';

import type { BrandProfile, Creator } from './types';

const CREATORS_PATH = path.resolve(__dirname, '..', 'creators.json');

export async function loadCreators(): Promise<Creator[]> {
  const raw = await fs.readFile(CREATORS_PATH, 'utf8');
  return JSON.parse(raw) as Creator[];
}

export function buildCreatorSearchDocument(creator: Creator): string {
  return [
    creator.username,
    creator.bio,
    `Content tags: ${creator.content_style_tags.join(', ')}`,
    `Follower count: ${creator.metrics.follower_count}`,
    `GMV 30d: ${creator.metrics.total_gmv_30d}`,
    `Average views 30d: ${creator.metrics.avg_views_30d}`,
    `Engagement rate: ${creator.metrics.engagement_rate}`,
    `GPM: ${creator.metrics.gpm}`,
    `Audience gender: ${creator.metrics.demographics.major_gender}`,
    `Audience age ranges: ${creator.metrics.demographics.age_ranges.join(', ')}`,
  ].join('. ');
}

export function buildBrandSearchDocument(query: string, brandProfile: BrandProfile): string {
  return [
    query,
    `Brand industries: ${brandProfile.industries.join(', ')}`,
    `Target audience gender: ${brandProfile.target_audience.gender}`,
    `Target audience ages: ${brandProfile.target_audience.age_ranges.join(', ')}`,
    `Brand GMV: ${brandProfile.gmv}`,
  ].join('. ');
}

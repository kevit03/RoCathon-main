import type { BrandProfile } from './types';

export const brandProfiles: Record<string, BrandProfile> = {
  brand_smart_home: {
    id: 'brand_smart_home',
    industries: ['Home', 'Phones & Electronics'],
    target_audience: {
      gender: 'FEMALE',
      age_ranges: ['25-34', '35-44'],
    },
    gmv: 425000,
  },
  brand_outdoor_gear: {
    id: 'brand_outdoor_gear',
    industries: ['Sports & Outdoors', 'Tools & Hardware'],
    target_audience: {
      gender: 'MALE',
      age_ranges: ['25-34', '35-44'],
    },
    gmv: 380000,
  },
};

export function getBrandProfile(id: string): BrandProfile {
  const profile = brandProfiles[id];
  if (!profile) {
    throw new Error(`Unknown brand profile "${id}".`);
  }

  return profile;
}

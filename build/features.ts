import type { FeatureConfig, SiteVariables } from './types';

export function isFeatureEnabled(
  siteVariables: SiteVariables,
  featureName: keyof FeatureConfig,
): boolean {
  return siteVariables.features[featureName] !== false;
}

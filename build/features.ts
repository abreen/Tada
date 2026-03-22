import type { SiteVariables } from './types';

export function isFeatureEnabled(
  siteVariables: SiteVariables,
  featureName: string,
): boolean {
  return (
    siteVariables.features?.[featureName as keyof SiteVariables['features']] !==
    false
  );
}

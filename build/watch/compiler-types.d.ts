import type { SiteVariables } from '../types';

export interface TraceCacheEntry {
  manifestUrl: string;
  highlightedSource: string;
  totalSteps: number;
  mtime: number;
}

export type TraceCache = Map<string, TraceCacheEntry>;

export interface TadaBuildMeta {
  htmlAssetsByPath: Map<string, string>;
  siteVariables: SiteVariables;
}

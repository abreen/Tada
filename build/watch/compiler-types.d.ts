import type {
  HtmlOutputAnalysis,
  SiteVariables,
  TraceToolAvailability,
} from '../types';

export interface TraceCacheEntry {
  manifestUrl: string;
  highlightedSource: string;
  totalSteps: number;
  mtime: number;
}

export type TraceCache = Map<string, TraceCacheEntry>;

export interface TadaBuildMeta {
  htmlAssetsByPath: Map<string, string>;
  htmlAnalysisByPath: Map<string, HtmlOutputAnalysis>;
  siteVariables: SiteVariables;
}

export interface WatchTraceOptions {
  toolAvailability: TraceToolAvailability;
}

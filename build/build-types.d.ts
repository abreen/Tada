import type {
  HtmlOutputAnalysis,
  SiteVariables,
  TraceArtifactFile,
  TraceToolAvailability,
} from './types';

/** A finished trace, keyed in the cache by its traced source files */
export interface TraceCacheEntry {
  artifactId: string;
  /** Manifest and chunk files, re-emitted on a cache hit */
  files: TraceArtifactFile[];
  highlightedSources: { file: string; highlightedSource: string }[];
  totalSteps: number;
  sourceMtims: Record<string, number>;
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

export interface BuildDiagnostic {
  message: string;
}

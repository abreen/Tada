import type { BundledLanguage } from 'shiki';
import type { TadaProjectScan } from './source-model';

export type PlainTextLanguage = 'text' | 'txt' | 'plain';

/** Site configuration loaded from site.dev.yaml/yml/json or site.prod.yaml/yml/json */
export interface SiteVariables {
  base: string;
  basePath: string;
  title: string;
  titlePostfix: string;
  symbol?: string;
  faviconSymbol?: string;
  themeColor: string;
  faviconColor?: string;
  faviconFontWeight?: number;
  internalDomains?: string[];
  defaultTimeZone: string;
  features: FeatureConfig;
  extensionToShikiLanguage?: Record<
    string,
    BundledLanguage | PlainTextLanguage
  >;
  shikiLanguages?: BundledLanguage[];
  tintHue?: number;
  tintAmount?: number;
  vars?: Record<string, unknown>;
}

export type FeatureConfig = {
  search: boolean;
  favicon: boolean;
  footer: boolean;
};

/** A rendered content asset ready to write to dist/ */
export interface HtmlOutputAnalysis {
  outgoingTargets: Set<string>;
}

export interface Asset {
  assetPath: string;
  content: string | Buffer;
  htmlAnalysis?: HtmlOutputAnalysis;
}

/** Options for the content rendering pipeline */
export interface ContentRenderOptions {
  distDir: string;
  assetFiles: string[];
  scan: TadaProjectScan;
}

/** Result from ContentRenderer.processContent() */
export interface ContentRenderResult {
  errors: Error[];
  htmlAssetsByPath: Map<string, string>;
  htmlAnalysisByPath: Map<string, HtmlOutputAnalysis>;
}

/** Logger returned by makeLogger() */
export interface Logger {
  minLogLevel: string;
  setMinLogLevel(level: string): void;
  debug(strings: TemplateStringsArray, ...args: unknown[]): void;
  info(strings: TemplateStringsArray, ...args: unknown[]): void;
  warn(strings: TemplateStringsArray, ...args: unknown[]): void;
  error(strings: TemplateStringsArray, ...args: unknown[]): void;
  event(strings: TemplateStringsArray, ...args: unknown[]): void;
  followup(strings: string[]): void;
}

/** Options for plain text asset rendering */
export interface RenderPlainTextOptions {
  filePath: string;
  contentDir: string;
  distDir: string;
  siteVariables: SiteVariables;
  validInternalTargets: Set<string>;
  assetFiles: string[];
  literateJavaOutputPaths?: Set<string>;
  dependencyCollector?: RenderDependencyCollector;
  cachedTraceSourceDir?: string;
  traceCache?: Map<
    string,
    {
      manifestUrl: string;
      artifactId: string;
      highlightedSources: { file: string; highlightedSource: string }[];
      totalSteps: number;
      sourceMtims: Record<string, number>;
    }
  >;
  traceToolAvailability?: TraceToolAvailability;
}

export interface TraceToolAvailability {
  java?: boolean;
  python?: boolean;
}

/** Options for code page asset rendering */
export interface RenderCodePageOptions {
  filePath: string;
  contentDir: string;
  distDir: string;
  siteVariables: SiteVariables;
  assetFiles: string[];
  validInternalTargets: Set<string>;
  literateJavaOutputPaths?: Set<string>;
  dependencyCollector?: RenderDependencyCollector;
}

/** Options for literate Java asset rendering */
export interface RenderLiterateJavaOptions {
  filePath: string;
  contentDir: string;
  distDir: string;
  siteVariables: SiteVariables;
  assetFiles: string[];
  skipExecution?: boolean;
  validInternalTargets: Set<string>;
  literateJavaOutputPaths?: Set<string>;
  dependencyCollector?: RenderDependencyCollector;
}

/** Options for copied content asset rendering */
export interface RenderCopiedContentOptions {
  filePath: string;
  contentDir: string;
  siteVariables: SiteVariables;
}

export interface RenderDependencyCollector {
  partials?: Set<string>;
  traceFiles?: Set<string>;
  internalTargets?: Set<string>;
  generatedOutputPaths?: Set<string>;
  setAuthorKey?: (authorKey: string) => void;
}

/** Front matter parse result (from parseFrontMatterAndContent) */
export interface ParsedContent {
  pageVariables: Record<string, unknown>;
  content: string;
}

/** Front matter parse result (from parseFrontMatter) */
export interface ParsedFrontMatter {
  frontMatter: Record<string, unknown>;
  content: string;
}

/** Theme derivation result */
export interface DerivedTheme {
  themeColorLight: string;
  themeColorDark: string;
  themeColorTextLight: string;
  themeColorTextDark: string;
  textOnThemeLight: string;
  textOnThemeDark: string;
}

/** Java code TOC entry from extractJavaMethodToc */
export interface JavaTocEntry {
  kind: 'method' | 'constructor' | 'field';
  label: string;
  name: string;
  line: number;
}

/** Heading TOC item collected by toc-plugin */
export interface HeadingTocItem {
  id: string;
  text: string;
  level: number;
  subtitle?: string;
}

/** Literate Java code block */
export interface LiterateCodeBlock {
  javaStartLine: number;
  javaEndLine: number;
  content: string;
  hidden: boolean;
}

/** Result from parseLiterateJava */
export interface LiterateJavaParseResult {
  pageVariables: Record<string, unknown>;
  content: string;
  javaSource: string;
  codeBlocks: LiterateCodeBlock[];
  visibleBlockIndices: number[];
}

/** Execution output entry from LiterateRunner */
export interface LiterateRunnerEntry {
  blockIndex: number;
  output: string;
}

/** A single execution step captured by TraceRunner */
export interface TraceStep {
  line: number;
  file: string;
  stack: TraceStackFrame[];
  heap: Record<string, TraceHeapObject>;
  output?: TraceOutputEvent[];
}

export interface TraceOutputEvent {
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface TraceStackFrame {
  method: string;
  class: string;
  line?: number;
  locals: Record<string, TraceValue>;
}

export type TraceValue =
  | {
      type: 'int' | 'long' | 'short' | 'byte' | 'float' | 'double';
      value: number;
    }
  | { type: 'boolean'; value: boolean }
  | { type: 'char' | 'String'; value: string }
  | { type: 'null' }
  | { type: 'ref'; id: string }
  | { type: 'unknown' }
  | { type: 'uninitialized' }
  | { type: 'truncated'; remaining: number };

export type TraceHeapObject =
  | { type: string; elements: TraceValue[] }
  | { type: string; fields: Record<string, TraceValue> }
  | { type: string; value: string | number | boolean };

/** Manifest written alongside trace chunks */
export interface TraceManifest {
  totalSteps: number;
  chunkSize: number;
  primaryFile: string;
  sources: TraceSource[];
}

export interface TraceSource {
  file: string;
  source: string;
  lineToSteps: Record<number, number[]>;
}

/** Position and size of a heap object in the precomputed layout. */
export interface TraceObjectLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  /** For field objects, x-offset where value boxes start. */
  valueX?: number;
  /** For arrays, width of each cell. */
  cellWidth?: number;
  /** Field names that are structural children in the tree layout. */
  childFields?: string[];
}

/** A precomputed layout for the entire trace (all steps). */
export interface TraceLayout {
  /** Stable position for every heap object that ever exists. */
  objects: Record<string, TraceObjectLayout>;
  /** Fields to ignore for layout on each class (from @trace-ignore). */
  ignoreFields: Record<string, string[]>;
}

/** A single entry in a chunk file (new format with precomputed SVG). */
export interface TraceChunkEntry {
  file: string;
  line: number;
  output?: TraceOutputEvent[];
  svg: string;
}

/** Site config creation input (used by bin/validators) */
export interface SiteConfigInput {
  title: string;
  symbol: string;
  themeColor: string;
  tintHue: string;
  tintAmount: string;
  defaultTimeZone: string;
  base: string;
  basePath: string;
  internalDomains: string[];
  features: FeatureConfig;
  extensionToShikiLanguage: Record<string, BundledLanguage | PlainTextLanguage>;
  shikiLanguages: BundledLanguage[];
}

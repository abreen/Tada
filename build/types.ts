/** Site configuration loaded from site.dev.json or site.prod.json */
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
  features?: FeatureConfig;
  codeLanguages?: Record<string, string>;
  tintHue?: number;
  tintAmount?: number;
  vars?: Record<string, unknown>;
}

export type FeatureConfig = {
  search: boolean;
  code: boolean;
  favicon: boolean;
};

/** A rendered content asset ready to write to dist/ */
export interface Asset {
  assetPath: string;
  content: string | Buffer;
}

/** Options for the content rendering pipeline */
export interface ContentRenderOptions {
  distDir: string;
  assetFiles: string[];
  watchState?: WatchState;
}

/** State passed from watch mode to control incremental rebuilds */
export interface WatchState {
  changedContentFiles?: Set<string>;
  jsonDataChanged?: boolean;
  partialsChanged?: boolean;
}

/** Result from ContentRenderer.processContent() */
export interface ContentRenderResult {
  errors: Error[];
  changedHtmlAssetPaths: Set<string>;
  removedHtmlAssetPaths: Set<string>;
  htmlAssetsByPath: Map<string, string>;
  buildContentFiles: string[];
}

/** Logger returned by makeLogger() */
export interface Logger {
  minLogLevel: string;
  setMinLogLevel(level: string): void;
  getArgs(
    level: string,
    strings: TemplateStringsArray | string | string[],
    args: unknown[],
    colorFn: (strings: TemplateStringsArray, ...args: unknown[]) => string,
  ): string[];
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
  traceCache?: Map<
    string,
    { manifestUrl: string; highlightedSource: string; totalSteps: number }
  >;
}

/** Options for code page asset rendering */
export interface RenderCodePageOptions {
  filePath: string;
  contentDir: string;
  distDir: string;
  siteVariables: SiteVariables;
  assetFiles: string[];
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
}

/** Options for copied content asset rendering */
export interface RenderCopiedContentOptions {
  filePath: string;
  contentDir: string;
  siteVariables: SiteVariables;
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
  stdout: string;
}

export interface TraceStackFrame {
  method: string;
  class: string;
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
  | { type: string; value: string };

/** Manifest written alongside trace chunks */
export interface TraceManifest {
  totalSteps: number;
  chunkSize: number;
  sourceFile: string;
  source: string;
  lineToSteps: Record<number, number[]>;
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
}

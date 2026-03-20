declare module 'wawoff2' {
  export function compress(input: Buffer | Uint8Array): Promise<Uint8Array>;
  export function decompress(input: Buffer | Uint8Array): Promise<Uint8Array>;
}

declare module 'pagefind' {
  interface PagefindIndex {
    addHTMLFile(file: {
      sourcePath: string;
      content: string;
    }): Promise<{ errors: string[] }>;
    addCustomRecord(record: {
      url: string;
      content: string;
      language: string;
      meta: Record<string, string>;
    }): Promise<{ errors: string[] }>;
    writeFiles(options: { outputPath: string }): Promise<{ errors: string[] }>;
    deleteIndex(): Promise<void>;
  }

  export function createIndex(options?: {
    keepIndexUrl?: boolean;
    verbose?: boolean;
  }): Promise<{ index: PagefindIndex | null; errors: string[] }>;

  export function close(): Promise<void>;
}

declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string | Buffer, options?: Record<string, unknown>);
    static fragment(html: string): DocumentFragment;
    readonly window: DOMWindow;
  }

  interface DOMWindow extends Window {
    close(): void;
  }
}

declare module 'java-parser' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function parse(source: string): any;
}

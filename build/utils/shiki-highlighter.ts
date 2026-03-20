import type { HighlighterGeneric, BundledLanguage, BundledTheme } from 'shiki';
import { makeLogger } from '../log.js';

const log = makeLogger(__filename);

let highlighter: HighlighterGeneric<BundledLanguage, BundledTheme> | null =
  null;

export async function initHighlighter(langs: string[]): Promise<void> {
  if (highlighter) {
    return;
  }
  log.debug`Initializing syntax highlighter`;
  const { createHighlighter } = await import('shiki');
  highlighter = await createHighlighter({
    themes: ['github-light', 'github-dark'],
    langs,
  });
}

export function getHighlighter(): HighlighterGeneric<
  BundledLanguage,
  BundledTheme
> {
  if (!highlighter) {
    throw new Error('Shiki highlighter not initialized');
  }
  return highlighter;
}

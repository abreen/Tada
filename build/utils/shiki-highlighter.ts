import type {
  HighlighterGeneric,
  BundledLanguage,
  BundledTheme,
  ThemeRegistrationAny,
} from 'shiki';
import { makeLogger } from '../log';
import type { PlainTextLanguage } from '../types';

const log = makeLogger(import.meta.url);
const COMMENT_COLOR = 'var(--fg2-color)';
const SHIKI_THEMES = {
  light: 'tada-github-light',
  dark: 'tada-github-dark',
} as const;
const COMMENT_SCOPES = [
  'comment',
  'punctuation.definition.comment',
  'string.comment',
];

let highlighter: HighlighterGeneric<BundledLanguage, BundledTheme> | null =
  null;

async function createThemeWithCommentOverride(
  themeName: 'github-light' | 'github-dark',
  customName: 'tada-github-light' | 'tada-github-dark',
): Promise<ThemeRegistrationAny> {
  const { bundledThemes } = await import('shiki');
  const theme = (await bundledThemes[themeName]()).default;
  return {
    ...theme,
    name: customName,
    tokenColors: [
      ...(theme.tokenColors ?? []),
      { scope: COMMENT_SCOPES, settings: { foreground: COMMENT_COLOR } },
    ],
  };
}

export async function initHighlighter(
  langs: Array<BundledLanguage | PlainTextLanguage>,
): Promise<void> {
  const langsWithFallback = [
    ...new Set<BundledLanguage | PlainTextLanguage>(['text', ...langs]),
  ];
  if (!highlighter) {
    log.debug`Initializing syntax highlighter`;
    const { createHighlighter } = await import('shiki');
    const themes = await Promise.all([
      createThemeWithCommentOverride('github-light', 'tada-github-light'),
      createThemeWithCommentOverride('github-dark', 'tada-github-dark'),
    ]);
    highlighter = await createHighlighter({ themes, langs: langsWithFallback });
    return;
  }

  const missingLangs = langsWithFallback.filter(
    lang => !highlighter!.getLoadedLanguages().includes(lang),
  );
  if (missingLangs.length > 0) {
    log.debug`Loading additional syntax languages: ${missingLangs.join(', ')}`;
    await highlighter.loadLanguage(...missingLangs);
  }
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

export function highlightCode(code: string, lang: string): string {
  return getHighlighter().codeToHtml(code, {
    lang,
    themes: SHIKI_THEMES,
    defaultColor: false,
  });
}

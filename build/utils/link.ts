const SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function isInternalLink(href: string | undefined): boolean {
  if (!href || href.startsWith('#') || href.startsWith('//')) {
    return false;
  }
  return !SCHEME_RE.test(href);
}

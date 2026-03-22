export type SubResult = { title: string; url: string; excerpt: string };
export type Result = {
  title: string;
  url: string;
  excerpt: string;
  score: number;
  subResults: SubResult[];
  pageNumber: number | null;
};

export function getPdfPageNumber(
  url: string,
  pageMeta: string | undefined,
): number | null {
  const fromMeta = Number.parseInt(pageMeta ?? '', 10);
  if (Number.isInteger(fromMeta) && fromMeta > 0) {
    return fromMeta;
  }
  const match = url.match(/#(?:.*&)?page=(\d+)\b/i);
  if (!match) {
    return null;
  }
  const fromUrl = Number.parseInt(match[1], 10);
  return Number.isInteger(fromUrl) && fromUrl >= 1 ? fromUrl : null;
}

export function getPdfBaseUrl(url: string): string | null {
  const hashIndex = url.indexOf('#');
  const baseUrl = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  return baseUrl.toLowerCase().endsWith('.pdf') ? baseUrl : null;
}

export function groupPdfResults(results: Result[]): Result[] {
  const pdfGroups = new Map<string, Result[]>();
  const other: Result[] = [];

  for (const result of results) {
    const baseUrl = getPdfBaseUrl(result.url);
    if (!baseUrl || result.pageNumber == null) {
      other.push(result);
      continue;
    }
    if (!pdfGroups.has(baseUrl)) {
      pdfGroups.set(baseUrl, []);
    }
    pdfGroups.get(baseUrl)!.push(result);
  }

  const grouped: Result[] = [...other];

  pdfGroups.forEach((pages, baseUrl) => {
    const primary = pages
      .slice()
      .sort(
        (a, b) =>
          b.score - a.score || (a.pageNumber ?? 0) - (b.pageNumber ?? 0),
      )[0];
    const subResults = pages
      .slice()
      .sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0))
      .map(page => ({
        title: `Page ${page.pageNumber ?? '?'}`,
        url: page.url,
        excerpt: page.excerpt,
      }));

    grouped.push({
      title: primary.title,
      url: baseUrl,
      excerpt: primary.excerpt,
      score: primary.score,
      subResults,
      pageNumber: null,
    });
  });

  grouped.sort((a, b) => b.score - a.score);
  return grouped;
}

const NON_HTML_EXTENSIONS = new Set([
  '.pdf',
  '.java',
  '.py',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.zip',
  '.tar',
  '.gz',
  '.json',
  '.xml',
  '.css',
  '.js',
  '.ts',
  '.c',
  '.h',
  '.cpp',
  '.rb',
  '.go',
  '.rs',
  '.txt',
  '.csv',
  '.ico',
  '.woff2',
  '.mp4',
  '.mp3',
]);

export function isEligibleLink(
  href: string,
  origin: string,
  basePath: string,
): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }

  if (url.origin !== origin) {
    return false;
  }

  if (!url.pathname.startsWith(basePath)) {
    return false;
  }

  const path = url.pathname;
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = path.slice(dotIndex).toLowerCase();
    if (NON_HTML_EXTENSIONS.has(ext)) {
      return false;
    }
  }

  return true;
}

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

  const normalizedBasePath = basePath.endsWith('/')
    ? basePath.slice(0, -1) || '/'
    : basePath;
  if (
    normalizedBasePath !== '/' &&
    url.pathname !== normalizedBasePath &&
    !url.pathname.startsWith(`${normalizedBasePath}/`)
  ) {
    return false;
  }

  return true;
}

/** Query parameter Pagefind adds to result links, once per search term */
export const HIGHLIGHT_PARAM = 'pagefind-highlight';

/**
 * Removes the search terms from a link to a file that cannot highlight them,
 * such as a PDF. Relative URLs stay relative and the fragment is kept.
 */
export function removeHighlightParam(url: string): string {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const queryIndex = beforeHash.indexOf('?');
  if (queryIndex < 0) {
    return url;
  }
  const params = new URLSearchParams(beforeHash.slice(queryIndex + 1));
  params.delete(HIGHLIGHT_PARAM);
  const query = params.toString();
  return `${beforeHash.slice(0, queryIndex)}${query ? `?${query}` : ''}${hash}`;
}

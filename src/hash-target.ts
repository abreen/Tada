/*
 * markdown-it-anchor's slugifier uses encodeURIComponent() so generated
 * heading IDs can safely be used as URL hashes.
 *
 * Tada also allows raw HTML, so an author can create a decoded ID like
 * <h2 id="hello world">Hello</h2>. A link to that target becomes
 * #hello%20world, and getElementById('hello%20world') would not find it.
 */
export function getHashTarget(
  document: Document,
  hash: string,
): HTMLElement | null {
  const id = hash.slice(1);
  if (!id) {
    return null;
  }

  const rawTarget = document.getElementById(id);
  if (rawTarget) {
    return rawTarget;
  }

  try {
    const decodedId = decodeURIComponent(id);
    return decodedId === id ? null : document.getElementById(decodedId);
  } catch {
    return null;
  }
}

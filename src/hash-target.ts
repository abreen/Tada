/*
 * markdown-it-anchor's slugifier uses encodeURIComponent() so generated
 * heading IDs can safely be used as URL hashes.
 *
 * Tada also allows raw HTML, so an author can create a decoded ID like
 * <h2 id="hello world">Hello</h2>. A link to that target becomes
 * #hello%20world, and getElementById('hello%20world') would not find it.
 *
 * Like the browser, fall back to a legacy <a name="..."> anchor when no
 * element has the ID.
 */
export function getHashTarget(
  document: Document,
  hash: string,
): HTMLElement | null {
  const id = hash.slice(1);
  if (!id) {
    return null;
  }

  const rawTarget = findIndicatedElement(document, id);
  if (rawTarget) {
    return rawTarget;
  }

  try {
    const decodedId = decodeURIComponent(id);
    return decodedId === id ? null : findIndicatedElement(document, decodedId);
  } catch {
    return null;
  }
}

function findIndicatedElement(
  document: Document,
  fragment: string,
): HTMLElement | null {
  const byId = document.getElementById(fragment);
  if (byId) {
    return byId;
  }
  for (const element of document.getElementsByName(fragment)) {
    if (element.localName === 'a') {
      return element;
    }
  }
  return null;
}

export function switchCurrent(
  oldCurrent: HTMLElement | null,
  newCurrent: HTMLElement | null,
) {
  oldCurrent?.classList.remove('current');
  newCurrent?.classList.add('current');
}

/* The first line of a code page hash, such as #L5 or #L5-L9 */
export function parseLineHash(hash: string): number | null {
  const match = hash.match(/^#L(\d+)(?:-L\d+)?$/);
  return match ? parseInt(match[1], 10) : null;
}

/* The entry with the closest line at or before the given line. Entries are
 * not in source order, since the TOC groups them (such as fields and methods) */
export function findCodeEntry(
  entryLines: (number | null)[],
  line: number,
): number | null {
  let best: number | null = null;
  let bestLine = -1;
  for (let i = 0; i < entryLines.length; i++) {
    const entryLine = entryLines[i];
    if (entryLine != null && entryLine <= line && entryLine >= bestLine) {
      best = i;
      bestLine = entryLine;
    }
  }
  return best;
}

export interface ScrollState {
  // Viewport tops of the TOC link targets, in TOC order
  targetTops: number[];
  // Where the browser puts a target when scrolling to it
  restingTop: number;
  viewportHeight: number;
  atTop: boolean;
  atBottom: boolean;
  // The target named by the URL hash, if it is in the TOC
  hashTarget: number | null;
}

/* The entry whose section is being read. A target becomes current when it
 * reaches the line where clicking its TOC link puts it. Targets near the end
 * of the page cannot reach that line, so at the bottom of the page the hash
 * target (the last link clicked) or else the last visible target is current. */
export function findScrollEntry({
  targetTops,
  restingTop,
  viewportHeight,
  atTop,
  atBottom,
  hashTarget,
}: ScrollState): number | null {
  if (targetTops.length === 0) {
    return null;
  }

  // Before any target is reached, the first entry is current
  let current = 0;
  targetTops.forEach((top, i) => {
    // Allow for subpixel rounding of the resting position
    if (top <= restingTop + 1) {
      current = i;
    }
  });

  if (!atBottom) {
    return current;
  }

  const isVisible = (i: number) => targetTops[i] < viewportHeight;
  if (hashTarget != null && hashTarget >= current && isVisible(hashTarget)) {
    return hashTarget;
  }

  // A page that fits in the viewport has not been scrolled to its end
  if (atTop) {
    return current;
  }
  for (let i = targetTops.length - 1; i > current; i--) {
    if (isVisible(i)) {
      return i;
    }
  }
  return current;
}

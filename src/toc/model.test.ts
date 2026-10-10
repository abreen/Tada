import { describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import {
  findCodeEntry,
  findScrollEntry,
  parseLineHash,
  switchCurrent,
  type ScrollState,
} from './model';

function dom(html: string) {
  return new JSDOM(`<body>${html}</body>`);
}

describe('switchCurrent', () => {
  test('adds current class to new element', () => {
    const { document } = dom('<li>A</li><li>B</li>').window;
    const items = document.querySelectorAll('li');
    switchCurrent(null, items[0] as HTMLElement);
    expect(items[0].classList.contains('current')).toBe(true);
  });

  test('removes current from old and adds to new', () => {
    const { document } = dom('<li class="current">A</li><li>B</li>').window;
    const items = document.querySelectorAll('li');
    switchCurrent(items[0] as HTMLElement, items[1] as HTMLElement);
    expect(items[0].classList.contains('current')).toBe(false);
    expect(items[1].classList.contains('current')).toBe(true);
  });

  test('removes current without a new element', () => {
    const { document } = dom('<li class="current">A</li>').window;
    const item = document.querySelector('li') as HTMLElement;
    switchCurrent(item, null);
    expect(item.classList.contains('current')).toBe(false);
  });
});

describe('parseLineHash', () => {
  test('parses a single line', () => {
    expect(parseLineHash('#L12')).toBe(12);
  });

  test('parses the first line of a range', () => {
    expect(parseLineHash('#L3-L5')).toBe(3);
  });

  test('rejects other hashes', () => {
    for (const hash of ['', '#', '#L', '#intro', '#L3-', '#L3-5', 'L3']) {
      expect(parseLineHash(hash)).toBeNull();
    }
  });
});

describe('findCodeEntry', () => {
  // Fields are grouped before methods, so lines are not in source order
  const entryLines = [2, 4, 3, 5];

  test('finds the entry at the line', () => {
    expect(findCodeEntry(entryLines, 3)).toBe(2);
  });

  test('finds the closest entry before the line', () => {
    expect(findCodeEntry(entryLines, 9)).toBe(3);
  });

  test('finds nothing before the first entry', () => {
    expect(findCodeEntry(entryLines, 1)).toBeNull();
  });

  test('skips entries without a line', () => {
    expect(findCodeEntry([null, 2], 3)).toBe(1);
    expect(findCodeEntry([null], 3)).toBeNull();
  });
});

describe('findScrollEntry', () => {
  // A page scrolled partway, with the resting line at 60px
  const state: ScrollState = {
    targetTops: [-500, 60, 300],
    restingTop: 60,
    viewportHeight: 1000,
    atTop: false,
    atBottom: false,
    hashTarget: null,
  };

  test('finds nothing without targets', () => {
    expect(findScrollEntry({ ...state, targetTops: [] })).toBeNull();
  });

  test('finds the last target at or above the resting line', () => {
    expect(findScrollEntry(state)).toBe(1);
    expect(findScrollEntry({ ...state, targetTops: [-500, 61, 300] })).toBe(1);
    expect(findScrollEntry({ ...state, targetTops: [-500, 62, 300] })).toBe(0);
  });

  test('finds the first target before any is reached', () => {
    expect(findScrollEntry({ ...state, targetTops: [200, 300] })).toBe(0);
  });

  test('never reaches a missing target', () => {
    expect(
      findScrollEntry({ ...state, targetTops: [-500, Infinity, 30] }),
    ).toBe(2);
  });

  test('ignores the hash target above the bottom of the page', () => {
    expect(findScrollEntry({ ...state, hashTarget: 2 })).toBe(1);
  });

  describe('at the bottom of the page', () => {
    const bottom: ScrollState = {
      ...state,
      targetTops: [-500, 400, 700, 900],
      atBottom: true,
    };

    test('finds the visible hash target', () => {
      expect(findScrollEntry({ ...bottom, hashTarget: 1 })).toBe(1);
      expect(findScrollEntry({ ...bottom, hashTarget: 2 })).toBe(2);
    });

    test('finds the hash target at the resting line', () => {
      expect(
        findScrollEntry({
          ...bottom,
          targetTops: [-500, 60, 700],
          hashTarget: 1,
        }),
      ).toBe(1);
    });

    test('finds the last visible target without a hash target', () => {
      expect(findScrollEntry(bottom)).toBe(3);
      expect(
        findScrollEntry({ ...bottom, targetTops: [-500, 400, 1200] }),
      ).toBe(1);
    });

    test('ignores a hash target that was scrolled past', () => {
      expect(
        findScrollEntry({
          ...bottom,
          targetTops: [-500, -100, 700],
          hashTarget: 0,
        }),
      ).toBe(2);
    });

    test('ignores a hash target below the viewport', () => {
      expect(
        findScrollEntry({
          ...bottom,
          targetTops: [-500, 400, 1200],
          hashTarget: 2,
        }),
      ).toBe(1);
    });

    test('keeps the resting line rule on a page that fits the viewport', () => {
      expect(
        findScrollEntry({ ...bottom, targetTops: [100, 400], atTop: true }),
      ).toBe(0);
      expect(
        findScrollEntry({
          ...bottom,
          targetTops: [100, 400],
          atTop: true,
          hashTarget: 1,
        }),
      ).toBe(1);
    });
  });
});

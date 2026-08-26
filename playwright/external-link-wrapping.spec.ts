import { test, expect } from './test-fixtures';

test('keeps punctuation on the same line as an external-link icon', async ({
  page,
}) => {
  await page.goto('/external-link-wrapping.html');

  const link = page.getByRole('link', { name: 'Science Center', exact: true });
  await expect(link).toHaveText('Science Center');

  const separatedWidths = await link.evaluate(anchor => {
    const tail = anchor.querySelector<HTMLElement>('.external-link-tail');
    const punctuation = anchor.nextSibling;
    if (!tail || punctuation?.nodeType !== Node.TEXT_NODE) {
      throw new Error('Expected external-link tail followed by a text node');
    }
    if (!punctuation.textContent?.startsWith(',')) {
      throw new Error('Expected a comma immediately after the external link');
    }

    const container = anchor.parentElement;
    if (!container) {
      throw new Error('Expected the external link to have a container');
    }

    const punctuationRange = document.createRange();
    punctuationRange.setStart(punctuation, 0);
    punctuationRange.setEnd(punctuation, 1);

    const widths: number[] = [];
    for (let width = 100; width <= 500; width++) {
      container.style.width = `${width}px`;
      const tailRects = tail.getClientRects();
      const tailRect = tailRects[tailRects.length - 1];
      const punctuationRect = punctuationRange.getBoundingClientRect();
      if (Math.abs(tailRect.top - punctuationRect.top) > 1) {
        widths.push(width);
      }
    }
    container.style.removeProperty('width');

    return widths;
  });

  expect(separatedWidths).toEqual([]);
});

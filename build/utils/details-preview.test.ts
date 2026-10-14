import { describe, expect, test } from 'bun:test';
import { addDetailsPreviewSummaries } from './details-preview';

const SUMMARY =
  '<summary data-pagefind-ignore=""><span class="open-label">Show more</span><span class="close-label">Show less</span></summary>';

describe('addDetailsPreviewSummaries', () => {
  test('gives a content details element without a summary the preview summary', () => {
    expect(
      addDetailsPreviewSummaries('<details>\n<p>Body</p>\n</details>'),
    ).toBe(
      `<details class="details-preview">${SUMMARY}\n<p>Body</p>\n</details>`,
    );
  });

  test('keeps the existing classes and attributes of the details element', () => {
    expect(
      addDetailsPreviewSummaries(
        '<details class="info" open><p>Body</p></details>',
      ),
    ).toBe(
      `<details class="info details-preview" open>${SUMMARY}<p>Body</p></details>`,
    );
  });

  test('leaves details elements with a summary alone, wherever the summary is', () => {
    const html =
      '<details><summary>First</summary><p>Body</p></details><details><p>Body</p><summary>Last</summary></details>';
    expect(addDetailsPreviewSummaries(html)).toBe(html);
  });

  test('only counts summaries that are children of the details element', () => {
    expect(
      addDetailsPreviewSummaries(
        '<details><div><summary>Deep</summary></div></details>',
      ),
    ).toBe(
      `<details class="details-preview">${SUMMARY}<div><summary>Deep</summary></div></details>`,
    );
  });

  test('handles nested details elements independently', () => {
    expect(
      addDetailsPreviewSummaries(
        '<details><summary>Outer</summary><details><p>Inner</p></details></details><details><details><summary>Inner</summary></details></details>',
      ),
    ).toBe(
      `<details><summary>Outer</summary><details class="details-preview">${SUMMARY}<p>Inner</p></details></details><details class="details-preview">${SUMMARY}<details><summary>Inner</summary></details></details>`,
    );
  });

  test('leaves content without details elements unchanged', () => {
    const html = '<p>No details here</p>';
    expect(addDetailsPreviewSummaries(html)).toBe(html);
  });
});

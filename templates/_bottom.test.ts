import { expect, test } from 'bun:test';
import _ from 'lodash';
import { JSDOM } from 'jsdom';
import BOTTOM_TEMPLATE from './_bottom.html' with { type: 'text' };

function render(authorScriptPaths: string[]) {
  const html = `<div class="container">${_.template(BOTTOM_TEMPLATE)({ authorScriptPaths })}`;
  return new JSDOM(html).window.document;
}

test('renders a module preload marker for each author script, in order', () => {
  const document = render(['/_scripts/site.js', '/_scripts/lectures/a.js']);
  const links = [
    ...document.querySelectorAll('.container > link[data-tada-script]'),
  ];
  expect(links.map(link => link.getAttribute('href'))).toEqual([
    '/_scripts/site.js',
    '/_scripts/lectures/a.js',
  ]);
  expect(
    links.every(link => link.getAttribute('rel') === 'modulepreload'),
  ).toBe(true);
});

test('renders no markers without author scripts', () => {
  expect(render([]).querySelectorAll('link')).toHaveLength(0);
});

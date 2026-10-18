import { describe, expect, test } from 'bun:test';
import {
  getPageRenderers,
  isValidCustomElementName,
  renderCustomElements,
  validateRendererModule,
  type PageRenderer,
  type ScriptRenderers,
} from './custom-elements';
import type { Render, RenderInfo } from '../types/client';

const page: RenderInfo['page'] = {
  path: '/lectures/index.html',
  frontMatter: { title: 'Lectures' },
};
const vars = { course: 'CS 101' };

function renderers(
  list: Record<string, Render>,
): ReadonlyMap<string, PageRenderer> {
  return new Map(
    Object.entries(list).map(([name, render]) => [
      name,
      { render, file: 'src/a.render.ts', script: 'a.ts' },
    ]),
  );
}

function renderAll(html: string, list: Record<string, Render>): string {
  return renderCustomElements(
    html,
    renderers(list),
    page,
    vars,
    'content/a.md',
  );
}

describe('isValidCustomElementName', () => {
  test('accepts lowercase names with a hyphen', () => {
    for (const name of ['tz-chooser', 'a-b', 'x-1.2_3', 'my-big-widget']) {
      expect(isValidCustomElementName(name)).toBe(true);
    }
  });

  test('rejects names without a hyphen, with uppercase, or reserved', () => {
    for (const name of [
      'chooser',
      'Tz-chooser',
      'tz-Chooser',
      '1-a',
      '-a',
      'tz chooser',
      'font-face',
      'annotation-xml',
    ]) {
      expect(isValidCustomElementName(name)).toBe(false);
    }
  });
});

describe('validateRendererModule', () => {
  test('returns the render functions by element name', () => {
    const render = () => '';
    const result = validateRendererModule(
      { default: { 'tz-chooser': render } },
      'src/a.render.ts',
    );
    expect(result.file).toBe('src/a.render.ts');
    expect([...result.elements]).toEqual([['tz-chooser', render]]);
  });

  test('rejects a module without an object default export', () => {
    for (const exported of [undefined, null, () => '', [], 'x']) {
      expect(() =>
        validateRendererModule({ default: exported }, 'src/a.render.ts'),
      ).toThrow(
        'src/a.render.ts: the default export must be an object mapping element names to render functions',
      );
    }
  });

  test('rejects an invalid element name', () => {
    expect(() =>
      validateRendererModule(
        { default: { chooser: () => '' } },
        'src/a.render.ts',
      ),
    ).toThrow(
      'src/a.render.ts: "chooser" is not a valid custom element name; use lowercase letters and a hyphen, such as "tz-chooser"',
    );
  });

  test('rejects a value that is not a function', () => {
    expect(() =>
      validateRendererModule(
        { default: { 'tz-chooser': '<p></p>' } },
        'src/a.render.ts',
      ),
    ).toThrow('src/a.render.ts: "tz-chooser" must be a render function');
  });
});

describe('getPageRenderers', () => {
  const scriptRenderers = (file: string, names: string[]): ScriptRenderers => ({
    file,
    elements: new Map(names.map(name => [name, () => name])),
  });

  test('collects the renderers of the listed scripts only', () => {
    const result = getPageRenderers(
      ['a.ts', 'npm:b'],
      new Map([
        ['a.ts', scriptRenderers('src/a.render.ts', ['a-one'])],
        ['npm:b', scriptRenderers('node_modules/b/render.js', ['b-one'])],
        ['c.ts', scriptRenderers('src/c.render.ts', ['c-one'])],
      ]),
      'content/x.md',
    );
    expect([...result.keys()]).toEqual(['a-one', 'b-one']);
    expect(result.get('b-one')).toMatchObject({
      file: 'node_modules/b/render.js',
      script: 'npm:b',
    });
  });

  test('is empty when no build has renderers', () => {
    expect(getPageRenderers(['a.ts'], undefined, 'content/x.md').size).toBe(0);
  });

  test('rejects two scripts that render the same element', () => {
    expect(() =>
      getPageRenderers(
        ['a.ts', 'npm:b'],
        new Map([
          ['a.ts', scriptRenderers('src/a.render.ts', ['x-y'])],
          ['npm:b', scriptRenderers('node_modules/b/render.js', ['x-y'])],
        ]),
        'content/x.md',
      ),
    ).toThrow('content/x.md: <x-y> is rendered by both "a.ts" and "npm:b"');
  });
});

describe('renderCustomElements', () => {
  test('fills the element and keeps its start tag as written', () => {
    expect(
      renderAll('<p>Before</p>\n<tz-chooser  class="a">\n</tz-chooser>\n', {
        'tz-chooser': () => '<select></select>',
      }),
    ).toBe(
      '<p>Before</p>\n<tz-chooser  class="a"><select></select></tz-chooser>\n',
    );
  });

  test('passes attributes, content as written, page, and variables', () => {
    let received: RenderInfo | undefined;
    renderAll('<x-y Data-Zone="ET" title="a &amp; b"><em>Hi</em></x-y>', {
      'x-y': info => {
        received = info;
        return '';
      },
    });
    expect(received).toEqual({
      attributes: { 'data-zone': 'ET', title: 'a & b' },
      html: '<em>Hi</em>',
      page,
      vars,
    });
    expect(Object.isFrozen(received!.attributes)).toBe(true);
  });

  test('renders each element, including nested in other markup', () => {
    let count = 0;
    expect(
      renderAll('<x-y></x-y><div><p><x-y>a</x-y></p></div>', {
        'x-y': () => String(++count),
      }),
    ).toBe('<x-y>2</x-y><div><p><x-y>1</x-y></p></div>');
  });

  test('passes elements inside a rendered element as written', () => {
    const html = '<x-y><x-y>inner</x-y></x-y>';
    const calls: string[] = [];
    expect(
      renderAll(html, {
        'x-y': info => {
          calls.push(info.html);
          return 'out';
        },
      }),
    ).toBe('<x-y>out</x-y>');
    expect(calls).toEqual(['<x-y>inner</x-y>']);
  });

  test('leaves elements without renderers, templates, and noscript alone', () => {
    const html =
      '<other-el></other-el><template><x-y></x-y></template><noscript><x-y></x-y></noscript><svg><x-y></x-y></svg>';
    expect(renderAll(html, { 'x-y': () => 'out' })).toBe(html);
  });

  test('returns content without the element unchanged', () => {
    const html = '<p>No elements</p>';
    expect(renderAll(html, { 'x-y': () => 'out' })).toBe(html);
  });

  test('rejects an element without an end tag', () => {
    expect(() => renderAll('<div><x-y></div>', { 'x-y': () => '' })).toThrow(
      'content/a.md: <x-y> needs a closing tag </x-y>',
    );
  });

  test('names the page, element, and file when a render function throws', () => {
    expect(() =>
      renderAll('<x-y></x-y>', {
        'x-y': () => {
          throw new Error('no data');
        },
      }),
    ).toThrow('content/a.md: <x-y> render failed (src/a.render.ts): no data');
  });

  test('rejects a result that is not a string', () => {
    expect(() =>
      renderAll('<x-y></x-y>', { 'x-y': () => 3 as unknown as string }),
    ).toThrow(
      'content/a.md: <x-y> render function in src/a.render.ts must return a string, got number',
    );
  });

  test('rejects an async render function', () => {
    expect(() =>
      renderAll('<x-y></x-y>', {
        'x-y': (async () => '') as unknown as Render,
      }),
    ).toThrow(
      'content/a.md: <x-y> render function in src/a.render.ts must return a string, not a Promise',
    );
  });
});

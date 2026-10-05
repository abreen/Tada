import { describe, expect, mock, test, beforeAll } from 'bun:test';
import { createGlobals } from './globals.test';
import { initHighlighter } from './utils/shiki-highlighter';
import { htmlToPlainText } from './utils/plain-text';
import {
  renderCodeSegment,
  renderCodeWithComments,
  extractJavaMethodToc,
  rewriteProseLinks,
} from './utils/code';
import type { SiteVariables } from './types';

beforeAll(async () => {
  await initHighlighter(['java', 'python', 'text']);
});

describe('extractJavaMethodToc', () => {
  test('returns methods from a regular class', () => {
    const toc = extractJavaMethodToc(`
public class Foo {
  public void foo() {}
  public int bar(int x) { return x; }
}
`);
    expect(toc).toEqual([
      { kind: 'method', label: 'Method', name: 'foo()', line: 3 },
      { kind: 'method', label: 'Method', name: 'bar(x)', line: 4 },
    ]);
  });

  test('returns top-level methods from a compact source file', () => {
    const toc = extractJavaMethodToc(`
void hello() {
  System.out.println("Hello");
}

void main() {
  hello();
}
`);
    expect(toc).toEqual([
      { kind: 'method', label: 'Method', name: 'hello()', line: 2 },
      { kind: 'method', label: 'Method', name: 'main()', line: 6 },
    ]);
  });

  test('returns empty array when class has no methods or fields', () => {
    const toc = extractJavaMethodToc(`
public class Empty {
}
`);
    expect(toc).toEqual([]);
  });

  test('returns constructor from a class', () => {
    const toc = extractJavaMethodToc(`
public class Point {
  public Point(int x) {}
}
`);
    expect(toc).toEqual([
      { kind: 'constructor', label: 'Constructor', name: 'Point(x)', line: 3 },
    ]);
  });

  test('excludes methods on inner classes', () => {
    const toc = extractJavaMethodToc(`
public class Outer {
  public void outerMethod() {}
  static class Inner {
    public void innerMethod() {}
  }
}
`);
    expect(toc.map(e => e.name)).toEqual(['outerMethod()']);
  });

  test('excludes anonymous class members in fields, methods, and initializers', () => {
    const toc = extractJavaMethodToc(`class Outer {
  Runnable task = new Runnable() {
    int hiddenField;
    public void run() {}
  };
  Outer() {
    new Runnable() { public void run() {} };
  }
  static {
    new Runnable() { public void run() {} };
  }
  void outerMethod() {
    new Runnable() { public void run() {} };
  }
}`);
    expect(toc).toEqual([
      { kind: 'field', label: 'Field', name: 'Runnable task', line: 2 },
      { kind: 'constructor', label: 'Constructor', name: 'Outer()', line: 6 },
      { kind: 'method', label: 'Method', name: 'outerMethod()', line: 12 },
    ]);
  });

  test('includes abstract and native class methods without entering nested types', () => {
    const toc = extractJavaMethodToc(`abstract class Outer {
  abstract String describe(int count);
  native void send(byte[] data);
  Outer() {}
  static { System.out.println("initialized"); }
  abstract class Inner {
    int hiddenField;
    Inner() {}
    abstract void hidden();
  }
  interface Nested { void hidden(); }
  enum Choice { A; void hidden() {} }
  record Point(int x) { void hidden() {} }
}`);
    expect(toc).toEqual([
      { kind: 'method', label: 'Method', name: 'describe(count)', line: 2 },
      { kind: 'method', label: 'Method', name: 'send(data)', line: 3 },
      { kind: 'constructor', label: 'Constructor', name: 'Outer()', line: 4 },
    ]);
  });

  test('returns default method from an interface', () => {
    const toc = extractJavaMethodToc(`
public interface Greeter {
  default String greet(String name) { return "Hello, " + name; }
}
`);
    expect(toc).toEqual([
      { kind: 'method', label: 'Method', name: 'greet(name)', line: 3 },
    ]);
  });

  test('returns fields from a class with type but not access modifier', () => {
    const toc = extractJavaMethodToc(`
public class Counter {
  private int count;
  public String label;
}
`);
    expect(toc.map(e => e.name)).toEqual(['int count', 'String label']);
  });

  test('returns one entry per variable in a multi-variable declaration', () => {
    const toc = extractJavaMethodToc(`
public class Coords {
  int x, y;
}
`);
    expect(toc.map(e => e.name)).toEqual(['int x', 'int y']);
  });

  test('returns array type field', () => {
    const toc = extractJavaMethodToc(`
public class Arr {
  int[] values;
}
`);
    expect(toc).toEqual([
      { kind: 'field', label: 'Field', name: 'int[] values', line: 3 },
    ]);
  });

  test('returns generic type field', () => {
    const toc = extractJavaMethodToc(`
public class Container {
  List<String> items;
}
`);
    expect(toc).toEqual([
      { kind: 'field', label: 'Field', name: 'List<String> items', line: 3 },
    ]);
  });

  test('returns interface constant', () => {
    const toc = extractJavaMethodToc(`
public interface Config {
  int TIMEOUT = 30;
}
`);
    expect(toc).toEqual([
      { kind: 'field', label: 'Field', name: 'int TIMEOUT', line: 3 },
    ]);
  });

  test('returns abstract interface methods (no body)', () => {
    const toc = extractJavaMethodToc(`
public interface Greeter {
  String greet(String name);
}
`);
    expect(toc).toEqual([
      { kind: 'method', label: 'Method', name: 'greet(name)', line: 3 },
    ]);
  });
});

describe('renderCodeWithComments', () => {
  test('renders build-time line rows for code segments', () => {
    const html = renderCodeWithComments('alpha\n\nbeta\n', 'java', {
      base: '',
      basePath: '/',
      internalDomains: [],
      title: 'Test',
      titlePostfix: ' - Test',
      themeColor: 'steelblue',
      defaultTimeZone: 'America/New_York',
      features: { search: true, favicon: true, footer: true, pickers: true },
    } as SiteVariables);

    expect(html).toContain('<span class="code-row">');
    expect(html).toContain('id="L1" href="#L1"');
    expect(html).toContain('id="L2" href="#L2"');
    expect(html).toContain('id="L3" href="#L3"');
    expect(html).not.toContain('id="L4" href="#L4"');
    expect(html).toContain('<code class="shiki language-java">');
  });

  test('renders code comments with fg2 color', () => {
    const html = renderCodeWithComments('// note\nint x = 1;\n', 'java', {
      base: '',
      basePath: '/',
      internalDomains: [],
      title: 'Test',
      titlePostfix: ' - Test',
      themeColor: 'steelblue',
      defaultTimeZone: 'America/New_York',
      features: { search: true, favicon: true, footer: true, pickers: true },
    } as SiteVariables);

    expect(html).toContain(
      'style="--shiki-light:var(--fg2-color);--shiki-dark:var(--fg2-color)"',
    );
    expect(html).toContain('// note');
  });

  test.each([
    ['', 'https://example.edu/course/rect.py.html'],
    ['lectures/01', 'https://example.edu/course/lectures/01/rect.py.html'],
    [undefined, './rect.py'],
  ])(
    'data-prose-source resolves links from directory %s',
    (pageDirPath, expected) => {
      const source = '/// See [rect](./rect.py)\npublic class Foo {}\n';
      const html = renderCodeWithComments(
        source,
        'java',
        {
          base: 'https://example.edu',
          basePath: '/course',
          extensionToShikiLanguage: { java: 'java', py: 'python' },
          shikiLanguages: ['java', 'python'],
          internalDomains: [],
          title: 'Test',
          titlePostfix: ' - Test',
          themeColor: 'steelblue',
          defaultTimeZone: 'America/New_York',
          features: {
            search: true,
            favicon: true,
            footer: true,
            pickers: true,
          },
        } as SiteVariables,
        pageDirPath,
      );

      expect(html).toContain(`data-prose-source="/// See [rect](${expected})"`);
    },
  );

  test('leaves raw HTML prose links unchanged until page finalization', () => {
    const source = '/// <a href="./Pair.java">Pair</a>\npublic class Foo {}\n';
    const html = renderCodeWithComments(
      source,
      'java',
      {
        base: 'https://example.edu',
        basePath: '/course',
        extensionToShikiLanguage: { java: 'java', py: 'python' },
        shikiLanguages: ['java', 'python'],
        internalDomains: [],
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
        defaultTimeZone: 'America/New_York',
        features: { search: true, favicon: true, footer: true, pickers: true },
      } as SiteVariables,
      'lectures/01',
    );

    expect(html).toContain('href="./Pair.java"');
    expect(html).not.toContain('href="./Pair.java.html"');
  });

  test('leaves raw HTML prose links to literate Java downloads unchanged before page finalization', () => {
    const source = '/// <a href="./Pair.java">Pair</a>\npublic class Foo {}\n';
    const html = renderCodeWithComments(
      source,
      'java',
      {
        base: 'https://example.edu',
        basePath: '/course',
        extensionToShikiLanguage: { java: 'java', py: 'python' },
        shikiLanguages: ['java', 'python'],
        internalDomains: [],
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
        defaultTimeZone: 'America/New_York',
        features: { search: true, favicon: true, footer: true, pickers: true },
      } as SiteVariables,
      'lectures/01',
    );

    expect(html).toContain('href="./Pair.java"');
    expect(html).not.toContain('href="./Pair.java.html"');
  });

  test('renders KaTeX math in Java Markdown comments', () => {
    const source =
      '/// The equation $E = mc^2$ is famous.\npublic class Foo {}\n';
    const html = renderCodeWithComments(source, 'java', {
      base: '',
      basePath: '/',
      internalDomains: [],
      title: 'Test',
      titlePostfix: ' - Test',
      themeColor: 'steelblue',
      defaultTimeZone: 'America/New_York',
      features: { search: true, favicon: true, footer: true, pickers: true },
    } as SiteVariables);

    expect(html).toContain('class="katex"');
    expect(html).toContain('aria-label="E, equals, m, c, squared"');
  });

  test('throws on invalid LaTeX in Java Markdown comments', () => {
    const source =
      '/// Invalid $\\invalidcommand{$ math.\npublic class Foo {}\n';

    expect(() =>
      renderCodeWithComments(source, 'java', {
        base: '',
        basePath: '/',
        internalDomains: [],
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
        defaultTimeZone: 'America/New_York',
        features: { search: true, favicon: true, footer: true, pickers: true },
      } as SiteVariables),
    ).toThrow();
  });

  test('does not substitute <%= %> by itself (templating happens in renderCodePageAsset)', () => {
    const source = '# Supplied as part of <%= vars.fullCourseName %>\n';
    const html = renderCodeWithComments(source, 'text', {
      base: '',
      basePath: '/',
      internalDomains: [],
      title: 'Test',
      titlePostfix: ' - Test',
      themeColor: 'steelblue',
      defaultTimeZone: 'America/New_York',
      features: { search: true, favicon: true, footer: true, pickers: true },
      vars: { fullCourseName: 'CS 0' },
    } as SiteVariables);

    // renderCodeWithComments itself does not template; the caller
    // (renderCodePageAsset) is expected to template first.
    expect(html).toContain('&lt;%=');
  });
});

describe('rewriteProseLinks', () => {
  const siteVariables = {
    base: 'https://example.edu',
    basePath: '/course',
    extensionToShikiLanguage: { java: 'java', py: 'python' },
    shikiLanguages: ['java', 'python'],
    internalDomains: [],
    title: 'Test',
    titlePostfix: ' - Test',
    themeColor: 'steelblue',
    defaultTimeZone: 'America/New_York',
    features: { search: true, favicon: true, footer: true, pickers: true },
  } as SiteVariables;

  test('rewrites relative link with base + basePath', () => {
    const lines = ['/// See [rectangle.py](./rectangle.py)'];
    const result = rewriteProseLinks(lines, siteVariables, 'lectures/01');
    expect(result[0]).toBe(
      '/// See [rectangle.py](https://example.edu/course/lectures/01/rectangle.py.html)',
    );
  });

  test('rewrites absolute link with base + basePath', () => {
    const lines = ['/// See [about](/about.html)'];
    const result = rewriteProseLinks(lines, siteVariables, 'lectures/01');
    expect(result[0]).toBe(
      '/// See [about](https://example.edu/course/about.html)',
    );
  });

  test('leaves external links unchanged', () => {
    const lines = ['/// See [Google](https://google.com)'];
    const result = rewriteProseLinks(lines, siteVariables, 'lectures/01');
    expect(result[0]).toBe('/// See [Google](https://google.com)');
  });

  test('leaves anchor links unchanged', () => {
    const lines = ['/// See [section](#overview)'];
    const result = rewriteProseLinks(lines, siteVariables, 'lectures/01');
    expect(result[0]).toBe('/// See [section](#overview)');
  });

  test('applies code extension rewriting', () => {
    const lines = ['/// See [App](./App.java)'];
    const result = rewriteProseLinks(lines, siteVariables, 'lectures/01');
    expect(result[0]).toBe(
      '/// See [App](https://example.edu/course/lectures/01/App.java.html)',
    );
  });

  test('handles multiple links on one line', () => {
    const lines = ['/// See [a](./a.py) and [b](./b.java)'];
    const result = rewriteProseLinks(lines, siteVariables, 'lectures/01');
    expect(result[0]).toBe(
      '/// See [a](https://example.edu/course/lectures/01/a.py.html) and [b](https://example.edu/course/lectures/01/b.java.html)',
    );
  });

  test('does not rewrite non-comment lines', () => {
    const lines = ['String s = "[link](./file.py)";'];
    const result = rewriteProseLinks(lines, siteVariables, 'lectures/01');
    expect(result[0]).toBe('String s = "[link](./file.py)";');
  });

  test('preserves query string and fragment', () => {
    const lines = ['/// See [code](./App.java?view=1#L5)'];
    const result = rewriteProseLinks(lines, siteVariables, 'lectures/01');
    expect(result[0]).toBe(
      '/// See [code](https://example.edu/course/lectures/01/App.java.html?view=1#L5)',
    );
  });

  test('works with root basePath', () => {
    const vars = { ...siteVariables, basePath: '/' } as SiteVariables;
    const lines = ['/// See [rect](./rect.py)'];
    const result = rewriteProseLinks(lines, vars, 'lectures/01');
    expect(result[0]).toBe(
      '/// See [rect](https://example.edu/lectures/01/rect.py.html)',
    );
  });
});

function codeCells(html: string): string[] {
  return Array.from(
    html.matchAll(/<code class="shiki language-[^"]+">(.*?)<\/code><\/span>/g),
    match => match[1],
  );
}

function textOf(cellHtml: string): string {
  return htmlToPlainText(cellHtml);
}

function countOf(text: string, search: string): number {
  return text.split(search).length - 1;
}

describe('renderCodeSegment', () => {
  test.each([
    [
      'Java block comment',
      'java',
      [
        'int a = 1; /* start',
        '   middle <b> & "q"',
        '',
        '   end */ int b = 2;',
      ],
    ],
    [
      'Java text block',
      'java',
      ['String s = """', '    Hello, <world> & friends', '', '    """;'],
    ],
    [
      'Python triple-quoted string',
      'python',
      ['def f():', '    """Docstring', '', '    with <tags> & more', '    """'],
    ],
  ])('renders one balanced row per line of a %s', (_, lang, lines) => {
    const html = renderCodeSegment(lines, 1, lang);
    const cells = codeCells(html);

    expect(html.startsWith('<pre>')).toBe(true);
    expect(countOf(html, '<span class="code-row">')).toBe(lines.length);
    expect(cells).toHaveLength(lines.length);
    cells.forEach((cell, i) => {
      expect(cell.startsWith('<span class="line">')).toBe(true);
      expect(countOf(cell, '<span')).toBe(countOf(cell, '</span>'));
      expect(textOf(cell)).toBe(lines[i] || ' ');
      expect(html).toContain(`id="L${i + 1}" href="#L${i + 1}">${i + 1}</a>`);
    });
  });

  test('keeps comment styling on every line of a block comment', () => {
    const cells = codeCells(
      renderCodeSegment(['/* one', '   two', '   three */'], 1, 'java'),
    );

    expect(cells).toHaveLength(3);
    for (const cell of cells) {
      expect(cell).toContain(
        'style="--shiki-light:var(--fg2-color);--shiki-dark:var(--fg2-color)"',
      );
    }
  });

  test('renders empty lines with a non-breaking space', () => {
    const cells = codeCells(renderCodeSegment(['', 'int a;', ''], 1, 'java'));

    expect(cells[0]).toBe('<span class="line"></span>&nbsp;');
    expect(cells[2]).toBe('<span class="line"></span>&nbsp;');
  });

  test('renders plain line numbers when line links are disabled', () => {
    const html = renderCodeSegment(['x = 1', 'y = 2'], 5, 'python', {
      linkLineNumbers: false,
    });

    expect(html).toContain(
      '<span class="code-row"><span class="line-number" data-pagefind-ignore data-line="5">5</span><code class="shiki language-python">',
    );
    expect(html).toContain('data-line="6">6</span>');
    expect(html).not.toContain('<a class="line-number"');
  });

  test('renders no rows for an empty segment', () => {
    expect(renderCodeSegment([], 1, 'python')).toBe('<pre></pre>');
  });

  test('drops carriage returns from CRLF sources', () => {
    const lines = ['class A {\r', '  int x;\r', '}\r'];
    const html = renderCodeSegment(lines, 1, 'java');

    expect(html).not.toContain('\r');
    expect(codeCells(html).map(textOf)).toEqual(['class A {', '  int x;', '}']);
  });

  test('falls back to escaped plain lines when highlighting fails', () => {
    let output = '';
    mock.module('./globals', () => ({
      globals: createGlobals({
        stdoutWrite(chunk) {
          output += chunk;
        },
      }),
    }));

    const html = renderCodeSegment(['a < b && c', ''], 3, 'not-a-language');

    expect(output).toContain('Failed to highlight code block');
    expect(codeCells(html)).toEqual(['a &lt; b &amp;&amp; c', '']);
    expect(html).toContain('id="L3" href="#L3"');
    expect(html).toContain('id="L4" href="#L4"');
  });
});

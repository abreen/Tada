import { describe, expect, test, beforeAll } from 'bun:test';
import { initHighlighter } from './utils/shiki-highlighter';
import {
  renderCodeWithComments,
  extractJavaMethodToc,
  rewriteProseLinks,
} from './utils/code';
import type { SiteVariables } from './types';

beforeAll(async () => {
  await initHighlighter(['java', 'text', 'plaintext']);
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
      features: { search: true, code: true, favicon: true },
    } as SiteVariables);

    expect(html).toContain('<span class="code-row">');
    expect(html).toContain('id="L1" href="#L1"');
    expect(html).toContain('id="L2" href="#L2"');
    expect(html).toContain('id="L3" href="#L3"');
    expect(html).not.toContain('id="L4" href="#L4"');
    expect(html).toContain('<code class="shiki language-java">');
  });

  test('data-prose-source contains rewritten links when pageDirPath is provided', () => {
    const source = '/// See [rect](./rect.py)\npublic class Foo {}\n';
    const html = renderCodeWithComments(
      source,
      'java',
      {
        base: 'https://example.edu',
        basePath: '/course',
        codeLanguages: { java: 'java', py: 'python' },
        internalDomains: [],
        title: 'Test',
        titlePostfix: ' - Test',
        themeColor: 'steelblue',
        defaultTimeZone: 'America/New_York',
        features: { search: true, code: true, favicon: true },
      } as SiteVariables,
      'lectures/01',
    );

    expect(html).toContain(
      'https://example.edu/course/lectures/01/rect.py.html',
    );
  });
});

describe('rewriteProseLinks', () => {
  const siteVariables = {
    base: 'https://example.edu',
    basePath: '/course',
    codeLanguages: { java: 'java', py: 'python' },
    internalDomains: [],
    title: 'Test',
    titlePostfix: ' - Test',
    themeColor: 'steelblue',
    defaultTimeZone: 'America/New_York',
    features: { search: true, code: true, favicon: true },
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

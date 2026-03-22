import { describe, expect, test, beforeAll } from 'bun:test';
import { initHighlighter } from './utils/shiki-highlighter';
import { renderCodeWithComments, extractJavaMethodToc } from './utils/code';
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
      defaultTimeZone: 'America/New_York',
    } as SiteVariables);

    expect(html).toContain('<span class="code-row">');
    expect(html).toContain('id="L1" href="#L1"');
    expect(html).toContain('id="L2" href="#L2"');
    expect(html).toContain('id="L3" href="#L3"');
    expect(html).not.toContain('id="L4" href="#L4"');
    expect(html).toContain('<code class="shiki language-java">');
  });
});

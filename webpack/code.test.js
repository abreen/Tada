const { describe, expect, test, beforeAll } = require('bun:test');
const { initHighlighter } = require('./utils/shiki-highlighter');
const {
  renderCodeWithComments,
  extractJavaMethodToc,
} = require('./utils/code');

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
      { name: 'foo()', line: 3 },
      { name: 'bar(x)', line: 4 },
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
      { name: 'hello()', line: 2 },
      { name: 'main()', line: 6 },
    ]);
  });

  test('returns empty array when class has no methods', () => {
    const toc = extractJavaMethodToc(`
public class Empty {
  private int x = 0;
}
`);
    expect(toc).toEqual([]);
  });

  test('returns constructor from a class', () => {
    const toc = extractJavaMethodToc(`
public class Point {
  private int x;
  public Point(int x) { this.x = x; }
}
`);
    expect(toc).toEqual([{ name: 'Point(x)', line: 4 }]);
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
    expect(toc).toEqual([{ name: 'greet(name)', line: 3 }]);
  });

  test('returns abstract interface methods (no body)', () => {
    const toc = extractJavaMethodToc(`
public interface Greeter {
  String greet(String name);
}
`);
    expect(toc).toEqual([{ name: 'greet(name)', line: 3 }]);
  });
});

describe('renderCodeWithComments', () => {
  test('renders build-time line rows for code segments', () => {
    const html = renderCodeWithComments('alpha\n\nbeta\n', 'java', {
      basePath: '/',
      internalDomains: [],
    });

    expect(html).toContain('<span class="code-row">');
    expect(html).toContain('id="L1" href="#L1"');
    expect(html).toContain('id="L2" href="#L2"');
    expect(html).toContain('id="L3" href="#L3"');
    expect(html).not.toContain('id="L4" href="#L4"');
    expect(html).toContain('<code class="shiki language-java">');
  });
});

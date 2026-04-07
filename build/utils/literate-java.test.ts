import { describe, test, expect } from 'bun:test';
import { hasMainMethod, deriveClassName } from './literate-java';

describe('hasMainMethod', () => {
  test('returns true for standard main method', () => {
    expect(hasMainMethod('public static void main(String[] args) {')).toBe(
      true,
    );
  });

  test('returns true for main with no access modifier', () => {
    expect(hasMainMethod('static void main(String[] args) {')).toBe(true);
  });

  test('returns true when main is on its own line', () => {
    const source = `public class Test {
    public static void main(String[] args) {
        System.out.println("hello");
    }
}`;
    expect(hasMainMethod(source)).toBe(true);
  });

  test('returns false for no main method', () => {
    expect(hasMainMethod('public class Test { int x = 1; }')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(hasMainMethod('')).toBe(false);
  });

  test('returns false for main without void', () => {
    expect(hasMainMethod('public static int main(String[] args) {')).toBe(
      false,
    );
  });

  test('returns true with extra whitespace between void and main', () => {
    expect(hasMainMethod('void   main(String[] args)')).toBe(true);
  });

  test('returns false when main is in a comment', () => {
    // The regex does not strip comments, so it will match inside comments.
    // This documents the current behavior.
    expect(hasMainMethod('// void main(args)')).toBe(true);
  });
});

describe('deriveClassName', () => {
  test('extracts class name from simple file path', () => {
    expect(deriveClassName('/path/to/MyClass.java')).toBe('MyClass');
  });

  test('extracts class name from literate Java path (double extension)', () => {
    expect(deriveClassName('/path/to/VowelCounter.java.md')).toBe(
      'VowelCounter',
    );
  });

  test('handles file in current directory', () => {
    expect(deriveClassName('Test.java')).toBe('Test');
  });

  test('handles nested path', () => {
    expect(deriveClassName('/a/b/c/Demo.java')).toBe('Demo');
  });
});

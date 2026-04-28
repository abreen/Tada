import { describe, test, expect } from 'bun:test';
import {
  generateStepSvg,
  formatValue,
  escapeXml,
  filterStep,
} from './trace-svg';
import { computeLayout } from './trace-layout';
import type { TraceStep, TraceHeapObject, TraceStackFrame } from '../types';

function makeStep(
  line: number,
  stack: TraceStackFrame[],
  heap: Record<string, TraceHeapObject>,
): TraceStep {
  return { line, file: 'Test.java', stack, heap, output: [] };
}

describe('generateStepSvg', () => {
  test('generates valid SVG with stack frames for a simple int variable', () => {
    const step = makeStep(
      5,
      [
        {
          method: 'main',
          class: 'Test',
          line: 5,
          locals: { x: { type: 'int', value: 42 } },
        },
      ],
      {},
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    expect(svg).toStartWith('<svg class="trace-memory"');
    expect(svg).toEndWith('</svg>');
    expect(svg).toContain('viewBox="0 0');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // Should contain frame title with method:line
    expect(svg).toContain('main:5');
    expect(svg).toContain('class="trace-frame-title"');
    // Should contain variable name
    expect(svg).toContain('>x</text>');
    // Should contain value
    expect(svg).toContain('>42</text>');
    // Should contain a var box rect
    expect(svg).toContain('class="trace-var-box"');
    // Should have the arrowhead defs
    expect(svg).toContain('<defs>');
    expect(svg).toContain('id="trace-arrowhead"');
    // Should have stack separator line
    expect(svg).toContain('class="trace-separator"');
  });

  test('generates heap objects with arrows for ref variable', () => {
    const step = makeStep(
      10,
      [
        {
          method: 'main',
          class: 'Test',
          line: 10,
          locals: { node: { type: 'ref', id: '1' } },
        },
      ],
      {
        '1': {
          type: 'Node',
          fields: { val: { type: 'int', value: 7 }, next: { type: 'null' } },
        },
      },
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    // Should have a heap object
    expect(svg).toContain('class="trace-obj"');
    expect(svg).toContain('data-id="1"');
    // Should have object border
    expect(svg).toContain('class="trace-obj-border"');
    // Should have field names
    expect(svg).toContain('>val</text>');
    expect(svg).toContain('>next</text>');
    // Should have field values
    expect(svg).toContain('>7</text>');
    expect(svg).toContain('>null</text>');
    // Should have at least one arrow (stack -> heap)
    expect(svg).toContain('class="trace-arrow"');
    expect(svg).toContain('marker-end="url(#trace-arrowhead)"');
  });

  test('generates BST with all three nodes and arrows', () => {
    const step = makeStep(
      15,
      [
        {
          method: 'main',
          class: 'Test',
          line: 15,
          locals: { root: { type: 'ref', id: '1' } },
        },
      ],
      {
        '1': {
          type: 'Node',
          fields: {
            val: { type: 'int', value: 10 },
            left: { type: 'ref', id: '2' },
            right: { type: 'ref', id: '3' },
          },
        },
        '2': {
          type: 'Node',
          fields: {
            val: { type: 'int', value: 5 },
            left: { type: 'null' },
            right: { type: 'null' },
          },
        },
        '3': {
          type: 'Node',
          fields: {
            val: { type: 'int', value: 15 },
            left: { type: 'null' },
            right: { type: 'null' },
          },
        },
      },
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    // All three nodes should be present
    expect(svg).toContain('data-id="1"');
    expect(svg).toContain('data-id="2"');
    expect(svg).toContain('data-id="3"');
    // At least 3 arrows: root->1 (stack, fg), 1->2 and 1->3 (heap)
    const allArrows = (svg.match(/class="trace-arrow(?:-heap|-dim)?"/g) ?? [])
      .length;
    expect(allArrows).toBeGreaterThanOrEqual(3);
  });

  test('BST node renders child-slot row with left/right labels', () => {
    const step = makeStep(
      15,
      [
        {
          method: 'main',
          class: 'Test',
          line: 15,
          locals: { root: { type: 'ref', id: '1' } },
        },
      ],
      {
        '1': {
          type: 'Node',
          fields: {
            val: { type: 'int', value: 10 },
            left: { type: 'ref', id: '2' },
            right: { type: 'ref', id: '3' },
          },
        },
        '2': {
          type: 'Node',
          fields: {
            val: { type: 'int', value: 5 },
            left: { type: 'null' },
            right: { type: 'null' },
          },
        },
        '3': {
          type: 'Node',
          fields: {
            val: { type: 'int', value: 15 },
            left: { type: 'null' },
            right: { type: 'null' },
          },
        },
      },
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    // The root node should have child-slot labels (left, right) as field names
    // "val" should be rendered as a data field row
    expect(svg).toContain('>val</text>');
    expect(svg).toContain('>left</text>');
    expect(svg).toContain('>right</text>');
  });

  test('handles empty step gracefully', () => {
    const step = makeStep(
      1,
      [{ method: 'main', class: 'Test', locals: {} }],
      {},
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    // Should still be valid SVG
    expect(svg).toStartWith('<svg class="trace-memory"');
    expect(svg).toEndWith('</svg>');
    // Should have viewBox 0 0 0 0 for empty diagram
    expect(svg).toContain('viewBox="0 0 0 0"');
  });

  test('handles string heap objects', () => {
    const step = makeStep(
      5,
      [
        {
          method: 'main',
          class: 'Test',
          locals: { s: { type: 'ref', id: '1' } },
        },
      ],
      { '1': { type: 'String', value: 'hello' } },
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    // String object should show quoted text
    expect(svg).toContain('&quot;hello&quot;');
    // Should have an arrow to the string
    expect(svg).toContain('class="trace-arrow"');
  });

  test('renders boxed Java primitives as inline heap values', () => {
    const step = makeStep(
      5,
      [
        {
          method: 'main',
          class: 'Test',
          locals: { boxed: { type: 'ref', id: '1' } },
        },
      ],
      { '1': { type: 'java.lang.Integer', value: 42 } },
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    expect(svg).toContain('data-id="1"');
    expect(svg).toContain('>42</text>');
    expect(svg).not.toContain('class="trace-obj-border"');
    expect(svg).toContain('class="trace-arrow"');
  });

  test('targets boxed primitive arrows near the rendered value', () => {
    const step = makeStep(
      5,
      [
        {
          method: 'main',
          class: 'Test',
          locals: { boxed: { type: 'ref', id: '1' } },
        },
      ],
      { '1': { type: 'java.lang.Integer', value: 42 } },
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    const objectX = Number(
      svg.match(/data-id="1" transform="translate\(([^,]+),/)?.[1],
    );
    const arrowEndX = Number(
      svg.match(/class="trace-arrow" d="M \d+ \d+ Q \d+ \d+, (\d+) \d+"/)?.[1],
    );

    expect(arrowEndX).toBeGreaterThan(objectX);
  });

  test('handles array heap objects', () => {
    const step = makeStep(
      5,
      [
        {
          method: 'main',
          class: 'Test',
          locals: { arr: { type: 'ref', id: '1' } },
        },
      ],
      {
        '1': {
          type: 'int[]',
          elements: [
            { type: 'int', value: 1 },
            { type: 'int', value: 2 },
            { type: 'int', value: 3 },
          ],
        },
      },
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    // Should show array values
    expect(svg).toContain('>1</text>');
    expect(svg).toContain('>2</text>');
    expect(svg).toContain('>3</text>');
    // Should have cell separators
    expect(svg).toContain('class="trace-separator"');
  });

  test('multiple stack frames are rendered in reverse order', () => {
    // In JDI traces, stack[0] is the bottom (main), stack[1] is the newest call.
    // The renderer reverses the stack so the newest frame appears at the top
    // visually and main appears at the bottom.
    const step = makeStep(
      20,
      [
        {
          method: 'main',
          class: 'Test',
          line: 10,
          locals: { x: { type: 'int', value: 1 } },
        },
        {
          method: 'foo',
          class: 'Test',
          line: 20,
          locals: { y: { type: 'int', value: 2 } },
        },
      ],
      {},
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    // Both frames should be present
    expect(svg).toContain('main:10');
    expect(svg).toContain('foo:20');
    // foo (newest frame) should appear first in SVG output (top of diagram)
    const mainPos = svg.indexOf('main:10');
    const fooPos = svg.indexOf('foo:20');
    expect(fooPos).toBeLessThan(mainPos);
  });

  test('non-tree field object has no child-slot row', () => {
    const step = makeStep(
      5,
      [
        {
          method: 'main',
          class: 'Test',
          locals: { p: { type: 'ref', id: '1' } },
        },
      ],
      {
        '1': {
          type: 'Person',
          fields: {
            name: { type: 'String', value: 'Alice' },
            age: { type: 'int', value: 30 },
          },
        },
      },
    );
    const layout = computeLayout([step]);
    const svg = generateStepSvg(step, layout);

    // Should have field names as regular rows
    expect(svg).toContain('>name</text>');
    expect(svg).toContain('>age</text>');
    // Should have values
    expect(svg).toContain('>&quot;Alice&quot;</text>');
    expect(svg).toContain('>30</text>');
  });
});

describe('filterStep', () => {
  test('removes args from main locals', () => {
    const step = makeStep(
      1,
      [
        {
          method: 'main',
          class: 'Test',
          locals: {
            args: { type: 'ref', id: 'args_1' },
            x: { type: 'int', value: 5 },
          },
        },
      ],
      { args_1: { type: 'String[]', elements: [] } },
    );
    const { stack, heap } = filterStep(step);
    expect(stack[0].locals).not.toHaveProperty('args');
    expect(stack[0].locals).toHaveProperty('x');
    // args_1 should be filtered out since it's only reachable via args
    expect(heap).not.toHaveProperty('args_1');
  });

  test('keeps objects reachable from non-args variables', () => {
    const step = makeStep(
      1,
      [
        {
          method: 'main',
          class: 'Test',
          locals: {
            args: { type: 'ref', id: 'args_1' },
            node: { type: 'ref', id: '2' },
          },
        },
      ],
      {
        args_1: { type: 'String[]', elements: [] },
        '2': { type: 'Node', fields: { val: { type: 'int', value: 10 } } },
      },
    );
    const { heap } = filterStep(step);
    expect(heap).toHaveProperty('2');
    expect(heap).not.toHaveProperty('args_1');
  });

  test('removes heap objects that are no longer reachable from visible locals', () => {
    const step = makeStep(
      1,
      [
        {
          method: 'main',
          class: 'Test',
          locals: { current: { type: 'ref', id: '2' } },
        },
      ],
      {
        '1': { type: 'String', value: 'old temporary' },
        '2': { type: 'String', value: 'current' },
      },
    );

    const { heap } = filterStep(step);
    expect(heap).not.toHaveProperty('1');
    expect(heap).toHaveProperty('2');
  });

  test('keeps objects reachable from transient heap roots', () => {
    const step = makeStep(1, [{ method: 'main', class: 'Test', locals: {} }], {
      '1': { type: 'ArrayBag', fields: { items: { type: 'ref', id: '2' } } },
      '2': { type: 'Object[]', elements: [] },
    });
    step.transientHeapRoots = ['1'];

    const { heap } = filterStep(step);
    expect(heap).toHaveProperty('1');
    expect(heap).toHaveProperty('2');
  });
});

describe('formatValue', () => {
  test('null shows "null"', () => {
    expect(formatValue({ type: 'null' })).toBe('null');
  });

  test('boolean shows true/false', () => {
    expect(formatValue({ type: 'boolean', value: true })).toBe('true');
    expect(formatValue({ type: 'boolean', value: false })).toBe('false');
  });

  test('char shows quoted character', () => {
    expect(formatValue({ type: 'char', value: 'A' })).toBe("'A'");
  });

  test('String shows double-quoted', () => {
    expect(formatValue({ type: 'String', value: 'hi' })).toBe('"hi"');
  });

  test('int shows number', () => {
    expect(formatValue({ type: 'int', value: 42 })).toBe('42');
  });

  test('ref shows bullet', () => {
    expect(formatValue({ type: 'ref', id: '1' })).toBe('\u2022');
  });

  test('unknown shows ?', () => {
    expect(formatValue({ type: 'unknown' })).toBe('?');
  });

  test('uninitialized shows empty', () => {
    expect(formatValue({ type: 'uninitialized' })).toBe('');
  });

  test('truncated shows ellipsis with count', () => {
    expect(formatValue({ type: 'truncated', remaining: 5 })).toBe('\u2026(5)');
  });
});

describe('escapeXml', () => {
  test('escapes &, <, >, "', () => {
    expect(escapeXml('a & b')).toBe('a &amp; b');
    expect(escapeXml('<tag>')).toBe('&lt;tag&gt;');
    expect(escapeXml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  test('handles combined special chars', () => {
    expect(escapeXml('a & b < c > d "e"')).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot;',
    );
  });
});

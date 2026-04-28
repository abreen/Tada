import { describe, test, expect } from 'bun:test';
import {
  scanSteps,
  buildSupergraph,
  getObjectSize,
  computeLayout,
} from './trace-layout';
import type { TraceStep, TraceHeapObject, TraceStackFrame } from '../types';

function makeStep(
  line: number,
  stack: TraceStackFrame[],
  heap: Record<string, TraceHeapObject>,
): TraceStep {
  return { line, file: 'Test.java', stack, heap, output: [] };
}

const mainStack: TraceStackFrame[] = [
  { method: 'main', class: 'Test', locals: {} },
];

describe('scanSteps', () => {
  test('collects object lifetimes from multi-step traces', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': { type: 'Node', fields: { val: { type: 'int', value: 10 } } },
      }),
      makeStep(2, mainStack, {
        '1': { type: 'Node', fields: { val: { type: 'int', value: 10 } } },
        '2': { type: 'Node', fields: { val: { type: 'int', value: 20 } } },
      }),
      makeStep(3, mainStack, {
        '2': { type: 'Node', fields: { val: { type: 'int', value: 20 } } },
      }),
    ];

    const objects = scanSteps(steps);
    expect(objects.size).toBe(2);

    const obj1 = objects.get('1')!;
    expect(obj1.firstStep).toBe(0);
    expect(obj1.lastStep).toBe(1);
    expect(obj1.type).toBe('Node');

    const obj2 = objects.get('2')!;
    expect(obj2.firstStep).toBe(1);
    expect(obj2.lastStep).toBe(2);
  });

  test('collects references from field objects', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Node',
          fields: { left: { type: 'ref', id: '2' }, right: { type: 'null' } },
        },
        '2': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
      }),
      makeStep(2, mainStack, {
        '1': {
          type: 'Node',
          fields: {
            left: { type: 'ref', id: '2' },
            right: { type: 'ref', id: '3' },
          },
        },
        '2': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
        '3': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
      }),
    ];

    const objects = scanSteps(steps);
    const obj1 = objects.get('1')!;
    expect(obj1.references.has('2')).toBe(true);
    expect(obj1.references.has('3')).toBe(true);
    expect(obj1.fieldNames.has('left')).toBe(true);
    expect(obj1.fieldNames.has('right')).toBe(true);
    expect(obj1.maxFields).toBe(2);
  });

  test('detects arrays and tracks max elements', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'int[]',
          elements: [
            { type: 'int', value: 1 },
            { type: 'int', value: 2 },
          ],
        },
      }),
      makeStep(2, mainStack, {
        '1': {
          type: 'int[]',
          elements: [
            { type: 'int', value: 1 },
            { type: 'int', value: 2 },
            { type: 'int', value: 3 },
          ],
        },
      }),
    ];

    const objects = scanSteps(steps);
    const obj = objects.get('1')!;
    expect(obj.isArray).toBe(true);
    expect(obj.maxElements).toBe(3);
  });

  test('detects string objects', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, { '1': { type: 'String', value: 'hello' } }),
    ];

    const objects = scanSteps(steps);
    const obj = objects.get('1')!;
    expect(obj.isString).toBe(true);
    expect(obj.value).toBe('hello');
  });
});

describe('buildSupergraph', () => {
  test('finds structural children from field refs', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Node',
          fields: {
            left: { type: 'ref', id: '2' },
            right: { type: 'ref', id: '3' },
          },
        },
        '2': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
        '3': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
      }),
    ];

    const objects = scanSteps(steps);
    const { graph, referenced } = buildSupergraph(objects);

    expect(graph.get('1')).toEqual(expect.arrayContaining(['2', '3']));
    expect(graph.get('1')!.length).toBe(2);
    expect(referenced.has('2')).toBe(true);
    expect(referenced.has('3')).toBe(true);
    expect(referenced.has('1')).toBe(false);
  });

  test('returns fieldToChild mapping', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Node',
          fields: {
            left: { type: 'ref', id: '2' },
            right: { type: 'ref', id: '3' },
          },
        },
        '2': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
        '3': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
      }),
    ];

    const objects = scanSteps(steps);
    const { fieldToChild } = buildSupergraph(objects);

    const fMap = fieldToChild.get('1')!;
    expect(fMap).toBeDefined();
    expect(fMap.get('left')).toBe('2');
    expect(fMap.get('right')).toBe('3');
  });

  test('respects ignoreFields', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Node',
          fields: {
            left: { type: 'ref', id: '2' },
            parent: { type: 'ref', id: '3' },
          },
        },
        '2': { type: 'Node', fields: {} },
        '3': { type: 'Node', fields: {} },
      }),
    ];

    const objects = scanSteps(steps);
    const { graph, referenced } = buildSupergraph(objects, {
      Node: ['parent'],
    });

    expect(graph.get('1')).toEqual(['2']);
    expect(referenced.has('2')).toBe(true);
    expect(referenced.has('3')).toBe(false);
  });

  test('follows array element refs', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Object[]',
          elements: [
            { type: 'ref', id: '2' },
            { type: 'ref', id: '3' },
          ],
        },
        '2': { type: 'String', value: 'a' },
        '3': { type: 'String', value: 'b' },
      }),
    ];

    const objects = scanSteps(steps);
    const { graph, referenced } = buildSupergraph(objects);

    expect(graph.get('1')).toEqual(expect.arrayContaining(['2', '3']));
    expect(referenced.has('2')).toBe(true);
    expect(referenced.has('3')).toBe(true);
  });
});

describe('getObjectSize', () => {
  test('sizes a string object', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, { '1': { type: 'String', value: 'hello' } }),
    ];
    const objects = scanSteps(steps);
    const size = getObjectSize(objects.get('1')!);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
    expect(size.cellWidth).toBeUndefined();
  });

  test('sizes an array with cellWidth', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'int[]',
          elements: [
            { type: 'int', value: 1 },
            { type: 'int', value: 2 },
            { type: 'int', value: 3 },
          ],
        },
      }),
    ];
    const objects = scanSteps(steps);
    const size = getObjectSize(objects.get('1')!);
    expect(size.cellWidth).toBeDefined();
    expect(size.cellWidth).toBeGreaterThan(0);
    expect(size.valueX).toBeUndefined();
  });

  test('sizes a field object without child fields: no extra header row', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Person',
          fields: {
            name: { type: 'String', value: 'Alice' },
            age: { type: 'int', value: 30 },
          },
        },
      }),
    ];
    const objects = scanSteps(steps);
    const size = getObjectSize(objects.get('1')!);
    expect(size.valueX).toBeDefined();
    expect(size.valueX).toBeGreaterThan(0);
    // 2 data fields, no child slots = 2 rows
    expect(size.height).toBe(15 * 2 * 2);
  });

  test('sizes a tree node with child fields: data rows + 1 child-slot row', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Node',
          fields: {
            val: { type: 'int', value: 42 },
            left: { type: 'null' },
            right: { type: 'null' },
          },
        },
      }),
    ];
    const objects = scanSteps(steps);
    // Pass left and right as child fields
    const childFields = new Set(['left', 'right']);
    const size = getObjectSize(objects.get('1')!, 15, childFields);
    expect(size.valueX).toBeDefined();
    expect(size.valueX).toBeGreaterThan(0);
    // 1 data field (val) + 2 child-slot rows (label + box) = 3 rows
    expect(size.height).toBe(15 * 2 * 3);
  });
});

describe('computeLayout', () => {
  test('returns empty layout for empty steps', () => {
    const layout = computeLayout([]);
    expect(Object.keys(layout.objects)).toHaveLength(0);
  });

  test('returns empty layout for steps with no heap objects', () => {
    const layout = computeLayout([makeStep(1, mainStack, {})]);
    expect(Object.keys(layout.objects)).toHaveLength(0);
  });

  test('BST: root above children, left child left of right child, same y', () => {
    // Build a BST: root(1) -> left(2), right(3)
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
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
      }),
    ];

    const layout = computeLayout(steps);
    const pos = layout.objects;

    expect(pos['1']).toBeDefined();
    expect(pos['2']).toBeDefined();
    expect(pos['3']).toBeDefined();

    // Root should be above children
    expect(pos['1'].y).toBeLessThan(pos['2'].y);
    expect(pos['1'].y).toBeLessThan(pos['3'].y);

    // Children at the same depth
    expect(pos['2'].y).toBe(pos['3'].y);

    // Left child should be to the left of right child
    expect(pos['2'].x).toBeLessThan(pos['3'].x);

    // All coordinates should be non-negative
    expect(pos['1'].x).toBeGreaterThanOrEqual(0);
    expect(pos['1'].y).toBeGreaterThanOrEqual(0);
    expect(pos['2'].x).toBeGreaterThanOrEqual(0);
    expect(pos['2'].y).toBeGreaterThanOrEqual(0);
    expect(pos['3'].x).toBeGreaterThanOrEqual(0);
    expect(pos['3'].y).toBeGreaterThanOrEqual(0);

    // Root should have childFields set
    expect(pos['1'].childFields).toBeDefined();
    expect(pos['1'].childFields).toContain('left');
    expect(pos['1'].childFields).toContain('right');
  });

  test('linked list: each node to the right of the previous', () => {
    // A -> B -> C (chain / linked list)
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Node',
          fields: {
            val: { type: 'int', value: 1 },
            next: { type: 'ref', id: '2' },
          },
        },
        '2': {
          type: 'Node',
          fields: {
            val: { type: 'int', value: 2 },
            next: { type: 'ref', id: '3' },
          },
        },
        '3': {
          type: 'Node',
          fields: { val: { type: 'int', value: 3 }, next: { type: 'null' } },
        },
      }),
    ];

    const layout = computeLayout(steps);
    const pos = layout.objects;

    // Chain type (1 structural child field): laid out left to right
    expect(pos['1'].y).toBe(pos['2'].y);
    expect(pos['2'].y).toBe(pos['3'].y);
    expect(pos['1'].x).toBeLessThan(pos['2'].x);
    expect(pos['2'].x).toBeLessThan(pos['3'].x);
  });

  test('layout stability: supergraph union produces same positions regardless of step order', () => {
    // Object '3' appears only in step 2, but the supergraph should still
    // place it consistently because we scan ALL steps.
    const stepsEarly: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Node',
          fields: {
            left: { type: 'ref', id: '2' },
            right: { type: 'ref', id: '3' },
          },
        },
        '2': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
        '3': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
      }),
    ];

    // Same final state but objects appear across two steps
    const stepsLate: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Node',
          fields: { left: { type: 'ref', id: '2' }, right: { type: 'null' } },
        },
        '2': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
      }),
      makeStep(2, mainStack, {
        '1': {
          type: 'Node',
          fields: {
            left: { type: 'ref', id: '2' },
            right: { type: 'ref', id: '3' },
          },
        },
        '2': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
        '3': {
          type: 'Node',
          fields: { left: { type: 'null' }, right: { type: 'null' } },
        },
      }),
    ];

    const layoutEarly = computeLayout(stepsEarly);
    const layoutLate = computeLayout(stepsLate);

    // Both should produce the same positions because the supergraph
    // (union of all references across all steps) is the same
    for (const id of ['1', '2', '3']) {
      expect(layoutLate.objects[id].x).toBe(layoutEarly.objects[id].x);
      expect(layoutLate.objects[id].y).toBe(layoutEarly.objects[id].y);
      expect(layoutLate.objects[id].width).toBe(layoutEarly.objects[id].width);
      expect(layoutLate.objects[id].height).toBe(
        layoutEarly.objects[id].height,
      );
    }
  });

  test('multiple disconnected roots are stacked vertically', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': { type: 'Node', fields: { val: { type: 'int', value: 1 } } },
        '2': { type: 'Node', fields: { val: { type: 'int', value: 2 } } },
      }),
    ];

    const layout = computeLayout(steps);
    const pos = layout.objects;

    // Both are roots (neither references the other)
    // They should be stacked: second root below the first
    expect(pos['1'].y).toBeLessThan(pos['2'].y);
  });

  test('passes through ignoreFields', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Node',
          fields: {
            left: { type: 'ref', id: '2' },
            parent: { type: 'ref', id: '3' },
          },
        },
        '2': { type: 'Node', fields: {} },
        '3': { type: 'Node', fields: {} },
      }),
    ];

    const layout = computeLayout(steps, { Node: ['parent'] });

    // With 'parent' ignored, only 'left' is structural (1 field = chain).
    // '2' should be to the right of '1', '3' is a separate root below.
    expect(layout.objects['1'].x).toBeLessThan(layout.objects['2'].x);
    expect(layout.objects['1'].y).toBe(layout.objects['2'].y);

    expect(layout.ignoreFields).toEqual({ Node: ['parent'] });
  });

  test('handles cycles gracefully', () => {
    // Create a cycle: 1 -> 2 -> 1
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': { type: 'Node', fields: { next: { type: 'ref', id: '2' } } },
        '2': { type: 'Node', fields: { next: { type: 'ref', id: '1' } } },
      }),
    ];

    // Should not infinite-loop; both objects should get positions
    const layout = computeLayout(steps);
    expect(layout.objects['1']).toBeDefined();
    expect(layout.objects['2']).toBeDefined();
  });

  test('non-tree references (different types) do not get childFields', () => {
    // A Person referencing a String -- not a tree structure
    const steps: TraceStep[] = [
      makeStep(1, mainStack, {
        '1': {
          type: 'Person',
          fields: {
            name: { type: 'ref', id: '2' },
            age: { type: 'int', value: 30 },
          },
        },
        '2': { type: 'String', value: 'Alice' },
      }),
    ];

    const layout = computeLayout(steps);
    // Person should NOT have childFields since String is a different type
    expect(layout.objects['1'].childFields).toBeUndefined();
  });

  test('reuses orphan rows for objects with non-overlapping lifetimes', () => {
    const steps: TraceStep[] = [
      makeStep(1, mainStack, { '1': { type: 'String', value: 'a' } }),
      makeStep(2, mainStack, { '2': { type: 'String', value: 'b' } }),
      makeStep(3, mainStack, { '3': { type: 'String', value: 'c' } }),
    ];

    const layout = computeLayout(steps);
    expect(layout.objects['1'].y).toBe(layout.objects['2'].y);
    expect(layout.objects['2'].y).toBe(layout.objects['3'].y);
  });
});

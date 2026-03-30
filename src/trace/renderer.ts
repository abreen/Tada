import Konva from 'konva';
import type {
  TraceStep,
  TraceStackFrame,
  TraceValue,
  TraceHeapObject,
} from './types';

const ARRAY_MAX_CELLS = 12;
const SECTION_GAP = 60;
const OBJ_GAP = 24;
const PADDING = 8;

let FONT = 'monospace';
let FONT_SIZE = 16;
let HEADER_FONT_SIZE = 16;

let FRAME_WIDTH = 170;
let FRAME_HEADER_H = 28;
let VAR_ROW_H = 24;
let VAR_BOX_X = 100;
let VAR_BOX_W = 60;
let OBJ_WIDTH = 180;
let OBJ_FIELD_H = 24;
let OBJ_FIELD_NAME_X = 10;
let OBJ_FIELD_VALUE_X = 100;
let ARRAY_CELL_W = 44;
let ARRAY_CELL_H = 28;

interface Colors {
  fg: string;
  fg2: string;
  bg: string;
  bg2: string;
  theme: string;
  textOnTheme: string;
}

function getColors(): Colors {
  const s = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  FONT = get('--mono-font', 'monospace');
  FONT_SIZE = parseInt(get('--font-size-smaller', '15'), 10);
  HEADER_FONT_SIZE = FONT_SIZE;

  const row = Math.round(FONT_SIZE * 2);
  FRAME_HEADER_H = row;
  VAR_ROW_H = row;
  ARRAY_CELL_H = row;
  OBJ_FIELD_H = row;
  VAR_BOX_X = Math.round(FONT_SIZE * 7);
  VAR_BOX_W = Math.round(FONT_SIZE * 4);
  FRAME_WIDTH = VAR_BOX_X + VAR_BOX_W + PADDING;
  OBJ_FIELD_NAME_X = Math.round(FONT_SIZE * 0.5);
  OBJ_FIELD_VALUE_X = Math.round(FONT_SIZE * 7);
  OBJ_WIDTH = Math.round(FONT_SIZE * 12);
  ARRAY_CELL_W = Math.round(FONT_SIZE * 3);

  return {
    fg: get('--fg-color', '#1a1a1a'),
    fg2: get('--fg2-color', '#666'),
    bg: get('--bg-color', '#fafafa'),
    bg2: get('--bg2-color', '#eee'),
    theme: get('--theme-color', '#1f8aad'),
    textOnTheme: get('--text-on-theme', '#fff'),
  };
}

function filterStep(step: TraceStep): {
  stack: TraceStackFrame[];
  heap: Record<string, TraceHeapObject>;
} {
  // Remove 'args' from main() locals
  const stack = step.stack.map(frame => {
    if (frame.method !== 'main') {
      return frame;
    }
    const locals: Record<string, TraceValue> = {};
    for (const [name, val] of Object.entries(frame.locals)) {
      if (name === 'args') {
        continue;
      }
      locals[name] = val;
    }
    return { ...frame, locals };
  });

  // Find objects reachable only through the hidden 'args' variable
  const argsOnly = new Set<string>();
  for (const frame of step.stack) {
    if (frame.method === 'main') {
      const argsVal = frame.locals.args;
      if (argsVal?.type === 'ref') {
        const q = [argsVal.id];
        while (q.length > 0) {
          const id = q.shift()!;
          if (argsOnly.has(id) || !step.heap[id]) {
            continue;
          }
          argsOnly.add(id);
          const obj = step.heap[id];
          if ('elements' in obj) {
            for (const el of obj.elements) {
              if (el.type === 'ref') {
                q.push(el.id);
              }
            }
          } else if ('fields' in obj) {
            for (const v of Object.values(obj.fields)) {
              if (v.type === 'ref') {
                q.push(v.id);
              }
            }
          }
        }
      }
    }
  }

  // Find objects reachable from visible (non-args) variables
  const reachable = new Set<string>();
  const queue: string[] = [];
  for (const frame of stack) {
    for (const val of Object.values(frame.locals)) {
      if (val.type === 'ref') {
        queue.push(val.id);
      }
    }
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id) || !step.heap[id]) {
      continue;
    }
    reachable.add(id);
    const obj = step.heap[id];
    if ('elements' in obj) {
      for (const el of obj.elements) {
        if (el.type === 'ref') {
          queue.push(el.id);
        }
      }
    } else if ('fields' in obj) {
      for (const val of Object.values(obj.fields)) {
        if (val.type === 'ref') {
          queue.push(val.id);
        }
      }
    }
  }

  // Keep heap objects that are reachable from visible variables, or that
  // exist in the trace heap but aren't exclusively from the hidden 'args'
  // (e.g., in-flight objects being constructed on the operand stack)
  const heap: Record<string, TraceHeapObject> = {};
  const sortedIds = Object.keys(step.heap)
    .filter(id => reachable.has(id) || !argsOnly.has(id))
    .sort((a, b) => {
      const numA = parseInt(a.split('_').pop()!, 10);
      const numB = parseInt(b.split('_').pop()!, 10);
      return numA - numB;
    });
  for (const id of sortedIds) {
    heap[id] = step.heap[id];
  }

  return { stack, heap };
}

interface FrameLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: TraceStackFrame;
  varPositions: Map<string, { x: number; y: number }>;
}

interface ObjectLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cellWidth?: number;
  valueX?: number; // x-offset where value boxes start (for field objects)
  fieldPositions: Map<string, { x: number; y: number }>;
}

interface ArrowEndpoints {
  fromX: number;
  fromY: number;
  stubX: number; // X past the right edge of the source box
  toX: number;
  toY: number;
  approachDir: 'left' | 'right' | 'below';
}

function layoutStack(stack: TraceStackFrame[], stackX: number): FrameLayout[] {
  const layouts: FrameLayout[] = [];
  let y = 0;

  // Reverse so main() is at top, newest frame at bottom (stack grows down)
  const reversed = [...stack].reverse();
  for (const frame of reversed) {
    const varCount = Object.keys(frame.locals).length;
    const varsH = Math.max(varCount, 1) * VAR_ROW_H;
    const height = FRAME_HEADER_H + varsH + PADDING;
    const varPositions = new Map<string, { x: number; y: number }>();

    let rowY = FRAME_HEADER_H;
    for (const name of Object.keys(frame.locals)) {
      // Arrow starts from center of the value box
      varPositions.set(name, {
        x: stackX + VAR_BOX_X + VAR_BOX_W / 2,
        y: y + rowY + VAR_ROW_H / 2,
      });
      rowY += VAR_ROW_H;
    }

    layouts.push({
      x: stackX,
      y,
      width: FRAME_WIDTH,
      height,
      frame,
      varPositions,
    });
    y += height;
  }

  return layouts;
}

let _measureCtx: CanvasRenderingContext2D | null = null;

function measureText(text: string, fontSize: number): number {
  if (!_measureCtx) {
    const canvas = document.createElement('canvas');
    _measureCtx = canvas.getContext('2d')!;
  }
  _measureCtx.font = `${fontSize}px ${FONT}`;
  return Math.ceil(_measureCtx.measureText(text).width);
}

function isStringObject(obj: TraceHeapObject): boolean {
  return 'value' in obj && obj.type === 'String';
}

function getObjectSize(obj: TraceHeapObject): {
  width: number;
  height: number;
  valueX?: number;
} {
  if ('value' in obj && isStringObject(obj)) {
    const text = `"${obj.value}"`;
    return { width: measureText(text, FONT_SIZE) + 8, height: FONT_SIZE + 8 };
  }
  if ('elements' in obj) {
    const cellCount = Math.min(obj.elements.length, ARRAY_MAX_CELLS);
    // Measure widest cell content
    let maxCellW = ARRAY_CELL_W;
    for (const el of obj.elements.slice(0, cellCount)) {
      if (el.type !== 'ref') {
        const w = measureText(formatValue(el), FONT_SIZE) + 16;
        if (w > maxCellW) {
          maxCellW = w;
        }
      }
    }
    return { width: cellCount * maxCellW, height: ARRAY_CELL_H };
  }
  if ('fields' in obj) {
    const fieldCount = Object.keys(obj.fields).length;
    const padding = Math.round(FONT_SIZE * 0.5);
    let maxNameW = 0;
    let maxValW = 0;
    for (const [name, val] of Object.entries(obj.fields)) {
      const nw = measureText(name, FONT_SIZE);
      if (nw > maxNameW) {
        maxNameW = nw;
      }
      if (val.type !== 'ref') {
        const vw = measureText(formatValue(val), FONT_SIZE);
        if (vw > maxValW) {
          maxValW = vw;
        }
      }
    }
    // Value box needs at least enough room for a ref arrow or the widest value
    const valBoxW = Math.max(maxValW + padding * 2, VAR_BOX_W);
    const valueX = padding + maxNameW + padding;
    return {
      width: valueX + valBoxW,
      height: Math.max(fieldCount, 1) * OBJ_FIELD_H,
      valueX,
    };
  }
  // Other value object
  return { width: OBJ_WIDTH, height: OBJ_FIELD_H };
}

function layoutHeap(
  heap: Record<string, TraceHeapObject>,
  heapX: number,
): ObjectLayout[] {
  const layouts: ObjectLayout[] = [];
  let y = PADDING;

  for (const [id, obj] of Object.entries(heap)) {
    const { width, height, valueX } = getObjectSize(obj);
    const fieldPositions = new Map<string, { x: number; y: number }>();
    let cellWidth: number | undefined;

    if (isStringObject(obj)) {
      // No fields for strings
    } else if ('elements' in obj) {
      const cellCount = Math.min(obj.elements.length, ARRAY_MAX_CELLS);
      cellWidth = cellCount > 0 ? width / cellCount : ARRAY_CELL_W;
      for (let i = 0; i < cellCount; i++) {
        fieldPositions.set(String(i), {
          x: heapX + (i + 0.5) * cellWidth,
          y: y + ARRAY_CELL_H,
        });
      }
    } else if ('fields' in obj) {
      const vx = valueX ?? OBJ_FIELD_VALUE_X;
      let rowY = 0;
      for (const name of Object.keys(obj.fields)) {
        fieldPositions.set(name, {
          x: heapX + vx + (width - vx) / 2,
          y: y + rowY + OBJ_FIELD_H / 2,
        });
        rowY += OBJ_FIELD_H;
      }
    }

    layouts.push({
      id,
      x: heapX,
      y,
      width,
      height,
      cellWidth,
      valueX,
      fieldPositions,
    });
    y += height + OBJ_GAP;
  }

  return layouts;
}

const ARROW_STUB = 24;
const ARROW_GAP = 8;

const ENDPOINT_GAP = 8;

interface PendingArrow {
  fromX: number;
  fromY: number;
  stubX: number;
  targetId: string;
}

function collectArrows(
  stack: TraceStackFrame[],
  heap: Record<string, TraceHeapObject>,
  stackLayouts: FrameLayout[],
  heapLayouts: ObjectLayout[],
): ArrowEndpoints[] {
  const objectMap = new Map(heapLayouts.map(l => [l.id, l]));
  const pending: PendingArrow[] = [];

  // Collect from stack variables
  for (const frameLayout of stackLayouts) {
    for (const [name, val] of Object.entries(frameLayout.frame.locals)) {
      if (val.type !== 'ref') {
        continue;
      }
      const from = frameLayout.varPositions.get(name);
      if (objectMap.has(val.id) && from) {
        pending.push({
          fromX: from.x,
          fromY: from.y,
          stubX: frameLayout.x + frameLayout.width + ARROW_STUB,
          targetId: val.id,
        });
      }
    }
  }

  // Collect from heap object fields and array elements
  for (const objLayout of heapLayouts) {
    const obj = heap[objLayout.id];
    if ('fields' in obj) {
      for (const [name, val] of Object.entries(obj.fields)) {
        if (val.type !== 'ref') {
          continue;
        }
        const from = objLayout.fieldPositions.get(name);
        if (objectMap.has(val.id) && from) {
          pending.push({
            fromX: from.x,
            fromY: from.y,
            stubX: objLayout.x + objLayout.width + ARROW_STUB,
            targetId: val.id,
          });
        }
      }
    }
    if ('elements' in obj) {
      for (let i = 0; i < Math.min(obj.elements.length, ARRAY_MAX_CELLS); i++) {
        const el = obj.elements[i];
        if (el.type !== 'ref') {
          continue;
        }
        const from = objLayout.fieldPositions.get(String(i));
        if (objectMap.has(el.id) && from) {
          pending.push({
            fromX: from.x,
            fromY: from.y,
            stubX: objLayout.x + objLayout.width + ARROW_STUB,
            targetId: el.id,
          });
        }
      }
    }
  }

  // Group arrows by (targetId, side)
  const groups = new Map<string, PendingArrow[]>();
  const sideMap = new Map<string, 'left' | 'right'>();

  for (const pa of pending) {
    const target = objectMap.get(pa.targetId)!;
    const heapObj = heap[pa.targetId];

    // Strings always use left middle directly
    if (heapObj && isStringObject(heapObj)) {
      const key = `${pa.targetId}:left`;
      sideMap.set(key, 'left');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(pa);
      continue;
    }

    // Choose side: stub left of target center → left, otherwise right
    const centerX = target.x + target.width / 2;
    const side = pa.stubX <= centerX ? 'left' : 'right';
    const key = `${pa.targetId}:${side}`;
    sideMap.set(key, side);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pa);
  }

  // Distribute endpoints along each side
  const result: ArrowEndpoints[] = [];

  for (const [key, arrows] of groups) {
    const targetId = key.split(':')[0];
    const side = sideMap.get(key)!;
    const target = objectMap.get(targetId)!;
    const heapObj = heap[targetId];

    // Strings: single anchor at left middle
    if (heapObj && isStringObject(heapObj)) {
      for (const pa of arrows) {
        result.push({
          fromX: pa.fromX,
          fromY: pa.fromY,
          stubX: pa.stubX,
          toX: target.x - ARROW_GAP,
          toY: target.y + target.height / 2,
          approachDir: 'left',
        });
      }
      continue;
    }

    // Sort by source Y to minimize crossing
    arrows.sort((a, b) => a.fromY - b.fromY);

    const count = arrows.length;
    const sideX = side === 'left' ? target.x : target.x + target.width;
    const gapDir = side === 'left' ? -1 : 1;
    const sideHeight = target.height;
    const maxOnSide = Math.floor(sideHeight / ENDPOINT_GAP) + 1;

    const endpoints: {
      x: number;
      y: number;
      dir: 'left' | 'right' | 'below';
    }[] = [];

    {
      // Center on the side (always, even with overflow)
      const onSideCount = Math.min(count, maxOnSide);
      const span = (onSideCount - 1) * ENDPOINT_GAP;
      const startY = target.y + (sideHeight - span) / 2;
      for (let i = 0; i < onSideCount; i++) {
        endpoints.push({
          x: sideX + gapDir * ARROW_GAP,
          y: startY + i * ENDPOINT_GAP,
          dir: side,
        });
      }
      // Spill onto bottom edge from the corner inward
      const remaining = count - onSideCount;
      const inward = side === 'left' ? 1 : -1;
      for (let i = 0; i < remaining; i++) {
        endpoints.push({
          x: sideX + inward * (i + 1) * ENDPOINT_GAP,
          y: target.y + target.height + ARROW_GAP,
          dir: 'below',
        });
      }
    }

    for (let i = 0; i < count; i++) {
      result.push({
        fromX: arrows[i].fromX,
        fromY: arrows[i].fromY,
        stubX: arrows[i].stubX,
        toX: endpoints[i].x,
        toY: endpoints[i].y,
        approachDir: endpoints[i].dir,
      });
    }
  }

  return result;
}

function drawFrame(
  layer: Konva.Layer,
  layout: FrameLayout,
  colors: Colors,
  isFirst: boolean,
): void {
  const { x, y, width, frame } = layout;
  const group = new Konva.Group({ x, y });

  // Separator between frames (not for the first)
  if (!isFirst) {
    group.add(
      new Konva.Line({
        points: [0, 0, width, 0],
        stroke: colors.fg2,
        strokeWidth: 1,
      }),
    );
  }

  // Frame label (method name with line number)
  group.add(
    new Konva.Text({
      x: 6,
      height: FRAME_HEADER_H,
      text: `${frame.method}:${frame.line}`,
      fontSize: HEADER_FONT_SIZE,
      fontFamily: FONT,
      fill: colors.fg,
      verticalAlign: 'middle',
      fontStyle: 'bold',
    }),
  );

  // Each variable: name label, then a value box to its right
  let rowY = FRAME_HEADER_H;
  for (const [name, val] of Object.entries(frame.locals)) {
    // Variable name (right-aligned before the box)
    group.add(
      new Konva.Text({
        x: 0,
        y: rowY,
        width: VAR_BOX_X - 8,
        height: VAR_ROW_H,
        text: name,
        fontSize: FONT_SIZE,
        fontFamily: FONT,
        fill: colors.fg,
        align: 'right',
        verticalAlign: 'middle',
      }),
    );

    // Value box
    group.add(
      new Konva.Rect({
        x: VAR_BOX_X,
        y: rowY,
        width: VAR_BOX_W,
        height: VAR_ROW_H,
        stroke: colors.fg2,
        strokeWidth: 1,
      }),
    );

    if (val.type === 'ref') {
      // Arrow starts from center of box (no dot drawn)
    } else {
      // Value text centered in box
      group.add(
        new Konva.Text({
          x: VAR_BOX_X,
          y: rowY,
          width: VAR_BOX_W,
          height: VAR_ROW_H,
          text: formatValue(val),
          fontSize: FONT_SIZE,
          fontFamily: FONT,
          fill: val.type === 'null' ? colors.fg2 : colors.fg,
          align: 'center',
          verticalAlign: 'middle',
        }),
      );
    }

    rowY += VAR_ROW_H;
  }

  layer.add(group);
}

function drawHeapObj(
  layer: Konva.Layer,
  layout: ObjectLayout,
  obj: TraceHeapObject,
  colors: Colors,
): void {
  const { x, y, width, height } = layout;
  const group = new Konva.Group({ x, y });

  if ('value' in obj && isStringObject(obj)) {
    // Strings: just the quoted value, no box
    group.add(
      new Konva.Text({
        x: 0,
        y: 0,
        width,
        height,
        text: `"${obj.value}"`,
        fontSize: FONT_SIZE,
        fontFamily: FONT,
        fill: colors.fg,
        verticalAlign: 'middle',
      }),
    );
    layer.add(group);
    return;
  }

  // Box outline
  group.add(
    new Konva.Rect({ width, height, stroke: colors.fg2, strokeWidth: 1 }),
  );

  if ('elements' in obj) {
    const cellCount = Math.min(obj.elements.length, ARRAY_MAX_CELLS);
    const cw = layout.cellWidth ?? ARRAY_CELL_W;
    for (let i = 0; i < cellCount; i++) {
      const cellX = i * cw;

      if (i > 0) {
        group.add(
          new Konva.Line({
            points: [cellX, 0, cellX, height],
            stroke: colors.fg2,
            strokeWidth: 1,
          }),
        );
      }

      const el = obj.elements[i];
      if (el.type === 'ref') {
        // Arrow starts from center of cell (no dot drawn)
      } else {
        group.add(
          new Konva.Text({
            x: cellX,
            y: 0,
            width: cw,
            height: ARRAY_CELL_H,
            text: formatValue(el),
            fontSize: FONT_SIZE,
            fontFamily: FONT,
            fill: el.type === 'null' ? colors.fg2 : colors.fg,
            align: 'center',
            verticalAlign: 'middle',
          }),
        );
      }
    }
  } else if ('fields' in obj) {
    const vx = layout.valueX ?? OBJ_FIELD_VALUE_X;
    let rowY = 0;
    for (const [name, val] of Object.entries(obj.fields)) {
      if (rowY > 0) {
        group.add(
          new Konva.Line({
            points: [0, rowY, width, rowY],
            stroke: colors.fg2,
            strokeWidth: 1,
          }),
        );
      }

      group.add(
        new Konva.Text({
          x: OBJ_FIELD_NAME_X,
          y: rowY,
          height: OBJ_FIELD_H,
          text: name,
          fontSize: FONT_SIZE,
          fontFamily: FONT,
          fill: colors.fg,
          verticalAlign: 'middle',
        }),
      );

      // Value box (matching stack frame variable boxes)
      group.add(
        new Konva.Rect({
          x: vx,
          y: rowY,
          width: width - vx,
          height: OBJ_FIELD_H,
          stroke: colors.fg2,
          strokeWidth: 1,
        }),
      );

      if (val.type !== 'ref') {
        group.add(
          new Konva.Text({
            x: vx,
            y: rowY,
            width: width - vx,
            height: OBJ_FIELD_H,
            text: formatValue(val),
            fontSize: FONT_SIZE,
            fontFamily: FONT,
            fill: val.type === 'null' ? colors.fg2 : colors.fg,
            align: 'center',
            verticalAlign: 'middle',
          }),
        );
      }

      rowY += OBJ_FIELD_H;
    }
  } else if ('value' in obj) {
    group.add(
      new Konva.Text({
        x: OBJ_FIELD_NAME_X,
        y: 0,
        width: width - 20,
        height: OBJ_FIELD_H,
        text: String(obj.value),
        fontSize: FONT_SIZE,
        fontFamily: FONT,
        fill: colors.fg,
        verticalAlign: 'middle',
      }),
    );
  }

  layer.add(group);
}

const ARROW_STRAIGHT = 10;

function drawArrow(
  layer: Konva.Layer,
  arrow: ArrowEndpoints,
  colors: Colors,
): void {
  // cp1: extend horizontally right to stubX (outside the source box)
  const cp1x = arrow.stubX;
  const cp1y = arrow.fromY;

  let straightStartX: number;
  let straightStartY: number;
  let cp2x: number;
  let cp2y: number;

  if (arrow.approachDir === 'left') {
    straightStartX = arrow.toX - ARROW_STRAIGHT;
    straightStartY = arrow.toY;
    cp2x = straightStartX - ARROW_STUB;
    cp2y = arrow.toY;
  } else if (arrow.approachDir === 'right') {
    straightStartX = arrow.toX + ARROW_STRAIGHT;
    straightStartY = arrow.toY;
    cp2x = straightStartX + ARROW_STUB;
    cp2y = arrow.toY;
  } else {
    // 'below'
    straightStartX = arrow.toX;
    straightStartY = arrow.toY + ARROW_STRAIGHT;
    cp2x = arrow.toX;
    cp2y = straightStartY + ARROW_STUB;
  }

  // Bezier curve from source to start of straight segment
  layer.add(
    new Konva.Shape({
      sceneFunc: (ctx, shape) => {
        ctx.beginPath();
        ctx.moveTo(arrow.fromX, arrow.fromY);
        ctx.bezierCurveTo(
          cp1x,
          cp1y,
          cp2x,
          cp2y,
          straightStartX,
          straightStartY,
        );
        ctx.strokeShape(shape);
      },
      stroke: colors.fg,
      strokeWidth: 1.5,
    }),
  );

  // Straight arrow from end of curve to anchor point
  layer.add(
    new Konva.Arrow({
      points: [straightStartX, straightStartY, arrow.toX, arrow.toY],
      pointerLength: 8,
      pointerWidth: 6,
      fill: colors.fg,
      stroke: colors.fg,
      strokeWidth: 1.5,
    }),
  );
}

export function renderMemoryDiagram(
  container: HTMLElement,
  step: TraceStep,
): { stage: Konva.Stage; width: number; height: number } | null {
  container.innerHTML = '';

  const { stack, heap } = filterStep(step);

  const hasVars = stack.some(f => Object.keys(f.locals).length > 0);
  const hasHeap = Object.keys(heap).length > 0;
  if (!hasVars && !hasHeap) {
    return null;
  }

  const colors = getColors();
  const stackX = 0;
  const stackLayouts = layoutStack(stack, stackX);
  const stackRight = stackX + FRAME_WIDTH;
  const stackBottom =
    stackLayouts.length > 0
      ? Math.max(...stackLayouts.map(l => l.y + l.height))
      : 0;
  const heapX = stackRight + SECTION_GAP;
  const heapLayouts = layoutHeap(heap, heapX);

  const heapBottom =
    heapLayouts.length > 0
      ? Math.max(...heapLayouts.map(l => l.y + l.height))
      : 0;
  const heapRight =
    heapLayouts.length > 0
      ? Math.max(...heapLayouts.map(l => l.x + l.width))
      : heapX;

  const totalWidth = (hasHeap ? heapRight + ARROW_STUB : stackRight) + PADDING;
  const totalHeight = Math.max(stackBottom, heapBottom) + PADDING;

  const stage = new Konva.Stage({
    container: container as HTMLDivElement,
    width: totalWidth,
    height: totalHeight,
  });

  const layer = new Konva.Layer();
  stage.add(layer);

  // Draw stack right border (full canvas height)
  layer.add(
    new Konva.Line({
      points: [stackRight, 0, stackRight, totalHeight],
      stroke: colors.fg2,
      strokeWidth: 1,
    }),
  );

  // Draw stack frames
  for (let i = 0; i < stackLayouts.length; i++) {
    drawFrame(layer, stackLayouts[i], colors, i === 0);
  }

  // Draw heap objects
  for (const layout of heapLayouts) {
    drawHeapObj(layer, layout, heap[layout.id], colors);
  }

  // Draw arrows
  const arrows = collectArrows(stack, heap, stackLayouts, heapLayouts);
  for (const arrow of arrows) {
    drawArrow(layer, arrow, colors);
  }

  layer.draw();
  return { stage, width: totalWidth, height: totalHeight };
}

export function renderSourcePanel(
  highlightedHtml: string,
  currentLine: number,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'trace-source';
  container.innerHTML = highlightedHtml;

  // Highlight active line
  updateSourceHighlight(container, currentLine);
  return container;
}

export function updateSourceHighlight(
  panel: HTMLElement,
  currentLine: number,
): void {
  panel.querySelectorAll('.line-number').forEach(ln => {
    ln.classList.remove('trace-line-active');
  });
  const el = panel.querySelector(`.line-number[data-line="${currentLine}"]`);
  if (el) {
    el.classList.add('trace-line-active');
    const elRect = el.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    panel.scrollTop += elRect.top - panelRect.top - panel.clientHeight / 2;
  }
}

export function renderStepControls(
  currentStep: number,
  totalSteps: number,
  callbacks: {
    onFirst: () => void;
    onPrev: () => void;
    onNext: () => void;
    onLast: () => void;
  },
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'trace-controls';

  const firstBtn = makeButton(
    'trace-btn trace-first',
    '\u23EE',
    callbacks.onFirst,
  );
  const prevBtn = makeButton(
    'trace-btn trace-prev',
    '\u25C0',
    callbacks.onPrev,
  );
  const nextBtn = makeButton(
    'trace-btn trace-next',
    '\u25B6',
    callbacks.onNext,
  );
  const lastBtn = makeButton(
    'trace-btn trace-last',
    '\u23ED',
    callbacks.onLast,
  );
  const counter = document.createElement('span');
  counter.className = 'trace-step-counter';
  counter.textContent = `${currentStep + 1} / ${totalSteps}`;

  firstBtn.disabled = currentStep === 0;
  prevBtn.disabled = currentStep === 0;
  nextBtn.disabled = currentStep >= totalSteps - 1;
  lastBtn.disabled = currentStep >= totalSteps - 1;

  container.append(firstBtn, prevBtn, counter, nextBtn, lastBtn);
  return container;
}

export function updateStepControls(
  container: HTMLElement,
  currentStep: number,
  totalSteps: number,
): void {
  const counter = container.querySelector('.trace-step-counter');
  if (counter) {
    counter.textContent = `${currentStep + 1} / ${totalSteps}`;
  }
  const first = container.querySelector('.trace-first') as HTMLButtonElement;
  const prev = container.querySelector('.trace-prev') as HTMLButtonElement;
  const next = container.querySelector('.trace-next') as HTMLButtonElement;
  const last = container.querySelector('.trace-last') as HTMLButtonElement;
  const btns = [first, prev, next, last];

  const focused = document.activeElement;

  if (first) {
    first.disabled = currentStep === 0;
  }
  if (prev) {
    prev.disabled = currentStep === 0;
  }
  if (next) {
    next.disabled = currentStep >= totalSteps - 1;
  }
  if (last) {
    last.disabled = currentStep >= totalSteps - 1;
  }

  // When a clicked button becomes disabled, the browser removes focus.
  // Move focus to a sensible sibling so the outline stays visible.
  if (focused instanceof HTMLButtonElement && focused.disabled) {
    if (focused === first || focused === prev) {
      next?.focus();
    } else if (focused === next || focused === last) {
      prev?.focus();
    }
  }

  // Roving tabindex: the focused button is the Tab stop.
  const currentFocus = document.activeElement;
  const enabled = btns.filter(b => b && !b.disabled);
  const focusedBtn = enabled.find(b => b === currentFocus);
  for (const b of enabled) {
    b.tabIndex = b === focusedBtn ? 0 : -1;
  }
  if (!focusedBtn && enabled.length > 0) {
    enabled[0].tabIndex = 0;
  }
  for (const b of btns) {
    if (b && b.disabled) {
      b.tabIndex = -1;
    }
  }
}

function makeButton(
  className: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

export function formatValue(val: TraceValue): string {
  switch (val.type) {
    case 'null':
      return 'null';
    case 'boolean':
      return String(val.value);
    case 'char':
      return `'${val.value}'`;
    case 'String':
      return `"${val.value}"`;
    case 'ref':
      return `\u2022`;
    case 'unknown':
      return '?';
    case 'uninitialized':
      return '';
    case 'truncated':
      return `\u2026(${val.remaining})`;
    default:
      if ('value' in val) {
        return String(val.value);
      }
      return '?';
  }
}

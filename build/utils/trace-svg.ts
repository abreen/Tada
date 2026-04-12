import type {
  TraceStep,
  TraceStackFrame,
  TraceValue,
  TraceHeapObject,
  TraceLayout,
  TraceObjectLayout,
} from '../types';
import { ARRAY_MAX_CELLS, DEFAULT_FONT_SIZE } from './trace-layout';

/** Gap between stack area and heap area. */
const SECTION_GAP = 60;

/** Padding around the SVG. */
const PADDING = 8;

/** Horizontal margin when routing stack-to-heap arrows. */
const ARROW_MARGIN = 20;

// ---------------------------------------------------------------------------
// Escape & format helpers
// ---------------------------------------------------------------------------

/** Escape &, <, >, " for SVG text content. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a TraceValue for display. */
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
      return '\u2022';
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

// ---------------------------------------------------------------------------
// filterStep -- remove args from main(), hide objects reachable only via args
// ---------------------------------------------------------------------------

function isStringObject(obj: TraceHeapObject): boolean {
  return 'value' in obj && obj.type === 'String';
}

export function filterStep(step: TraceStep): {
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
  // aren't exclusively reachable from the hidden 'args'
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

// ---------------------------------------------------------------------------
// Stack layout
// ---------------------------------------------------------------------------

interface FrameLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: TraceStackFrame;
  varPositions: Map<string, { x: number; y: number }>;
}

function layoutStack(
  stack: TraceStackFrame[],
  dims: { rowH: number; varBoxX: number; varBoxW: number; frameWidth: number },
): FrameLayout[] {
  const layouts: FrameLayout[] = [];
  let y = 0;
  const stackX = 0;

  // Reverse so main() is at top, newest frame at bottom
  const reversed = [...stack].reverse();
  for (const frame of reversed) {
    const varCount = Object.keys(frame.locals).length;
    const varsH = Math.max(varCount, 1) * dims.rowH;
    const height = dims.rowH + varsH + PADDING;
    const varPositions = new Map<string, { x: number; y: number }>();

    let rowY = dims.rowH;
    for (const name of Object.keys(frame.locals)) {
      varPositions.set(name, {
        x: stackX + dims.varBoxX + dims.varBoxW / 2,
        y: y + rowY + dims.rowH / 2,
      });
      rowY += dims.rowH;
    }

    layouts.push({
      x: stackX,
      y,
      width: dims.frameWidth,
      height,
      frame,
      varPositions,
    });
    y += height;
  }

  return layouts;
}

// ---------------------------------------------------------------------------
// SVG frame generation
// ---------------------------------------------------------------------------

function svgFrame(
  layout: FrameLayout,
  isFirst: boolean,
  dims: { rowH: number; varBoxX: number; varBoxW: number; fontSize: number },
): string {
  const { x, y, width, frame } = layout;
  const parts: string[] = [];
  parts.push(`<g class="trace-frame" transform="translate(${x},${y})">`);

  // Separator between frames (not for the first)
  if (!isFirst) {
    parts.push(
      `<line class="trace-separator" x1="0" y1="0" x2="${width}" y2="0"/>`,
    );
  }

  // Frame label
  const label =
    frame.line != null ? `${frame.method}:${frame.line}` : frame.method;
  parts.push(
    `<text class="trace-frame-title" x="6" y="${dims.rowH / 2}" ` +
      `dominant-baseline="central" font-weight="bold">${escapeXml(label)}</text>`,
  );

  // Variables
  let rowY = dims.rowH;
  for (const [name, val] of Object.entries(frame.locals)) {
    // Variable name (right-aligned)
    parts.push(
      `<text class="trace-var-name" x="${dims.varBoxX - 8}" y="${rowY + dims.rowH / 2}" ` +
        `text-anchor="end" dominant-baseline="central">${escapeXml(name)}</text>`,
    );

    // Value box
    parts.push(
      `<rect class="trace-var-box" x="${dims.varBoxX}" y="${rowY}" ` +
        `width="${dims.varBoxW}" height="${dims.rowH}"/>`,
    );

    // Value text (not for refs -- arrow handles it)
    if (val.type !== 'ref') {
      const cls = val.type === 'null' ? 'trace-val trace-null' : 'trace-val';
      parts.push(
        `<text class="${cls}" x="${dims.varBoxX + dims.varBoxW / 2}" y="${rowY + dims.rowH / 2}" ` +
          `text-anchor="middle" dominant-baseline="central">${escapeXml(formatValue(val))}</text>`,
      );
    }

    rowY += dims.rowH;
  }

  parts.push('</g>');
  return parts.join('');
}

// ---------------------------------------------------------------------------
// SVG heap object generation
// ---------------------------------------------------------------------------

function svgHeapObject(
  id: string,
  obj: TraceHeapObject,
  pos: TraceObjectLayout,
  dims: { rowH: number; fontSize: number },
  absX: number,
  absY: number,
): string {
  const { width, height } = pos;
  const parts: string[] = [];
  parts.push(
    `<g class="trace-obj" data-id="${escapeXml(id)}" transform="translate(${absX},${absY})">`,
  );

  if ('value' in obj && isStringObject(obj)) {
    // Strings: just quoted text, no box
    parts.push(
      `<text class="trace-val" x="0" y="${height / 2}" ` +
        `dominant-baseline="central">${escapeXml(`"${obj.value}"`)}</text>`,
    );
    parts.push('</g>');
    return parts.join('');
  }

  // Border rect
  parts.push(
    `<rect class="trace-obj-border" x="0" y="0" width="${width}" height="${height}"/>`,
  );

  if ('elements' in obj) {
    const cellCount = Math.min(obj.elements.length, ARRAY_MAX_CELLS);
    const cw = pos.cellWidth ?? Math.round(dims.fontSize * 3);
    for (let i = 0; i < cellCount; i++) {
      const cellX = i * cw;

      if (i > 0) {
        parts.push(
          `<line class="trace-separator" x1="${cellX}" y1="0" x2="${cellX}" y2="${height}"/>`,
        );
      }

      const el = obj.elements[i];
      if (el.type !== 'ref') {
        const cls = el.type === 'null' ? 'trace-val trace-null' : 'trace-val';
        parts.push(
          `<text class="${cls}" x="${cellX + cw / 2}" y="${height / 2}" ` +
            `text-anchor="middle" dominant-baseline="central">${escapeXml(formatValue(el))}</text>`,
        );
      }
    }
  } else if ('fields' in obj) {
    const childFieldSet = new Set(pos.childFields ?? []);
    const vx = pos.valueX ?? Math.round(dims.fontSize * 7);

    if (childFieldSet.size > 0) {
      // Tree node: data fields on top, child-slot row at bottom
      const dataFields = Object.entries(obj.fields).filter(
        ([name]) => !childFieldSet.has(name),
      );
      const childFields = Array.from(childFieldSet);

      // Draw data field rows
      let rowY = 0;
      for (const [name, val] of dataFields) {
        if (rowY > 0) {
          parts.push(
            `<line class="trace-separator" x1="0" y1="${rowY}" x2="${width}" y2="${rowY}"/>`,
          );
        }

        const nameX = Math.round(dims.fontSize * 0.5);
        parts.push(
          `<text class="trace-field-name" x="${nameX}" y="${rowY + dims.rowH / 2}" ` +
            `dominant-baseline="central">${escapeXml(name)}</text>`,
        );

        // Value box
        parts.push(
          `<rect class="trace-var-box" x="${vx}" y="${rowY}" ` +
            `width="${width - vx}" height="${dims.rowH}"/>`,
        );

        if (val.type !== 'ref') {
          const cls =
            val.type === 'null' ? 'trace-val trace-null' : 'trace-val';
          parts.push(
            `<text class="${cls}" x="${vx + (width - vx) / 2}" y="${rowY + dims.rowH / 2}" ` +
              `text-anchor="middle" dominant-baseline="central">${escapeXml(formatValue(val))}</text>`,
          );
        }

        rowY += dims.rowH;
      }

      // Draw child-slot row at bottom
      const slotY = rowY;
      parts.push(
        `<line class="trace-separator" x1="0" y1="${slotY}" x2="${width}" y2="${slotY}"/>`,
      );

      const slotCount = childFields.length;
      const labelRowH = dims.rowH;
      const boxY = slotY + labelRowH;
      const boxH = height - boxY;

      for (let i = 0; i < slotCount; i++) {
        const slotX = Math.round((width * i) / slotCount);
        const slotEnd = Math.round((width * (i + 1)) / slotCount);
        const sw = slotEnd - slotX;
        const fieldName = childFields[i];
        const val = obj.fields[fieldName];

        // Field name label centered in the label row
        parts.push(
          `<text class="trace-field-name" x="${slotX + sw / 2}" ` +
            `y="${slotY + labelRowH / 2}" text-anchor="middle" ` +
            `dominant-baseline="central">${escapeXml(fieldName)}</text>`,
        );

        // Box for the value
        parts.push(
          `<rect class="trace-var-box" x="${slotX}" y="${boxY}" ` +
            `width="${sw}" height="${boxH}"/>`,
        );

        // Show "null" centered in the box for null slots
        if (val && val.type === 'null') {
          parts.push(
            `<text class="trace-val trace-null" x="${slotX + sw / 2}" ` +
              `y="${boxY + boxH / 2}" text-anchor="middle" ` +
              `dominant-baseline="central">${escapeXml(formatValue(val))}</text>`,
          );
        }
      }
    } else {
      // Non-tree field object: just data rows, no extra space
      let rowY = 0;
      for (const [name, val] of Object.entries(obj.fields)) {
        if (rowY > 0) {
          parts.push(
            `<line class="trace-separator" x1="0" y1="${rowY}" x2="${width}" y2="${rowY}"/>`,
          );
        }

        const nameX = Math.round(dims.fontSize * 0.5);
        parts.push(
          `<text class="trace-field-name" x="${nameX}" y="${rowY + dims.rowH / 2}" ` +
            `dominant-baseline="central">${escapeXml(name)}</text>`,
        );

        // Value box
        parts.push(
          `<rect class="trace-var-box" x="${vx}" y="${rowY}" ` +
            `width="${width - vx}" height="${dims.rowH}"/>`,
        );

        if (val.type !== 'ref') {
          const cls =
            val.type === 'null' ? 'trace-val trace-null' : 'trace-val';
          parts.push(
            `<text class="${cls}" x="${vx + (width - vx) / 2}" y="${rowY + dims.rowH / 2}" ` +
              `text-anchor="middle" dominant-baseline="central">${escapeXml(formatValue(val))}</text>`,
          );
        }

        rowY += dims.rowH;
      }
    }
  } else if ('value' in obj) {
    const nameX = Math.round(dims.fontSize * 0.5);
    parts.push(
      `<text class="trace-val" x="${nameX}" y="${dims.rowH / 2}" ` +
        `dominant-baseline="central">${escapeXml(String(obj.value))}</text>`,
    );
  }

  parts.push('</g>');
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Arrow generation
// ---------------------------------------------------------------------------

interface HeapObjInfo {
  id: string;
  absX: number;
  absY: number;
  width: number;
  height: number;
  pos: TraceObjectLayout;
}

/**
 * Given a source point and a target rectangle, find the point where the line
 * from source to target center intersects the target's boundary.
 */
function rectBoundaryPoint(
  sx: number,
  sy: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { x: number; y: number } {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  const dx = sx - cx;
  const dy = sy - cy;

  if (dx === 0 && dy === 0) {
    return { x: cx, y: ry }; // source is at center, default to top
  }

  const hw = rw / 2;
  const hh = rh / 2;

  // Scale factor to reach each edge
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return { x: Math.round(cx + dx * scale), y: Math.round(cy + dy * scale) };
}

/**
 * Get the center of the child-slot box for a given field.
 * The slot row has a small label at the top and a box below it.
 */
function childSlotCenter(
  objInfo: HeapObjInfo,
  fieldName: string,
  dims: { rowH: number; fontSize: number },
): { x: number; y: number } {
  const childFields = objInfo.pos.childFields ?? [];
  const slotCount = childFields.length;
  const idx = childFields.indexOf(fieldName);
  const slotX = Math.round((objInfo.width * idx) / slotCount);
  const slotEnd = Math.round((objInfo.width * (idx + 1)) / slotCount);
  const sw = slotEnd - slotX;

  // The child area is the last 2 * rowH of the object. Label row then box row.
  const boxY = objInfo.height - dims.rowH;
  const boxH = dims.rowH;

  return {
    x: Math.round(objInfo.absX + slotX + sw / 2),
    y: Math.round(objInfo.absY + boxY + boxH / 2),
  };
}

function generateArrows(
  stack: TraceStackFrame[],
  heap: Record<string, TraceHeapObject>,
  stackLayouts: FrameLayout[],
  heapObjMap: Map<string, HeapObjInfo>,
  dims: { rowH: number; fontSize: number },
): string[] {
  const parts: string[] = [];

  // Stack-to-heap arrow: quadratic Bezier, starts horizontally.
  function arrow(
    sx: number,
    sy: number,
    target: HeapObjInfo,
    style: 'fg' | 'dim' = 'fg',
  ): string {
    const ep = rectBoundaryPoint(
      sx,
      sy,
      target.absX,
      target.absY,
      target.width,
      target.height,
    );
    const cpx = Math.round((sx + ep.x) / 2);
    const cls = style === 'fg' ? 'trace-arrow' : 'trace-arrow-dim';
    const marker = style === 'fg' ? 'trace-arrowhead' : 'trace-arrowhead-dim';
    return (
      `<path class="${cls}" d="` +
      `M ${sx} ${sy} Q ${cpx} ${sy}, ${ep.x} ${ep.y}" ` +
      `marker-end="url(#${marker})"/>`
    );
  }

  // Child-slot arrow: orthogonal routing (down -> across -> down) with
  // rounded corners. Each slot gets its own horizontal channel so sibling
  // arrows from the same parent don't overlap.
  function childSlotArrow(sx: number, sy: number, target: HeapObjInfo): string {
    const tx = Math.round(target.absX + target.width / 2);
    const ty = target.absY;

    // Nearly aligned vertically: straight line
    if (Math.abs(tx - sx) < 4) {
      return (
        `<path class="trace-arrow-heap" d="M ${sx} ${sy} L ${tx} ${ty}" ` +
        `marker-end="url(#trace-arrowhead-dim)"/>`
      );
    }

    // Horizontal channel at the midpoint between source and target top.
    // Sibling arrows diverge horizontally so they share the same channel Y.
    const channelY = Math.round((sy + ty) / 2);

    const vertSpace = Math.abs(channelY - sy);
    const horizSpace = Math.abs(tx - sx);
    const r = Math.min(5, vertSpace / 2, horizSpace / 2);
    const dir = tx > sx ? 1 : -1;

    const path =
      `M ${sx} ${sy} ` +
      `L ${sx} ${channelY - r} ` +
      `Q ${sx} ${channelY}, ${sx + dir * r} ${channelY} ` +
      `L ${tx - dir * r} ${channelY} ` +
      `Q ${tx} ${channelY}, ${tx} ${channelY + r} ` +
      `L ${tx} ${ty}`;

    return (
      `<path class="trace-arrow-heap" d="${path}" ` +
      `marker-end="url(#trace-arrowhead-dim)"/>`
    );
  }

  // Non-structural heap arrow: cubic Bezier with auto-detected direction
  // (typically horizontal toward ref chains).
  function heapArrow(sx: number, sy: number, target: HeapObjInfo): string {
    const ep = rectBoundaryPoint(
      sx,
      sy,
      target.absX,
      target.absY,
      target.width,
      target.height,
    );
    const dx = ep.x - sx;
    const dy = ep.y - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) {
      return '';
    }

    const d = Math.min(dist * 0.4, 50);
    let cp1x: number;
    let cp1y: number;

    if (Math.abs(dy) >= Math.abs(dx)) {
      cp1x = sx;
      cp1y = dy >= 0 ? sy + d : sy - d;
    } else {
      cp1x = dx >= 0 ? sx + d : sx - d;
      cp1y = sy;
    }

    // Approach target along its surface normal
    const tcx = target.absX + target.width / 2;
    const tcy = target.absY + target.height / 2;
    const nx = ep.x - tcx;
    const ny = ep.y - tcy;
    const nlen = Math.sqrt(nx * nx + ny * ny);
    let cp2x = ep.x;
    let cp2y = ep.y;
    if (nlen > 0) {
      cp2x = ep.x + (nx / nlen) * d;
      cp2y = ep.y + (ny / nlen) * d;
    }

    return (
      `<path class="trace-arrow-heap" d="` +
      `M ${sx} ${sy} C ${Math.round(cp1x)} ${Math.round(cp1y)}, ` +
      `${Math.round(cp2x)} ${Math.round(cp2y)}, ${ep.x} ${ep.y}" ` +
      `marker-end="url(#trace-arrowhead-dim)"/>`
    );
  }

  // Collect dim arrows first, then current-frame arrows, so fg-color
  // arrows paint on top in SVG document order.
  const currentFrameIndex = stackLayouts.length - 1;
  const fgArrows: string[] = [];

  // Stack-to-heap arrows from non-current frames (dim)
  for (let fi = 0; fi < stackLayouts.length; fi++) {
    const fl = stackLayouts[fi];
    if (fi === currentFrameIndex) {
      continue;
    }
    for (const [name, val] of Object.entries(fl.frame.locals)) {
      if (val.type !== 'ref') {
        continue;
      }
      const target = heapObjMap.get(val.id);
      const from = fl.varPositions.get(name);
      if (!target || !from) {
        continue;
      }
      parts.push(arrow(Math.round(from.x), Math.round(from.y), target, 'dim'));
    }
  }

  // Stack-to-heap arrows from current frame (fg, deferred)
  if (currentFrameIndex >= 0) {
    const fl = stackLayouts[currentFrameIndex];
    for (const [name, val] of Object.entries(fl.frame.locals)) {
      if (val.type !== 'ref') {
        continue;
      }
      const target = heapObjMap.get(val.id);
      const from = fl.varPositions.get(name);
      if (!target || !from) {
        continue;
      }
      fgArrows.push(
        arrow(Math.round(from.x), Math.round(from.y), target, 'fg'),
      );
    }
  }

  // Heap-to-heap arrows (dim)
  for (const [id, objInfo] of heapObjMap) {
    const obj = heap[id];
    if (!obj) {
      continue;
    }

    if ('fields' in obj) {
      const childFieldSet = new Set(objInfo.pos.childFields ?? []);
      for (const [fieldName, val] of Object.entries(obj.fields)) {
        if (val.type !== 'ref') {
          continue;
        }
        const target = heapObjMap.get(val.id);
        if (!target) {
          continue;
        }

        if (childFieldSet.has(fieldName)) {
          // Structural child: orthogonal routing through per-slot channel
          const start = childSlotCenter(objInfo, fieldName, dims);
          parts.push(childSlotArrow(start.x, start.y, target));
        } else {
          // Data field: cubic Bezier with auto direction
          const vx = objInfo.pos.valueX ?? Math.round(dims.fontSize * 7);
          let rowIdx = 0;
          for (const name of Object.keys(obj.fields)) {
            if (childFieldSet.has(name)) {
              continue;
            }
            if (name === fieldName) {
              break;
            }
            rowIdx++;
          }
          const start = {
            x: Math.round(objInfo.absX + vx + (objInfo.width - vx) / 2),
            y: Math.round(objInfo.absY + rowIdx * dims.rowH + dims.rowH / 2),
          };
          parts.push(heapArrow(start.x, start.y, target));
        }
      }
    }

    if ('elements' in obj) {
      const cellCount = Math.min(obj.elements.length, ARRAY_MAX_CELLS);
      const cw = objInfo.pos.cellWidth ?? Math.round(DEFAULT_FONT_SIZE * 3);
      for (let i = 0; i < cellCount; i++) {
        const el = obj.elements[i];
        if (el.type !== 'ref') {
          continue;
        }
        const target = heapObjMap.get(el.id);
        if (!target) {
          continue;
        }
        const sx = Math.round(objInfo.absX + (i + 0.5) * cw);
        const sy = Math.round(objInfo.absY + objInfo.height / 2);
        parts.push(heapArrow(sx, sy, target));
      }
    }
  }

  // Append fg-color arrows last so they render on top
  for (const a of fgArrows) {
    parts.push(a);
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a complete SVG string for a single trace step.
 */
export function generateStepSvg(
  step: TraceStep,
  layout: TraceLayout,
  fontSize: number = DEFAULT_FONT_SIZE,
): string {
  const { stack, heap } = filterStep(step);

  const hasVars = stack.some(f => Object.keys(f.locals).length > 0);
  const hasHeap = Object.keys(heap).length > 0;

  if (!hasVars && !hasHeap) {
    return (
      '<svg class="trace-memory" viewBox="0 0 0 0" ' +
      'xmlns="http://www.w3.org/2000/svg"></svg>'
    );
  }

  const rowH = Math.round(fontSize * 2);
  const varBoxX = Math.round(fontSize * 7);
  const varBoxW = Math.round(fontSize * 4);
  const frameWidth = varBoxX + varBoxW + PADDING;

  const dims = { rowH, varBoxX, varBoxW, frameWidth, fontSize };

  // Layout stack
  const stackLayouts = layoutStack(stack, dims);
  const stackRight = frameWidth;
  const stackBottom =
    stackLayouts.length > 0
      ? Math.max(...stackLayouts.map(l => l.y + l.height))
      : 0;

  // Position heap objects (layout positions are relative to heap area)
  const heapX = stackRight + SECTION_GAP;

  // Build heap object info map
  const heapObjMap = new Map<string, HeapObjInfo>();
  for (const [id] of Object.entries(heap)) {
    const pos = layout.objects[id];
    if (!pos) {
      continue;
    }

    heapObjMap.set(id, {
      id,
      absX: heapX + pos.x,
      absY: PADDING + pos.y,
      width: pos.width,
      height: pos.height,
      pos,
    });
  }

  const heapBottom =
    heapObjMap.size > 0
      ? Math.max(...Array.from(heapObjMap.values()).map(l => l.absY + l.height))
      : 0;
  const heapRight =
    heapObjMap.size > 0
      ? Math.max(...Array.from(heapObjMap.values()).map(l => l.absX + l.width))
      : heapX;

  const totalWidth =
    (hasHeap ? heapRight + ARROW_MARGIN : stackRight) + PADDING;
  const totalHeight = Math.max(stackBottom, heapBottom) + PADDING;

  // Build SVG
  const parts: string[] = [];
  parts.push(
    `<svg class="trace-memory" viewBox="0 0 ${totalWidth} ${totalHeight}" ` +
      `width="${totalWidth}" height="${totalHeight}" ` +
      `xmlns="http://www.w3.org/2000/svg">`,
  );

  // Defs: arrowhead markers
  parts.push('<defs>');
  parts.push(
    '<marker id="trace-arrowhead" markerWidth="8" markerHeight="6" ' +
      'refX="8" refY="3" orient="auto" markerUnits="strokeWidth">',
  );
  parts.push('<polygon class="trace-arrowhead" points="0 0, 8 3, 0 6"/>');
  parts.push('</marker>');
  parts.push(
    '<marker id="trace-arrowhead-dim" markerWidth="8" markerHeight="6" ' +
      'refX="8" refY="3" orient="auto" markerUnits="strokeWidth">',
  );
  parts.push('<polygon class="trace-arrowhead-dim" points="0 0, 8 3, 0 6"/>');
  parts.push('</marker>');
  parts.push('</defs>');

  // Stack right border
  parts.push(
    `<line class="trace-separator" x1="${stackRight}" y1="0" ` +
      `x2="${stackRight}" y2="${totalHeight}"/>`,
  );

  // Stack frames
  for (let i = 0; i < stackLayouts.length; i++) {
    parts.push(svgFrame(stackLayouts[i], i === 0, dims));
  }

  // Heap objects
  for (const [id, objInfo] of heapObjMap) {
    const obj = heap[id];
    parts.push(
      svgHeapObject(id, obj, objInfo.pos, dims, objInfo.absX, objInfo.absY),
    );
  }

  // Arrows
  const arrowParts = generateArrows(
    stack,
    heap,
    stackLayouts,
    heapObjMap,
    dims,
  );
  for (const arrow of arrowParts) {
    parts.push(arrow);
  }

  parts.push('</svg>');
  return parts.join('');
}

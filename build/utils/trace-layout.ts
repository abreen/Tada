import { flextree } from 'd3-flextree';
import type {
  TraceStep,
  TraceValue,
  TraceLayout,
  TraceObjectLayout,
} from '../types';

/** Maximum number of array cells to display. */
export const ARRAY_MAX_CELLS = 12;

/** Default font size in pixels. */
export const DEFAULT_FONT_SIZE = 15;

/** Gap between objects in the layout. */
const OBJ_GAP = 24;

/** Char width ratio for monospace text. */
const CHAR_WIDTH_RATIO = 0.6;

/** Row height as a multiple of font size. */
const ROW_HEIGHT_RATIO = 2;

/** Minimum width for a value box in a field object. */
const MIN_VALUE_WIDTH = 40;

/** Information collected about a heap object across all trace steps. */
export interface ObjectInfo {
  id: string;
  type: string;
  firstStep: number;
  lastStep: number;
  /** Set of object IDs this object ever references (across all steps). */
  references: Set<string>;
  /** Per-field reference targets (field name -> set of referenced object IDs). */
  fieldRefs: Map<string, Set<string>>;
  /** Max number of fields seen on this object (for field objects). */
  maxFields: number;
  /** Max number of elements seen on this object (for arrays). */
  maxElements: number;
  /** String value (for string-valued objects). */
  value: string | null;
  isArray: boolean;
  isString: boolean;
  /** All field names ever seen on this object. */
  fieldNames: Set<string>;
  /** Maximum display character count of any value seen in each field. */
  maxFieldValueWidths: Map<string, number>;
}

/** A tree node used to build the hierarchy for d3-flextree. */
export interface TreeNode {
  id: string;
  width: number;
  height: number;
  children: TreeNode[];
}

/**
 * Walk every step, collect every heap object's type, lifetime (first/last step),
 * all references it ever makes, max fields seen, whether it's an array or string.
 */
export function scanSteps(steps: TraceStep[]): Map<string, ObjectInfo> {
  const objects = new Map<string, ObjectInfo>();

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex];
    for (const [id, obj] of Object.entries(step.heap)) {
      let info = objects.get(id);
      if (!info) {
        info = {
          id,
          type: obj.type,
          firstStep: stepIndex,
          lastStep: stepIndex,
          references: new Set(),
          fieldRefs: new Map(),
          maxFields: 0,
          maxElements: 0,
          value: null,
          isArray: false,
          isString: false,
          fieldNames: new Set(),
          maxFieldValueWidths: new Map(),
        };
        objects.set(id, info);
      }

      info.lastStep = stepIndex;

      if ('elements' in obj) {
        info.isArray = true;
        info.maxElements = Math.max(info.maxElements, obj.elements.length);

        if (!info.fieldRefs.has('__elements__')) {
          info.fieldRefs.set('__elements__', new Set());
        }
        const elemRefs = info.fieldRefs.get('__elements__')!;

        for (const elem of obj.elements) {
          if (elem.type === 'ref') {
            info.references.add(elem.id);
            elemRefs.add(elem.id);
          }
        }
      } else if ('fields' in obj) {
        const fieldEntries = Object.entries(obj.fields);
        info.maxFields = Math.max(info.maxFields, fieldEntries.length);
        for (const [fieldName, val] of fieldEntries) {
          info.fieldNames.add(fieldName);

          if (val.type === 'ref') {
            info.references.add(val.id);
            if (!info.fieldRefs.has(fieldName)) {
              info.fieldRefs.set(fieldName, new Set());
            }
            info.fieldRefs.get(fieldName)!.add(val.id);
          }

          // Track max display width for each field's value
          const valWidth = traceValueDisplayLength(val);
          const current = info.maxFieldValueWidths.get(fieldName) ?? 0;
          if (valWidth > current) {
            info.maxFieldValueWidths.set(fieldName, valWidth);
          }
        }
      } else if ('value' in obj) {
        info.isString = true;
        info.value = obj.value;
      }
    }
  }

  return objects;
}

/** Get the display character length of a TraceValue. */
function traceValueDisplayLength(val: TraceValue): number {
  switch (val.type) {
    case 'int':
    case 'long':
    case 'short':
    case 'byte':
    case 'float':
    case 'double':
      return String(val.value).length;
    case 'boolean':
      return val.value ? 4 : 5; // "true" or "false"
    case 'char':
      return 3; // 'x'
    case 'String':
      return val.value.length + 2; // quoted
    case 'null':
      return 4;
    case 'ref':
      return 2; // reference arrow placeholder
    case 'unknown':
      return 1;
    case 'uninitialized':
      return 1;
    case 'truncated':
      return 3; // "..."
  }
}

/**
 * Build a map of objectId -> child objectIds by following reference fields,
 * excluding fields listed in ignoreFields.
 * Also returns a mapping of parentId -> (fieldName -> childId) so we know
 * which fields are structural children.
 */
export function buildSupergraph(
  objects: Map<string, ObjectInfo>,
  ignoreFields: Record<string, string[]> = {},
): {
  graph: Map<string, string[]>;
  referenced: Set<string>;
  fieldToChild: Map<string, Map<string, string>>;
} {
  const graph = new Map<string, string[]>();
  const referenced = new Set<string>();
  /** parentId -> (fieldName -> childId) for structural children */
  const fieldToChild = new Map<string, Map<string, string>>();

  for (const [id, info] of objects) {
    const children: string[] = [];
    const seen = new Set<string>();
    const ignore = new Set(ignoreFields[info.type] ?? []);
    const fieldMap = new Map<string, string>();

    for (const [fieldName, refs] of info.fieldRefs) {
      // Skip ignored fields (but never skip __elements__ for arrays)
      if (fieldName !== '__elements__' && ignore.has(fieldName)) {
        continue;
      }

      for (const refId of refs) {
        if (!seen.has(refId) && objects.has(refId)) {
          seen.add(refId);
          children.push(refId);
          referenced.add(refId);
          if (fieldName !== '__elements__') {
            fieldMap.set(fieldName, refId);
          }
        }
      }
    }

    graph.set(id, children);
    if (fieldMap.size > 0) {
      fieldToChild.set(id, fieldMap);
    }
  }

  return { graph, referenced, fieldToChild };
}

/**
 * Compute the display size of a heap object.
 *
 * @param childFields - field names that are structural children (rendered as
 *   bottom slots instead of normal rows). Only applies to field objects.
 */
export function getObjectSize(
  info: ObjectInfo,
  fontSize: number = DEFAULT_FONT_SIZE,
  childFields: Set<string> = new Set(),
): { width: number; height: number; valueX?: number; cellWidth?: number } {
  const charWidth = fontSize * CHAR_WIDTH_RATIO;
  const rowHeight = fontSize * ROW_HEIGHT_RATIO;

  if (info.isString) {
    const text = `"${info.value ?? ''}"`;
    const textWidth = text.length * charWidth;
    const width = Math.max(info.type.length * charWidth + 16, textWidth + 16);
    const height = rowHeight * 2; // header + value
    return { width, height };
  }

  if (info.isArray) {
    const cellCount = Math.min(info.maxElements, ARRAY_MAX_CELLS);
    const cellWidth = Math.max(charWidth * 3, MIN_VALUE_WIDTH);
    const width = Math.max(
      info.type.length * charWidth + 16,
      cellCount * cellWidth,
    );
    const height = rowHeight;
    return { width, height, cellWidth };
  }

  // Field object
  const fieldNames = Array.from(info.fieldNames);
  const dataFields = fieldNames.filter(f => !childFields.has(f));
  const hasChildSlots = childFields.size > 0;

  const maxFieldNameWidth = dataFields.reduce(
    (max, name) => Math.max(max, name.length * charWidth),
    0,
  );
  const maxValueWidth = Math.max(
    MIN_VALUE_WIDTH,
    ...dataFields.map(
      name => (info.maxFieldValueWidths.get(name) ?? 0) * charWidth,
    ),
  );
  const namePad = Math.round(fontSize * 0.5);
  const valueX = namePad + maxFieldNameWidth + namePad;
  const contentWidth = valueX + maxValueWidth + 8;

  // For the child-slot row, compute minimum width from slot labels
  let childSlotWidth = 0;
  if (hasChildSlots) {
    const childFieldNames = Array.from(childFields);
    const slotPadding = 16; // padding inside each slot
    childSlotWidth = childFieldNames.reduce(
      (sum, name) => sum + name.length * charWidth + slotPadding,
      0,
    );
  }

  const headerWidth = info.type.length * charWidth + 16;
  const width = Math.max(headerWidth, contentWidth, childSlotWidth);
  const dataRows = Math.max(dataFields.length, 1);
  // data rows + (2 child-slot rows if tree node: label row + box row)
  const height = rowHeight * (dataRows + (hasChildSlots ? 2 : 0));
  return { width, height, valueX };
}

/** Size info returned by getObjectSize. */
type ObjSize = {
  width: number;
  height: number;
  valueX?: number;
  cellWidth?: number;
};

/** Chain of non-tree objects laid out horizontally to the right of a tree node. */
interface RefChain {
  ids: string[];
  totalWidth: number;
  maxHeight: number;
}

/** Construct a TraceObjectLayout, copying optional size and child field info. */
function makeLayout(
  x: number,
  y: number,
  size: ObjSize,
  childFields?: Set<string>,
): TraceObjectLayout {
  const ol: TraceObjectLayout = {
    x,
    y,
    width: size.width,
    height: size.height,
  };
  if (size.valueX !== undefined) {
    ol.valueX = size.valueX;
  }
  if (size.cellWidth !== undefined) {
    ol.cellWidth = size.cellWidth;
  }
  if (childFields && childFields.size > 0) {
    ol.childFields = Array.from(childFields);
  }
  return ol;
}

/**
 * The main entry point. Scans steps, builds supergraph, finds root objects,
 * builds a tree for each root, runs d3-flextree, translates positions to
 * all-positive coordinates, returns positions for every object.
 */
export function computeLayout(
  steps: TraceStep[],
  ignoreFields: Record<string, string[]> = {},
  fontSize: number = DEFAULT_FONT_SIZE,
): TraceLayout {
  const objects = scanSteps(steps);

  if (objects.size === 0) {
    return { objects: {}, ignoreFields };
  }

  const { graph, fieldToChild } = buildSupergraph(objects, ignoreFields);

  // Phase 1: classify types and compute structural metadata
  const { chainTypes, objectChildFields, structuralChildren, roots } =
    classifyTypes(objects, fieldToChild);

  // Compute sizes for all objects (now with child field info)
  const sizes = new Map<string, ObjSize>();
  for (const [id, info] of objects) {
    const cFields = objectChildFields.get(id) ?? new Set();
    sizes.set(id, getObjectSize(info, fontSize, cFields));
  }

  // Phase 2: identify tree nodes and compute ref chains
  const { refChains } = buildRefChains(
    roots,
    objects,
    graph,
    structuralChildren,
    sizes,
  );

  // Phase 3: lay out all roots (chains and trees), then arrays and orphans
  const result: Record<string, TraceObjectLayout> = {};
  let yOffset = 0;

  for (const rootId of roots) {
    const rootInfo = objects.get(rootId)!;
    if (chainTypes.has(rootInfo.type)) {
      yOffset = layoutChainRoot(
        rootId,
        sizes,
        refChains,
        structuralChildren,
        objects,
        result,
        yOffset,
      );
    } else {
      yOffset = layoutTreeRoot(
        rootId,
        graph,
        sizes,
        refChains,
        objectChildFields,
        structuralChildren,
        result,
        yOffset,
      );
    }
  }

  yOffset = layoutArrays(objects, graph, sizes, fontSize, result, yOffset);
  layoutOrphans(objects, sizes, result, yOffset);

  return { objects: result, ignoreFields };
}

/**
 * Phase 1: determine which types are "chain" (1 self-referencing field) vs
 * "tree" (2+ fields), compute per-object child fields, structural children,
 * and find tree/chain roots.
 */
function classifyTypes(
  objects: Map<string, ObjectInfo>,
  fieldToChild: Map<string, Map<string, string>>,
) {
  // Find which field names are structural per type (same-type references).
  const typeChildFields = new Map<string, Set<string>>();
  for (const [parentId, fMap] of fieldToChild) {
    const parentInfo = objects.get(parentId);
    if (parentInfo) {
      for (const [fieldName, childId] of fMap) {
        const childInfo = objects.get(childId);
        if (childInfo && childInfo.type === parentInfo.type) {
          let s = typeChildFields.get(parentInfo.type);
          if (!s) {
            s = new Set();
            typeChildFields.set(parentInfo.type, s);
          }
          s.add(fieldName);
        }
      }
    }
  }

  // Chain types (1 structural child field) are laid out horizontally.
  // Tree types (2+ fields) use d3-flextree. Only tree types get child-slot
  // rendering.
  const chainTypes = new Set<string>();
  for (const [type, fields] of typeChildFields) {
    if (fields.size === 1) {
      chainTypes.add(type);
    }
  }

  // objectChildFields: only tree types get child-slot rendering so that
  // chain nodes render as plain field objects with arrows going right.
  const objectChildFields = new Map<string, Set<string>>();
  for (const [id, info] of objects) {
    if (chainTypes.has(info.type)) {
      continue;
    }
    const cFields = typeChildFields.get(info.type);
    if (cFields && cFields.size > 0) {
      objectChildFields.set(id, new Set(cFields));
    }
  }

  // Compute structural child IDs (object IDs, not field names) per parent,
  // using typeChildFields directly so chain types are included.
  const structuralChildren = new Map<string, Set<string>>();
  for (const [parentId, fMap] of fieldToChild) {
    const parentInfo = objects.get(parentId);
    if (!parentInfo) {
      continue;
    }
    const cFields = typeChildFields.get(parentInfo.type);
    if (!cFields) {
      continue;
    }
    const structIds = new Set<string>();
    for (const [fieldName, childId] of fMap) {
      if (cFields.has(fieldName)) {
        structIds.add(childId);
      }
    }
    if (structIds.size > 0) {
      structuralChildren.set(parentId, structIds);
    }
  }

  // Find tree roots: objects that (a) belong to a type with structural child
  // fields and (b) are not themselves a structural child of another object.
  const structurallyReferenced = new Set<string>();
  for (const childSet of structuralChildren.values()) {
    for (const childId of childSet) {
      structurallyReferenced.add(childId);
    }
  }
  const roots: string[] = [];
  for (const id of objects.keys()) {
    if (structurallyReferenced.has(id)) {
      continue;
    }
    const info = objects.get(id)!;
    if (!typeChildFields.has(info.type)) {
      continue;
    }
    roots.push(id);
  }

  // Sort roots by first appearance for deterministic ordering
  roots.sort((a, b) => objects.get(a)!.firstStep - objects.get(b)!.firstStep);

  return { chainTypes, objectChildFields, structuralChildren, roots };
}

/**
 * Phase 2: walk from roots to mark tree nodes, then compute horizontal
 * ref chains for each tree node.
 */
function buildRefChains(
  roots: string[],
  objects: Map<string, ObjectInfo>,
  graph: Map<string, string[]>,
  structuralChildren: Map<string, Set<string>>,
  sizes: Map<string, ObjSize>,
) {
  const treeNodeIds = new Set<string>();
  function markTreeNodes(id: string) {
    if (treeNodeIds.has(id)) {
      return;
    }
    treeNodeIds.add(id);
    const sChildren = structuralChildren.get(id);
    if (sChildren) {
      for (const childId of sChildren) {
        if (objects.has(childId)) {
          markTreeNodes(childId);
        }
      }
    }
  }
  for (const rootId of roots) {
    if (objects.has(rootId)) {
      markTreeNodes(rootId);
    }
  }

  const refChains = new Map<string, RefChain>();
  const claimed = new Set<string>();
  for (const treeId of treeNodeIds) {
    const chain = computeRefChain(
      treeId,
      graph,
      structuralChildren,
      sizes,
      treeNodeIds,
      claimed,
    );
    if (chain.ids.length > 0) {
      refChains.set(treeId, chain);
      for (const id of chain.ids) {
        claimed.add(id);
      }
    }
  }

  return { treeNodeIds, refChains };
}

/** Effective width of a node including its ref chain. */
function effectiveWidth(
  nodeWidth: number,
  chain: RefChain | undefined,
): number {
  return nodeWidth + (chain ? Math.round(OBJ_GAP * 0.5) + chain.totalWidth : 0);
}

/** Effective height of a node including its ref chain. */
function effectiveHeight(
  nodeHeight: number,
  chain: RefChain | undefined,
): number {
  return chain ? Math.max(nodeHeight, chain.maxHeight) : nodeHeight;
}

/**
 * Place ref chain objects in a horizontal line starting at (startX, y).
 * Each object in the chain is separated by half the gap.
 */
function placeRefChain(
  chain: RefChain,
  startX: number,
  y: number,
  sizes: Map<string, ObjSize>,
  result: Record<string, TraceObjectLayout>,
) {
  let xOff = startX;
  for (const childId of chain.ids) {
    const cs = sizes.get(childId)!;
    result[childId] = makeLayout(xOff, y, cs);
    xOff += cs.width + Math.round(OBJ_GAP * 0.5);
  }
}

/**
 * Lay out a chain-type root and its structural children left to right.
 * Returns the updated yOffset.
 */
function layoutChainRoot(
  rootId: string,
  sizes: Map<string, ObjSize>,
  refChains: Map<string, RefChain>,
  structuralChildren: Map<string, Set<string>>,
  objects: Map<string, ObjectInfo>,
  result: Record<string, TraceObjectLayout>,
  yOffset: number,
): number {
  let xOff = 0;
  let maxHeight = 0;
  let currentId: string | undefined = rootId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId) && objects.has(currentId)) {
    visited.add(currentId);
    const size = sizes.get(currentId)!;
    const chain = refChains.get(currentId);
    const ew = effectiveWidth(size.width, chain);

    result[currentId] = makeLayout(Math.round(xOff), Math.round(yOffset), size);

    if (chain) {
      const refX = xOff + size.width + Math.round(OBJ_GAP * 0.5);
      placeRefChain(
        chain,
        Math.round(refX),
        Math.round(yOffset),
        sizes,
        result,
      );
      maxHeight = Math.max(maxHeight, size.height, chain.maxHeight);
    } else {
      maxHeight = Math.max(maxHeight, size.height);
    }

    xOff += ew + OBJ_GAP;

    // Follow the single structural child
    const sChildren = structuralChildren.get(currentId);
    currentId = sChildren ? [...sChildren][0] : undefined;
  }

  return yOffset + maxHeight + OBJ_GAP;
}

/**
 * Lay out a tree-type root using d3-flextree.
 * Returns the updated yOffset.
 */
function layoutTreeRoot(
  rootId: string,
  graph: Map<string, string[]>,
  sizes: Map<string, ObjSize>,
  refChains: Map<string, RefChain>,
  objectChildFields: Map<string, Set<string>>,
  structuralChildren: Map<string, Set<string>>,
  result: Record<string, TraceObjectLayout>,
  yOffset: number,
): number {
  const visited = new Set<string>();
  const treeData = buildTreeNode(
    rootId,
    graph,
    sizes,
    visited,
    structuralChildren,
  );

  if (!treeData) {
    return yOffset;
  }

  // d3-flextree nodeSize includes the chain width so nodes are spaced apart
  const layoutEngine = flextree<TreeNode>({}).nodeSize(node => {
    const chain = refChains.get(node.data.id);
    const ew = effectiveWidth(node.data.width, chain);
    const eh = effectiveHeight(node.data.height, chain);
    return [ew + OBJ_GAP, eh + OBJ_GAP];
  });

  const root = layoutEngine.hierarchy(treeData, d => d.children);
  layoutEngine(root);

  // Find bounds to translate to positive coordinates
  let minX = Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  root.each(node => {
    const chain = refChains.get(node.data.id);
    const ew = effectiveWidth(node.data.width, chain);
    const eh = effectiveHeight(node.data.height, chain);
    minX = Math.min(minX, node.x - ew / 2);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + eh);
  });

  // Place tree nodes and their ref chains
  root.each(node => {
    const size = sizes.get(node.data.id)!;
    const cFields = objectChildFields.get(node.data.id);
    const chain = refChains.get(node.data.id);
    const ew = effectiveWidth(node.data.width, chain);

    // Tree node is left-aligned within its effective bounding box
    const leftEdge = node.x - ew / 2;
    const nx = Math.round(leftEdge - minX);
    const ny = Math.round(node.y - minY + yOffset);

    result[node.data.id] = makeLayout(nx, ny, size, cFields);

    if (chain) {
      const chainX = nx + size.width + Math.round(OBJ_GAP * 0.5);
      placeRefChain(chain, chainX, ny, sizes, result);
    }
  });

  return yOffset + maxY - minY + OBJ_GAP;
}

/**
 * Position arrays and their referenced objects below the cells.
 * Returns the updated yOffset.
 */
function layoutArrays(
  objects: Map<string, ObjectInfo>,
  graph: Map<string, string[]>,
  sizes: Map<string, ObjSize>,
  fontSize: number,
  result: Record<string, TraceObjectLayout>,
  yOffset: number,
): number {
  for (const [id, info] of objects) {
    if (!info.isArray || id in result) {
      continue;
    }

    const size = sizes.get(id)!;
    const cw = size.cellWidth ?? Math.round(fontSize * CHAR_WIDTH_RATIO * 3);

    result[id] = makeLayout(0, Math.round(yOffset), size);

    // Get unreferenced children from graph, preserving cell order
    const children = (graph.get(id) ?? []).filter(
      cid => !(cid in result) && objects.has(cid),
    );

    if (children.length > 0) {
      // Center each child below its cell, then resolve overlaps
      const placements = children.map((childId, i) => {
        const cs = sizes.get(childId)!;
        return {
          id: childId,
          x: (i + 0.5) * cw - cs.width / 2,
          width: cs.width,
          height: cs.height,
          size: cs,
        };
      });

      const gap = Math.round(OBJ_GAP * 0.5);
      for (let j = 1; j < placements.length; j++) {
        const prev = placements[j - 1];
        const curr = placements[j];
        const minX = prev.x + prev.width + gap;
        if (curr.x < minX) {
          curr.x = minX;
        }
      }

      const refY = Math.round(yOffset + size.height + OBJ_GAP);
      let maxRefHeight = 0;
      for (const p of placements) {
        result[p.id] = makeLayout(Math.round(Math.max(0, p.x)), refY, p.size);
        maxRefHeight = Math.max(maxRefHeight, p.height);
      }

      yOffset = refY + maxRefHeight + OBJ_GAP;
    } else {
      yOffset += size.height + OBJ_GAP;
    }
  }
  return yOffset;
}

/**
 * Place any orphan objects that were not reached by tree, chain, or array
 * layout passes.
 */
function layoutOrphans(
  objects: Map<string, ObjectInfo>,
  sizes: Map<string, ObjSize>,
  result: Record<string, TraceObjectLayout>,
  yOffset: number,
) {
  type OrphanSlot = { ids: string[]; lastStep: number; maxHeight: number };

  const orphanIds = [...objects.keys()]
    .filter(id => !(id in result))
    .sort((a, b) => {
      const aInfo = objects.get(a)!;
      const bInfo = objects.get(b)!;
      return (
        aInfo.firstStep - bInfo.firstStep || aInfo.lastStep - bInfo.lastStep
      );
    });

  const slots: OrphanSlot[] = [];
  for (const id of orphanIds) {
    const info = objects.get(id)!;
    const size = sizes.get(id)!;

    let slot = slots.find(existing => existing.lastStep < info.firstStep);
    if (!slot) {
      slot = { ids: [], lastStep: info.lastStep, maxHeight: size.height };
      slots.push(slot);
    } else {
      slot.lastStep = info.lastStep;
      slot.maxHeight = Math.max(slot.maxHeight, size.height);
    }
    slot.ids.push(id);
  }

  let y = yOffset;
  for (const slot of slots) {
    for (const id of slot.ids) {
      const size = sizes.get(id)!;
      result[id] = makeLayout(0, Math.round(y), size);
    }
    y += slot.maxHeight + OBJ_GAP;
  }
}

/** Compute the chain of non-tree objects reachable from a tree node. */
function computeRefChain(
  startId: string,
  graph: Map<string, string[]>,
  structuralChildren: Map<string, Set<string>>,
  sizes: Map<string, ObjSize>,
  treeNodeIds: Set<string>,
  claimed: Set<string>,
): RefChain {
  const ids: string[] = [];
  let totalWidth = 0;
  let maxHeight = 0;

  const allChildren = graph.get(startId) ?? [];
  const structural = structuralChildren.get(startId);

  const queue: string[] = [];
  const visited = new Set<string>();

  for (const childId of allChildren) {
    if (structural?.has(childId)) {
      continue;
    }
    if (treeNodeIds.has(childId)) {
      continue;
    }
    if (claimed.has(childId)) {
      continue;
    }
    if (sizes.has(childId)) {
      queue.push(childId);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);

    const size = sizes.get(id);
    if (!size) {
      continue;
    }

    ids.push(id);
    totalWidth += size.width;
    maxHeight = Math.max(maxHeight, size.height);

    const childChildren = graph.get(id) ?? [];
    for (const gcId of childChildren) {
      if (
        !visited.has(gcId) &&
        !treeNodeIds.has(gcId) &&
        !claimed.has(gcId) &&
        sizes.has(gcId)
      ) {
        queue.push(gcId);
      }
    }
  }

  if (ids.length > 1) {
    totalWidth += (ids.length - 1) * Math.round(OBJ_GAP * 0.5);
  }

  return { ids, totalWidth, maxHeight };
}

/** Recursively build a TreeNode for d3-flextree (structural children only). */
function buildTreeNode(
  id: string,
  graph: Map<string, string[]>,
  sizes: Map<string, ObjSize>,
  visited: Set<string>,
  structuralChildren: Map<string, Set<string>>,
): TreeNode | null {
  if (visited.has(id)) {
    return null;
  }
  visited.add(id);

  const size = sizes.get(id);
  if (!size) {
    return null;
  }

  const children: TreeNode[] = [];
  const childIds = graph.get(id) ?? [];
  const structural = structuralChildren.get(id);
  for (const childId of childIds) {
    if (!structural?.has(childId)) {
      continue;
    }
    const childNode = buildTreeNode(
      childId,
      graph,
      sizes,
      visited,
      structuralChildren,
    );
    if (childNode) {
      children.push(childNode);
    }
  }

  return { id, width: size.width, height: size.height, children };
}

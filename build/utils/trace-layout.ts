import { flextree } from 'd3-flextree';
import type {
  TraceStep,
  TraceValue,
  TraceLayout,
  TraceObjectLayout,
} from '../types';

/** Maximum number of array cells to display. */
const ARRAY_MAX_CELLS = 12;

/** Default font size in pixels. */
const DEFAULT_FONT_SIZE = 15;

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

  // Determine child fields for each object based on the supergraph.
  // A field is a "child field" if it ever pointed to a structural child.
  // First pass: find which field names are structural per type.
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
  // Chain types (1 structural child field, e.g., linked list) are laid out
  // horizontally. Tree types (2+ fields, e.g., BST) use d3-flextree.
  // Only tree types get child-slot rendering.
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
  // fields (i.e., a tree type) and (b) are not themselves a structural child
  // of another object. Cross-type refs (e.g., PreorderIterator -> Node) don't
  // prevent an object from being a root.
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

  // Compute sizes for all objects (now with child field info)
  const sizes = new Map<
    string,
    { width: number; height: number; valueX?: number; cellWidth?: number }
  >();
  for (const [id, info] of objects) {
    const cFields = objectChildFields.get(id) ?? new Set();
    sizes.set(id, getObjectSize(info, fontSize, cFields));
  }

  // Identify tree nodes (reachable from roots via structural refs)
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

  // Compute horizontal ref chains (non-tree children laid out to the right)
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

  // Build layouts: chains go left-to-right, trees use d3-flextree
  const result: Record<string, TraceObjectLayout> = {};
  let yOffset = 0;

  for (const rootId of roots) {
    const rootInfo = objects.get(rootId)!;

    if (chainTypes.has(rootInfo.type)) {
      // Horizontal chain layout with ref chains below each node
      let xOff = 0;
      let maxHeight = 0;
      let currentId: string | undefined = rootId;
      const visited = new Set<string>();

      while (currentId && !visited.has(currentId) && objects.has(currentId)) {
        visited.add(currentId);
        const size = sizes.get(currentId)!;
        const chain = refChains.get(currentId);

        // Effective width: node + ref chain to the right (if any)
        const nodeWidth = size.width;
        const chainWidth = chain
          ? Math.round(OBJ_GAP * 0.5) + chain.totalWidth
          : 0;
        const effectiveWidth = nodeWidth + chainWidth;

        const ol: TraceObjectLayout = {
          x: Math.round(xOff),
          y: Math.round(yOffset),
          width: size.width,
          height: size.height,
        };
        if (size.valueX !== undefined) {
          ol.valueX = size.valueX;
        }
        if (size.cellWidth !== undefined) {
          ol.cellWidth = size.cellWidth;
        }
        result[currentId] = ol;

        // Place ref chain objects to the right of this chain node
        if (chain) {
          let refX = xOff + nodeWidth + Math.round(OBJ_GAP * 0.5);
          for (const refId of chain.ids) {
            const rs = sizes.get(refId)!;
            const rol: TraceObjectLayout = {
              x: Math.round(refX),
              y: Math.round(yOffset),
              width: rs.width,
              height: rs.height,
            };
            if (rs.valueX !== undefined) {
              rol.valueX = rs.valueX;
            }
            if (rs.cellWidth !== undefined) {
              rol.cellWidth = rs.cellWidth;
            }
            result[refId] = rol;
            refX += rs.width + Math.round(OBJ_GAP * 0.5);
          }
          maxHeight = Math.max(maxHeight, size.height, chain.maxHeight);
        } else {
          maxHeight = Math.max(maxHeight, size.height);
        }

        xOff += effectiveWidth + OBJ_GAP;

        // Follow the single structural child
        const sChildren = structuralChildren.get(currentId);
        currentId = sChildren ? [...sChildren][0] : undefined;
      }

      yOffset += maxHeight + OBJ_GAP;
      continue;
    }

    // Tree layout with d3-flextree
    const visited = new Set<string>();
    const treeData = buildTreeNode(
      rootId,
      graph,
      sizes,
      visited,
      structuralChildren,
    );

    if (!treeData) {
      continue;
    }

    // d3-flextree nodeSize includes the chain width so nodes are spaced apart
    const layoutEngine = flextree<TreeNode>({}).nodeSize(node => {
      const chain = refChains.get(node.data.id);
      const ew =
        node.data.width +
        (chain ? Math.round(OBJ_GAP * 0.5) + chain.totalWidth : 0);
      const eh = chain
        ? Math.max(node.data.height, chain.maxHeight)
        : node.data.height;
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
      const ew =
        node.data.width +
        (chain ? Math.round(OBJ_GAP * 0.5) + chain.totalWidth : 0);
      const eh = chain
        ? Math.max(node.data.height, chain.maxHeight)
        : node.data.height;
      minX = Math.min(minX, node.x - ew / 2);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y + eh);
    });

    // Place tree nodes and their ref chains
    root.each(node => {
      const size = sizes.get(node.data.id)!;
      const cFields = objectChildFields.get(node.data.id);
      const chain = refChains.get(node.data.id);
      const ew =
        node.data.width +
        (chain ? Math.round(OBJ_GAP * 0.5) + chain.totalWidth : 0);

      // Tree node is left-aligned within its effective bounding box
      const leftEdge = node.x - ew / 2;

      const ol: TraceObjectLayout = {
        x: Math.round(leftEdge - minX),
        y: Math.round(node.y - minY + yOffset),
        width: size.width,
        height: size.height,
      };
      if (size.valueX !== undefined) {
        ol.valueX = size.valueX;
      }
      if (size.cellWidth !== undefined) {
        ol.cellWidth = size.cellWidth;
      }
      if (cFields && cFields.size > 0) {
        ol.childFields = Array.from(cFields);
      }
      result[node.data.id] = ol;

      // Place chain objects to the right of the tree node
      if (chain) {
        let xOff =
          Math.round(leftEdge - minX) + size.width + Math.round(OBJ_GAP * 0.5);
        for (const childId of chain.ids) {
          const cs = sizes.get(childId)!;
          const col: TraceObjectLayout = {
            x: xOff,
            y: Math.round(node.y - minY + yOffset),
            width: cs.width,
            height: cs.height,
          };
          if (cs.valueX !== undefined) {
            col.valueX = cs.valueX;
          }
          if (cs.cellWidth !== undefined) {
            col.cellWidth = cs.cellWidth;
          }
          result[childId] = col;
          xOff += cs.width + Math.round(OBJ_GAP * 0.5);
        }
      }
    });

    // Stack next tree below this one
    yOffset += maxY - minY + OBJ_GAP;
  }

  // Position arrays and their referenced objects below the cells
  for (const [id, info] of objects) {
    if (!info.isArray || id in result) {
      continue;
    }

    const size = sizes.get(id)!;
    const cw = size.cellWidth ?? Math.round(fontSize * CHAR_WIDTH_RATIO * 3);

    const ol: TraceObjectLayout = {
      x: 0,
      y: Math.round(yOffset),
      width: size.width,
      height: size.height,
    };
    if (size.cellWidth !== undefined) {
      ol.cellWidth = size.cellWidth;
    }
    result[id] = ol;

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
        const col: TraceObjectLayout = {
          x: Math.round(Math.max(0, p.x)),
          y: refY,
          width: p.size.width,
          height: p.size.height,
        };
        if (p.size.valueX !== undefined) {
          col.valueX = p.size.valueX;
        }
        if (p.size.cellWidth !== undefined) {
          col.cellWidth = p.size.cellWidth;
        }
        result[p.id] = col;
        maxRefHeight = Math.max(maxRefHeight, p.height);
      }

      yOffset = refY + maxRefHeight + OBJ_GAP;
    } else {
      yOffset += size.height + OBJ_GAP;
    }
  }

  // Place any orphan objects that weren't reached by the tree/chain/array passes
  for (const id of objects.keys()) {
    if (!(id in result)) {
      const size = sizes.get(id)!;
      const ol: TraceObjectLayout = {
        x: 0,
        y: Math.round(yOffset),
        width: size.width,
        height: size.height,
      };
      if (size.valueX !== undefined) {
        ol.valueX = size.valueX;
      }
      if (size.cellWidth !== undefined) {
        ol.cellWidth = size.cellWidth;
      }
      result[id] = ol;
      yOffset += size.height + OBJ_GAP;
    }
  }

  return { objects: result, ignoreFields };
}

/** Chain of non-tree objects laid out horizontally to the right of a tree node. */
interface RefChain {
  ids: string[];
  totalWidth: number;
  maxHeight: number;
}

/** Compute the chain of non-tree objects reachable from a tree node. */
function computeRefChain(
  startId: string,
  graph: Map<string, string[]>,
  structuralChildren: Map<string, Set<string>>,
  sizes: Map<
    string,
    { width: number; height: number; valueX?: number; cellWidth?: number }
  >,
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
  sizes: Map<
    string,
    { width: number; height: number; valueX?: number; cellWidth?: number }
  >,
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

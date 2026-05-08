import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { setPositions, type HandleSide, type MindDocument, type MindNode } from "../model";

export const DEFAULT_MAX_WIDTH = 280;
export const DEFAULT_MAX_HEIGHT = 200;
const ROW_GAP = 20;
const COLUMN_GAP = 80;
const MARGIN_X = 24;
const MARGIN_Y = 24;

export interface MindNodeData extends Record<string, unknown> {
  text: string;
  depth: number;
  isRoot: boolean;
  color?: string;
  note?: string;
  collapsed: boolean;
  hasChildren: boolean;
  hiddenChildCount: number;
  /** Resolved max-width for this node (per-node override or default). */
  maxWidth: number;
  /** Resolved max-height for this node. */
  maxHeight: number;
  /** True if the node has long-form Markdown notes attached. */
  hasNotes: boolean;
  /**
   * Set of sides this node has at least one outgoing edge leaving from
   * (union of every child's `edgeFrom`). MindMapNode renders a visible
   * source dot on each. Empty for leaves.
   */
  outgoingSides: HandleSide[];
  /**
   * Side of this node where the incoming edge arrives. Always defined
   * (unused on the root, but rendering treats root as "no incoming"). */
  incomingSide: HandleSide;
}

const DEFAULT_FROM_SIDE: HandleSide = "right";
const DEFAULT_TO_SIDE: HandleSide = "left";

export interface LayoutResult {
  nodes: Node<MindNodeData>[];
  edges: Edge[];
}

export interface LayoutDefaults {
  maxWidth: number;
  maxHeight: number;
}

const FALLBACK_DEFAULTS: LayoutDefaults = {
  maxWidth: DEFAULT_MAX_WIDTH,
  maxHeight: DEFAULT_MAX_HEIGHT,
};

interface NodeMetrics {
  width: number;
  height: number;
  /** Vertical extent of this node's visible subtree in pixels. */
  subtreeHeight: number;
  /** Total descendants regardless of collapse, for the "hidden N" badge. */
  descendantCount: number;
}

/**
 * Horizontal tidy-tree layout, variable per-node sizing.
 *
 *   measure() — bottom-up, computes each node's pixel width/height plus
 *   the total vertical extent of its subtree. O(N).
 *
 *   place() — top-down, positions each node at column = depth-derived
 *   x (parent.x + parent.width + COLUMN_GAP) and row = vertical center
 *   of its allotted subtree-extent. O(N).
 *
 * Each node's slot reserves `maxWidth × maxHeight` regardless of how
 * tightly the rendered text fills it. CSS clamps the rendered size to
 * those bounds, so the layout doesn't need to measure real DOM. This
 * keeps layout deterministic and synchronous (no ResizeObserver
 * round-trips) at the cost of slightly sparser-looking maps when most
 * nodes are short — which the user can tune via Settings.
 */
export function layoutMindMap(
  doc: MindDocument,
  defaults: LayoutDefaults = FALLBACK_DEFAULTS,
): LayoutResult {
  const metrics = new Map<MindNode, NodeMetrics>();
  measure(doc.root, defaults, metrics);

  const nodes: Node<MindNodeData>[] = [];
  const edges: Edge[] = [];
  if (doc.layoutMode === "manual") {
    placeManual(doc.root, null, null, 0, defaults, metrics, nodes, edges);
  } else {
    place(doc.root, null, null, 0, MARGIN_Y, defaults, metrics, nodes, edges);
  }
  return { nodes, edges };
}

function measure(
  node: MindNode,
  defaults: LayoutDefaults,
  out: Map<MindNode, NodeMetrics>,
): NodeMetrics {
  const width = node.maxWidth ?? defaults.maxWidth;
  const height = node.maxHeight ?? defaults.maxHeight;
  let descendantCount = node.children.length;
  let childrenHeight = 0;

  if (!node.collapsed) {
    for (let i = 0; i < node.children.length; i += 1) {
      const childMetrics = measure(node.children[i]!, defaults, out);
      descendantCount += childMetrics.descendantCount;
      childrenHeight += childMetrics.subtreeHeight;
      if (i > 0) childrenHeight += ROW_GAP;
    }
  } else {
    // Collapsed branches still count their descendants (for the badge),
    // but contribute zero to the visible subtree height.
    descendantCount = countDescendants(node);
  }

  const subtreeHeight = Math.max(height, childrenHeight);
  const m: NodeMetrics = { width, height, subtreeHeight, descendantCount };
  out.set(node, m);
  return m;
}

function countDescendants(node: MindNode): number {
  let n = node.children.length;
  for (const child of node.children) n += countDescendants(child);
  return n;
}

/**
 * Stable handle id for a node + side. React Flow requires explicit ids
 * when an edge could connect to multiple handles on the same node — and
 * since we render handles on all four sides per node (so the user can
 * pick), we always specify the id on edges.
 */
export function handleId(role: "source" | "target", side: HandleSide): string {
  return `${role}-${side}`;
}

function emitNode(
  out: Node<MindNodeData>[],
  node: MindNode,
  m: NodeMetrics,
  x: number,
  y: number,
  depth: number,
  isRoot: boolean,
  collapsed: boolean,
): void {
  // Union of edgeFrom values across this node's children — the parent
  // needs a visible source-dot on every side that at least one child's
  // incoming edge leaves from.
  const outgoingSides: HandleSide[] = [];
  if (!collapsed) {
    const seen = new Set<HandleSide>();
    for (const child of node.children) {
      const side = child.edgeFrom ?? DEFAULT_FROM_SIDE;
      if (!seen.has(side)) {
        seen.add(side);
        outgoingSides.push(side);
      }
    }
  }
  out.push({
    id: node.id,
    type: "mind",
    position: { x, y },
    data: {
      text: node.text,
      depth,
      isRoot,
      color: node.color,
      note: node.note,
      collapsed,
      hasChildren: node.children.length > 0,
      hiddenChildCount: collapsed ? m.descendantCount : 0,
      maxWidth: m.width,
      maxHeight: m.height,
      hasNotes: typeof node.notes === "string" && node.notes.trim().length > 0,
      outgoingSides,
      incomingSide: node.edgeTo ?? DEFAULT_TO_SIDE,
    },
  });
}

function emitEdge(out: Edge[], node: MindNode, parent: MindNode | null): void {
  if (!parent) return;
  // Per-edge endpoints come off the CHILD (each child has exactly one
  // incoming edge, so storage maps 1:1).
  const fromSide = node.edgeFrom ?? DEFAULT_FROM_SIDE;
  const toSide = node.edgeTo ?? DEFAULT_TO_SIDE;
  out.push({
    id: `${parent.id}->${node.id}`,
    source: parent.id,
    sourceHandle: handleId("source", fromSide),
    target: node.id,
    targetHandle: handleId("target", toSide),
    type: "smoothstep",
    // Direction arrow at the target end so users can tell incoming from
    // outgoing visually now that edges can land on any of the four sides.
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
  });
}

/**
 * Manual-mode placement. Honors each node's stored `position` verbatim;
 * nodes without one (newly added since the last save, typically) inherit
 * a small offset from their parent so they're visible and the user can
 * drag from there. No subtree centering; no row gymnastics — manual
 * mode is exactly "what's on disk plus a sensible default for new nodes".
 */
const NEW_NODE_OFFSET_X = 60;
const NEW_NODE_OFFSET_Y = 30;

function placeManual(
  node: MindNode,
  parent: MindNode | null,
  parentPosition: { x: number; y: number; width: number; height: number } | null,
  depth: number,
  defaults: LayoutDefaults,
  metrics: Map<MindNode, NodeMetrics>,
  outNodes: Node<MindNodeData>[],
  outEdges: Edge[],
): void {
  const m = metrics.get(node);
  if (!m) return;
  const collapsed = Boolean(node.collapsed);

  let x: number;
  let y: number;
  if (node.position) {
    x = node.position.x;
    y = node.position.y;
  } else if (parentPosition === null) {
    // Root with no position — start at canvas margin.
    x = MARGIN_X;
    y = MARGIN_Y;
  } else {
    // New child of an already-placed parent: offset right and down a bit
    // so it doesn't sit on top of the parent.
    x = parentPosition.x + parentPosition.width + NEW_NODE_OFFSET_X;
    y = parentPosition.y + NEW_NODE_OFFSET_Y;
  }

  emitNode(outNodes, node, m, x, y, depth, parent === null, collapsed);
  emitEdge(outEdges, node, parent);
  if (collapsed) return;

  const myRect = { x, y, width: m.width, height: m.height };
  for (const child of node.children) {
    placeManual(child, node, myRect, depth + 1, defaults, metrics, outNodes, outEdges);
  }
}

function place(
  node: MindNode,
  parent: MindNode | null,
  parentRect: { x: number; width: number } | null,
  depth: number,
  yTop: number,
  defaults: LayoutDefaults,
  metrics: Map<MindNode, NodeMetrics>,
  outNodes: Node<MindNodeData>[],
  outEdges: Edge[],
): void {
  const m = metrics.get(node);
  if (!m) return;

  const x = parentRect === null ? MARGIN_X : parentRect.x + parentRect.width + COLUMN_GAP;
  const y = yTop + (m.subtreeHeight - m.height) / 2;
  const collapsed = Boolean(node.collapsed);

  emitNode(outNodes, node, m, x, y, depth, parent === null, collapsed);
  emitEdge(outEdges, node, parent);

  if (collapsed) return;
  let childY = yTop;
  for (const child of node.children) {
    const childMetrics = metrics.get(child);
    place(
      child,
      node,
      { x, width: m.width },
      depth + 1,
      childY,
      defaults,
      metrics,
      outNodes,
      outEdges,
    );
    if (childMetrics) childY += childMetrics.subtreeHeight + ROW_GAP;
  }
}

/**
 * Returns a copy of `doc` with every node's `position` field populated
 * for use in manual mode. Resolution order per node:
 *
 *   1. caller-supplied `overrides[id]` (e.g., the dragged node's drop
 *      point during the auto→manual auto-switch),
 *   2. the node's existing `position` field (last known manual state —
 *      preserved across mode toggles),
 *   3. fallback to the auto-layout's position for that node, so newly-
 *      added auto-mode nodes get sensible coordinates instead of the
 *      bare parent-offset stacking we'd otherwise get.
 *
 * Layout mode itself is not changed — caller does that explicitly with
 * setLayoutMode.
 */
export function materializeManualPositions(
  doc: MindDocument,
  overrides?: Map<string, { x: number; y: number }>,
): MindDocument {
  // Compute auto-layout positions to gap-fill any nodes lacking both
  // an override and a stored position.
  const autoNodes = layoutMindMap({ ...doc, layoutMode: undefined }).nodes;
  const autoPositions = new Map<string, { x: number; y: number }>();
  for (const n of autoNodes) {
    autoPositions.set(n.id, { x: n.position.x, y: n.position.y });
  }

  const positions = new Map<string, { x: number; y: number }>();
  walk(doc.root, (treeNode) => {
    const o = overrides?.get(treeNode.id);
    if (o) {
      positions.set(treeNode.id, o);
      return;
    }
    if (treeNode.position) {
      positions.set(treeNode.id, treeNode.position);
      return;
    }
    const fallback = autoPositions.get(treeNode.id);
    if (fallback) positions.set(treeNode.id, fallback);
  });
  return setPositions(doc, positions);
}

function walk(node: MindNode, visit: (n: MindNode) => void): void {
  visit(node);
  for (const c of node.children) walk(c, visit);
}

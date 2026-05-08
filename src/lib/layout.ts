import type { Edge, Node } from "@xyflow/react";
import type { MindDocument, MindNode } from "../model";

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
}

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
  place(doc.root, null, null, 0, MARGIN_Y, defaults, metrics, nodes, edges);
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

function place(
  node: MindNode,
  parentId: string | null,
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

  outNodes.push({
    id: node.id,
    type: "mind",
    position: { x, y },
    data: {
      text: node.text,
      depth,
      isRoot: parentId === null,
      color: node.color,
      note: node.note,
      collapsed,
      hasChildren: node.children.length > 0,
      hiddenChildCount: collapsed ? m.descendantCount : 0,
      maxWidth: m.width,
      maxHeight: m.height,
      hasNotes: typeof node.notes === "string" && node.notes.trim().length > 0,
    },
  });

  if (parentId) {
    outEdges.push({
      id: `${parentId}->${node.id}`,
      source: parentId,
      target: node.id,
      type: "smoothstep",
    });
  }

  if (collapsed) return;
  let childY = yTop;
  for (const child of node.children) {
    const childMetrics = metrics.get(child);
    place(
      child,
      node.id,
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

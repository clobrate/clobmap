import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { MindDocument, TagNode } from "../model";

// Constants chosen to give the tag tree a more compact visual feel
// than the data canvas — the tag tree is meant to be glanceable
// reference, not a primary editing surface.
const TAG_NODE_WIDTH = 140;
const TAG_NODE_HEIGHT = 28;
const TAG_ROW_GAP = 6;
const TAG_COLUMN_GAP = 36;
const TAG_MARGIN_X = 16;
const TAG_MARGIN_Y = 16;

export interface TagMapNodeData extends Record<string, unknown> {
  name: string;
  depth: number;
  isRoot: boolean;
  hasChildren: boolean;
}

export interface TagLayoutResult {
  nodes: Node<TagMapNodeData>[];
  edges: Edge[];
}

interface TagMetrics {
  subtreeHeight: number;
}

/**
 * Horizontal tidy-tree layout for the tag tree. Much simpler than the
 * data-canvas layout: tag-nodes have a fixed size, there's no manual
 * mode (positions aren't stored on TagNode), and edges only use the
 * default right→left routing — tag-nodes don't carry per-side handle
 * configuration the way data-nodes do.
 */
export function layoutTagTree(doc: MindDocument): TagLayoutResult {
  const nodes: Node<TagMapNodeData>[] = [];
  const edges: Edge[] = [];
  if (!doc.tagRoot || doc.tagRoot.children.length === 0) {
    return { nodes, edges };
  }
  const metrics = new Map<TagNode, TagMetrics>();
  measure(doc.tagRoot, metrics);
  place(doc.tagRoot, null, null, 0, TAG_MARGIN_Y, metrics, nodes, edges);
  return { nodes, edges };
}

function measure(node: TagNode, out: Map<TagNode, TagMetrics>): TagMetrics {
  let childrenHeight = 0;
  for (let i = 0; i < node.children.length; i += 1) {
    const childMetrics = measure(node.children[i]!, out);
    childrenHeight += childMetrics.subtreeHeight;
    if (i > 0) childrenHeight += TAG_ROW_GAP;
  }
  const subtreeHeight = Math.max(TAG_NODE_HEIGHT, childrenHeight);
  const m: TagMetrics = { subtreeHeight };
  out.set(node, m);
  return m;
}

function place(
  node: TagNode,
  parent: TagNode | null,
  parentRect: { x: number; width: number } | null,
  depth: number,
  yTop: number,
  metrics: Map<TagNode, TagMetrics>,
  outNodes: Node<TagMapNodeData>[],
  outEdges: Edge[],
): void {
  const m = metrics.get(node);
  if (!m) return;
  const x =
    parentRect === null
      ? TAG_MARGIN_X
      : parentRect.x + parentRect.width + TAG_COLUMN_GAP;
  const y = yTop + (m.subtreeHeight - TAG_NODE_HEIGHT) / 2;
  const isRoot = parent === null;

  outNodes.push({
    id: node.id,
    type: "tagNode",
    position: { x, y },
    data: {
      name: node.name,
      depth,
      isRoot,
      hasChildren: node.children.length > 0,
    },
  });
  if (parent) {
    outEdges.push({
      id: `${parent.id}->${node.id}`,
      source: parent.id,
      target: node.id,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    });
  }

  let childY = yTop;
  for (const child of node.children) {
    const childMetrics = metrics.get(child);
    place(
      child,
      node,
      { x, width: TAG_NODE_WIDTH },
      depth + 1,
      childY,
      metrics,
      outNodes,
      outEdges,
    );
    if (childMetrics) childY += childMetrics.subtreeHeight + TAG_ROW_GAP;
  }
}

export const TAG_LAYOUT_CONSTANTS = {
  TAG_NODE_WIDTH,
  TAG_NODE_HEIGHT,
} as const;

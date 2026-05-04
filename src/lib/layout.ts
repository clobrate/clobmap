import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { MindDocument, MindNode } from "../model";

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 44;

export interface MindNodeData extends Record<string, unknown> {
  text: string;
  depth: number;
  isRoot: boolean;
  color?: string;
  note?: string;
  collapsed?: boolean;
  hasChildren: boolean;
}

export interface LayoutResult {
  nodes: Node<MindNodeData>[];
  edges: Edge[];
}

export function layoutMindMap(doc: MindDocument): LayoutResult {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: "LR",
    nodesep: 20,
    ranksep: 80,
    marginx: 24,
    marginy: 24,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const nodes: Node<MindNodeData>[] = [];
  const edges: Edge[] = [];

  const visit = (node: MindNode, parentId: string | null, depth: number): void => {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    nodes.push({
      id: node.id,
      type: "mind",
      position: { x: 0, y: 0 },
      data: {
        text: node.text,
        depth,
        isRoot: parentId === null,
        color: node.color,
        note: node.note,
        collapsed: node.collapsed,
        hasChildren: node.children.length > 0,
      },
    });
    if (parentId) {
      graph.setEdge(parentId, node.id);
      edges.push({
        id: `${parentId}->${node.id}`,
        source: parentId,
        target: node.id,
        type: "smoothstep",
      });
    }
    for (const child of node.children) {
      visit(child, node.id, depth + 1);
    }
  };

  visit(doc.root, null, 0);
  dagre.layout(graph);

  const positioned: Node<MindNodeData>[] = nodes.map((n) => {
    const laid = graph.node(n.id);
    return {
      ...n,
      position: {
        x: laid.x - NODE_WIDTH / 2,
        y: laid.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: positioned, edges };
}

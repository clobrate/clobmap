import { useEffect, useMemo } from "react";
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import { buildFilterTree, UNTAGGED_LABEL, type FilterNode } from "../lib/tagFilter";

// Compact layout tuned for the filter view: a horizontal tidy-tree
// with tighter gaps than the main canvas. The view is read-only so we
// don't need to round-trip sizes back into the document; we pick fixed
// pixel sizes per node kind and lay out deterministically.
const TAG_W = 160;
const DATA_W = 200;
const NODE_H = 30;
const ROW_GAP = 8;
const COLUMN_GAP = 40;
const MARGIN_X = 16;
const MARGIN_Y = 16;

interface RenderData extends Record<string, unknown> {
  kind: "tag" | "untagged" | "data";
  label: string;
}

const nodeTypes = { filterNode: FilterRenderNode };

/**
 * Read-only canvas surface that mirrors the doc through `buildFilterTree`.
 * Mounted by App.tsx when `filterTagId !== null`, replacing the data
 * canvas + tag-tree split. Structural edits (Tab, Enter, drag, Delete)
 * are all disabled here per design §5.3 — the only way out is the
 * Reset filter button.
 */
export function FilterCanvas() {
  return (
    <ReactFlowProvider>
      <FilterCanvasInner />
    </ReactFlowProvider>
  );
}

function FilterCanvasInner() {
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const filterTagId = useUIStore((s) => s.filterTagId);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);

  const layoutResult = useMemo(() => {
    if (!parsedDoc || !filterTagId) return { nodes: [], edges: [] };
    const root = buildFilterTree(parsedDoc, filterTagId);
    if (!root) return { nodes: [], edges: [] };
    return layoutFilterTree(root);
  }, [parsedDoc, filterTagId]);

  const [nodes, setNodes] = useNodesState<Node<RenderData>>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes(layoutResult.nodes);
    setEdges(layoutResult.edges);
  }, [layoutResult, setNodes, setEdges]);

  // We accept basic selection changes only — no position changes
  // bubble back (drag is disabled at the ReactFlow level), so the
  // structural shape stays read-only.
  const onNodesChange = (changes: NodeChange<Node<RenderData>>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  };

  if (!filterTagId || nodes.length === 0) {
    // Defensive: caller (App.tsx) is responsible for not mounting this
    // canvas without a filter. Render a stub when filter is gone or the
    // tag-node disappeared (e.g., user deleted it from another surface).
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Tag is no longer in the document. Use Reset filter to return.
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full bg-white outline-none dark:bg-neutral-950"
      role="tree"
      aria-label="Tag filter view"
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        // Structural editing is disabled — these are the explicit knobs.
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.15 }}
        panOnScroll
        zoomOnScroll
        minZoom={0.3}
        maxZoom={2}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        colorMode={resolvedTheme}
      >
        <Background gap={16} color={resolvedTheme === "dark" ? "#262626" : "#e5e5e5"} />
      </ReactFlow>
    </div>
  );
}

/**
 * Single render component for every filter-canvas entry. Style varies
 * by the `kind` of derived FilterNode it mirrors:
 *  - "tag": pill, neutral background
 *  - "untagged": pill with a dashed border to distinguish the pseudo-bucket
 *  - "data": rounded rectangle, emerald accent, matches the data-canvas
 *    styling closely so users feel oriented
 */
function FilterRenderNode({ data }: NodeProps<Node<RenderData>>) {
  const { kind, label } = data;
  let classes: string;
  if (kind === "data") {
    classes =
      "rounded-md border bg-white px-2.5 py-1 text-sm text-neutral-900 shadow-sm border-emerald-400/60 dark:bg-neutral-900 dark:text-neutral-100 dark:border-emerald-500/60";
  } else if (kind === "untagged") {
    classes =
      "rounded-full border border-dashed bg-neutral-100 px-2.5 py-0.5 text-xs uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";
  } else {
    classes =
      "rounded-full border bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200";
  }
  return (
    <div className={classes} role="treeitem">
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-neutral-500"
      />
      <span className="whitespace-nowrap">{label}</span>
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-neutral-500"
      />
    </div>
  );
}

interface LayoutResult {
  nodes: Node<RenderData>[];
  edges: Edge[];
}

/**
 * Horizontal tidy-tree layout for the filter tree. Symmetric to
 * `tagLayout.ts` but parameterized on node kind for width — data
 * entries are wider than tag pills.
 */
function layoutFilterTree(root: FilterNode): LayoutResult {
  const metrics = new Map<FilterNode, { subtreeHeight: number }>();
  measure(root, metrics);
  const out: LayoutResult = { nodes: [], edges: [] };
  place(root, null, null, 0, MARGIN_Y, metrics, out);
  return out;
}

function nodeWidth(n: FilterNode): number {
  return n.kind === "data" ? DATA_W : TAG_W;
}

function measure(
  n: FilterNode,
  m: Map<FilterNode, { subtreeHeight: number }>,
): { subtreeHeight: number } {
  const kids = childrenOf(n);
  let childrenH = 0;
  for (let i = 0; i < kids.length; i += 1) {
    const cm = measure(kids[i]!, m);
    childrenH += cm.subtreeHeight;
    if (i > 0) childrenH += ROW_GAP;
  }
  const subtreeHeight = Math.max(NODE_H, childrenH);
  const entry = { subtreeHeight };
  m.set(n, entry);
  return entry;
}

function childrenOf(n: FilterNode): FilterNode[] {
  if (n.kind === "data") return [];
  return n.children;
}

function place(
  n: FilterNode,
  parent: FilterNode | null,
  parentRect: { x: number; width: number } | null,
  depth: number,
  yTop: number,
  metrics: Map<FilterNode, { subtreeHeight: number }>,
  out: LayoutResult,
): void {
  const m = metrics.get(n);
  if (!m) return;
  const x = parentRect === null ? MARGIN_X : parentRect.x + parentRect.width + COLUMN_GAP;
  const w = nodeWidth(n);
  const y = yTop + (m.subtreeHeight - NODE_H) / 2;
  out.nodes.push({
    id: n.id,
    type: "filterNode",
    position: { x, y },
    data: {
      kind: n.kind,
      label: n.kind === "untagged" ? UNTAGGED_LABEL : n.kind === "tag" ? n.name : n.text,
    },
    draggable: false,
  });
  if (parent) {
    out.edges.push({
      id: `${parent.id}->${n.id}`,
      source: parent.id,
      target: n.id,
      type: "smoothstep",
    });
  }
  let childY = yTop;
  for (const child of childrenOf(n)) {
    const cm = metrics.get(child);
    place(child, n, { x, width: w }, depth + 1, childY, metrics, out);
    if (cm) childY += cm.subtreeHeight + ROW_GAP;
  }
}

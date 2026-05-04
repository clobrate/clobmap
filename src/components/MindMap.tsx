import { useMemo } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useDocumentStore } from "../store/document";
import { layoutMindMap, type MindNodeData } from "../lib/layout";
import { MindMapNode } from "./MindMapNode";

const nodeTypes = { mind: MindMapNode };

export function MindMap() {
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const parseError = useDocumentStore((s) => s.parseError);

  const { nodes, edges } = useMemo<{ nodes: Node<MindNodeData>[]; edges: Edge[] }>(() => {
    if (!parsedDoc) return { nodes: [], edges: [] };
    return layoutMindMap(parsedDoc);
  }, [parsedDoc]);

  if (!parsedDoc) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-500">
        {parseError ? "Waiting for valid YAML…" : "No document"}
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-neutral-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        panOnScroll
        zoomOnScroll
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background gap={16} color="#262626" />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-neutral-900" />
      </ReactFlow>
    </div>
  );
}

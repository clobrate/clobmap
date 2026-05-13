import { useCallback, useEffect, useMemo } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import {
  OpError,
  moveTagNode,
  tagDelete,
  type MindDocument,
} from "../model";
import { layoutTagTree, type TagMapNodeData } from "../lib/tagLayout";
import { TagMapNode } from "./TagMapNode";
import { TagContextMenu } from "./TagContextMenu";

const nodeTypes = { tagNode: TagMapNode };

/**
 * Tag-tree pane — a second React Flow surface that renders the
 * document's `tagRoot` subtree. Sits below the data canvas in a
 * vertical split (mounted by App.tsx when `hasAnyTag === true`).
 *
 * Editing surfaces in Phase C:
 *  - Double-click a tag-node → InlineRename (`updateTagName` op)
 *  - Right-click → Rename / Delete tag (cascading `tagDelete`)
 *  - Drag a tag-node onto another → re-parent (`moveTagNode` op)
 */
export function TagTreePane() {
  return (
    <ReactFlowProvider>
      <TagTreePaneInner />
    </ReactFlowProvider>
  );
}

function TagTreePaneInner() {
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);
  const selectedTagId = useUIStore((s) => s.selectedTagId);
  const setSelectedTag = useUIStore((s) => s.setSelectedTag);
  const setEditingTag = useUIStore((s) => s.setEditingTag);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const tagContextMenu = useUIStore((s) => s.tagContextMenu);
  const closeTagContextMenu = useUIStore((s) => s.closeTagContextMenu);
  const setFilterTagId = useUIStore((s) => s.setFilterTagId);

  // Layout the tag tree fresh on every parsedDoc change; same approach
  // the data canvas uses for the data tree.
  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(
    () =>
      parsedDoc
        ? layoutTagTree(parsedDoc)
        : ({ nodes: [], edges: [] } as ReturnType<typeof layoutTagTree>),
    [parsedDoc],
  );

  const reactFlow = useReactFlow<Node<TagMapNodeData>, Edge>();
  const [nodes, setNodes] = useNodesState<Node<TagMapNodeData>>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  // Replace nodes + edges only when the layout itself changed (parsedDoc
  // structural edits). Selection changes flow through a separate effect
  // below — rebuilding the whole list on every click would knock
  // in-progress double-clicks off because the DOM briefly re-renders
  // between click1 and click2.
  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  // Sync only the `selected` flag when selectedTagId changes — no
  // position changes, no array re-creation if nothing changed.
  useEffect(() => {
    setNodes((current) =>
      current.map((n) =>
        n.selected === (n.id === selectedTagId)
          ? n
          : { ...n, selected: n.id === selectedTagId },
      ),
    );
  }, [selectedTagId, setNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<TagMapNodeData>>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [setNodes],
  );

  const onNodeClick: NodeMouseHandler<Node<TagMapNodeData>> = useCallback(
    (_e, node) => {
      setSelectedTag(node.id);
      // Clear any data-node selection so pane-level keyboard shortcuts
      // (F2, Delete) don't race against the data-canvas handler.
      useUIStore.getState().setSelected(null);
      closeTagContextMenu();
    },
    [setSelectedTag, closeTagContextMenu],
  );

  const onNodeDoubleClick: NodeMouseHandler<Node<TagMapNodeData>> = useCallback(
    (_e, node) => {
      if (node.data.isRoot) return;
      setEditingTag(node.id);
    },
    [setEditingTag],
  );

  const onNodeContextMenu: NodeMouseHandler<Node<TagMapNodeData>> = useCallback(
    (e, node) => {
      e.preventDefault();
      if (node.data.isRoot) return;
      setSelectedTag(node.id);
      useUIStore.getState().setSelected(null);
      useUIStore.getState().openTagContextMenu(node.id, e.clientX, e.clientY);
    },
    [setSelectedTag],
  );

  const onNodeDragStop: OnNodeDrag<Node<TagMapNodeData>> = useCallback(
    (_e, node) => {
      const tree = useDocumentStore.getState().parsedDoc;
      if (!tree) return;
      // Find an intersecting tag-node (excluding self / descendants of self).
      const intersecting = reactFlow
        .getIntersectingNodes(node)
        .filter((n) => n.id !== node.id);
      const target = intersecting[0];
      if (target) {
        try {
          applyTreeChange(moveTagNode(tree, node.id, target.id));
        } catch (err) {
          if (!(err instanceof OpError)) throw err;
        }
      }
      // No target → snap back. Re-layout will fire from the next render
      // (selectedTagId unchanged → effect above resets positions).
      setNodes(
        layoutNodes.map((n) => ({
          ...n,
          selected: n.id === selectedTagId,
        })),
      );
    },
    [reactFlow, applyTreeChange, setNodes, layoutNodes, selectedTagId],
  );

  const onPaneClick = useCallback(() => {
    // Clicking empty space in the pane both dismisses the right-click
    // menu and clears the tag selection — which in turn clears the
    // per-data-node fill highlight (highlight follows selection).
    closeTagContextMenu();
    setSelectedTag(null);
  }, [closeTagContextMenu, setSelectedTag]);

  const handleDeleteFromMenu = useCallback(
    (tagId: string) => {
      const tree = useDocumentStore.getState().parsedDoc;
      if (!tree) return;
      try {
        applyTreeChange(tagDelete(tree, tagId));
        setSelectedTag(null);
      } catch (err) {
        if (!(err instanceof OpError)) throw err;
      }
      closeTagContextMenu();
    },
    [applyTreeChange, setSelectedTag, closeTagContextMenu],
  );

  // Pane-level keyboard shortcuts. Window-listener (so node-level
  // focus doesn't matter), but guarded so it only fires when the tag
  // tree has a selected node AND no other editing surface is active.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't compete with the inline rename input, the tag-tree
      // context menu, or other editors that own focus.
      const ui = useUIStore.getState();
      if (ui.editingTagId !== null) return;
      if (ui.editingNodeId !== null) return;
      if (ui.notesEditorNodeId !== null) return;
      if (ui.tagEditorNodeId !== null) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      const id = selectedTagId;
      if (!id) return;
      const tree = useDocumentStore.getState().parsedDoc;
      if (!tree?.tagRoot || tree.tagRoot.id === id) return;
      if (e.key === "F2") {
        e.preventDefault();
        setEditingTag(id);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        try {
          applyTreeChange(tagDelete(tree, id));
          setSelectedTag(null);
        } catch (err) {
          if (!(err instanceof OpError)) throw err;
        }
        return;
      }
      if (e.key === "Escape") {
        // Clear selection so the user can dismiss without a destructive
        // action. Doesn't preventDefault — other handlers may want it
        // (the modal layer also listens for Escape).
        setSelectedTag(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedTagId, applyTreeChange, setEditingTag, setSelectedTag]);

  if (!parsedDoc || !parsedDoc.tagRoot || parsedDoc.tagRoot.children.length === 0) {
    // Nothing to render — caller (App.tsx) is responsible for not mounting
    // this pane when there are no tags, but be defensive.
    return null;
  }

  return (
    <div
      className="relative h-full w-full border-t border-neutral-200 bg-neutral-50 outline-none dark:border-neutral-800 dark:bg-neutral-950"
      role="tree"
      aria-label="Tag tree"
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        panOnScroll
        zoomOnScroll
        minZoom={0.3}
        maxZoom={2}
        nodesConnectable={false}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        colorMode={resolvedTheme}
      >
        <Background gap={12} color={resolvedTheme === "dark" ? "#1f1f1f" : "#ececec"} />
      </ReactFlow>
      {tagContextMenu && (
        <TagContextMenu
          tagId={tagContextMenu.tagId}
          x={tagContextMenu.x}
          y={tagContextMenu.y}
          onClose={closeTagContextMenu}
          onRename={() => {
            setEditingTag(tagContextMenu.tagId);
            closeTagContextMenu();
          }}
          onDelete={() => handleDeleteFromMenu(tagContextMenu.tagId)}
          onShowHierarchy={() => {
            setFilterTagId(tagContextMenu.tagId);
            closeTagContextMenu();
          }}
        />
      )}
    </div>
  );
}

/**
 * Helper: does the doc have any user-visible tags?
 * Hoisted so callers (App.tsx) don't have to duplicate the check.
 */
export function hasAnyTag(doc: MindDocument | null): boolean {
  return !!doc?.tagRoot && doc.tagRoot.children.length > 0;
}

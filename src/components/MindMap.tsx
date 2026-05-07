import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
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
import { layoutMindMap, type MindNodeData } from "../lib/layout";
import { MindMapNode } from "./MindMapNode";
import { ContextMenu } from "./ContextMenu";
import {
  addChild,
  addSibling,
  deleteNode,
  duplicateNode,
  findById,
  idGeneratorForDocument,
  moveNode,
  OpError,
  updateNode,
} from "../model";
import { navigateIntoChildren, navigateSibling, navigateToParent } from "../lib/navigation";

const nodeTypes = { mind: MindMapNode };

export function MindMap() {
  return (
    <ReactFlowProvider>
      <MindMapInner />
    </ReactFlowProvider>
  );
}

function MindMapInner() {
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const parseError = useDocumentStore((s) => s.parseError);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);

  const selectedId = useUIStore((s) => s.selectedNodeId);
  const setSelected = useUIStore((s) => s.setSelected);
  const editingId = useUIStore((s) => s.editingNodeId);
  const setEditing = useUIStore((s) => s.setEditing);
  const contextMenu = useUIStore((s) => s.contextMenu);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const closeContextMenu = useUIStore((s) => s.closeContextMenu);
  const clipboard = useUIStore((s) => s.clipboard);
  const setClipboard = useUIStore((s) => s.setClipboard);
  const resolvedTheme = useUIStore((s) => s.resolvedTheme);
  const announce = useUIStore((s) => s.announce);

  const layout = useMemo(
    () => (parsedDoc ? layoutMindMap(parsedDoc) : { nodes: [], edges: [] }),
    [parsedDoc],
  );

  const reactFlow = useReactFlow<Node<MindNodeData>, Edge>();

  // iOS-specific keyboard primer: a hidden input we focus synchronously
  // inside a tap handler so iOS counts it as a user-gesture-initiated focus
  // and shows the soft keyboard. When InlineRename mounts a moment later,
  // iOS keeps the keyboard up while focus transfers to the real input.
  const keyboardPrimerRef = useRef<HTMLInputElement>(null);
  const primeKeyboard = useCallback(() => {
    keyboardPrimerRef.current?.focus();
  }, []);

  // Keep React Flow's internal node positions in sync with layout positions.
  useEffect(() => {
    reactFlow.setNodes(layout.nodes.map((n) => ({ ...n, selected: n.id === selectedId })));
    reactFlow.setEdges(layout.edges);
  }, [layout.nodes, layout.edges, selectedId, reactFlow]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<MindNodeData>>[]) => {
      reactFlow.setNodes((current) => applyNodeChanges(changes, current));
    },
    [reactFlow],
  );

  // Pan (without changing zoom) so a freshly-created node lands inside the
  // visible viewport. Wait one frame for the layout effect above to push the
  // new node into React Flow and for it to measure dimensions.
  const revealNode = useCallback(
    (nodeId: string) => {
      requestAnimationFrame(() => {
        const z = reactFlow.getZoom();
        reactFlow.fitView({
          nodes: [{ id: nodeId }],
          duration: 250,
          padding: 0.4,
          minZoom: z,
          maxZoom: z,
        });
      });
    },
    [reactFlow],
  );

  const onNodeClick: NodeMouseHandler<Node<MindNodeData>> = useCallback(
    (_e, node) => {
      setSelected(node.id);
      closeContextMenu();
    },
    [setSelected, closeContextMenu],
  );

  const onNodeDoubleClick: NodeMouseHandler<Node<MindNodeData>> = useCallback(
    (_e, node) => {
      setSelected(node.id);
      setEditing(node.id);
    },
    [setSelected, setEditing],
  );

  const onNodeContextMenu: NodeMouseHandler<Node<MindNodeData>> = useCallback(
    (e, node) => {
      e.preventDefault();
      setSelected(node.id);
      openContextMenu(node.id, e.clientX, e.clientY);
    },
    [setSelected, openContextMenu],
  );

  const onPaneClick = useCallback(() => {
    setSelected(null);
    setEditing(null);
    closeContextMenu();
  }, [setSelected, setEditing, closeContextMenu]);

  const onNodeDragStop: OnNodeDrag<Node<MindNodeData>> = useCallback(
    (_e, node) => {
      const tree = useDocumentStore.getState().parsedDoc;
      if (!tree) return;
      const intersecting = reactFlow.getIntersectingNodes(node).filter((n) => n.id !== node.id);
      const target = intersecting[0];
      if (target) {
        try {
          applyTreeChange(moveNode(tree, node.id, target.id));
          return;
        } catch (err) {
          if (!(err instanceof OpError)) throw err;
        }
      }
      // Snap back to laid-out position
      reactFlow.setNodes(layout.nodes.map((n) => ({ ...n, selected: n.id === selectedId })));
    },
    [applyTreeChange, layout.nodes, selectedId, reactFlow],
  );

  // Global keyboard handler for the canvas
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingId !== null) return;
      const tree = useDocumentStore.getState().parsedDoc;
      if (!tree) return;

      const isCmd = e.metaKey || e.ctrlKey;

      if (isCmd && e.key === "0") {
        e.preventDefault();
        reactFlow.fitView({ padding: 0.2 });
        return;
      }
      if (isCmd && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (isCmd && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (isCmd && e.key.toLowerCase() === "x") {
        if (!selectedId || selectedId === tree.root.id) return;
        e.preventDefault();
        useUIStore.getState().setClipboard({ nodeId: selectedId });
        return;
      }
      if (isCmd && e.key.toLowerCase() === "v") {
        const cb = useUIStore.getState().clipboard;
        if (!cb || !selectedId) return;
        e.preventDefault();
        try {
          applyTreeChange(moveNode(tree, cb.nodeId, selectedId));
          useUIStore.getState().setClipboard(null);
        } catch (err) {
          if (!(err instanceof OpError)) throw err;
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setEditing(null);
        closeContextMenu();
        if (useUIStore.getState().clipboard) useUIStore.getState().setClipboard(null);
        return;
      }

      if (!selectedId) return;
      const selected = findById(tree, selectedId);
      if (!selected) return;

      switch (e.key) {
        case "Tab": {
          e.preventDefault();
          const ids = idGeneratorForDocument(tree);
          const result = addChild(tree, selectedId, "New", ids);
          applyTreeChange(result.doc);
          setSelected(result.newId);
          setEditing(result.newId);
          revealNode(result.newId);
          return;
        }
        case "Enter": {
          if (selectedId === tree.root.id) return;
          e.preventDefault();
          try {
            const ids = idGeneratorForDocument(tree);
            const result = addSibling(tree, selectedId, "New", ids);
            applyTreeChange(result.doc);
            setSelected(result.newId);
            setEditing(result.newId);
            revealNode(result.newId);
          } catch (err) {
            if (!(err instanceof OpError)) throw err;
          }
          return;
        }
        case "F2": {
          e.preventDefault();
          setEditing(selectedId);
          return;
        }
        case "Delete":
        case "Backspace": {
          if (selectedId === tree.root.id) return;
          e.preventDefault();
          try {
            applyTreeChange(deleteNode(tree, selectedId));
            setSelected(null);
          } catch (err) {
            if (!(err instanceof OpError)) throw err;
          }
          return;
        }
        case " ": {
          e.preventDefault();
          if (!selected.children.length) return;
          applyTreeChange(updateNode(tree, selectedId, { collapsed: !selected.collapsed }));
          return;
        }
        case "ArrowUp":
        case "ArrowDown": {
          const target = navigateSibling(tree, selectedId, e.key === "ArrowUp" ? -1 : 1);
          if (target) {
            e.preventDefault();
            setSelected(target.id);
            announce(`${target.text}, ${target.aria}`);
          }
          return;
        }
        case "ArrowRight": {
          const target = navigateIntoChildren(tree, selectedId, applyTreeChange);
          if (target) {
            e.preventDefault();
            setSelected(target.id);
            announce(`${target.text}, ${target.aria}`);
          }
          return;
        }
        case "ArrowLeft": {
          const target = navigateToParent(tree, selectedId);
          if (target) {
            e.preventDefault();
            setSelected(target.id);
            announce(`${target.text}, ${target.aria}`);
          }
          return;
        }
        default:
          return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    announce,
    applyTreeChange,
    closeContextMenu,
    editingId,
    redo,
    reactFlow,
    revealNode,
    selectedId,
    setEditing,
    setSelected,
    undo,
  ]);

  if (!parsedDoc) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-neutral-500 dark:bg-neutral-950">
        {parseError ? "Waiting for valid YAML…" : "No document"}
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full bg-white outline-none dark:bg-neutral-950"
      role="tree"
      aria-label="Mind map canvas"
      tabIndex={0}
    >
      <input
        ref={keyboardPrimerRef}
        aria-hidden="true"
        tabIndex={-1}
        readOnly
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
      />
      <ReactFlow
        defaultNodes={[]}
        defaultEdges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        panOnScroll
        zoomOnScroll
        minZoom={0.1}
        maxZoom={2}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        colorMode={resolvedTheme}
      >
        <Background gap={16} color={resolvedTheme === "dark" ? "#262626" : "#e5e5e5"} />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          className="!hidden bg-neutral-50 sm:!block dark:!bg-neutral-900"
        />
      </ReactFlow>
      {parsedDoc.root.children.length === 0 && (
        <div className="pointer-events-none absolute bottom-6 left-0 right-0 flex justify-center">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Click the node, then press{" "}
            <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1 py-px font-mono text-[11px] dark:border-neutral-700 dark:bg-neutral-800">
              Tab
            </kbd>{" "}
            to add a child.
          </p>
        </div>
      )}
      {contextMenu && findById(parsedDoc, contextMenu.nodeId) && (
        <ContextMenu
          nodeId={contextMenu.nodeId}
          x={contextMenu.x}
          y={contextMenu.y}
          tree={parsedDoc}
          isClipboardActive={clipboard !== null}
          onClose={closeContextMenu}
          onAddChild={() => handleAddChild(contextMenu.nodeId)}
          onAddSibling={() => handleAddSibling(contextMenu.nodeId)}
          onDelete={() => handleDelete(contextMenu.nodeId)}
          onToggleCollapse={() => handleToggleCollapse(contextMenu.nodeId)}
          onRename={() => {
            primeKeyboard();
            setEditing(contextMenu.nodeId);
            closeContextMenu();
          }}
          onDuplicate={() => handleDuplicate(contextMenu.nodeId)}
          onEditNote={(note) => handleEditNote(contextMenu.nodeId, note)}
          onSetColor={(color) => handleSetColor(contextMenu.nodeId, color)}
          onCut={() => handleCut(contextMenu.nodeId)}
          onPaste={() => handlePaste(contextMenu.nodeId)}
        />
      )}
    </div>
  );

  function handleAddChild(nodeId: string) {
    primeKeyboard();
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree) return;
    const ids = idGeneratorForDocument(tree);
    const result = addChild(tree, nodeId, "New", ids);
    applyTreeChange(result.doc);
    setSelected(result.newId);
    setEditing(result.newId);
    revealNode(result.newId);
    closeContextMenu();
  }

  function handleAddSibling(nodeId: string) {
    primeKeyboard();
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree || nodeId === tree.root.id) return;
    try {
      const ids = idGeneratorForDocument(tree);
      const result = addSibling(tree, nodeId, "New", ids);
      applyTreeChange(result.doc);
      setSelected(result.newId);
      setEditing(result.newId);
      revealNode(result.newId);
    } catch (err) {
      if (!(err instanceof OpError)) throw err;
    }
    closeContextMenu();
  }

  function handleDelete(nodeId: string) {
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree || nodeId === tree.root.id) return;
    try {
      applyTreeChange(deleteNode(tree, nodeId));
      setSelected(null);
    } catch (err) {
      if (!(err instanceof OpError)) throw err;
    }
    closeContextMenu();
  }

  function handleToggleCollapse(nodeId: string) {
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree) return;
    const node = findById(tree, nodeId);
    if (!node || node.children.length === 0) return;
    applyTreeChange(updateNode(tree, nodeId, { collapsed: !node.collapsed }));
    closeContextMenu();
  }

  function handleDuplicate(nodeId: string) {
    primeKeyboard();
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree || nodeId === tree.root.id) return;
    try {
      const ids = idGeneratorForDocument(tree);
      const result = duplicateNode(tree, nodeId, ids);
      applyTreeChange(result.doc);
      setSelected(result.newId);
      setEditing(result.newId);
      revealNode(result.newId);
    } catch (err) {
      if (!(err instanceof OpError)) throw err;
    }
    closeContextMenu();
  }

  function handleEditNote(nodeId: string, note: string) {
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree) return;
    applyTreeChange(updateNode(tree, nodeId, { note }));
    closeContextMenu();
  }

  function handleSetColor(nodeId: string, color: string | null) {
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree) return;
    applyTreeChange(updateNode(tree, nodeId, { color: color ?? "" }));
    closeContextMenu();
  }

  function handleCut(nodeId: string) {
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree || nodeId === tree.root.id) return;
    setClipboard({ nodeId });
    closeContextMenu();
  }

  function handlePaste(targetId: string) {
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree || !clipboard) return;
    try {
      applyTreeChange(moveNode(tree, clipboard.nodeId, targetId));
      setClipboard(null);
    } catch (err) {
      if (!(err instanceof OpError)) throw err;
    }
    closeContextMenu();
  }
}

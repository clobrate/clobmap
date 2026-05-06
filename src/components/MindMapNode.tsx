import { useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import type { MindNodeData } from "../lib/layout";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import { useLongPress } from "../lib/useLongPress";
import { updateNode, updateText } from "../model";

type Props = NodeProps<Node<MindNodeData>>;

export function MindMapNode({ id, data, selected }: Props) {
  const { text, isRoot, color, note, hasChildren, collapsed, hiddenChildCount } = data;

  const editingNodeId = useUIStore((s) => s.editingNodeId);
  const setEditing = useUIStore((s) => s.setEditing);
  const setSelected = useUIStore((s) => s.setSelected);
  const openContextMenu = useUIStore((s) => s.openContextMenu);
  const clipboard = useUIStore((s) => s.clipboard);
  const isEditing = editingNodeId === id;
  const isClipped = clipboard?.nodeId === id;

  const longPress = useLongPress((x, y) => {
    setSelected(id);
    openContextMenu(id, x, y);
  });

  const baseClass = isRoot
    ? "rounded-lg border bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-700 shadow-sm transition dark:text-emerald-100"
    : "rounded-md border bg-white px-3 py-1.5 text-sm text-neutral-900 shadow-sm transition hover:border-neutral-400 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-500";

  const borderClass = selected
    ? isRoot
      ? "border-emerald-500 ring-2 ring-emerald-400/60 dark:border-emerald-300"
      : "border-emerald-500 ring-2 ring-emerald-400/40 dark:border-emerald-400"
    : isRoot
      ? "border-emerald-400/60 dark:border-emerald-500/40"
      : "border-neutral-300 dark:border-neutral-700";

  const dimClass = isClipped ? "opacity-40 outline-dashed outline-1 outline-amber-400/60" : "";

  const style = color && !selected ? { borderColor: color } : undefined;

  return (
    <div
      className={`${baseClass} ${borderClass} ${dimClass}`}
      style={{
        ...style,
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        touchAction: "manipulation",
      }}
      title={note}
      role="treeitem"
      aria-level={data.depth + 1}
      aria-selected={selected}
      aria-expanded={hasChildren ? !collapsed : undefined}
      {...longPress}
    >
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2 !w-2 !border-0 !bg-neutral-500"
        />
      )}
      {isEditing ? (
        <InlineRename initialText={text} nodeId={id} onClose={() => setEditing(null)} />
      ) : (
        <div className="flex max-w-[200px] items-center gap-1.5">
          <span className="truncate">{text}</span>
          {hasChildren && (
            <Chevron nodeId={id} collapsed={collapsed} hiddenChildCount={hiddenChildCount} />
          )}
        </div>
      )}
      {hasChildren && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2 !w-2 !border-0 !bg-neutral-500"
        />
      )}
    </div>
  );
}

function Chevron({
  nodeId,
  collapsed,
  hiddenChildCount,
}: {
  nodeId: string;
  collapsed: boolean;
  hiddenChildCount: number;
}) {
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);

  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Stop ReactFlow from selecting the node when the chevron is clicked.
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
        const tree = useDocumentStore.getState().parsedDoc;
        if (!tree) return;
        applyTreeChange(updateNode(tree, nodeId, { collapsed: !collapsed }));
      }}
      className="ml-auto flex items-center gap-1 rounded px-1 py-0.5 text-xs text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-100"
      title={collapsed ? "Expand" : "Collapse"}
      aria-label={collapsed ? "Expand node" : "Collapse node"}
    >
      <span className="font-mono leading-none">{collapsed ? "▸" : "▾"}</span>
      {collapsed && hiddenChildCount > 0 && (
        <span className="tabular-nums text-[10px] text-neutral-700 dark:text-neutral-300">
          {hiddenChildCount}
        </span>
      )}
    </button>
  );
}

function InlineRename({
  initialText,
  nodeId,
  onClose,
}: {
  initialText: string;
  nodeId: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialText);
  const inputRef = useRef<HTMLInputElement>(null);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);

  useEffect(() => {
    // Defensive multi-frame focus: when a brand-new node is created via Tab,
    // the input mounts inside a React Flow wrapper that's still settling
    // (measurement, position transform, internal focus juggling). A single
    // focus() call can fire before the input is eligible or get blown away
    // immediately after. Re-asserting focus across several frames covers all
    // of that without depending on a single timing assumption. Cap at 6
    // frames (~100ms) so we don't fight the user if they intentionally tab
    // away. Stops asserting once focus is on the input.
    let frame = 0;
    const tryFocus = () => {
      const el = inputRef.current;
      if (!el) return;
      if (document.activeElement !== el) {
        el.focus();
        el.select();
      }
      frame++;
      if (frame < 6 && document.activeElement !== el) {
        requestAnimationFrame(tryFocus);
      }
    };
    tryFocus();
    requestAnimationFrame(tryFocus);
  }, []);

  const commit = () => {
    const tree = useDocumentStore.getState().parsedDoc;
    if (tree && value !== initialText) {
      applyTreeChange(updateText(tree, nodeId, value));
    }
    onClose();
  };

  return (
    <input
      ref={inputRef}
      aria-label="Rename node"
      className="w-full rounded border border-neutral-300 bg-white px-1 py-0.5 text-sm text-neutral-900 outline-none focus:border-emerald-500 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-emerald-400"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    />
  );
}

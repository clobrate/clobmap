import { useEffect } from "react";
import { findById, type MindDocument } from "../model";

interface Props {
  nodeId: string;
  x: number;
  y: number;
  tree: MindDocument;
  onClose: () => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDelete: () => void;
  onToggleCollapse: () => void;
  onRename: () => void;
}

export function ContextMenu({
  nodeId,
  x,
  y,
  tree,
  onClose,
  onAddChild,
  onAddSibling,
  onDelete,
  onToggleCollapse,
  onRename,
}: Props) {
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest("[data-context-menu]")) onClose();
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [onClose]);

  const node = findById(tree, nodeId);
  if (!node) return null;
  const isRoot = nodeId === tree.root.id;
  const hasChildren = node.children.length > 0;

  return (
    <div
      data-context-menu
      className="absolute z-50 min-w-[180px] rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm text-neutral-100 shadow-lg"
      style={{ left: x, top: y }}
    >
      <Item label="Rename" shortcut="F2" onClick={onRename} />
      <Item label="Add child" shortcut="Tab" onClick={onAddChild} />
      <Item label="Add sibling" shortcut="Enter" disabled={isRoot} onClick={onAddSibling} />
      <Item
        label={node.collapsed ? "Expand" : "Collapse"}
        shortcut="Space"
        disabled={!hasChildren}
        onClick={onToggleCollapse}
      />
      <div className="my-1 border-t border-neutral-800" />
      <Item label="Delete" shortcut="⌫" disabled={isRoot} danger onClick={onDelete} />
    </div>
  );
}

function Item({
  label,
  shortcut,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const colorClass = disabled
    ? "text-neutral-600"
    : danger
      ? "text-red-300 hover:bg-red-500/10"
      : "text-neutral-100 hover:bg-neutral-800";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left ${colorClass}`}
    >
      <span>{label}</span>
      {shortcut && <span className="text-xs text-neutral-500">{shortcut}</span>}
    </button>
  );
}

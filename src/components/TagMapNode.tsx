import { useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Node } from "@xyflow/react";
import type { TagMapNodeData } from "../lib/tagLayout";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import { OpError, updateTagName } from "../model";

type Props = NodeProps<Node<TagMapNodeData>>;

/**
 * React Flow node renderer for tag-tree entries. Deliberately
 * stripped-down compared to MindMapNode: label only (no chevron, no
 * note indicator, no chip row). Double-click opens an inline rename.
 * The synthetic tag-tree root renders with a slightly different style
 * and isn't user-editable (rename / delete / move are all rejected
 * for it at the model layer).
 */
export function TagMapNode({ id, data, selected }: Props) {
  const { name, isRoot, hasChildren } = data;
  const editingTagId = useUIStore((s) => s.editingTagId);
  const setEditingTag = useUIStore((s) => s.setEditingTag);
  const setSelectedTag = useUIStore((s) => s.setSelectedTag);
  const openTagContextMenu = useUIStore((s) => s.openTagContextMenu);
  const isEditing = editingTagId === id && !isRoot;

  const baseClass = isRoot
    ? "rounded-full border bg-neutral-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-600 shadow-sm dark:bg-neutral-800 dark:text-neutral-300"
    : "rounded-full border bg-white px-2.5 py-0.5 text-xs text-neutral-800 shadow-sm transition hover:border-neutral-400 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-500";

  const borderClass = selected
    ? "border-emerald-500 ring-2 ring-emerald-400/40 dark:border-emerald-400"
    : isRoot
      ? "border-neutral-300 dark:border-neutral-700"
      : "border-neutral-300 dark:border-neutral-700";

  return (
    <div
      className={`${baseClass} ${borderClass}`}
      role="treeitem"
      aria-level={data.depth + 1}
      aria-selected={selected}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isRoot) return; // root has no editable actions
        setSelectedTag(id);
        openTagContextMenu(id, e.clientX, e.clientY);
      }}
      onDoubleClick={(e) => {
        if (isRoot) return;
        e.stopPropagation();
        setEditingTag(id);
      }}
    >
      {!isRoot && (
        <Handle
          id="target-left"
          type="target"
          position={Position.Left}
          className="!h-2 !w-2 !border-0 !bg-neutral-500"
        />
      )}
      {isEditing ? (
        <TagInlineRename initialName={name} tagId={id} onClose={() => setEditingTag(null)} />
      ) : (
        <span className="block min-w-0 whitespace-nowrap">{name}</span>
      )}
      {hasChildren && (
        <Handle
          id="source-right"
          type="source"
          position={Position.Right}
          className="!h-2 !w-2 !border-0 !bg-neutral-500"
        />
      )}
    </div>
  );
}

function TagInlineRename({
  initialName,
  tagId,
  onClose,
}: {
  initialName: string;
  tagId: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const tree = useDocumentStore.getState().parsedDoc;
    if (!tree || value === initialName) {
      onClose();
      return;
    }
    try {
      applyTreeChange(updateTagName(tree, tagId, value));
      onClose();
    } catch (err) {
      if (err instanceof OpError) {
        setError(err.message);
        return;
      }
      throw err;
    }
  };

  return (
    <div className="flex flex-col">
      <input
        ref={inputRef}
        type="text"
        aria-label="Rename tag"
        className="block w-full rounded border border-neutral-300 bg-white px-1 py-0 text-xs text-neutral-900 outline-none focus:border-emerald-500 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-emerald-400"
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
      {error && (
        <span className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}

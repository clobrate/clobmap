import { useEffect, useRef, useState } from "react";
import { findById, type MindDocument } from "../model";

interface Props {
  nodeId: string;
  x: number;
  y: number;
  tree: MindDocument;
  isClipboardActive: boolean;
  onClose: () => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDelete: () => void;
  onToggleCollapse: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onEditNote: (note: string) => void;
  onEditNotes: () => void;
  onSetColor: (color: string | null) => void;
  onCut: () => void;
  onPaste: () => void;
}

export function ContextMenu(props: Props) {
  const {
    nodeId,
    x,
    y,
    tree,
    isClipboardActive,
    onClose,
    onAddChild,
    onAddSibling,
    onDelete,
    onToggleCollapse,
    onRename,
    onDuplicate,
    onEditNote,
    onEditNotes,
    onSetColor,
    onCut,
    onPaste,
  } = props;

  const [editingNote, setEditingNote] = useState(false);

  useEffect(() => {
    if (editingNote) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest("[data-context-menu]")) onClose();
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [onClose, editingNote]);

  const node = findById(tree, nodeId);
  if (!node) return null;
  const isRoot = nodeId === tree.root.id;
  const hasChildren = node.children.length > 0;

  if (editingNote) {
    return (
      <NoteEditor
        x={x}
        y={y}
        initial={node.note ?? ""}
        onCommit={(value) => {
          onEditNote(value);
          setEditingNote(false);
        }}
        onCancel={() => setEditingNote(false)}
      />
    );
  }

  return (
    <div
      data-context-menu
      role="menu"
      className="fixed z-50 min-w-[200px] rounded-md border border-neutral-200 bg-white py-1 text-sm text-neutral-900 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      style={{ left: x, top: y }}
    >
      <Item label="Rename" shortcut="F2" onClick={onRename} />
      <Item label="Edit notes…" shortcut="N" onClick={onEditNotes} />
      <Item label="Edit tooltip…" onClick={() => setEditingNote(true)} />
      <ColorRow current={node.color} onPick={onSetColor} />
      <Divider />
      <Item label="Add child" shortcut="Tab" onClick={onAddChild} />
      <Item label="Add sibling" shortcut="Enter" disabled={isRoot} onClick={onAddSibling} />
      <Item
        label={node.collapsed ? "Expand" : "Collapse"}
        shortcut="Space"
        disabled={!hasChildren}
        onClick={onToggleCollapse}
      />
      <Item label="Duplicate" disabled={isRoot} onClick={onDuplicate} />
      <Divider />
      <Item label="Cut" shortcut="⌘X" disabled={isRoot} onClick={onCut} />
      <Item label="Paste here" shortcut="⌘V" disabled={!isClipboardActive} onClick={onPaste} />
      <Divider />
      <Item label="Delete" shortcut="⌫" disabled={isRoot} danger onClick={onDelete} />
    </div>
  );
}

function NoteEditor({
  x,
  y,
  initial,
  onCommit,
  onCancel,
}: {
  x: number;
  y: number;
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div
      data-context-menu
      className="fixed z-50 w-[280px] rounded-md border border-neutral-200 bg-white p-3 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
      style={{ left: x, top: y }}
    >
      <label className="mb-1 block text-xs uppercase tracking-wider text-neutral-500">Note</label>
      <textarea
        ref={ref}
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onCommit(value);
          }
        }}
        className="w-full rounded border border-neutral-300 bg-white p-2 text-neutral-900 outline-none focus:border-emerald-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
        placeholder="Optional longer description…"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onCommit(value)}
          className="rounded bg-emerald-500/80 px-2 py-1 text-xs text-white hover:bg-emerald-500 dark:text-emerald-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

const PRESET_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7"] as const;

function ColorRow({ current, onPick }: { current?: string; onPick: (c: string | null) => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="mr-1 text-neutral-600 dark:text-neutral-400">Color</span>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          aria-label={`Set color ${c}`}
          aria-pressed={current === c}
          className={`h-4 w-4 rounded-full border ${
            current === c
              ? "border-neutral-900 dark:border-white"
              : "border-neutral-300 dark:border-neutral-700"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <button
        type="button"
        onClick={() => onPick(null)}
        aria-label="Clear color"
        title="Clear color"
        className="ml-1 h-4 w-4 rounded-full border border-neutral-400 bg-transparent text-[10px] leading-none text-neutral-500 hover:text-neutral-900 dark:border-neutral-600 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        ×
      </button>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />;
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
    ? "text-neutral-400 dark:text-neutral-600"
    : danger
      ? "text-red-600 hover:bg-red-500/10 dark:text-red-300"
      : "text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800";
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left ${colorClass}`}
    >
      <span>{label}</span>
      {shortcut && <span className="text-xs text-neutral-500">{shortcut}</span>}
    </button>
  );
}

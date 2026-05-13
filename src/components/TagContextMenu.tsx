import { useEffect } from "react";

/**
 * Right-click menu for tag-tree nodes. Deliberately separate from the
 * data-canvas `ContextMenu` because the surfaces share zero items —
 * tag-nodes don't have notes, color, clipboard cut/paste, or duplicate.
 *
 * Phase C exposes Rename + Delete. The "Show nodes under this tag's
 * hierarchy" action is wired in Phase D.
 */
interface Props {
  tagId: string;
  x: number;
  y: number;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function TagContextMenu({ x, y, onClose, onRename, onDelete }: Props) {
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest("[data-tag-context-menu]")) onClose();
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [onClose]);

  return (
    <div
      data-tag-context-menu
      role="menu"
      className="fixed z-50 min-w-[180px] rounded-md border border-neutral-200 bg-white py-1 text-sm text-neutral-900 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      style={{ left: x, top: y }}
    >
      <Item label="Rename" onClick={onRename} />
      <Divider />
      <Item label="Delete tag" danger onClick={onDelete} />
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-neutral-200 dark:border-neutral-800" />;
}

function Item({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const colorClass = danger
    ? "text-red-600 hover:bg-red-500/10 dark:text-red-300"
    : "text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800";
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center px-3 py-1.5 text-left ${colorClass}`}
    >
      {label}
    </button>
  );
}

import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import {
  addChild,
  addSibling,
  deleteNode,
  idGeneratorForDocument,
  moveNode,
  moveSibling,
  OpError,
  updateText,
} from "../model";
import {
  dropPlan,
  nextPageId,
  prevPageId,
  type DropPosition,
  type PageEntry,
} from "../lib/notelets";
import { strings } from "../i18n/strings";

/**
 * Notelets table-of-contents: the document tree as a flat ARIA tree, one
 * row per page (Root → Subject → Page → Child Page), indented by depth.
 *
 * Navigation: click / `↑` `↓` / `Home` `End` select a row and scroll its
 * page into view. Structural editing (Phase 3), mirroring the mind-map's
 * keyboard (`MindMap.tsx`): `Tab` add child, `Enter` add sibling, `Delete` /
 * `Backspace` remove, `F2` rename (Phase 3 · item 2), `Alt`+`↑`/`↓` reorder.
 * All edits route through `applyTreeChange`, so YAML / Mind-map stay in sync
 * and every change is undoable.
 */
export function NoteletsSidebar({
  pages,
  onNavigate,
}: {
  pages: PageEntry[];
  onNavigate: (id: string) => void;
}) {
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const setSelected = useUIStore((s) => s.setSelected);
  const editingNodeId = useUIStore((s) => s.editingNodeId);
  const setEditing = useUIStore((s) => s.setEditing);
  const treeRef = useRef<HTMLUListElement>(null);

  // Keep keyboard focus on the selected row — but only when the user is
  // already navigating within the tree, so we never steal focus from a click
  // elsewhere or from the page column. Skipped while a row is being renamed,
  // so we don't yank focus out of the rename input.
  useEffect(() => {
    if (editingNodeId) return;
    const tree = treeRef.current;
    if (!tree || !selectedNodeId) return;
    if (!tree.contains(document.activeElement)) return;
    const el = tree.querySelector<HTMLElement>(
      `[data-toc-id="${CSS.escape(selectedNodeId)}"]`,
    );
    el?.focus();
  }, [selectedNodeId, editingNodeId]);

  const activate = (id: string): void => {
    setSelected(id);
    onNavigate(id);
  };

  // ── Structural ops (all via applyTreeChange → undo + YAML sync) ──────────

  const addChildTo = (id: string): void => {
    if (!parsedDoc) return;
    const ids = idGeneratorForDocument(parsedDoc);
    const { doc, newId } = addChild(parsedDoc, id, "New", ids);
    applyTreeChange(doc);
    setSelected(newId);
    setEditing(newId); // land in rename mode (input arrives in item 2)
  };

  const addSiblingTo = (id: string): void => {
    if (!parsedDoc) return;
    try {
      const ids = idGeneratorForDocument(parsedDoc);
      const { doc, newId } = addSibling(parsedDoc, id, "New", ids);
      applyTreeChange(doc);
      setSelected(newId);
      setEditing(newId);
    } catch (err) {
      if (!(err instanceof OpError)) throw err; // root has no sibling → ignore
    }
  };

  const deleteSelected = (id: string): void => {
    if (!parsedDoc || id === parsedDoc.root.id) return;
    // Select the row above (or below) so focus lands somewhere sensible.
    const idx = pages.findIndex((p) => p.node.id === id);
    const neighbor = pages[idx - 1]?.node.id ?? pages[idx + 1]?.node.id ?? null;
    try {
      applyTreeChange(deleteNode(parsedDoc, id));
      setSelected(neighbor);
    } catch (err) {
      if (!(err instanceof OpError)) throw err;
    }
  };

  const reorder = (id: string, direction: "up" | "down"): void => {
    if (!parsedDoc || id === parsedDoc.root.id) return;
    try {
      const next = moveSibling(parsedDoc, id, direction);
      if (next !== parsedDoc) applyTreeChange(next); // stays selected (same id)
    } catch (err) {
      if (!(err instanceof OpError)) throw err;
    }
  };

  // ── Drag to reorder / re-parent (HTML5 DnD; keyboard reorder is the a11y
  //    alternative) ─────────────────────────────────────────────────────────
  const draggedRef = useRef<string | null>(null);
  const [dropInfo, setDropInfo] = useState<{ id: string; position: DropPosition } | null>(null);

  const positionFor = (e: React.DragEvent): DropPosition => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const third = rect.height / 3;
    return y < third ? "before" : y > 2 * third ? "after" : "onto";
  };

  const onRowDrop = (e: React.DragEvent, targetId: string): void => {
    e.preventDefault();
    const dragged = draggedRef.current;
    const position = positionFor(e);
    draggedRef.current = null;
    setDropInfo(null);
    if (!dragged || !parsedDoc || dragged === targetId) return;
    const plan = dropPlan(parsedDoc.root, dragged, targetId, position);
    if (!plan) return;
    try {
      applyTreeChange(moveNode(parsedDoc, dragged, plan.parentId, plan.index));
      setSelected(dragged);
    } catch (err) {
      if (!(err instanceof OpError)) throw err; // self/descendant → no-op
    }
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    // Let Cmd/Ctrl combos (undo/redo — handled at the Notelets container level
    // on `window` — plus new-tab, save, …) bubble; don't run structural keys
    // while a modifier is held.
    if (e.metaKey || e.ctrlKey) return;
    const current = selectedNodeId;
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        if (e.altKey) {
          if (current) reorder(current, "down");
          break;
        }
        const target = current ? nextPageId(pages, current) : pages[0]?.node.id;
        if (target) activate(target);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        if (e.altKey) {
          if (current) reorder(current, "up");
          break;
        }
        const target = current ? prevPageId(pages, current) : pages[0]?.node.id;
        if (target) activate(target);
        break;
      }
      case "Home": {
        e.preventDefault();
        const first = pages[0]?.node.id;
        if (first) activate(first);
        break;
      }
      case "End": {
        e.preventDefault();
        const last = pages[pages.length - 1]?.node.id;
        if (last) activate(last);
        break;
      }
      case "Tab": {
        // Plain Tab adds a child; Shift+Tab falls through so focus can leave
        // the tree (a11y escape hatch).
        if (e.shiftKey || !current) break;
        e.preventDefault();
        addChildTo(current);
        break;
      }
      case "Enter": {
        if (!current) break;
        e.preventDefault();
        addSiblingTo(current);
        break;
      }
      case "F2": {
        if (!current) break;
        e.preventDefault();
        setEditing(current);
        break;
      }
      case "Delete":
      case "Backspace": {
        if (!current) break;
        e.preventDefault();
        deleteSelected(current);
        break;
      }
    }
  };

  return (
    <ul
      ref={treeRef}
      role="tree"
      aria-label={strings.notelets.tableOfContents}
      className="text-sm"
      onKeyDown={onKeyDown}
    >
      {pages.map(({ node, depth }, i) => {
        const active = node.id === selectedNodeId;
        const isEditingRow = editingNodeId === node.id;
        const isRoot = node.id === parsedDoc?.root.id;
        // Roving tabindex: the selected row is tabbable; if nothing is
        // selected yet, the first row is the entry point.
        const tabbable = active || (!selectedNodeId && i === 0);
        // Drop indicator: a line above/below for sibling drops, a ring for a
        // child drop.
        const drop = dropInfo?.id === node.id ? dropInfo.position : null;
        const dropCls =
          drop === "onto"
            ? " ring-2 ring-inset ring-blue-400"
            : drop === "before"
              ? " border-t-2 border-blue-500"
              : drop === "after"
                ? " border-b-2 border-blue-500"
                : "";
        return (
          <li key={node.id} role="none">
            <div
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={active}
              data-toc-id={node.id}
              tabIndex={tabbable ? 0 : -1}
              draggable={!isRoot && !isEditingRow}
              onClick={() => activate(node.id)}
              onDoubleClick={() => setEditing(node.id)}
              onDragStart={(e) => {
                draggedRef.current = node.id;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", node.id);
              }}
              onDragOver={(e) => {
                if (!draggedRef.current || draggedRef.current === node.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropInfo({ id: node.id, position: positionFor(e) });
              }}
              onDrop={(e) => onRowDrop(e, node.id)}
              onDragEnd={() => {
                draggedRef.current = null;
                setDropInfo(null);
              }}
              style={{ paddingLeft: `${depth * 12 + 12}px` }}
              className={
                "cursor-pointer truncate py-1 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 " +
                (active
                  ? "bg-neutral-200 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200") +
                dropCls
              }
            >
              {editingNodeId === node.id ? (
                <RenameInput
                  nodeId={node.id}
                  initial={node.text}
                  onDone={() => setEditing(null)}
                />
              ) : (
                node.text || " "
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Inline rename for a sidebar row. Commit rules match the mind-map's rename
 * (`MindMapNode.tsx`): commit on Enter / blur, but only if the value changed
 * (empty is allowed); cancel on Esc. `stopPropagation` on keydown so the
 * tree's structural keys (Tab / Enter / Delete) don't fire while renaming.
 */
function RenameInput({
  nodeId,
  initial,
  onDone,
}: {
  nodeId: string;
  initial: string;
  onDone: () => void;
}) {
  const applyTreeChange = useDocumentStore((s) => s.applyTreeChange);
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const commit = (): void => {
    const tree = useDocumentStore.getState().parsedDoc;
    if (tree && value !== initial) applyTreeChange(updateText(tree, nodeId, value));
    onDone();
  };

  return (
    <input
      ref={ref}
      aria-label="Rename node"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onDone();
        }
      }}
      className="w-full rounded border border-neutral-300 bg-white px-1 py-0 text-sm text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-600 dark:bg-neutral-950 dark:text-neutral-100"
    />
  );
}

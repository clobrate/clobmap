import { useEffect, useRef } from "react";
import { useUIStore } from "../store/ui";
import { nextPageId, prevPageId, type PageEntry } from "../lib/notelets";
import { strings } from "../i18n/strings";

/**
 * Notelets table-of-contents: the document tree as a flat ARIA tree, one
 * row per page (Root → Subject → Page → Child Page), indented by depth.
 * Read-only navigation only — selecting a row highlights it, syncs the
 * shared `selectedNodeId`, and scrolls its page into view. Structural editing
 * (Tab / Enter / rename / drag) lands in Phase 3.
 */
export function NoteletsSidebar({
  pages,
  onNavigate,
}: {
  pages: PageEntry[];
  onNavigate: (id: string) => void;
}) {
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const setSelected = useUIStore((s) => s.setSelected);
  const treeRef = useRef<HTMLUListElement>(null);

  // Keep keyboard focus on the selected row — but only when the user is
  // already navigating within the tree, so we never steal focus from a click
  // elsewhere or from the page column.
  useEffect(() => {
    const tree = treeRef.current;
    if (!tree || !selectedNodeId) return;
    if (!tree.contains(document.activeElement)) return;
    const el = tree.querySelector<HTMLElement>(
      `[data-toc-id="${CSS.escape(selectedNodeId)}"]`,
    );
    el?.focus();
  }, [selectedNodeId]);

  const activate = (id: string): void => {
    setSelected(id);
    onNavigate(id);
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const current = selectedNodeId;
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const target = current ? nextPageId(pages, current) : pages[0]?.node.id;
        if (target) activate(target);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
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
      case "Enter":
      case " ": {
        if (current) {
          e.preventDefault();
          onNavigate(current);
        }
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
        // Roving tabindex: the selected row is tabbable; if nothing is
        // selected yet, the first row is the entry point.
        const tabbable = active || (!selectedNodeId && i === 0);
        return (
          <li key={node.id} role="none">
            <div
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={active}
              data-toc-id={node.id}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => activate(node.id)}
              style={{ paddingLeft: `${depth * 12 + 12}px` }}
              className={
                "cursor-pointer truncate py-1 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 " +
                (active
                  ? "bg-neutral-200 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-200")
              }
            >
              {node.text || " "}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

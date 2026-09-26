import { useEffect, useState, type MouseEvent } from "react";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import { loadNotes, type LoadedNotes } from "../lib/notes";
import { useMarkdownHtml } from "../lib/useMarkdownHtml";
import { NoteletsPageEditor } from "./NoteletsPageEditor";
import { strings } from "../i18n/strings";
import type { PageEntry } from "../lib/notelets";

/**
 * One Notelets page: a node's title as a heading and its notes as markdown.
 * Notes load through the shared `loadNotes` reader (inline vs sidecar stays
 * invisible) and render via the shared `useMarkdownHtml`. Clicking an editable
 * body enters edit mode — a CodeMirror editor mounts in place (NoteletsPageEditor)
 * and saves on blur / Esc. Read-only notes (web/iOS sidecar) show a banner and
 * are not editable. Note-less nodes render as a heading with a "click to add
 * notes" affordance (uniform treatment, product §6.4).
 */
export function NoteletsPage({
  page,
  isEditing = false,
  onEdit,
  onExitEdit,
}: {
  page: PageEntry;
  isEditing?: boolean;
  onEdit?: () => void;
  onExitEdit?: () => void;
}) {
  const { node, depth } = page;
  const docPath = useDocumentStore((s) => s.currentFilePath);
  const setSelected = useUIStore((s) => s.setSelected);
  const [loaded, setLoaded] = useState<LoadedNotes | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadNotes(node.notes, docPath).then((r) => {
      if (!cancelled) setLoaded(r);
    });
    return () => {
      cancelled = true;
    };
  }, [node.notes, docPath]);

  const { html, onLinkClick } = useMarkdownHtml(loaded?.content ?? "");
  const hasNotes = (loaded?.content ?? "").trim().length > 0;
  const readOnly = loaded?.readOnly ?? false;
  const editable = !readOnly;

  const beginEdit = (): void => {
    if (!editable) return;
    setSelected(node.id);
    onEdit?.();
  };

  // A click on the rendered body either follows a link (external, no edit) or
  // enters edit mode.
  const onBodyClick = (e: MouseEvent<HTMLElement>): void => {
    const anchor = (e.target as HTMLElement | null)?.closest("a");
    if (anchor) {
      onLinkClick(e);
      return;
    }
    beginEdit();
  };

  return (
    <section
      data-page-id={node.id}
      className="scroll-mt-4 border-b border-neutral-100 py-4 last:border-0 dark:border-neutral-800/60"
    >
      <h2
        className="font-semibold text-neutral-900 dark:text-neutral-100"
        style={{ fontSize: `${Math.max(15, 22 - depth)}px` }}
      >
        {node.text}
      </h2>

      {loaded?.message && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          {loaded.message}
        </div>
      )}

      {isEditing && editable ? (
        <NoteletsPageEditor
          nodeId={node.id}
          title={node.text}
          onExit={() => onExitEdit?.()}
        />
      ) : hasNotes ? (
        <div
          onClick={onBodyClick}
          className={
            "clobmap-md mt-2 text-sm text-neutral-700 dark:text-neutral-300" +
            (editable ? " cursor-text" : "")
          }
          /* micromark output is CommonMark; raw HTML is escaped (markdown-only). */
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : editable ? (
        <button
          type="button"
          onClick={beginEdit}
          className="mt-2 block text-left text-sm text-neutral-400 italic hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          {strings.notelets.addNotes}
        </button>
      ) : null}
    </section>
  );
}

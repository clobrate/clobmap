import { useEffect, useState } from "react";
import { useDocumentStore } from "../store/document";
import { loadNotes, type LoadedNotes } from "../lib/notes";
import { useMarkdownHtml } from "../lib/useMarkdownHtml";
import type { PageEntry } from "../lib/notelets";

/**
 * One Notelets page: a node's title as a heading and its notes rendered as
 * markdown. Read-only in Phase 1 — notes are loaded through the shared
 * `loadNotes` reader (so inline vs sidecar stays invisible) and rendered via
 * the shared `useMarkdownHtml`. In-page editing arrives in Phase 2. Note-less
 * nodes render as a heading with no body (uniform treatment, product §6.4).
 */
export function NoteletsPage({ page }: { page: PageEntry }) {
  const { node, depth } = page;
  const docPath = useDocumentStore((s) => s.currentFilePath);
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

      {hasNotes && (
        <div
          onClick={onLinkClick}
          className="clobmap-md mt-2 text-sm text-neutral-700 dark:text-neutral-300"
          /* micromark output is CommonMark; raw HTML is escaped (markdown-only,
             read-only). Editing lands in Phase 2. */
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </section>
  );
}

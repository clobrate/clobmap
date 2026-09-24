import { useCallback, useMemo, useRef } from "react";
import { useDocumentStore } from "../store/document";
import { flattenPages, type PageEntry } from "../lib/notelets";
import { NoteletsSidebar } from "./NoteletsSidebar";
import { strings } from "../i18n/strings";

/**
 * Notelets — the notebook view (notes-as-pages with a tree sidebar). This
 * container owns the two-pane layout, the flattened page list, and the
 * click-to-scroll wiring. The sidebar (NoteletsSidebar) is real as of work
 * item 2; page bodies are still minimal stubs until NoteletsPage brings
 * markdown rendering in work item 3. See
 * docs/notelets/notelets-phase1-implementation-plan.md.
 */
export function Notelets() {
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll a page into view within the notebook column. Click-to-scroll is a
  // container concern; scroll-spy (the reverse direction) arrives in item 4.
  const scrollToPage = useCallback((id: string): void => {
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  const pages = useMemo(
    () => (parsedDoc ? flattenPages(parsedDoc.root) : []),
    [parsedDoc],
  );

  if (!parsedDoc || pages.length === 0) {
    return <NoteletsEmptyState />;
  }

  return (
    <div className="flex h-full min-h-0">
      <aside
        aria-label={strings.notelets.tableOfContents}
        className="w-64 shrink-0 overflow-auto border-r border-neutral-200 bg-neutral-50 py-2 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <NoteletsSidebar pages={pages} onNavigate={scrollToPage} />
      </aside>
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {pages.map((p) => (
            <PageStub key={p.node.id} page={p} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NoteletsEmptyState() {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">
      {strings.notelets.empty}
    </div>
  );
}

/**
 * TEMPORARY page — heading + raw notes text. Replaced by NoteletsPage
 * (shared loadNotes + useMarkdownHtml rendering, message banner, sidecar
 * handling) in work item 3.
 */
function PageStub({ page }: { page: PageEntry }) {
  const { node, depth } = page;
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
      {node.notes ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-400">
          {node.notes}
        </p>
      ) : null}
    </section>
  );
}

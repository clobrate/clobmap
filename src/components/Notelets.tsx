import { useCallback, useEffect, useMemo, useRef } from "react";
import { useDocumentStore } from "../store/document";
import { useUIStore } from "../store/ui";
import { flattenPages, pickActivePageId } from "../lib/notelets";
import { NoteletsSidebar } from "./NoteletsSidebar";
import { NoteletsPage } from "./NoteletsPage";
import { strings } from "../i18n/strings";

/**
 * Notelets — the notebook view (notes-as-pages with a tree sidebar). This
 * container owns the two-pane layout, the flattened page list, and the
 * two-way selection ↔ scroll sync: clicking the sidebar scrolls a page into
 * view (click-to-scroll), and scrolling the column selects the page at the
 * top (scroll-spy). NoteletsSidebar renders the table of contents and
 * NoteletsPage renders each page.
 * See docs/notelets/notelets-phase1-implementation-plan.md.
 */
export function Notelets() {
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);
  const setSelected = useUIStore((s) => s.setSelected);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Suppress scroll-spy while WE are the ones scrolling (click / keyboard /
  // enter-view), so smooth-scroll passing over intermediate pages doesn't
  // flicker the selection.
  const programmaticRef = useRef(false);
  const programmaticTimer = useRef<number | null>(null);
  const didInitialScroll = useRef(false);

  const pages = useMemo(
    () => (parsedDoc ? flattenPages(parsedDoc.root) : []),
    [parsedDoc],
  );

  const scrollToPage = useCallback((id: string): void => {
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(id)}"]`);
    if (!el) return;
    programmaticRef.current = true;
    if (programmaticTimer.current !== null) window.clearTimeout(programmaticTimer.current);
    programmaticTimer.current = window.setTimeout(() => {
      programmaticRef.current = false;
    }, 600);
    el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  // Scroll-spy: observe page elements against a thin trigger band at the top
  // of the column; the page occupying it becomes the selected node. Re-runs
  // when the page set changes (doc edits).
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || pages.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.pageId;
          if (!id) continue;
          if (e.isIntersecting) {
            visible.set(id, e.boundingClientRect.top - (e.rootBounds?.top ?? 0));
          } else {
            visible.delete(id);
          }
        }
        if (programmaticRef.current) return;
        const active = pickActivePageId(
          [...visible].map(([id, top]) => ({ id, top })),
        );
        if (active && active !== useUIStore.getState().selectedNodeId) {
          setSelected(active);
        }
      },
      // Trigger band = the top ~20% of the column.
      { root: container, rootMargin: "0px 0px -80% 0px", threshold: 0 },
    );
    container.querySelectorAll("[data-page-id]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages, setSelected]);

  // Enter-view sync: on first mount with a node already selected (e.g. picked
  // in the mind-map), scroll to its page once.
  useEffect(() => {
    if (didInitialScroll.current || pages.length === 0) return;
    const sel = useUIStore.getState().selectedNodeId;
    if (sel && pages.some((p) => p.node.id === sel)) {
      didInitialScroll.current = true;
      scrollToPage(sel);
    }
  }, [pages, scrollToPage]);

  if (!parsedDoc || pages.length === 0) {
    return <NoteletsEmptyState />;
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ToC sidebar is hidden on phones (narrow screens read the pages full-
          width); a mobile page-picker/drawer is deferred to Phase 4. */}
      <aside
        aria-label={strings.notelets.tableOfContents}
        className="hidden w-64 shrink-0 overflow-auto border-r border-neutral-200 bg-neutral-50 py-2 sm:block dark:border-neutral-800 dark:bg-neutral-900"
      >
        <NoteletsSidebar pages={pages} onNavigate={scrollToPage} />
      </aside>
      <div
        ref={scrollRef}
        aria-label={strings.notelets.pages}
        className="min-w-0 flex-1 overflow-auto"
      >
        <div className="mx-auto max-w-3xl px-6 py-6">
          {pages.map((p) => (
            <NoteletsPage key={p.node.id} page={p} />
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

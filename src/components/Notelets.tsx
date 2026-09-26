import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDocumentStore } from "../store/document";
import { useUIStore, type NoteletsMode } from "../store/ui";
import {
  flattenPages,
  nextPageId,
  pickActivePageId,
  prevPageId,
  subjectsOf,
  type PageEntry,
} from "../lib/notelets";
import { saveNoteletsModePref } from "../lib/settings";
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
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const setSelected = useUIStore((s) => s.setSelected);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const noteletsMode = useUIStore((s) => s.noteletsMode);
  const setNoteletsMode = useUIStore((s) => s.setNoteletsMode);
  const announce = useUIStore((s) => s.announce);
  const scrollRef = useRef<HTMLDivElement>(null);

  const changeMode = useCallback(
    (m: NoteletsMode): void => {
      setNoteletsMode(m);
      void saveNoteletsModePref(m);
    },
    [setNoteletsMode],
  );

  // Undo / redo for the whole Notelets view. The mind-map binds these on
  // `window`, but it isn't mounted here — so we own them while Notelets is up.
  // Skipped when a text editor owns focus (the CodeMirror page editor or the
  // sidebar rename input), so their native Cmd+Z keeps undoing text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      const ae = document.activeElement;
      if (
        ae instanceof HTMLElement &&
        (ae.closest(".cm-editor") || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")
      ) {
        return;
      }
      e.preventDefault();
      if (k === "y" || e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
  // Suppress scroll-spy while WE are the ones scrolling (click / keyboard /
  // enter-view), so smooth-scroll passing over intermediate pages doesn't
  // flicker the selection.
  const programmaticRef = useRef(false);
  const programmaticTimer = useRef<number | null>(null);
  const didInitialScroll = useRef(false);

  // Which page is currently in edit mode (one at a time).
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  // Mobile ToC drawer (the sidebar is hidden inline below `sm`).
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Esc closes the mobile drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const pages = useMemo(
    () => (parsedDoc ? flattenPages(parsedDoc.root) : []),
    [parsedDoc],
  );

  // Derived so a page that disappears (deleted / doc replaced) can't stay
  // "editing" — no effect / setState needed.
  const activeEditingId =
    editingPageId !== null && pages.some((p) => p.node.id === editingPageId)
      ? editingPageId
      : null;

  // Ref mirror so the scroll-spy callback (set up once) reads the latest value.
  const editingRef = useRef<string | null>(null);
  useEffect(() => {
    editingRef.current = activeEditingId;
  }, [activeEditingId]);

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

  // In page mode, the current page follows the shared selection (single source
  // of truth — paging and sidebar clicks both go through setSelected), falling
  // back to the first page.
  const currentPage = useMemo<PageEntry | undefined>(
    () => pages.find((p) => p.node.id === selectedNodeId) ?? pages[0],
    [pages, selectedNodeId],
  );

  // Navigate to a page (paging or sidebar): select it + announce its title.
  const goToPage = useCallback(
    (id: string): void => {
      const p = pages.find((x) => x.node.id === id);
      if (!p) return;
      setSelected(id);
      announce(p.node.text || strings.notelets.untitledPage);
    },
    [pages, setSelected, announce],
  );

  // Scroll-spy: observe page elements against a thin trigger band at the top
  // of the column; the page occupying it becomes the selected node. Re-runs
  // when the page set changes (doc edits). Scroll mode only.
  useEffect(() => {
    if (noteletsMode !== "scroll") return;
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
        // Don't let scroll-spy yank the selection while a page is being
        // edited, or during our own programmatic scrolls.
        if (programmaticRef.current || editingRef.current !== null) return;
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
  }, [pages, setSelected, noteletsMode]);

  // Enter-view sync: on first mount with a node already selected (e.g. picked
  // in the mind-map), scroll to its page once. Scroll mode only.
  useEffect(() => {
    if (noteletsMode !== "scroll" || didInitialScroll.current || pages.length === 0) return;
    const sel = useUIStore.getState().selectedNodeId;
    if (sel && pages.some((p) => p.node.id === sel)) {
      didInitialScroll.current = true;
      scrollToPage(sel);
    }
  }, [pages, scrollToPage, noteletsMode]);

  // Page mode: ←/→ page prev/next. Window-level (no focusable pane needed) but
  // inert while a page is being edited or a text field / editor owns focus, so
  // the arrows keep moving the caret there.
  useEffect(() => {
    if (noteletsMode !== "page") return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (editingRef.current !== null) return;
      const ae = document.activeElement;
      if (
        ae instanceof HTMLElement &&
        (ae.closest(".cm-editor") || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")
      ) {
        return;
      }
      const sel = useUIStore.getState().selectedNodeId;
      const curId = pages.some((p) => p.node.id === sel) ? sel! : pages[0]?.node.id;
      if (!curId) return;
      const target = e.key === "ArrowLeft" ? prevPageId(pages, curId) : nextPageId(pages, curId);
      if (target) {
        e.preventDefault();
        goToPage(target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [noteletsMode, pages, goToPage]);

  if (!parsedDoc || pages.length === 0) {
    return <NoteletsEmptyState />;
  }

  const renderPage = (p: PageEntry) => (
    <NoteletsPage
      key={p.node.id}
      page={p}
      isEditing={p.node.id === activeEditingId}
      onEdit={() => setEditingPageId(p.node.id)}
      // Only clear if THIS page is still the one editing. When the user clicks
      // straight from page A to page B, A's blur-exit resolves after B's onEdit
      // has already set editingPageId = B; without this guard that late exit
      // would wipe B's editor.
      onExitEdit={() => setEditingPageId((cur) => (cur === p.node.id ? null : cur))}
    />
  );

  // Subject tabs: the root's children. The active tab is the subject the
  // current page lives under (root page → Overview).
  const subjects = subjectsOf(parsedDoc.root);
  const activeSubjectId = currentPage?.subjectId ?? null;
  const onSubjectSelect = (id: string): void => {
    goToPage(id); // select + announce
    if (noteletsMode === "scroll") scrollToPage(id);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Inline ToC sidebar (desktop). On phones it's hidden here and opened as
          a drawer via the toolbar ☰ button (see the drawer below `sm`). */}
      <aside
        aria-label={strings.notelets.tableOfContents}
        className="hidden w-64 shrink-0 overflow-auto border-r border-neutral-200 bg-neutral-50 py-2 sm:block dark:border-neutral-800 dark:bg-neutral-900"
      >
        <NoteletsSidebar pages={pages} onNavigate={scrollToPage} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-1.5 dark:border-neutral-800">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label={strings.notelets.openToc}
              onClick={() => setDrawerOpen(true)}
              className="shrink-0 rounded px-1.5 py-0.5 text-neutral-600 hover:bg-neutral-100 sm:hidden dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              ☰
            </button>
            <SubjectTabs
              rootId={parsedDoc.root.id}
              subjects={subjects}
              activeSubjectId={activeSubjectId}
              onSelect={onSubjectSelect}
            />
          </div>
          <ModeToggle mode={noteletsMode} onChange={changeMode} />
        </div>
        {noteletsMode === "scroll" ? (
          <div
            ref={scrollRef}
            aria-label={strings.notelets.pages}
            className="min-w-0 flex-1 overflow-auto"
          >
            <div className="mx-auto max-w-3xl px-6 py-6">{pages.map(renderPage)}</div>
          </div>
        ) : (
          (() => {
            const currentId = currentPage?.node.id ?? "";
            const currentIdx = pages.findIndex((p) => p.node.id === currentId);
            const prevId = prevPageId(pages, currentId);
            const nextId = nextPageId(pages, currentId);
            return (
              <>
                <div aria-label={strings.notelets.pages} className="min-w-0 flex-1 overflow-auto">
                  <div className="mx-auto max-w-3xl px-6 py-6">
                    {currentPage && renderPage(currentPage)}
                  </div>
                </div>
                <PageNav
                  position={`${currentIdx + 1} / ${pages.length}`}
                  onPrev={prevId ? () => goToPage(prevId) : undefined}
                  onNext={nextId ? () => goToPage(nextId) : undefined}
                />
              </>
            );
          })()
        )}
      </div>

      {/* Mobile ToC drawer (only rendered below `sm`). */}
      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={strings.notelets.tableOfContents}
          className="fixed inset-0 z-40 sm:hidden"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[80%] overflow-auto bg-neutral-50 py-2 shadow-xl dark:bg-neutral-900"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
            // Tapping a row navigates (its own onClick) then closes the drawer.
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('[role="treeitem"]')) {
                setDrawerOpen(false);
              }
            }}
          >
            <NoteletsSidebar pages={pages} onNavigate={scrollToPage} />
          </div>
        </div>
      )}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: NoteletsMode;
  onChange: (m: NoteletsMode) => void;
}) {
  const opts: ReadonlyArray<{ value: NoteletsMode; label: string }> = [
    { value: "scroll", label: strings.notelets.modeScroll },
    { value: "page", label: strings.notelets.modePage },
  ];
  return (
    <div
      role="tablist"
      aria-label={strings.notelets.readingMode}
      className="flex items-center gap-0.5 rounded-md bg-neutral-200 p-0.5 text-xs dark:bg-neutral-800"
    >
      {opts.map(({ value, label }) => {
        const active = mode === value;
        return (
          <button
            key={value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(value)}
            className={
              active
                ? "rounded bg-white px-2.5 py-1 text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50"
                : "rounded px-2.5 py-1 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SubjectTabs({
  rootId,
  subjects,
  activeSubjectId,
  onSelect,
}: {
  rootId: string;
  subjects: ReadonlyArray<{ id: string; text: string }>;
  activeSubjectId: string | null;
  onSelect: (id: string) => void;
}) {
  const cls = (active: boolean) =>
    "max-w-[10rem] shrink-0 truncate rounded px-2 py-0.5 " +
    (active
      ? "bg-neutral-200 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60");
  return (
    <div
      role="tablist"
      aria-label={strings.notelets.subjects}
      className="flex min-w-0 items-center gap-1 overflow-x-auto text-xs"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeSubjectId === null}
        onClick={() => onSelect(rootId)}
        className={cls(activeSubjectId === null)}
      >
        {strings.notelets.overview}
      </button>
      {subjects.map((s) => {
        const active = activeSubjectId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(s.id)}
            className={cls(active)}
          >
            {s.text || strings.notelets.untitledPage}
          </button>
        );
      })}
    </div>
  );
}

function PageNav({
  position,
  onPrev,
  onNext,
}: {
  position: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const btn =
    "rounded border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800";
  return (
    <div className="flex shrink-0 items-center justify-between border-t border-neutral-200 px-4 py-2 dark:border-neutral-800">
      <button type="button" onClick={onPrev} disabled={!onPrev} aria-label={strings.notelets.prevPage} className={btn}>
        ‹ {strings.notelets.prev}
      </button>
      <span className="text-xs tabular-nums text-neutral-500">{position}</span>
      <button type="button" onClick={onNext} disabled={!onNext} aria-label={strings.notelets.nextPage} className={btn}>
        {strings.notelets.next} ›
      </button>
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

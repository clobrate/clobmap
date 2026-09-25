# Notelets — Phase 2 Implementation Plan (In-page editing)

Status: **Ready to build** — depends on Phases 0 & 1 (complete). Branch `feature/notelets`.
Author: Kiran (planned with Claude)
Last updated: 2026-09-24
Parent: [`notelets-implementation-detailed-plan.md`](./notelets-implementation-detailed-plan.md) §6 Phase 2. Prior: [`notelets-phase1-implementation-plan.md`](./notelets-phase1-implementation-plan.md). Product: [`notelets-product-doc.md`](./notelets-product-doc.md) §6.7.

---

## Goal

Make the notebook **writable**: edit a page's Markdown directly in its body, in place, without leaving Notelets or opening the popup. After this phase Notelets is a full read **+ write** surface.

Everything else about a page stays as Phase 1 shipped it — this phase only adds the edit affordance and wires it to the shared notes-IO path.

## What Phases 0 & 1 already give us (reuse, don't rebuild)

- **`useNodeNotes(nodeId)`** (`src/lib/useNodeNotes.ts`) — the write path: `{ content, setContent, save, saving, isDirty, readOnly, overLimit, loaded, error, autoSavedAt }`. Load, 1s debounced auto-save, inline↔sidecar extraction, over-limit and read-only rules — **all of it**. This is the entire IO story; Phase 2 is mostly a UI shell around it.
- **`NoteletsPage`** — already loads (read-only via `loadNotes`) and renders Markdown via `useMarkdownHtml`. We add an edit mode alongside the render.
- **Selection state** — `selectedNodeId` / `setSelected` (shared across views).
- **The popup precedent** — `NotesPopup` is the reference for textarea + auto-save + status ergonomics; `useNodeNotes` was extracted from it, so behavior parity is essentially free.

## Scope decisions (please confirm the two flagged ⚠️)

1. **One editor at a time (lazy-mount).** A page renders read-only Markdown by default; clicking its body mounts an editor **for that page only**. Editing 100 pages must not mount 100 editors/hooks. Edit state lives in the container as `editingPageId` (a single id); a page is editable iff `editingPageId === node.id`. This keeps `useNodeNotes` (with its per-node load + auto-save) mounted for exactly the page being edited, and preserves Phase 1's light read path (`loadNotes`) for all the others.

2. **Editor widget: CodeMirror (DECIDED — 2026-09-24).** Per product §6.7, page editing uses **CodeMirror**, reusing `YamlEditor.tsx`'s mount pattern (imperative `EditorState`/`EditorView`, theme + font `Compartment`s, `oneDark` in dark mode, `EditorView.lineWrapping`, an `updateListener` for `onChange`). The only new language is **Markdown**, which needs a dependency:
   ```
   npm install @codemirror/lang-markdown
   ```
   Because a CodeMirror instance is heavier than a textarea, the **lazy single-editor** rule (decision 1) matters more, not less — only the page being edited mounts an `EditorView`. `useNodeNotes` was originally extracted around the popup's textarea, but it's editor-agnostic: it exposes `content` / `setContent`, which the CodeMirror `onChange` drives and the initial doc seeds from. No change to `useNodeNotes` itself.

3. **Enter-edit interaction: click-to-edit (DECIDED — 2026-09-24).** Click the page body → it becomes a CodeMirror editor; blur or `Esc` → save & render. A note-less page shows a muted "Click to add notes" affordance so it, too, is click-to-edit.

4. **Exit must flush.** Auto-save is a 1s debounce inside `useNodeNotes`; its timer is cleared on unmount. So exiting edit mode **must `await save()` before unmounting the editor**, or a sub-1s final edit is lost. This is the single most important correctness detail in the phase.

5. **Read-only pages stay read-only.** Web/iOS sidecar path-refs (`loaded.readOnly`) show the Phase-1 banner and are **not** clickable-to-edit. Desktop reads/writes the sidecar file normally.

## Definition of done

- Clicking a page's body (desktop/web, editable notes) turns it into a Markdown editor seeded with the current notes.
- Typing edits the note; it auto-saves (~1s) and the change is reflected in YAML / Mind-map (via `applyTreeChange`).
- Blur or `Esc` saves immediately and returns the page to rendered Markdown.
- A note-less page can be clicked to start writing (empty editor).
- Over-limit (web/iOS >800 chars) shows the same indicator as the popup and does not silently drop content; desktop auto-extracts to a sidecar past the threshold.
- Read-only (sidecar on web/iOS) pages can't be edited and show the banner.
- Only one page is ever in edit mode.
- `npm test`, `npm run typecheck`, `npm run lint` green; new e2e in `notelets.spec.ts` green; existing popup + Notelets tests unchanged.

---

## Work item 1 — `NoteletsPageEditor.tsx` (CodeMirror editor bound to `useNodeNotes`)

New component, mounted only for the page being edited. Mirrors `YamlEditor.tsx`'s imperative CodeMirror wiring (`src/components/YamlEditor.tsx:49-163`), minus the YAML linter/gutter/line-numbers, plus Markdown.

**Extensions** (reuse from YamlEditor, swap the language):
- `history()`, `keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab])`
- `markdown()` from `@codemirror/lang-markdown` (in place of `yaml()`)
- `EditorView.lineWrapping`
- theme `Compartment` → `oneDark` when `resolvedTheme === "dark"`, `[]` otherwise
- font `Compartment` → `buildBaseTheme(fontSize)` (lift/share the helper)
- `updateListener` → `setContent(doc.toString())` on `docChanged`
- an `EditorView.domEventHandlers({ keydown, blur })` for `Esc` and blur → `exit()`

```tsx
export function NoteletsPageEditor({ nodeId, title, onExit }: {
  nodeId: string; title: string; onExit: () => void;
}) {
  const { content, setContent, save, hasLoaded, saving, isDirty, overLimit, error } =
    useNodeNotes(nodeId);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());

  // Save-then-exit. Await flush FIRST — the 1s auto-save debounce is cleared
  // on unmount, so this is the only thing preventing lost sub-second edits.
  const exit = useCallback(async () => { await save(); onExit(); }, [save, onExit]);
  const exitRef = useRef(exit); useEffect(() => { exitRef.current = exit; }, [exit]);

  // Mount CM once, but only after notes have loaded so the doc is seeded with
  // the real content (not the pre-load empty string).
  useEffect(() => {
    if (!hasLoaded || !containerRef.current) return;
    const dark = useUIStore.getState().resolvedTheme === "dark";
    const state = EditorState.create({
      doc: useNodeNotesContentSnapshot(),  // = current `content` at mount
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown(),
        EditorView.lineWrapping,
        themeCompartment.current.of(dark ? [oneDark] : []),
        EditorView.updateListener.of((u) => { if (u.docChanged) setContent(u.state.doc.toString()); }),
        EditorView.domEventHandlers({
          keydown: (e) => { if (e.key === "Escape") { e.preventDefault(); void exitRef.current(); return true; } return false; },
          blur:   () => { void exitRef.current(); return false; },
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view; view.focus();
    return () => { view.destroy(); viewRef.current = null; };
  }, [hasLoaded, setContent]);

  return (
    <div className="mt-2">
      <div ref={containerRef} aria-label={`Notes for ${title}`} className="clobmap-md-editor ..." />
      {/* char counter + over-limit warning (web/iOS) + saving / dirty / "Saved
          automatically" status — same wording as NotesPopup's footer */}
    </div>
  );
}
```
- **Controlled-sync caveat:** like `YamlEditor` mirrors `yamlText` in, add a small effect that pushes `content` into the view only when it differs (`view.state.doc.toString() !== content`) — needed for the initial post-load seed and any external change; the loop is broken by the equality check (user keystrokes already match).
- Reuses **every** IO rule from `useNodeNotes`; the component is just a bound `EditorView` + status line.
- No `close()` — `onExit` only clears the container's `editingPageId`.
- Theme effect: reconfigure `themeCompartment` on `resolvedTheme` change (copy from YamlEditor).

## Work item 2 — `NoteletsPage` edit-mode wiring

- Add a prop pair: `isEditing: boolean` and `onEdit: () => void` / `onExitEdit: () => void` (or pass `editingPageId` + setters).
- When **not** editing: render Markdown (Phase 1 path) **plus** an affordance — the body is clickable (cursor-text, subtle hover), and an empty page shows a muted "Click to add notes" placeholder so note-less pages are writable.
- When editing: render `<NoteletsPageEditor nodeId={node.id} onExit={onExitEdit} />` in place of the rendered body.
- Clicking the body (when editable) calls `setSelected(node.id)` + `onEdit()`.
- Gate on read-only: if `loaded.readOnly`, body is not clickable; show the banner only.

## Work item 3 — Container coordination (`Notelets.tsx`)

- Add `const [editingPageId, setEditingPageId] = useState<string | null>(null)`.
- Pass `isEditing={p.node.id === editingPageId}`, `onEdit={() => setEditingPageId(p.node.id)}`, `onExitEdit={() => setEditingPageId(null)}` to each `NoteletsPage`.
- **Scroll-spy interaction:** while `editingPageId !== null`, suppress scroll-spy `setSelected` (editing shouldn't be yanked by spy) — extend the existing `programmaticRef` guard concept, or simply skip spy when editing.
- **Keyboard entry (optional, nice):** `Enter` on a selected sidebar row could enter edit on that page; keep minimal — clicking is the primary path.

## Work item 4 — Edge cases

| Case | Behavior |
|---|---|
| Note-less page | Click → empty editor; typing + exit creates the note (`updateNode` sets `notes`), sidebar/YAML update |
| Over-limit (web/iOS) | Same indicator as popup; auto-save skipped past 800 chars; content not dropped |
| Sidecar overflow (desktop) | `useNodeNotes` → `saveNotes` auto-extracts to `./…md`; invisible to the user |
| Read-only (web/iOS sidecar) | Not editable; banner shown |
| Popup open on same node while editing in Notelets | Both write via `applyTreeChange`; last write wins — acceptable, note it |
| Node deleted while editing | Editor's `useNodeNotes` guards on missing node (`save()` returns false); container clears `editingPageId` |
| Exit with unsaved sub-1s edit | `await save()` on exit flushes it |

## Work item 5 — Polish & integration

- **Status line** per editor: "Saving…" / "Saved automatically" / "Unsaved changes" / over-limit — reuse the popup's wording (ideally lift a tiny shared status helper).
- **Theming:** the textarea + `.clobmap-md` render must both read well in light/dark.
- **Mobile:** editing works in the single-column layout (sidebar hidden).
- **a11y:** editor has an accessible label ("Notes for <title>"); `Esc` exits; focus returns sensibly to the page/sidebar on exit.
- **i18n:** new copy ("Click to add notes", status strings) via `src/i18n/strings.ts`.
- **Dirty/title:** edits flow through `applyTreeChange`, so the window-title dirty dot + draft persistence + disk auto-save already work.

## Test plan

| Level | What | Where |
|---|---|---|
| unit | `NoteletsPageEditor`: binds content, edits call `setContent`, exit calls `save` then `onExit`, read-only/over-limit gating | `src/components/__tests__/NoteletsPageEditor.test.tsx` (new, jsdom, mock `useNodeNotes` or `loadNotes`/`saveNotes`) |
| unit | `NoteletsPage`: not-editing renders Markdown; editing renders the editor; read-only not clickable | extend `NoteletsPage.test.tsx` |
| unit | container: one-editor-at-a-time (`editingPageId`) | extend `Notelets.test.tsx` |
| e2e | Click a page → type → blur → YAML reflects the new note | `e2e/tests/notelets.spec.ts` |
| e2e | Note-less page → click → type → page now renders the Markdown | new |
| e2e | `Esc` exits and saves | new |
| e2e | Over-limit indicator on the web build (>800 chars) | new |
| e2e | Read-only sidecar page is not editable | new |

> e2e runs against the built bundle — `npm run build:web` before `npm run e2e`. Keep scroll-spy-independent assertions deterministic. New pure logic (if any) goes in `src/lib` with unit tests; components stay out of the coverage scope but get behavioral tests like `ViewToggle`/`NoteletsSidebar`.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Lost edits when unmounting before the 1s auto-save | `await save()` on every exit path (blur, Esc, delete) — Work item 1's `exit()` |
| Mounting many editors on big docs | Lazy single-editor via `editingPageId`; only one `useNodeNotes` live |
| Scroll-spy yanks selection mid-edit | Suppress spy while `editingPageId !== null` |
| Divergence from the popup's IO behavior | Both go through `useNodeNotes`; don't fork the logic |
| Editing feels "modal" / janky on click | Tune enter/exit (focus, cursor, hover hint); consider a subtle animation, but keep it thin |
| CM `blur` fires when clicking the editor's own UI (future panels) or during layout shifts, exiting unexpectedly | Only wire `blur` → exit; no search/panels in this editor. If a stray exit shows up, guard on `relatedTarget` |
| CM controlled-sync loop (updateListener ↔ mirror effect) | Equality check before dispatching (`doc.toString() !== content`), exactly as `YamlEditor` does for `yamlText` |
| CM doc seeded before notes load (empty flash) | Gate mount on `hasLoaded`; seed doc with loaded `content` |
| New dependency `@codemirror/lang-markdown` | Small, first-party CodeMirror package; already using the CM6 stack (`@codemirror/*` + `codemirror`) |

## Suggested commits

0. `chore: add @codemirror/lang-markdown`
1. `feat(notelets): NoteletsPageEditor — CodeMirror (Markdown) bound to useNodeNotes (auto-save + exit-flush)`
2. `feat(notelets): click-to-edit page bodies; one editor at a time`
3. `feat(notelets): editable empty pages, over-limit + read-only gating, status line`
4. `test(notelets): unit + e2e for in-page editing`

Each commit should leave the suite green.

## Explicitly deferred (later phases)

- Sidebar **restructuring** (`Tab`/`Enter`/rename/drag/delete) → Phase 3.
- **One-page mode**, **Subject tabs**, keyboard **paging**, full mobile layout → Phase 4.
- **Virtualization**, print/export-from-Notelets → Phase 5.
- Optional CM niceties (fenced-code language highlighting via `markdown({ codeLanguages })`, a Markdown-aware keymap for bold/italic) — later, if wanted.

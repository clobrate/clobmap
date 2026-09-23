# Notelets — Product Document

Status: **Proposed** — product definition for the Notelets view. Not yet implemented. Work happens on the `feature/notelets` branch.
Author: Kiran (designed with Claude)
Last updated: 2026-09-22
Source: distilled from `conversation.md` (repo root) — the original brainstorm that motivated this feature.

---

## 1. Summary

**Notelets** is a new, third first-class view of a clobmap document — sitting alongside **YAML**, **Split**, and **Mind-map**. Where the mind-map treats the tree structure as the content and hides the prose behind an `N` popup, Notelets **inverts that relationship**: the tree becomes navigation and the per-node markdown **notes become the content**, rendered as a readable, editable document — much like a physical five-subject notebook with a section/page structure and a table-of-contents sidebar.

It is a **new view of the same data**, not a new kind of data. No changes to the document model are required for the core feature.

## 2. Motivation

clobmap's thesis is **"one file, several first-class views."** The mind-map is great for outlining and spatial thinking, but today the long-form writing — often the most valuable part of a map — is second-class:

- Notes live in a popup opened with `N`, so prose is hidden behind the structure.
- There is no "sit down and write / read the whole thing" surface.

Notelets covers a real workflow the other views don't: **outline in the mind-map, then write in the notebook** — the whiteboard-to-document transition. It also sharpens clobmap's AI story: an LLM can generate an outline with a notes paragraph per node, and clobmap opens it as a readable, editable notebook — a stronger demo than a mind-map alone.

## 3. Goals & non-goals

### 3.1 Goals
- Promote notes from a hidden popup to a **primary, document-style reading/writing surface**.
- Provide a **tree sidebar** that acts as both navigation (table of contents) and a lightweight **structural editor**.
- Express the **five-subject-notebook metaphor** meaningfully (subjects + recursively-nested pages, every level a page), not just cosmetically.
- Reuse existing rendering/serialization so the feature stays thin.
- Strengthen the "one file, several views" positioning and the AI-generated-outline demo.

### 3.2 In scope: faithful markdown (the guiding principle)
**If standard markdown supports it, Notelets renders it.** Notelets is a markdown surface, so anything in the markdown spec our renderer already handles is in scope — including:
- **Images and media** via standard markdown syntax (`![alt](path)`), local or remote.
- Links, headings, lists, code blocks, blockquotes, and (per the renderer) GFM extensions like tables, task lists, and strikethrough.

Refusing standard markdown wouldn't make Notelets "thin" — it would make it a broken markdown renderer. Faithful rendering of the note's own markdown is a requirement, not a feature to gate.

### 3.3 Non-goals (explicit guardrails)
Notelets must stay **thin**. The following are out of scope, and their appearance is the signal to stop:
- Backlinks / wiki-links between nodes.
- Databases, tables-as-data, or query views.
- **Non-standard embeds / transclusion** — wiki-style `![[other-note]]` transclusion, block/app embeds, or live third-party app/iframe widgets (the kind popular note-taking apps offer). These are *not* markdown; they pull in other nodes or external apps and are the actual drift risk. (This is distinct from §3.2's standard markdown media, which **is** supported.)
- Literal page-turn animations / skeuomorphic effects.
- A rich-text WYSIWYG editor beyond markdown.

clobmap's edge is **"it's one plain YAML file, and the map, the outline, and the notebook are all the same thing."** The moment Notelets needs any of the non-goals above, it has drifted into the territory of popular note-taking apps, where clobmap will not win on editor features.

**Raw HTML — shown as code, not rendered (decided):** Notelets supports markdown only. Raw HTML in a note (`<iframe>`, `<video>`, etc.) is **not rendered** — it is displayed literally as a code block. This sidesteps the passthrough security questions of a local-first plain-file tool. Standard markdown image/media syntax (§3.2) is unaffected and remains fully supported. (See §10.)

## 4. Target users & scenarios

| # | Persona | Scenario | What it implies |
|---|---------|----------|-----------------|
| 1 | The outliner-writer | Sketch structure in mind-map, switch to Notelets to write prose per node | Fast view toggle; notes editable inline in the page body |
| 2 | The reader | Read a whole map top-to-bottom as a document | Continuous-scroll mode; clean typographic rendering of markdown |
| 3 | The reorganizer | Restructure while writing, without leaving Notelets | Sidebar tree supports the same `Tab`/`Enter`/drag ops as the canvas |
| 4 | The AI user | Ask an LLM to generate an outline+notes, open it as a notebook | Every node renders as a page uniformly; note-less nodes are simply empty pages (§6.4) |

## 5. Concept & metaphor mapping

**Everything is a page.** Every node in the tree is a page that can carry its own markdown notes — the root, each subject, and every page and child page below. The hierarchy names *levels*, not different kinds of thing, and depth is **unlimited**: child pages nest recursively, exactly like the node tree in the YAML / mind-map views.

| Notebook concept | clobmap structure | Can hold notes? |
|---|---|---|
| **Root page** | The root node | Yes |
| **Subject** (the "five subjects") | Top-level children of the root | Yes |
| **Page** | Children of a subject | Yes |
| **Child page** (recursive, **infinite depth**) | Any deeper descendant | Yes |
| Page order | **Depth-first traversal** of the tree | — |
| Table of contents | The **sidebar tree** | — |

So the full nesting is **Root → Subject → Page → Child Page → …** with no depth limit, and *any* level can have notes. This makes the metaphor structural rather than decorative: the shape of the map *is* the shape of the notebook.

> **Terminology note:** top-level children of the root are called **"Subjects"** (matching the five-subject-notebook metaphor). The doc uses "Subject" consistently rather than "Section."

## 6. Functional requirements

### 6.1 Layout
- **Left sidebar:** the document tree, acting as table of contents + navigation. Selecting a node scrolls/opens its page.
- **Main area:** the page(s), rendering each node's markdown notes with its title as the page/section heading.

### 6.2 Reading modes
- **Continuous scroll** — the whole document as one flowing set of pages (this is essentially what the existing "All notes (Markdown)" export already produces, so much of the rendering logic exists).
- **One page at a time** — focus on a single node's page. (Both modes required; continuous scroll is the natural default.)
- **Keyboard paging** — in one-page mode, next/prev-page navigation via keyboard is supported.

### 6.3 Sidebar as a real editor
The sidebar tree should support the **same structural operations as the canvas**, so users never leave Notelets to restructure:
- `Tab` — add child
- `Enter` — add sibling / commit rename
- **Drag** — re-parent / reorder (reuse existing `moveNode` semantics)
- Rename in place

### 6.4 Empty / note-less nodes
**All nodes are treated uniformly.** A node with no notes simply renders as a page with a heading (its title) and an empty body — an **empty page is acceptable** and expected. Notelets does not special-case note-less nodes into headings-only or divider pages; every node gets the same page treatment whether or not it carries prose. Empty pages are fine and require no dedicated handling.

### 6.5 Notes storage is invisible here (sidecar unchanged)
clobmap supports both **inline notes** and **sidecar markdown files** (used for large notes). This storage mechanism **continues exactly as-is — Notelets requires no changes to it.** In Notelets the distinction must be **invisible**: the notebook looks, reads, and edits identically whether a node's markdown lives inline in the YAML or in a sidecar `.md` file. Notelets is a rendering/editing lens over whatever the existing notes layer already resolves; it neither introduces a new storage format nor alters the sidecar behavior.

### 6.6 View integration
- Notelets appears as a **view toggle** next to YAML, Split, and Mind-map.
- **Selection sync is supported:** switching views maps the selected node ↔ the current page, in both directions.

### 6.7 Editing model
Page bodies are edited as **plain markdown**, reusing the same editor stack as the current YAML view (CodeMirror). No rich-text / WYSIWYG layer — this keeps Notelets thin and consistent with the rest of clobmap.

## 7. Design principles

1. **Thin by default.** Markdown editing, sidebar tree, section/page structure — nothing more (see §3.3). Faithful markdown rendering (§3.2) is part of "thin," not a violation of it.
2. **Same data, different lens.** No new document-model concepts for the core feature.
3. **Reuse over rebuild.** Lean on the existing markdown rendering (All-notes export), notes model, and `moveNode`/tree-op semantics.
4. **Metaphor with meaning.** Sections and pages must map to real structure, not be cosmetic chrome.
5. **No skeuomorphism.** Skip page-turn effects and physical-notebook gimmicks.

## 8. Positioning & competitive risk

Notelets places clobmap adjacent to **popular note-taking apps**. clobmap **will not win on editor features** and should not try. The defensible edge is the single-plain-YAML-file model where map, outline, and notebook are the same artifact. Keeping Notelets thin (§3.3) is what preserves that edge.

## 9. Success criteria

- Notelets ships as a fourth view toggle and becomes the **lead demo** when the project is posted publicly.
- A user can outline in the mind-map and write/read in Notelets without switching tools.
- An AI-generated outline-with-notes opens as a clean, readable notebook; nodes with prose show it, and note-less nodes are simply empty pages (uniform treatment).
- No net-new document-model complexity introduced for the core feature.

## 10. Resolved decisions

These were open questions, now decided; the answers are folded into the sections above.

1. **Editing model** — plain markdown editing, reusing the current YAML view's editor stack (CodeMirror). Stays thin, no WYSIWYG. (§6.7)
2. **Section granularity — infinite depth.** Everything is a page. The hierarchy **Root → Subject → Page → Child Page** nests recursively with no depth limit, mirroring the YAML/mind-map node tree, and **every level can carry notes** (root, subject, page, child page). (§5)
3. **One-page navigation** — supported: keyboard next/prev paging in one-page mode. (§6.2)
4. **Selection sync** — supported, both directions (Notelets page ↔ mind-map / YAML cursor). (§6.6)
5. **Raw HTML / iframe** — not rendered; Notelets supports markdown only, so raw HTML is shown as a code block. (§3.3)
6. **Naming** — view label **"Notelets"** (final). Hierarchy terms: **Root → Subject → Page → Child Page**, where page / child-page recurse infinitely.

## 11. Suggested phasing (non-binding)

1. **Read-only Notelets** — sidebar tree + continuous-scroll rendering of notes (reuses All-notes export rendering). Lowest risk, proves the concept.
2. **In-page editing** — edit markdown notes directly in the page body.
3. **Sidebar as editor** — `Tab`/`Enter`/drag structural ops in the sidebar.
4. **One-page mode + section tabs** — the full five-subject metaphor and paging.

---

*This document is the product-level definition for Notelets. A separate implementation/design doc (data flow, components, view-switching wiring, reuse of `model/ops.ts` and the notes model) will follow in `docs/notelets/`.*

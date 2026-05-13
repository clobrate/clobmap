import type { MindDocument } from "../model";

/**
 * Does the document have any user-visible tags? `true` when `tagRoot`
 * is materialized AND has at least one child. The synthetic tag-tree
 * root by itself doesn't count — the pane should stay hidden when no
 * actual tags exist (see §5.1 of `tagging-design-doc.md`).
 *
 * Lives in its own module (not next to the components) so component
 * files only export React components — keeps Vite's fast-refresh
 * boundary clean (`react-refresh/only-export-components`).
 */
export function hasAnyTag(doc: MindDocument | null): boolean {
  return !!doc?.tagRoot && doc.tagRoot.children.length > 0;
}

export interface MindNode {
  id: string;
  text: string;
  children: MindNode[];
  color?: string;
  collapsed?: boolean;
  /** Per-node override of the default max-width in pixels. */
  maxWidth?: number;
  /** Per-node override of the default max-height in pixels. */
  maxHeight?: number;
  /**
   * Long-form Markdown notes. May be inline content (typically <800 chars)
   * or a path reference to a sidecar `.md` file (starts with ./, ../, /,
   * ~/, or is a single-line `*.md` filename). Resolved at read/write time
   * by `src/lib/notes.ts`.
   */
  notes?: string;
  /**
   * Manual position in canvas coordinates. Only meaningful when the
   * document's `layoutMode` is "manual"; ignored (and stripped on save)
   * in auto mode.
   */
  position?: { x: number; y: number };
  /**
   * Side of the PARENT where the edge to this node originates. Each
   * child has its own value, so a parent with N children can route each
   * outgoing edge from a different side. Only meaningful for non-root
   * nodes. Default: "right".
   */
  edgeFrom?: HandleSide;
  /**
   * Side of THIS node where the incoming edge arrives. Only meaningful
   * for non-root nodes. Default: "left".
   */
  edgeTo?: HandleSide;
  /**
   * Free-form labels attached to this data-node. Order is preserved
   * verbatim on YAML round-trip. Empty array is treated identically to
   * `undefined` (serialize drops the key — same rule as the other
   * optional string fields above). Matching against the tag tree is
   * case-insensitive; the stored casing is whatever the user typed.
   */
  tags?: string[];
}

/**
 * Node in the *tag* tree. Parallel to MindNode but carries only a
 * display label — tag-nodes never have notes, positions, or any of
 * the other data-node fields. Lives under `MindDocument.tagRoot`.
 *
 * Tag identity for matching against `MindNode.tags` is by `name`
 * (case-insensitive). The `id` exists so the tree can be edited
 * (rename, move) without disturbing data-node references.
 */
export interface TagNode {
  id: string;
  name: string;
  children: TagNode[];
}

export type HandleSide = "top" | "right" | "bottom" | "left";

export type LayoutMode = "auto" | "manual";

export interface MindDocument {
  title: string;
  root: MindNode;
  version?: number;
  /**
   * "auto" runs the tidy-tree algorithm on every parse (default).
   * "manual" honors per-node `position` fields verbatim, falling back
   * to a small offset from the parent for newly-added nodes.
   */
  layoutMode?: LayoutMode;
  /**
   * Root of the tag tree. Absent until the first tag is added — the
   * first `tagsAdd` lazily materializes it. Once present, removing
   * every tag-node does NOT auto-remove tagRoot; the empty container
   * stays until the user clears it manually. The root carries no
   * semantics other than being the holder so generic tree ops
   * (mapTree / moveNode) can re-parent any user-visible tag.
   */
  tagRoot?: TagNode;
}

export type Result<T, E = ParseError> = { ok: true; value: T } | { ok: false; error: E };

export interface ParseError {
  message: string;
  line: number;
  col: number;
}

export const SCHEMA_VERSION = 2;

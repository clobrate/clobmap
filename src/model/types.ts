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
}

export type Result<T, E = ParseError> = { ok: true; value: T } | { ok: false; error: E };

export interface ParseError {
  message: string;
  line: number;
  col: number;
}

export const SCHEMA_VERSION = 1;

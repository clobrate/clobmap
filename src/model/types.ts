export interface MindNode {
  id: string;
  text: string;
  children: MindNode[];
  /** Short tooltip shown on hover. */
  note?: string;
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
}

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

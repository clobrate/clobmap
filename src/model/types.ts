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
}

export interface MindDocument {
  title: string;
  root: MindNode;
  version?: number;
}

export type Result<T, E = ParseError> = { ok: true; value: T } | { ok: false; error: E };

export interface ParseError {
  message: string;
  line: number;
  col: number;
}

export const SCHEMA_VERSION = 1;

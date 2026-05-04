export interface MindNode {
  id: string;
  text: string;
  children: MindNode[];
  note?: string;
  color?: string;
  collapsed?: boolean;
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

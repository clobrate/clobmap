/**
 * Node addressing (§11.2): resolve a user-supplied reference to a node `id`.
 * - An exact **id** wins.
 * - Otherwise a **title** (exact `text`) — errors if more than one node matches.
 * - A `A › B › C` **path** walks titles from the root (the root's own title may
 *   optionally lead the path).
 *
 * Ids are canonical; title/path are conveniences. Titles are not unique, so we
 * error on ambiguity rather than guess.
 */
import type { MindDocument, MindNode } from "../../src/model/types";
import { findById } from "../../src/model";

const PATH_SEP = "›";

function walk(node: MindNode, fn: (n: MindNode) => void): void {
  fn(node);
  for (const child of node.children) walk(child, fn);
}

/** Resolve `ref` (id | title | `A › B › C` path) to a node id, or throw. */
export function resolveNodeId(doc: MindDocument, ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error("Empty node reference.");

  // 1. Exact id.
  if (findById(doc, trimmed)) return trimmed;

  // 2. Path (contains the separator).
  if (trimmed.includes(PATH_SEP)) return resolvePath(doc, trimmed);

  // 3. Title (exact text), unique-or-error.
  const ids: string[] = [];
  walk(doc.root, (n) => {
    if (n.text === trimmed) ids.push(n.id);
  });
  if (ids.length === 1) return ids[0]!;
  if (ids.length > 1) {
    throw new Error(
      `Ambiguous title "${trimmed}" — ${ids.length} nodes match. Use an id or a "A ${PATH_SEP} B" path.`,
    );
  }
  throw new Error(`Node not found: "${trimmed}".`);
}

function resolvePath(doc: MindDocument, ref: string): string {
  const parts = ref
    .split(PATH_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error(`Empty path: "${ref}".`);

  let cur: MindNode = doc.root;
  // The path may optionally start with the root's own title.
  const start = parts[0] === doc.root.text ? 1 : 0;
  for (let i = start; i < parts.length; i += 1) {
    const seg = parts[i]!;
    const matches = cur.children.filter((c) => c.text === seg);
    if (matches.length === 0) {
      throw new Error(`Path segment "${seg}" not found under "${cur.text}".`);
    }
    if (matches.length > 1) {
      throw new Error(`Ambiguous path segment "${seg}" under "${cur.text}".`);
    }
    cur = matches[0]!;
  }
  return cur.id;
}

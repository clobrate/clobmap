/**
 * Read-side helpers: the "export all notes" markdown (byte-identical to the
 * app's `exportActions.exportAllNotes`) and a small node query.
 *
 * `demoteHeadings` is copied from `exportActions.ts` rather than imported —
 * that module pulls in React Flow + the app stores, which don't exist in a
 * headless Node process. The logic is pure string manipulation; the copy is
 * kept faithful (see the app for the canonical version).
 */
import type { MindDocument, MindNode } from "../../src/model/types";
import { readNote } from "./notes-fs";

/**
 * Demote ATX headings inside a notes body by one level so they sit beneath the
 * `# Title (id)` heading the exporter wraps each note in. Skips fenced code
 * blocks so `#` comments in code stay put. (Mirror of exportActions.ts.)
 */
export function demoteHeadings(body: string): string {
  const lines = body.split("\n");
  let inFence = false;
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = line.match(/^\s*(```|~~~)/);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (!inFence) {
        inFence = true;
        fence = marker;
      } else if (fence === marker) {
        inFence = false;
        fence = null;
      }
      continue;
    }
    if (inFence) continue;
    const heading = line.match(/^(\s*)(#{1,6})(\s)/);
    if (heading) {
      lines[i] = `${heading[1]}#${heading[2]}${line.slice(heading[0].length - 1)}`;
    }
  }
  return lines.join("\n");
}

function preorder(tree: MindDocument): MindNode[] {
  const ordered: MindNode[] = [];
  const visit = (n: MindNode): void => {
    ordered.push(n);
    for (const c of n.children) visit(c);
  };
  visit(tree.root);
  return ordered;
}

/**
 * Build the "export all notes" markdown for a document. Per node (pre-order):
 * `# <text> (<id>)` + `tags:` + `color:` (when set) + the demoted note body.
 * Byte-identical to the app so exports match regardless of which surface ran.
 */
export async function exportNotes(tree: MindDocument, docPath: string): Promise<string> {
  const sections: string[] = [];
  for (const node of preorder(tree)) {
    let body = "";
    if (node.notes) {
      body = demoteHeadings((await readNote(tree, node.id, docPath)).trim());
    }
    if (!body) body = "__ no notes found __";
    const tagsLine = `tags: ${node.tags && node.tags.length > 0 ? node.tags.join(", ") : "<none>"}`;
    const colorLine = node.color ? `\ncolor: ${node.color}` : "";
    sections.push(`# ${node.text} (${node.id})\n\n${tagsLine}${colorLine}\n\n${body}\n`);
  }
  return sections.join("\n");
}

export interface FindMatch {
  id: string;
  text: string;
}

/**
 * Find nodes matching any provided filter (AND across the given filters):
 * `text` substring (case-insensitive), exact `tag`, exact `color`.
 */
export function findNodes(
  tree: MindDocument,
  filters: { text?: string; tag?: string; color?: string },
): FindMatch[] {
  const q = filters.text?.toLowerCase();
  const tag = filters.tag?.toLowerCase();
  const color = filters.color?.toLowerCase();
  const out: FindMatch[] = [];
  const visit = (n: MindNode): void => {
    const textOk = q === undefined || n.text.toLowerCase().includes(q);
    const tagOk = tag === undefined || (n.tags ?? []).some((t) => t.toLowerCase() === tag);
    const colorOk = color === undefined || (n.color ?? "").toLowerCase() === color;
    if (textOk && tagOk && colorOk) out.push({ id: n.id, text: n.text });
    for (const c of n.children) visit(c);
  };
  visit(tree.root);
  return out;
}

import type { MindNode } from "../model";

/**
 * One page in the Notelets view. Every node is a page (Root → Subject →
 * Page → Child Page, recursively — see docs/notelets/). `depth` is the
 * distance from the root (root = 0). `subjectId` is the id of the top-level
 * "Subject" (a direct child of the root) this page lives under, or `null`
 * for the root page itself.
 */
export interface PageEntry {
  node: MindNode;
  depth: number;
  subjectId: string | null;
}

/**
 * Flatten the document tree into depth-first (pre-order) page order — the
 * same traversal the "All notes" export uses, so scroll order matches. Root
 * is first (depth 0, no subject); each of its children is a Subject; deeper
 * descendants inherit their Subject's id. Depth is unbounded.
 */
export function flattenPages(root: MindNode): PageEntry[] {
  const out: PageEntry[] = [];
  const visit = (node: MindNode, depth: number, subjectId: string | null): void => {
    out.push({ node, depth, subjectId });
    for (const child of node.children) {
      // A direct child of the root (depth 0 → child depth 1) IS a subject,
      // so it becomes the subject id for itself and its whole subtree.
      const childSubjectId = depth === 0 ? child.id : subjectId;
      visit(child, depth + 1, childSubjectId);
    }
  };
  visit(root, 0, null);
  return out;
}

/**
 * The Subjects of a document — the root's direct children. Returns a shallow
 * copy so callers can't mutate the tree by accident.
 */
export function subjectsOf(root: MindNode): MindNode[] {
  return [...root.children];
}

/**
 * Id of the page after `currentId` in depth-first order, or `null` if
 * `currentId` is the last page or isn't present.
 */
export function nextPageId(pages: PageEntry[], currentId: string): string | null {
  const i = pages.findIndex((p) => p.node.id === currentId);
  if (i < 0 || i + 1 >= pages.length) return null;
  return pages[i + 1]!.node.id;
}

/**
 * Id of the page before `currentId` in depth-first order, or `null` if
 * `currentId` is the first page or isn't present.
 */
export function prevPageId(pages: PageEntry[], currentId: string): string | null {
  const i = pages.findIndex((p) => p.node.id === currentId);
  if (i <= 0) return null;
  return pages[i - 1]!.node.id;
}

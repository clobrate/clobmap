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

/** A page currently intersecting the viewport, with its top offset (px)
 *  relative to the scroll viewport's top edge. */
export interface VisiblePage {
  id: string;
  top: number;
}

/**
 * Scroll-spy: given the pages currently visible in the notebook column and
 * each one's top offset relative to the viewport top, decide which page is
 * "active" (the one occupying the top of the viewport). That's the last page
 * whose top has reached or passed the threshold line; if none has yet (we're
 * scrolled above the first page's top), the topmost visible page. Pure so the
 * selection logic is unit-testable without a real IntersectionObserver.
 */
export function pickActivePageId(visible: VisiblePage[], threshold = 1): string | null {
  if (visible.length === 0) return null;
  const sorted = [...visible].sort((a, b) => a.top - b.top);
  let active: string | null = null;
  for (const v of sorted) {
    if (v.top <= threshold) active = v.id;
  }
  return active ?? sorted[0]!.id;
}

export type DropPosition = "before" | "after" | "onto";

/** `{ parent, index }` of a node, or null for the root (which has none). */
function parentInfo(root: MindNode, id: string): { parent: MindNode; index: number } | null {
  for (let i = 0; i < root.children.length; i += 1) {
    const child = root.children[i]!;
    if (child.id === id) return { parent: root, index: i };
    const found = parentInfo(child, id);
    if (found) return found;
  }
  return null;
}

/**
 * Translate a sidebar drop (drag `draggedId` onto `targetId` at `position`)
 * into `moveNode` arguments. `onto` → become the target's (last) child;
 * `before`/`after` → become a sibling at that slot. Returns the `index` in the
 * target parent's children AFTER the dragged node is removed (moveNode's
 * contract) — so same-parent reorders account for the index shift. Returns
 * null for no-op / invalid drops (onto self, before/after the root). moveNode
 * still guards the self/descendant cycle case, so the caller can just try it.
 */
export function dropPlan(
  root: MindNode,
  draggedId: string,
  targetId: string,
  position: DropPosition,
): { parentId: string; index?: number } | null {
  if (draggedId === targetId) return null;
  if (position === "onto") return { parentId: targetId };

  const target = parentInfo(root, targetId);
  if (!target) return null; // target is the root — it has no siblings

  const dragged = parentInfo(root, draggedId);
  const sameParent = dragged?.parent.id === target.parent.id;
  // Where the target sits once the dragged node is pulled out of the parent.
  const adjustedTargetIdx =
    sameParent && dragged!.index < target.index ? target.index - 1 : target.index;
  const index = position === "before" ? adjustedTargetIdx : adjustedTargetIdx + 1;
  return { parentId: target.parent.id, index };
}

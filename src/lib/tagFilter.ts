import type { MindDocument, MindNode, TagNode } from "../model";

/**
 * One node in the hierarchy-filter render tree. This is a derived,
 * render-only shape — not persisted, not modeled. Each entry knows
 * what kind it is and (for data entries) which underlying MindNode it
 * mirrors so callers can drill back when the user clicks.
 */
export type FilterNode =
  | {
      kind: "tag";
      /** Stable id used as the React Flow node id. Equals the
       *  underlying TagNode.id for the selected tag and its
       *  descendants. */
      id: string;
      name: string;
      children: FilterNode[];
    }
  | {
      kind: "untagged";
      /** Synthetic id; never collides with any real tag-node id. */
      id: string;
      children: FilterNode[];
    }
  | {
      kind: "data";
      /** A scoped id of the form `<parentTagId>::<dataNodeId>` so the
       *  same data-node can appear under multiple tag-nodes without
       *  React Flow seeing duplicate ids. */
      id: string;
      /** The original MindNode.id this entry mirrors. */
      underlyingId: string;
      text: string;
    };

export const UNTAGGED_ID = "filter:untagged";
export const UNTAGGED_LABEL = "Untagged";

function normalizeTagKey(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Collect every data-node carrying any of the given tag names (case-
 * insensitive). Returns them in document order — a depth-first walk
 * of the data tree. Each data-node appears at most once per
 * invocation (a node tagged with both "alpha" and "beta" shows up
 * once when filtering by either).
 */
function collectDataNodesForTag(
  rootData: MindNode,
  tagKey: string,
): MindNode[] {
  const out: MindNode[] = [];
  function walk(n: MindNode): void {
    if (n.tags && n.tags.some((t) => normalizeTagKey(t) === tagKey)) {
      out.push(n);
    }
    for (const c of n.children) walk(c);
  }
  walk(rootData);
  return out;
}

/**
 * Every data-node with no tags at all (empty array or absent field).
 * Used to populate the "Untagged" pseudo bucket.
 */
function collectUntaggedDataNodes(rootData: MindNode): MindNode[] {
  const out: MindNode[] = [];
  function walk(n: MindNode): void {
    if (!n.tags || n.tags.length === 0) out.push(n);
    for (const c of n.children) walk(c);
  }
  walk(rootData);
  return out;
}

function dataChildrenFor(parentTagId: string, dataNodes: MindNode[]): FilterNode[] {
  return dataNodes.map((d) => ({
    kind: "data" as const,
    id: `${parentTagId}::${d.id}`,
    underlyingId: d.id,
    text: d.text,
  }));
}

function findTagSubtree(root: TagNode, id: string): TagNode | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const found = findTagSubtree(c, id);
    if (found) return found;
  }
  return null;
}

/**
 * Build the render-only filter tree rooted at the selected tag-node.
 *
 * Shape:
 *   selectedTag (FilterNode kind=tag)
 *     ├── descendantTag-1 (kind=tag)
 *     │     ├── data-node A (kind=data, prefixed id)
 *     │     └── ...
 *     ├── descendantTag-2
 *     │     └── ...
 *     ├── (data-nodes directly tagged with selectedTag — appended first)
 *     └── Untagged (kind=untagged, sibling, only if there are untagged
 *         data-nodes)
 *
 * Returns `null` if the tag-node isn't found or the doc has no tag tree.
 */
export function buildFilterTree(
  doc: MindDocument,
  filterTagId: string,
): FilterNode | null {
  if (!doc.tagRoot) return null;
  const selected = findTagSubtree(doc.tagRoot, filterTagId);
  if (!selected) return null;
  // The synthetic tag-tree root has no semantics, but if the user
  // chose it as the filter root (edge case), treat it as "the whole
  // tag tree" — still works downstream.
  const isSyntheticRoot = doc.tagRoot.id === filterTagId;
  const rootNode = buildTagFilterNode(selected, doc.root);
  // Append the Untagged bucket as a final sibling under the root —
  // only when there's at least one untagged data-node, to avoid an
  // empty bucket on docs that don't need it.
  const untagged = collectUntaggedDataNodes(doc.root);
  if (untagged.length > 0) {
    rootNode.children.push({
      kind: "untagged",
      id: UNTAGGED_ID,
      children: dataChildrenFor(UNTAGGED_ID, untagged),
    });
  }
  // For the synthetic-root edge case, hide its "name" — the root is
  // labelled "tags" internally but that's not user-facing.
  if (isSyntheticRoot && rootNode.kind === "tag") {
    rootNode.name = "All tags";
  }
  return rootNode;
}

function buildTagFilterNode(tag: TagNode, rootData: MindNode): FilterNode & { kind: "tag" } {
  const key = normalizeTagKey(tag.name);
  const directData = collectDataNodesForTag(rootData, key);
  const descendantTagChildren = tag.children.map((c) =>
    buildTagFilterNode(c, rootData),
  );
  // Data children come BEFORE descendant tag children so a tag with
  // both gets its own bucket of data above the sub-categorisation.
  return {
    kind: "tag",
    id: tag.id,
    name: tag.name,
    children: [...dataChildrenFor(tag.id, directData), ...descendantTagChildren],
  };
}

import type { IdGenerator } from "./ids";
import { SCHEMA_VERSION, type MindDocument, type MindNode, type TagNode } from "./types";

export class OpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpError";
  }
}

/**
 * Minimal shape of any tree node operated on by the generic helpers
 * below. Both `MindNode` and `TagNode` satisfy this.
 */
interface TreeShape {
  id: string;
  children: TreeShape[];
}

export function findById(doc: MindDocument, id: string): MindNode | null {
  return findInTree(doc.root, id);
}

export function findTagById(doc: MindDocument, id: string): TagNode | null {
  if (!doc.tagRoot) return null;
  return findInTree(doc.tagRoot, id);
}

function findInTree<T extends TreeShape>(node: T, id: string): T | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findInTree(child as T, id);
    if (found) return found;
  }
  return null;
}

function findParent<T extends TreeShape>(
  node: T,
  id: string,
): { parent: T; index: number } | null {
  for (let i = 0; i < node.children.length; i += 1) {
    const child = node.children[i] as T;
    if (child.id === id) return { parent: node, index: i };
    const found = findParent(child, id);
    if (found) return found;
  }
  return null;
}

function isDescendant<T extends TreeShape>(node: T, candidateAncestorId: string): boolean {
  if (node.id === candidateAncestorId) return true;
  for (const child of node.children) {
    if (isDescendant(child as T, candidateAncestorId)) return true;
  }
  return false;
}

function mapTree<T extends TreeShape>(node: T, fn: (n: T) => T | null): T | null {
  const newChildren: T[] = [];
  let childrenChanged = false;
  for (const child of node.children as T[]) {
    const mapped = mapTree(child, fn);
    if (mapped !== child) childrenChanged = true;
    if (mapped !== null) newChildren.push(mapped);
  }
  const candidate = (childrenChanged ? { ...node, children: newChildren } : node) as T;
  return fn(candidate);
}

function makeNode(id: string, text: string): MindNode {
  return { id, text, children: [] };
}

export function addChild(
  doc: MindDocument,
  parentId: string,
  text: string,
  ids: IdGenerator,
  index?: number,
): { doc: MindDocument; newId: string } {
  const newId = ids.next();
  const newNode = makeNode(newId, text);
  let found = false;
  const newRoot = mapTree(doc.root, (n) => {
    if (n.id !== parentId) return n;
    found = true;
    const insertAt =
      index === undefined ? n.children.length : Math.max(0, Math.min(index, n.children.length));
    const children = [...n.children];
    children.splice(insertAt, 0, newNode);
    return { ...n, children };
  });
  if (!found || newRoot === null) {
    throw new OpError(`addChild: parent "${parentId}" not found`);
  }
  return { doc: { ...doc, root: newRoot }, newId };
}

export function addSibling(
  doc: MindDocument,
  siblingId: string,
  text: string,
  ids: IdGenerator,
): { doc: MindDocument; newId: string } {
  if (doc.root.id === siblingId) {
    throw new OpError("addSibling: cannot add sibling to root");
  }
  const parentInfo = findParent(doc.root, siblingId);
  if (!parentInfo) {
    throw new OpError(`addSibling: node "${siblingId}" not found`);
  }
  return addChild(doc, parentInfo.parent.id, text, ids, parentInfo.index + 1);
}

export function deleteNode(doc: MindDocument, id: string): MindDocument {
  if (doc.root.id === id) {
    throw new OpError("deleteNode: cannot delete root");
  }
  let removed = false;
  const newRoot = mapTree(doc.root, (n) => {
    if (n.id === id) {
      removed = true;
      return null;
    }
    return n;
  });
  if (!removed || newRoot === null) {
    throw new OpError(`deleteNode: node "${id}" not found`);
  }
  return { ...doc, root: newRoot };
}

export function updateText(doc: MindDocument, id: string, text: string): MindDocument {
  let updated = false;
  const newRoot = mapTree(doc.root, (n) => {
    if (n.id !== id) return n;
    updated = true;
    return { ...n, text };
  });
  if (!updated || newRoot === null) {
    throw new OpError(`updateText: node "${id}" not found`);
  }
  return { ...doc, root: newRoot };
}

export function updateNode(
  doc: MindDocument,
  id: string,
  patch: Partial<
    Pick<
      MindNode,
      | "text"
      | "color"
      | "collapsed"
      | "maxWidth"
      | "maxHeight"
      | "notes"
      | "position"
      | "edgeFrom"
      | "edgeTo"
    >
  >,
): MindDocument {
  let updated = false;
  const newRoot = mapTree(doc.root, (n) => {
    if (n.id !== id) return n;
    updated = true;
    const next: MindNode = { ...n };
    if (patch.text !== undefined) next.text = patch.text;
    if (patch.color !== undefined) {
      if (patch.color === "") delete next.color;
      else next.color = patch.color;
    }
    if (patch.collapsed !== undefined) {
      if (patch.collapsed === false) delete next.collapsed;
      else next.collapsed = patch.collapsed;
    }
    if ("maxWidth" in patch) {
      if (patch.maxWidth === undefined || patch.maxWidth <= 0) delete next.maxWidth;
      else next.maxWidth = patch.maxWidth;
    }
    if ("maxHeight" in patch) {
      if (patch.maxHeight === undefined || patch.maxHeight <= 0) delete next.maxHeight;
      else next.maxHeight = patch.maxHeight;
    }
    if ("notes" in patch) {
      if (patch.notes === undefined || patch.notes === "") delete next.notes;
      else next.notes = patch.notes;
    }
    if ("position" in patch) {
      if (patch.position === undefined) delete next.position;
      else next.position = { x: patch.position.x, y: patch.position.y };
    }
    if ("edgeFrom" in patch) {
      if (patch.edgeFrom === undefined) delete next.edgeFrom;
      else next.edgeFrom = patch.edgeFrom;
    }
    if ("edgeTo" in patch) {
      if (patch.edgeTo === undefined) delete next.edgeTo;
      else next.edgeTo = patch.edgeTo;
    }
    return next;
  });
  if (!updated || newRoot === null) {
    throw new OpError(`updateNode: node "${id}" not found`);
  }
  return { ...doc, root: newRoot };
}

export function moveSibling(
  doc: MindDocument,
  id: string,
  direction: "up" | "down",
): MindDocument {
  if (id === doc.root.id) {
    throw new OpError("moveSibling: cannot move root");
  }
  const parentInfo = findParent(doc.root, id);
  if (!parentInfo) {
    throw new OpError(`moveSibling: node "${id}" not found`);
  }
  const { parent, index } = parentInfo;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= parent.children.length) return doc;
  const newRoot = mapTree(doc.root, (n) => {
    if (n.id !== parent.id) return n;
    const children = [...n.children];
    [children[index], children[swapWith]] = [children[swapWith]!, children[index]!];
    return { ...n, children };
  });
  /* v8 ignore start */
  if (newRoot === null) {
    throw new OpError(`moveSibling: parent "${parent.id}" disappeared during move`);
  }
  /* v8 ignore stop */
  return { ...doc, root: newRoot };
}

export function moveNode(
  doc: MindDocument,
  id: string,
  newParentId: string,
  index?: number,
): MindDocument {
  if (id === doc.root.id) {
    throw new OpError("moveNode: cannot move root");
  }
  if (id === newParentId) {
    throw new OpError("moveNode: cannot move node into itself");
  }
  const moving = findById(doc, id);
  if (!moving) throw new OpError(`moveNode: node "${id}" not found`);
  if (isDescendant(moving, newParentId)) {
    throw new OpError("moveNode: cannot move node under one of its descendants");
  }
  const targetParent = findById(doc, newParentId);
  if (!targetParent) {
    throw new OpError(`moveNode: target parent "${newParentId}" not found`);
  }
  const removed = deleteNode(doc, id);
  const insertion = addChildExisting(removed, newParentId, moving, index);
  return insertion;
}

function addChildExisting(
  doc: MindDocument,
  parentId: string,
  node: MindNode,
  index?: number,
): MindDocument {
  let found = false;
  const newRoot = mapTree(doc.root, (n) => {
    if (n.id !== parentId) return n;
    found = true;
    const insertAt =
      index === undefined ? n.children.length : Math.max(0, Math.min(index, n.children.length));
    const children = [...n.children];
    children.splice(insertAt, 0, node);
    return { ...n, children };
  });
  // Defensive: both callers validate parentId before invoking this helper.
  /* v8 ignore start */
  if (!found || newRoot === null) {
    throw new OpError(`moveNode: parent "${parentId}" disappeared during move`);
  }
  /* v8 ignore stop */
  return { ...doc, root: newRoot };
}

export function cloneWithNewIds(node: MindNode, ids: IdGenerator): MindNode {
  const cloned: MindNode = {
    id: ids.next(),
    text: node.text,
    children: node.children.map((c) => cloneWithNewIds(c, ids)),
  };
  if (node.color !== undefined) cloned.color = node.color;
  if (node.collapsed !== undefined) cloned.collapsed = node.collapsed;
  return cloned;
}

export function duplicateNode(
  doc: MindDocument,
  id: string,
  ids: IdGenerator,
): { doc: MindDocument; newId: string } {
  if (id === doc.root.id) {
    throw new OpError("duplicateNode: cannot duplicate root");
  }
  const parentInfo = findParent(doc.root, id);
  if (!parentInfo) {
    throw new OpError(`duplicateNode: node "${id}" not found`);
  }
  const original = parentInfo.parent.children[parentInfo.index]!;
  const clone = cloneWithNewIds(original, ids);
  const inserted = addChildExisting(doc, parentInfo.parent.id, clone, parentInfo.index + 1);
  return { doc: inserted, newId: clone.id };
}

export function emptyDocument(title = "Untitled", ids?: IdGenerator): MindDocument {
  const id = ids ? ids.next() : "n1";
  return {
    title,
    version: SCHEMA_VERSION,
    layoutMode: "manual",
    root: { id, text: title, children: [] },
  };
}

/**
 * Walk the tree and apply a transform to each node. Returns a new tree
 * (input is not mutated). Used by the layout-mode switch helpers below.
 */
function mapAllNodes(node: MindNode, fn: (n: MindNode) => MindNode): MindNode {
  const next = fn(node);
  if (next.children.length === 0) return next;
  const children = next.children.map((c) => mapAllNodes(c, fn));
  // Avoid creating a new array if nothing actually changed (.map preserves
  // length, so we only need to compare element identity).
  let same = true;
  for (let i = 0; i < children.length; i += 1) {
    if (children[i] !== next.children[i]) {
      same = false;
      break;
    }
  }
  return same ? next : { ...next, children };
}

/**
 * Set the document's layoutMode. Used by the Auto/Manual toggle in
 * Settings. Switching to "auto" strips every node's `position` field
 * (positions are meaningless in auto mode and would just bloat the YAML).
 * Switching to "manual" leaves any existing positions in place; the
 * caller decides whether to seed positions from the auto-layout output.
 */
export function setLayoutMode(doc: MindDocument, mode: "auto" | "manual"): MindDocument {
  // Absent layoutMode is canonically "auto" — short-circuit so the
  // common "default doc, no edits yet" case doesn't churn the YAML.
  const current = doc.layoutMode ?? "auto";
  if (mode === current) return doc;
  // Both transitions just flip the flag. Manual-only fields
  // (`position`, `edgeFrom`, `edgeTo`) are preserved across the
  // round-trip so a user toggling Manual → Auto → Manual gets back
  // exactly what they had. The "Reset positions" button is the
  // separate escape hatch for "I want a clean tidy-tree now".
  return { ...doc, layoutMode: mode === "auto" ? undefined : "manual" };
}

/**
 * Bulk-set positions for a list of (id, position) pairs. Used by the
 * Auto → Manual transition: we capture the auto-layout's coordinates
 * and write them back so the visual state is preserved.
 */
export function setPositions(
  doc: MindDocument,
  positions: Map<string, { x: number; y: number }>,
): MindDocument {
  return {
    ...doc,
    root: mapAllNodes(doc.root, (n) => {
      const p = positions.get(n.id);
      if (!p) return n;
      return { ...n, position: { x: p.x, y: p.y } };
    }),
  };
}

/**
 * Strip every node's `position` while staying in manual mode. Used by
 * the "Reset positions" button — fall back to the auto-layout look but
 * keep the user in manual mode so they can keep dragging.
 */
export function clearAllPositions(doc: MindDocument): MindDocument {
  return { ...doc, root: mapAllNodes(doc.root, stripPosition) };
}

function stripPosition(n: MindNode): MindNode {
  if (n.position === undefined) return n;
  const { position: _drop, ...rest } = n;
  void _drop;
  return rest;
}

// ─────────────────────────────────────────────────────────────────────
// Tag operations
// ─────────────────────────────────────────────────────────────────────

const TAG_ROOT_DEFAULT_NAME = "tags";

function normalizeTagKey(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Walk the entire tag tree (including the synthetic root) and collect
 * every tag-node's name keyed by its normalized form.
 */
function collectTagNamesByKey(tagRoot: TagNode): Map<string, TagNode> {
  const out = new Map<string, TagNode>();
  function walk(node: TagNode, isRoot: boolean): void {
    if (!isRoot) out.set(normalizeTagKey(node.name), node);
    for (const c of node.children) walk(c, false);
  }
  walk(tagRoot, true);
  return out;
}

function ensureTagRoot(doc: MindDocument, ids: IdGenerator): MindDocument {
  if (doc.tagRoot) return doc;
  return {
    ...doc,
    tagRoot: { id: ids.next(), name: TAG_ROOT_DEFAULT_NAME, children: [] },
  };
}

/**
 * Attach one or more tags to a data-node. New tag names (case-insensitive,
 * not already present in the tag tree) get a fresh top-level tag-node
 * created under `tagRoot`; existing names are reused as-is. The tag tree
 * itself is materialized lazily on the first call.
 *
 * Throws OpError on:
 *  - missing data-node
 *  - empty / whitespace-only name
 *  - duplicate name within the input array (case-insensitive)
 *
 * Adding a name that already exists on the same data-node is a silent
 * no-op for that specific name — the rest of the patch still applies.
 */
export function tagsAdd(
  doc: MindDocument,
  nodeId: string,
  names: string[],
  ids: IdGenerator,
): MindDocument {
  const target = findById(doc, nodeId);
  if (!target) throw new OpError(`tagsAdd: node "${nodeId}" not found`);

  const cleaned: string[] = [];
  const seenInput = new Set<string>();
  for (const raw of names) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new OpError("tagsAdd: tag name cannot be empty");
    }
    const key = normalizeTagKey(trimmed);
    if (seenInput.has(key)) {
      throw new OpError(`tagsAdd: duplicate tag "${trimmed}" in input`);
    }
    seenInput.add(key);
    cleaned.push(trimmed);
  }
  if (cleaned.length === 0) return doc;

  let next = ensureTagRoot(doc, ids);
  const existingByKey = collectTagNamesByKey(next.tagRoot!);
  const tagsToAppendToTree: TagNode[] = [];
  for (const name of cleaned) {
    const key = normalizeTagKey(name);
    if (!existingByKey.has(key)) {
      const newTag: TagNode = { id: ids.next(), name, children: [] };
      tagsToAppendToTree.push(newTag);
      existingByKey.set(key, newTag);
    }
  }

  if (tagsToAppendToTree.length > 0) {
    next = {
      ...next,
      tagRoot: {
        ...next.tagRoot!,
        children: [...next.tagRoot!.children, ...tagsToAppendToTree],
      },
    };
  }

  const existingOnNodeByKey = new Set(
    (target.tags ?? []).map((t) => normalizeTagKey(t)),
  );
  const additions = cleaned.filter((n) => !existingOnNodeByKey.has(normalizeTagKey(n)));
  if (additions.length === 0) return next;

  const updatedRoot = mapTree(next.root, (n) => {
    if (n.id !== nodeId) return n;
    return { ...n, tags: [...(n.tags ?? []), ...additions] };
  });
  if (!updatedRoot) {
    throw new OpError(`tagsAdd: node "${nodeId}" disappeared during update`);
  }
  return { ...next, root: updatedRoot };
}

/**
 * Detach one or more tag names from a data-node. Names are matched
 * case-insensitively. Missing names are silently ignored (not an error
 * — the call is idempotent). The tag tree is NOT touched: the tag
 * still exists in the user's hierarchy, just no longer on this node.
 */
export function tagsRemove(
  doc: MindDocument,
  nodeId: string,
  names: string[],
): MindDocument {
  const target = findById(doc, nodeId);
  if (!target) throw new OpError(`tagsRemove: node "${nodeId}" not found`);
  if (!target.tags || target.tags.length === 0) return doc;

  const removeKeys = new Set(names.map((n) => normalizeTagKey(n)));
  const filtered = target.tags.filter((t) => !removeKeys.has(normalizeTagKey(t)));
  if (filtered.length === target.tags.length) return doc;

  const updatedRoot = mapTree(doc.root, (n) => {
    if (n.id !== nodeId) return n;
    if (filtered.length === 0) {
      const { tags: _drop, ...rest } = n;
      void _drop;
      return rest;
    }
    return { ...n, tags: filtered };
  });
  if (!updatedRoot) {
    throw new OpError(`tagsRemove: node "${nodeId}" disappeared during update`);
  }
  return { ...doc, root: updatedRoot };
}

/**
 * Cascading delete of a tag-node: removes it (and its descendants) from
 * the tag tree, and strips every matching tag name from every data-node
 * in the document. Single atomic operation — the caller's undo stack
 * sees it as one step.
 */
export function tagDelete(doc: MindDocument, tagNodeId: string): MindDocument {
  if (!doc.tagRoot) {
    throw new OpError(`tagDelete: no tag tree`);
  }
  if (doc.tagRoot.id === tagNodeId) {
    throw new OpError("tagDelete: cannot delete the tag-tree root");
  }
  const subtree = findInTree(doc.tagRoot, tagNodeId);
  if (!subtree) {
    throw new OpError(`tagDelete: tag-node "${tagNodeId}" not found`);
  }

  // Collect every tag name we need to strip from data-nodes.
  const namesToStrip = new Set<string>();
  function collect(n: TagNode): void {
    namesToStrip.add(normalizeTagKey(n.name));
    for (const c of n.children) collect(c);
  }
  collect(subtree);

  // 1. Remove the subtree from the tag tree.
  const newTagRoot = mapTree(doc.tagRoot, (n) => (n.id === tagNodeId ? null : n));
  if (!newTagRoot) {
    // Unreachable: the tag-root is never the target (checked above).
    throw new OpError("tagDelete: tag tree collapsed during delete");
  }

  // 2. Strip matching names from every data-node.
  const newRoot = mapTree(doc.root, (n) => {
    if (!n.tags || n.tags.length === 0) return n;
    const filtered = n.tags.filter((t) => !namesToStrip.has(normalizeTagKey(t)));
    if (filtered.length === n.tags.length) return n;
    if (filtered.length === 0) {
      const { tags: _drop, ...rest } = n;
      void _drop;
      return rest;
    }
    return { ...n, tags: filtered };
  });
  if (!newRoot) {
    throw new OpError("tagDelete: data tree collapsed during delete");
  }

  return { ...doc, root: newRoot, tagRoot: newTagRoot };
}

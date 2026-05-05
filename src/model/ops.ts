import type { IdGenerator } from "./ids";
import { SCHEMA_VERSION, type MindDocument, type MindNode } from "./types";

export class OpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpError";
  }
}

export function findById(doc: MindDocument, id: string): MindNode | null {
  return findNode(doc.root, id);
}

function findNode(node: MindNode, id: string): MindNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function findParent(
  node: MindNode,
  id: string,
  parent: MindNode | null = null,
): { parent: MindNode; index: number } | null {
  if (node.id === id) {
    return parent ? { parent, index: parent.children.indexOf(node) } : null;
  }
  for (const child of node.children) {
    const found = findParent(child, id, node);
    if (found) return found;
  }
  return null;
}

function isDescendant(node: MindNode, candidateAncestorId: string): boolean {
  if (node.id === candidateAncestorId) return true;
  for (const child of node.children) {
    if (isDescendant(child, candidateAncestorId)) return true;
  }
  return false;
}

function mapTree(node: MindNode, fn: (n: MindNode) => MindNode | null): MindNode | null {
  const newChildren: MindNode[] = [];
  let childrenChanged = false;
  for (const child of node.children) {
    const mapped = mapTree(child, fn);
    if (mapped !== child) childrenChanged = true;
    if (mapped !== null) newChildren.push(mapped);
  }
  const candidate = childrenChanged ? { ...node, children: newChildren } : node;
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
  patch: Partial<Pick<MindNode, "text" | "note" | "color" | "collapsed">>,
): MindDocument {
  let updated = false;
  const newRoot = mapTree(doc.root, (n) => {
    if (n.id !== id) return n;
    updated = true;
    const next: MindNode = { ...n };
    if (patch.text !== undefined) next.text = patch.text;
    if (patch.note !== undefined) {
      if (patch.note === "") delete next.note;
      else next.note = patch.note;
    }
    if (patch.color !== undefined) {
      if (patch.color === "") delete next.color;
      else next.color = patch.color;
    }
    if (patch.collapsed !== undefined) {
      if (patch.collapsed === false) delete next.collapsed;
      else next.collapsed = patch.collapsed;
    }
    return next;
  });
  if (!updated || newRoot === null) {
    throw new OpError(`updateNode: node "${id}" not found`);
  }
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
  if (!found || newRoot === null) {
    throw new OpError(`moveNode: parent "${parentId}" disappeared during move`);
  }
  return { ...doc, root: newRoot };
}

export function cloneWithNewIds(node: MindNode, ids: IdGenerator): MindNode {
  const cloned: MindNode = {
    id: ids.next(),
    text: node.text,
    children: node.children.map((c) => cloneWithNewIds(c, ids)),
  };
  if (node.note !== undefined) cloned.note = node.note;
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
  const original = findById(doc, id);
  if (!original) {
    throw new OpError(`duplicateNode: node "${id}" not found`);
  }
  const parentInfo = findParent(doc.root, id);
  if (!parentInfo) {
    throw new OpError(`duplicateNode: parent of "${id}" not found`);
  }
  const clone = cloneWithNewIds(original, ids);
  const inserted = addChildExisting(doc, parentInfo.parent.id, clone, parentInfo.index + 1);
  return { doc: inserted, newId: clone.id };
}

export function emptyDocument(title = "Untitled", ids?: IdGenerator): MindDocument {
  const id = ids ? ids.next() : "n1";
  return {
    title,
    version: SCHEMA_VERSION,
    root: { id, text: title, children: [] },
  };
}

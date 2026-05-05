import { findById, type MindDocument, type MindNode, updateNode } from "../model";

export interface NavTarget {
  id: string;
  text: string;
  aria: string;
}

function findParentInfo(
  node: MindNode,
  id: string,
  parent: MindNode | null = null,
): { parent: MindNode | null; index: number } | null {
  if (node.id === id) return parent ? { parent, index: parent.children.indexOf(node) } : null;
  for (const child of node.children) {
    const found = findParentInfo(child, id, node);
    if (found) return found;
  }
  return null;
}

function asTarget(node: MindNode, role: "sibling" | "parent" | "child"): NavTarget {
  return { id: node.id, text: node.text, aria: role };
}

export function navigateSibling(
  doc: MindDocument,
  fromId: string,
  delta: -1 | 1,
): NavTarget | null {
  const info = findParentInfo(doc.root, fromId);
  if (!info || !info.parent) return null;
  const next = info.parent.children[info.index + delta];
  if (!next) return null;
  return asTarget(next, "sibling");
}

export function navigateToParent(doc: MindDocument, fromId: string): NavTarget | null {
  const info = findParentInfo(doc.root, fromId);
  if (!info || !info.parent) return null;
  return asTarget(info.parent, "parent");
}

export function navigateIntoChildren(
  doc: MindDocument,
  fromId: string,
  applyTreeChange: (next: MindDocument) => void,
): NavTarget | null {
  const node = findById(doc, fromId);
  if (!node || node.children.length === 0) return null;
  // If collapsed, expand first so the user can see where they are going.
  if (node.collapsed) {
    applyTreeChange(updateNode(doc, fromId, { collapsed: false }));
  }
  const first = node.children[0];
  if (!first) return null;
  return asTarget(first, "child");
}

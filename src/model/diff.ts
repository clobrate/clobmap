import type { MindDocument, MindNode } from "./types";

export type NodeChange =
  | { type: "added"; id: string; parentId: string | null }
  | { type: "removed"; id: string; parentId: string | null }
  | { type: "moved"; id: string; fromParentId: string | null; toParentId: string | null }
  | { type: "text"; id: string; before: string; after: string }
  | { type: "fields"; id: string; changed: ReadonlyArray<"note" | "color" | "collapsed"> };

export interface TreeDiff {
  changes: NodeChange[];
}

interface IndexedNode {
  node: MindNode;
  parentId: string | null;
}

function indexTree(node: MindNode, parentId: string | null, out: Map<string, IndexedNode>): void {
  out.set(node.id, { node, parentId });
  for (const child of node.children) {
    indexTree(child, node.id, out);
  }
}

type FieldKey = "note" | "color" | "collapsed";

function fieldsChanged(a: MindNode, b: MindNode): FieldKey[] {
  const changed: FieldKey[] = [];
  if ((a.note ?? "") !== (b.note ?? "")) changed.push("note");
  if ((a.color ?? "") !== (b.color ?? "")) changed.push("color");
  if (Boolean(a.collapsed) !== Boolean(b.collapsed)) changed.push("collapsed");
  return changed;
}

export function diffTrees(before: MindDocument, after: MindDocument): TreeDiff {
  const beforeIdx = new Map<string, IndexedNode>();
  const afterIdx = new Map<string, IndexedNode>();
  indexTree(before.root, null, beforeIdx);
  indexTree(after.root, null, afterIdx);

  const changes: NodeChange[] = [];

  for (const [id, b] of beforeIdx) {
    const a = afterIdx.get(id);
    if (!a) {
      changes.push({ type: "removed", id, parentId: b.parentId });
    } else {
      if (b.parentId !== a.parentId) {
        changes.push({
          type: "moved",
          id,
          fromParentId: b.parentId,
          toParentId: a.parentId,
        });
      }
      if (b.node.text !== a.node.text) {
        changes.push({ type: "text", id, before: b.node.text, after: a.node.text });
      }
      const fields = fieldsChanged(b.node, a.node);
      if (fields.length > 0) {
        changes.push({ type: "fields", id, changed: fields });
      }
    }
  }

  for (const [id, a] of afterIdx) {
    if (!beforeIdx.has(id)) {
      changes.push({ type: "added", id, parentId: a.parentId });
    }
  }

  return { changes };
}

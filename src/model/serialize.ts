import { stringify, type Document } from "yaml";
import type { MindDocument, MindNode } from "./types";

function nodeToPlain(node: MindNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: node.id,
    text: node.text,
  };
  if (node.note !== undefined) out.note = node.note;
  if (node.color !== undefined) out.color = node.color;
  if (node.collapsed !== undefined) out.collapsed = node.collapsed;
  if (node.maxWidth !== undefined) out.maxWidth = node.maxWidth;
  if (node.maxHeight !== undefined) out.maxHeight = node.maxHeight;
  if (node.notes !== undefined) out.notes = node.notes;
  if (node.position !== undefined) {
    out.position = { x: node.position.x, y: node.position.y };
  }
  if (node.sourceHandle !== undefined) out.sourceHandle = node.sourceHandle;
  if (node.targetHandle !== undefined) out.targetHandle = node.targetHandle;
  out.children = node.children.map(nodeToPlain);
  return out;
}

function documentToPlain(doc: MindDocument): Record<string, unknown> {
  const out: Record<string, unknown> = { title: doc.title };
  if (doc.version !== undefined) out.version = doc.version;
  if (doc.layoutMode !== undefined) out.layoutMode = doc.layoutMode;
  out.root = nodeToPlain(doc.root);
  return out;
}

export function serializeYaml(doc: MindDocument): string {
  return stringify(documentToPlain(doc), {
    indent: 2,
    lineWidth: 0,
  });
}

export function serializeLiveYaml(doc: Document): string {
  return doc.toString();
}

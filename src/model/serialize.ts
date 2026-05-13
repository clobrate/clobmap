import { stringify, type Document } from "yaml";
import type { MindDocument, MindNode, TagNode } from "./types";

function nodeToPlain(node: MindNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: node.id,
    text: node.text,
  };
  if (node.color !== undefined) out.color = node.color;
  if (node.collapsed !== undefined) out.collapsed = node.collapsed;
  if (node.maxWidth !== undefined) out.maxWidth = node.maxWidth;
  if (node.maxHeight !== undefined) out.maxHeight = node.maxHeight;
  if (node.notes !== undefined) out.notes = node.notes;
  if (node.position !== undefined) {
    out.position = { x: node.position.x, y: node.position.y };
  }
  if (node.edgeFrom !== undefined) out.edgeFrom = node.edgeFrom;
  if (node.edgeTo !== undefined) out.edgeTo = node.edgeTo;
  if (node.tags !== undefined && node.tags.length > 0) {
    out.tags = [...node.tags];
  }
  out.children = node.children.map(nodeToPlain);
  return out;
}

function tagNodeToPlain(node: TagNode): Record<string, unknown> {
  return {
    id: node.id,
    name: node.name,
    children: node.children.map(tagNodeToPlain),
  };
}

function documentToPlain(doc: MindDocument): Record<string, unknown> {
  const out: Record<string, unknown> = { title: doc.title };
  if (doc.version !== undefined) out.version = doc.version;
  if (doc.layoutMode !== undefined) out.layoutMode = doc.layoutMode;
  out.root = nodeToPlain(doc.root);
  if (doc.tagRoot !== undefined) out.tagRoot = tagNodeToPlain(doc.tagRoot);
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

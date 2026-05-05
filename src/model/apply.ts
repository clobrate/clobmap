import { isMap, isScalar, isSeq, type Document, Scalar, YAMLMap, YAMLSeq } from "yaml";
import type { MindDocument, MindNode } from "./types";

export function applyTreeToDocument(doc: Document, after: MindDocument): void {
  let top: YAMLMap;
  if (isMap(doc.contents)) {
    top = doc.contents;
  } else {
    top = new YAMLMap();
    doc.contents = top;
  }

  setScalarValue(top, "title", after.title);
  if (after.version !== undefined) {
    setScalarValue(top, "version", after.version);
  } else if (top.has("version")) {
    top.delete("version");
  }

  const index = buildIdIndex(doc);
  const rootMap = ensureRootMap(doc);
  syncNode(rootMap, after.root, index);
  index.set(after.root.id, rootMap);
}

function ensureRootMap(doc: Document): YAMLMap {
  // applyTreeToDocument has already ensured doc.contents is a YAMLMap.
  const top = doc.contents as YAMLMap;
  const root = top.get("root", true);
  if (isMap(root)) return root;
  const fresh = new YAMLMap();
  top.set("root", fresh);
  return fresh;
}

function buildIdIndex(doc: Document): Map<string, YAMLMap> {
  const index = new Map<string, YAMLMap>();
  const root = doc.get("root", true);
  if (isMap(root)) collectMaps(root, index);
  return index;
}

function collectMaps(map: YAMLMap, out: Map<string, YAMLMap>): void {
  const id = getIdValue(map);
  if (id) out.set(id, map);
  const children = map.get("children", true);
  if (isSeq(children)) {
    for (const item of children.items) {
      if (isMap(item)) collectMaps(item, out);
    }
  }
}

function getIdValue(map: YAMLMap): string | null {
  const v = map.get("id", true);
  if (isScalar(v) && typeof v.value === "string") return v.value;
  return null;
}

function syncNode(target: YAMLMap, source: MindNode, index: Map<string, YAMLMap>): void {
  setScalarValue(target, "id", source.id);
  setScalarValue(target, "text", source.text);
  setOrDelete(target, "note", source.note);
  setOrDelete(target, "color", source.color);
  setOrDelete(target, "collapsed", source.collapsed);
  syncChildren(target, source.children, index);
}

function setScalarValue(map: YAMLMap, key: string, value: unknown): void {
  const existing = map.get(key, true);
  if (isScalar(existing)) {
    existing.value = value;
    return;
  }
  map.set(key, value);
}

function setOrDelete(map: YAMLMap, key: string, value: unknown): void {
  if (value === undefined) {
    if (map.has(key)) map.delete(key);
    return;
  }
  setScalarValue(map, key, value);
}

function syncChildren(parentMap: YAMLMap, source: MindNode[], index: Map<string, YAMLMap>): void {
  const existing = parentMap.get("children", true);
  let seq: YAMLSeq;
  if (isSeq(existing)) {
    seq = existing;
  } else {
    seq = new YAMLSeq();
    parentMap.set("children", seq);
  }
  seq.items = source.map((child) => syncOrCreate(child, index));
}

function syncOrCreate(source: MindNode, index: Map<string, YAMLMap>): YAMLMap {
  let map = index.get(source.id);
  if (!map) {
    map = new YAMLMap();
    map.set("id", new Scalar(source.id));
    map.set("text", new Scalar(source.text));
    if (source.note !== undefined) map.set("note", new Scalar(source.note));
    if (source.color !== undefined) map.set("color", new Scalar(source.color));
    if (source.collapsed !== undefined) {
      map.set("collapsed", new Scalar(source.collapsed));
    }
    map.set("children", new YAMLSeq());
    index.set(source.id, map);
  }
  syncNode(map, source, index);
  return map;
}

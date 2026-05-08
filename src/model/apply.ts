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
  if (after.layoutMode !== undefined) {
    setScalarValue(top, "layoutMode", after.layoutMode);
  } else if (top.has("layoutMode")) {
    top.delete("layoutMode");
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
  setOrDelete(target, "maxWidth", source.maxWidth);
  setOrDelete(target, "maxHeight", source.maxHeight);
  setOrDelete(target, "notes", source.notes);
  syncPosition(target, source.position);
  syncChildren(target, source.children, index);
}

function syncPosition(map: YAMLMap, position: MindNode["position"]): void {
  if (position === undefined) {
    if (map.has("position")) map.delete("position");
    return;
  }
  // Build a fresh sub-map so coordinates round-trip cleanly.
  const next = new YAMLMap();
  next.set("x", new Scalar(position.x));
  next.set("y", new Scalar(position.y));
  map.set("position", next);
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
    if (source.maxWidth !== undefined) map.set("maxWidth", new Scalar(source.maxWidth));
    if (source.maxHeight !== undefined) map.set("maxHeight", new Scalar(source.maxHeight));
    if (source.notes !== undefined) map.set("notes", new Scalar(source.notes));
    if (source.position !== undefined) {
      const pos = new YAMLMap();
      pos.set("x", new Scalar(source.position.x));
      pos.set("y", new Scalar(source.position.y));
      map.set("position", pos);
    }
    map.set("children", new YAMLSeq());
    index.set(source.id, map);
  }
  syncNode(map, source, index);
  return map;
}

import { parseDocument, type Document } from "yaml";
import type { MindDocument, MindNode, ParseError, Result } from "./types";

const NODE_FIELDS = [
  "id",
  "text",
  "children",
  "note",
  "color",
  "collapsed",
  "maxWidth",
  "maxHeight",
  "notes",
] as const;
const DOC_FIELDS = ["title", "root", "version"] as const;

function makeError(message: string, line = 1, col = 1): ParseError {
  return { message, line, col };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateNode(value: unknown, path: string): Result<MindNode> {
  if (!isPlainObject(value)) {
    return { ok: false, error: makeError(`expected mapping at ${path}`) };
  }
  for (const key of Object.keys(value)) {
    if (!(NODE_FIELDS as readonly string[]).includes(key)) {
      return { ok: false, error: makeError(`unknown field "${key}" at ${path}`) };
    }
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    return { ok: false, error: makeError(`missing or invalid "id" at ${path}`) };
  }
  if (typeof value.text !== "string") {
    return { ok: false, error: makeError(`missing or invalid "text" at ${path}`) };
  }

  const children: MindNode[] = [];
  if (value.children !== undefined && value.children !== null) {
    if (!Array.isArray(value.children)) {
      return { ok: false, error: makeError(`"children" must be a list at ${path}`) };
    }
    for (let i = 0; i < value.children.length; i += 1) {
      const childResult = validateNode(value.children[i], `${path}.children[${i}]`);
      if (!childResult.ok) return childResult;
      children.push(childResult.value);
    }
  }

  const node: MindNode = {
    id: value.id,
    text: value.text,
    children,
  };
  if (typeof value.note === "string") node.note = value.note;
  if (typeof value.color === "string") node.color = value.color;
  if (typeof value.collapsed === "boolean") node.collapsed = value.collapsed;
  if (typeof value.maxWidth === "number" && value.maxWidth > 0) {
    node.maxWidth = value.maxWidth;
  }
  if (typeof value.maxHeight === "number" && value.maxHeight > 0) {
    node.maxHeight = value.maxHeight;
  }
  if (typeof value.notes === "string") node.notes = value.notes;
  return { ok: true, value: node };
}

function validateDocument(value: unknown): Result<MindDocument> {
  if (!isPlainObject(value)) {
    return { ok: false, error: makeError("document must be a mapping") };
  }
  for (const key of Object.keys(value)) {
    if (!(DOC_FIELDS as readonly string[]).includes(key)) {
      return { ok: false, error: makeError(`unknown top-level field "${key}"`) };
    }
  }
  if (typeof value.title !== "string") {
    return { ok: false, error: makeError('missing or invalid top-level "title"') };
  }
  if (value.root === undefined) {
    return { ok: false, error: makeError('missing top-level "root"') };
  }
  const rootResult = validateNode(value.root, "root");
  if (!rootResult.ok) return rootResult;

  const doc: MindDocument = {
    title: value.title,
    root: rootResult.value,
  };
  if (typeof value.version === "number") doc.version = value.version;
  return { ok: true, value: doc };
}

function ensureUniqueIds(node: MindNode, seen: Set<string>): ParseError | null {
  if (seen.has(node.id)) {
    return makeError(`duplicate id "${node.id}"`);
  }
  seen.add(node.id);
  for (const child of node.children) {
    const err = ensureUniqueIds(child, seen);
    if (err) return err;
  }
  return null;
}

export function parseYaml(text: string): Result<MindDocument> {
  const liveResult = parseLiveYaml(text);
  if (!liveResult.ok) return liveResult;
  return { ok: true, value: liveResult.value.tree };
}

export interface LiveParseResult {
  tree: MindDocument;
  doc: Document.Parsed;
}

export function parseLiveYaml(text: string): Result<LiveParseResult> {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    const err = doc.errors[0];
    const pos = err.linePos?.[0];
    return {
      ok: false,
      error: makeError(err.message, pos?.line ?? 1, pos?.col ?? 1),
    };
  }
  const js = doc.toJS();
  const validated = validateDocument(js);
  if (!validated.ok) return validated;
  const dupErr = ensureUniqueIds(validated.value.root, new Set());
  if (dupErr) return { ok: false, error: dupErr };
  return { ok: true, value: { tree: validated.value, doc } };
}

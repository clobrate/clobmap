/**
 * The clobmap skill's engine: load → mutate the tree → save, going through
 * clobmap's own model layer so every edit is validated and round-trips
 * (comments + key order preserved via the live YAML AST). This is the ONLY way
 * the skill mutates a document — never hand-written YAML.
 *
 * The pure model (`src/model`) is imported directly (§11.4); all disk I/O is
 * Node `fs` (the app's `fsAdapter` is Tauri-only — this is its Node twin).
 */
import { promises as fs } from "node:fs";
import {
  parseLiveYaml,
  serializeLiveYaml,
  applyTreeToDocument,
  type LiveParseResult,
} from "../../src/model";
import type { MindDocument } from "../../src/model/types";

/** The live document: the parsed tree + the YAML AST that carries comments/order. */
export type LiveDoc = LiveParseResult;

/** Read + parse a `.clobmap.yaml`. Throws a clean error with line/message. */
export async function loadDoc(path: string): Promise<LiveDoc> {
  let text: string;
  try {
    text = await fs.readFile(path, "utf8");
  } catch {
    throw new Error(`Cannot read file: ${path}`);
  }
  const result = parseLiveYaml(text);
  if (!result.ok) {
    throw new Error(`Invalid clobmap YAML (${path}): line ${result.error.line} — ${result.error.message}`);
  }
  return result.value;
}

/** Serialize the live AST back to YAML text. */
export function serialize(live: LiveDoc): string {
  return serializeLiveYaml(live.doc);
}

/** Write text to `path` atomically (temp file → rename) so a crash never
 * truncates the document. */
export async function atomicWrite(path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, path);
}

/**
 * Load a document, apply a pure tree mutation, and write it back — the standard
 * edit path. `mutate` returns a new `MindDocument` (typically the result of a
 * `src/model` op). With `dryRun`, returns the new text without writing.
 */
export async function withDoc(
  path: string,
  mutate: (tree: MindDocument) => MindDocument,
  opts: { dryRun?: boolean } = {},
): Promise<string> {
  const live = await loadDoc(path);
  const next = mutate(live.tree);
  applyTreeToDocument(live.doc, next);
  const text = serialize(live);
  if (!opts.dryRun) await atomicWrite(path, text);
  return text;
}

/**
 * Small shared resolvers used by both the CLI dispatch (`cli.ts`) and the
 * batch op applier (`batch.ts`). Kept in their own module so batch can reuse
 * them without a circular import back into `cli.ts`.
 */
import { findTagById } from "../../src/model";
import type { HandleSide, MindDocument, TagNode } from "../../src/model/types";
import { inferMode, type NoteStorageMode } from "./notes-fs";

export function req<T>(v: T | undefined, msg: string): T {
  if (v === undefined || v === null || v === "") throw new Error(msg);
  return v;
}

export function resolveMode(
  flag: string | undefined,
  tree: MindDocument,
  folder: string,
): NoteStorageMode {
  if (flag === "inline" || flag === "folder") return flag;
  if (flag !== undefined) throw new Error("--notes-mode must be 'inline' or 'folder'");
  return inferMode(tree, folder);
}

/** Resolve a tag reference (tag-node id | name) to a tag-node id. */
export function resolveTagId(tree: MindDocument, ref: string): string {
  if (!tree.tagRoot) throw new Error("This document has no tags.");
  if (findTagById(tree, ref)) return ref;
  const matches: string[] = [];
  const walk = (t: TagNode, isRoot: boolean): void => {
    if (!isRoot && t.name.toLowerCase() === ref.toLowerCase()) matches.push(t.id);
    for (const c of t.children) walk(c, false);
  };
  walk(tree.tagRoot, true);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw new Error(`Ambiguous tag "${ref}" — ${matches.length} match; use a tag id.`);
  throw new Error(`Tag not found: "${ref}".`);
}

export function tagList(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const SIDES: readonly HandleSide[] = ["top", "right", "bottom", "left"];

export function asSide(v: string, flag: string): HandleSide {
  if ((SIDES as readonly string[]).includes(v)) return v as HandleSide;
  throw new Error(`${flag} must be one of: ${SIDES.join(", ")}`);
}

export function asNum(v: string, flag: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${flag} must be a number`);
  return n;
}

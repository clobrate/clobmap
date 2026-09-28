/**
 * JSON op-list batch applier (§11.6). Applies many ops to ONE in-memory tree,
 * in order, so the caller serializes + writes once (atomic). A single bad op
 * throws and aborts the whole batch — nothing is written. Each op mirrors a
 * CLI mutation command: `{ "op": "add-child", "parent": "...", "text": "..." }`.
 */
import {
  addChild,
  addSibling,
  deleteNode,
  duplicateNode,
  moveNode,
  moveSibling,
  updateNode,
  updateText,
  setLayoutMode,
  clearAllPositions,
  tagsAdd,
  tagsRemove,
  updateTagName,
  tagDelete,
  moveTagNode,
  moveTagSibling,
  type IdGenerator,
} from "../../src/model";
import type { HandleSide, MindDocument } from "../../src/model/types";
import { coerceNotesFolder, DEFAULT_NOTES_FOLDER } from "../../src/lib/notesFolder";
import { resolveNodeId } from "./addressing";
import { readNote, writeNote, joinAppend, joinPrepend } from "./notes-fs";
import { resolveMode, resolveTagId, asSide } from "./helpers";

export interface Op {
  op: string;
  [key: string]: unknown;
}

export interface BatchContext {
  file: string;
  dryRun: boolean;
}

function str(v: unknown, name: string): string {
  if (typeof v !== "string" || v === "") throw new Error(`op field "${name}": expected a non-empty string`);
  return v;
}
function num(v: unknown, name: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`op field "${name}": expected a number`);
  return n;
}
function optNum(v: unknown, name: string): number | undefined {
  return v === undefined ? undefined : num(v, name);
}
function dirOf(v: unknown): "up" | "down" {
  if (v === "up" || v === "down") return v;
  throw new Error('op field "dir": expected "up" or "down"');
}
function namesOf(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map((x) => String(x)) : typeof v === "string" ? v.split(",") : [];
  const names = raw.map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) throw new Error('op field "tags": expected a non-empty list or "a,b"');
  return names;
}

/** Apply a single op, returning the next tree + the ids it touched. */
async function applyOp(
  tree: MindDocument,
  ids: IdGenerator,
  op: Op,
  ctx: BatchContext,
): Promise<{ doc: MindDocument; affected: string[] }> {
  const noteWrite = async (id: string, content: string): Promise<MindDocument> => {
    const folder = coerceNotesFolder(str(op.notesFolder ?? DEFAULT_NOTES_FOLDER, "notesFolder"));
    const mode = resolveMode(op.notesMode as string | undefined, tree, folder);
    return writeNote(tree, id, content, ctx.file, { mode, folder, dryRun: ctx.dryRun });
  };

  switch (op.op) {
    case "add-child": {
      const res = addChild(tree, resolveNodeId(tree, str(op.parent, "parent")), str(op.text, "text"), ids, optNum(op.index, "index"));
      return { doc: res.doc, affected: [res.newId] };
    }
    case "add-sibling": {
      const res = addSibling(tree, resolveNodeId(tree, str(op.after, "after")), str(op.text, "text"), ids);
      return { doc: res.doc, affected: [res.newId] };
    }
    case "rename": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      return { doc: updateText(tree, id, str(op.text, "text")), affected: [id] };
    }
    case "delete": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      return { doc: deleteNode(tree, id), affected: [id] };
    }
    case "duplicate": {
      const res = duplicateNode(tree, resolveNodeId(tree, str(op.ref, "ref")), ids);
      return { doc: res.doc, affected: [res.newId] };
    }
    case "move": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      return { doc: moveNode(tree, id, resolveNodeId(tree, str(op.to, "to")), optNum(op.index, "index")), affected: [id] };
    }
    case "reorder": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      return { doc: moveSibling(tree, id, dirOf(op.dir)), affected: [id] };
    }
    case "collapse": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      return { doc: updateNode(tree, id, { collapsed: Boolean(op.on) }), affected: [id] };
    }
    case "color-set": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      return { doc: updateNode(tree, id, { color: str(op.color, "color") }), affected: [id] };
    }
    case "color-clear": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      return { doc: updateNode(tree, id, { color: "" }), affected: [id] };
    }
    case "size": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      const patch: { maxWidth?: number; maxHeight?: number } = {};
      if (op.maxWidth !== undefined) patch.maxWidth = num(op.maxWidth, "maxWidth");
      if (op.maxHeight !== undefined) patch.maxHeight = num(op.maxHeight, "maxHeight");
      if (op.maxWidth === undefined && op.maxHeight === undefined) {
        throw new Error('op "size": maxWidth and/or maxHeight is required');
      }
      return { doc: updateNode(tree, id, patch), affected: [id] };
    }
    case "layout": {
      const mode = op.mode === "manual" ? "manual" : op.mode === "auto" ? "auto" : undefined;
      if (!mode) throw new Error('op "layout": mode must be "auto" or "manual"');
      return { doc: setLayoutMode(tree, mode), affected: ["document"] };
    }
    case "pos-set": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      const manual = setLayoutMode(tree, "manual");
      return { doc: updateNode(manual, id, { position: { x: num(op.x, "x"), y: num(op.y, "y") } }), affected: [id] };
    }
    case "pos-clear": {
      if (op.ref !== undefined) {
        const id = resolveNodeId(tree, str(op.ref, "ref"));
        return { doc: updateNode(tree, id, { position: undefined }), affected: [id] };
      }
      return { doc: clearAllPositions(tree), affected: ["document"] };
    }
    case "edge-side": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      const patch: { edgeFrom?: HandleSide; edgeTo?: HandleSide } = {};
      if (op.from !== undefined) patch.edgeFrom = asSide(str(op.from, "from"), "from");
      if (op.to !== undefined) patch.edgeTo = asSide(str(op.to, "to"), "to");
      if (op.from === undefined && op.to === undefined) throw new Error('op "edge-side": from and/or to is required');
      return { doc: updateNode(setLayoutMode(tree, "manual"), id, patch), affected: [id] };
    }
    case "note-set":
    case "note-append":
    case "note-prepend": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      const text = str(op.text, "text");
      const existing = op.op === "note-set" ? "" : await readNote(tree, id, ctx.file);
      const content =
        op.op === "note-append" ? joinAppend(existing, text) : op.op === "note-prepend" ? joinPrepend(existing, text) : text;
      return { doc: await noteWrite(id, content), affected: [id] };
    }
    case "note-clear": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      return { doc: await noteWrite(id, ""), affected: [id] };
    }
    case "tag-add": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      return { doc: tagsAdd(tree, id, namesOf(op.tags), ids), affected: [id] };
    }
    case "tag-remove": {
      const id = resolveNodeId(tree, str(op.ref, "ref"));
      return { doc: tagsRemove(tree, id, namesOf(op.tags)), affected: [id] };
    }
    case "tag-rename": {
      const tagId = resolveTagId(tree, str(op.old, "old"));
      return { doc: updateTagName(tree, tagId, str(op.new, "new")), affected: [tagId] };
    }
    case "tag-delete": {
      const tagId = resolveTagId(tree, str(op.name, "name"));
      return { doc: tagDelete(tree, tagId), affected: [tagId] };
    }
    case "tag-move": {
      const tagId = resolveTagId(tree, str(op.tag, "tag"));
      const parentId = op.under !== undefined ? resolveTagId(tree, str(op.under, "under")) : tree.tagRoot!.id;
      return { doc: moveTagNode(tree, tagId, parentId), affected: [tagId] };
    }
    case "tag-reorder": {
      const tagId = resolveTagId(tree, str(op.tag, "tag"));
      return { doc: moveTagSibling(tree, tagId, dirOf(op.dir)), affected: [tagId] };
    }
    default:
      throw new Error(`Unknown op: "${op.op}"`);
  }
}

/**
 * Apply every op in order to one tree. Ops that create nodes/tags share the
 * caller's id generator so ids stay unique across the batch. Throws (aborting
 * the batch) on the first bad op — the caller must not write on throw.
 */
export async function applyOps(
  tree: MindDocument,
  ids: IdGenerator,
  ops: unknown,
  ctx: BatchContext,
): Promise<{ doc: MindDocument; affected: string[] }> {
  if (!Array.isArray(ops)) throw new Error("ops file must be a JSON array of ops");
  let doc = tree;
  const affected: string[] = [];
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i] as Op;
    if (!op || typeof op !== "object" || typeof op.op !== "string") {
      throw new Error(`op[${i}]: each op needs a string "op" field`);
    }
    try {
      const res = await applyOp(doc, ids, op, ctx);
      doc = res.doc;
      affected.push(...res.affected);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`op[${i}] (${op.op}): ${msg}`, { cause: e });
    }
  }
  return { doc, affected };
}

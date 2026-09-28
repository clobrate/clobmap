/**
 * Targeted coverage for edge branches the happy-path suites miss:
 * fenced-code heading skip, the inline→sidecar overflow, a broken note-file
 * ref, tag-name ambiguity, and the "(no changes)" dry-run diff.
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli";
import { loadDoc } from "../core";
import { findById } from "../../../src/model";
import { demoteHeadings } from "../export";
import { resolveTagId } from "../helpers";
import { NOTES_INLINE_LIMIT } from "../../../src/lib/notes";
import type { MindDocument } from "../../../src/model/types";

const FIXTURE = `title: Test
version: 1
root:
  id: n1
  text: Root
  children:
    - id: n2
      text: Venue
      children: []
`;
async function fresh(content = FIXTURE): Promise<{ dir: string; file: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-edge-"));
  const file = path.join(dir, "d.clobmap.yaml");
  await fs.writeFile(file, content, "utf8");
  return { dir, file };
}

describe("demoteHeadings", () => {
  it("demotes real headings but leaves headings inside fenced code alone", () => {
    const body = ["# Real", "", "```md", "# not a heading", "```", "~~~", "## also code", "~~~", "# Real2"].join("\n");
    const out = demoteHeadings(body).split("\n");
    expect(out[0]).toBe("## Real"); // demoted
    expect(out[3]).toBe("# not a heading"); // inside ``` fence — untouched
    expect(out[6]).toBe("## also code"); // inside ~~~ fence — untouched
    expect(out[8]).toBe("## Real2"); // demoted
  });
});

describe("notes — inline overflow + broken ref", () => {
  it("inline mode spills to a hidden sidecar past the inline cap", async () => {
    const { dir, file } = await fresh();
    const big = "x".repeat(NOTES_INLINE_LIMIT + 50);
    await run(["note-set", file, "n2", "--text", big, "--notes-mode", "inline"]);
    const notes = findById((await loadDoc(file)).tree, "n2")!.notes!;
    expect(notes).not.toBe(big); // stored as a path, not inline
    expect(notes.endsWith(".md")).toBe(true);
    const abs = path.join(dir, notes.replace(/^\.\//, ""));
    expect(await fs.readFile(abs, "utf8")).toBe(big);
    // And note-get reads it back.
    expect((await run(["note-get", file, "n2"])).out).toBe(big);
  });

  it("note-get returns empty when the note file ref is missing", async () => {
    const { file } = await fresh(FIXTURE.replace("children: []", 'notes: ./notelets/gone.md\n      children: []'));
    const r = await run(["note-get", file, "n2"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
  });
});

describe("resolveTagId", () => {
  // The loader enforces unique tag names, so the ambiguity guard is only
  // reachable on an in-memory tree — test the pure resolver directly.
  const dupTree: MindDocument = {
    title: "T",
    root: { id: "n1", text: "Root", children: [] },
    tagRoot: {
      id: "t0",
      name: "tags",
      children: [
        { id: "t1", name: "dup", children: [] },
        { id: "t2", name: "dup", children: [] },
      ],
    },
  };

  it("errors when a tag name matches more than one tag node", () => {
    expect(() => resolveTagId(dupTree, "dup")).toThrow(/Ambiguous tag "dup"/);
  });
  it("resolves an unambiguous name and an exact id", () => {
    const single: MindDocument = {
      ...dupTree,
      tagRoot: { id: "t0", name: "tags", children: [{ id: "t1", name: "solo", children: [] }] },
    };
    expect(resolveTagId(single, "solo")).toBe("t1");
    expect(resolveTagId(single, "t1")).toBe("t1"); // exact id
    expect(() => resolveTagId(single, "missing")).toThrow(/Tag not found/); // present tree, absent name
  });
  it("errors on a document with no tags", () => {
    expect(() => resolveTagId({ title: "T", root: { id: "n1", text: "R", children: [] } }, "x")).toThrow(/no tags/);
  });
});

describe("dry-run no-op diff", () => {
  it('shows "(no changes)" when a rename does not change anything', async () => {
    const { file } = await fresh();
    const r = await run(["rename", file, "n2", "--text", "Venue", "--dry-run"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe("(no changes)");
  });
});

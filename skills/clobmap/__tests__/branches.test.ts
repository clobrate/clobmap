/**
 * Branch-coverage tests for the remaining reachable branches: pure note-fs
 * join/guard paths, the outline "(untitled)" fallback + tagless/colorless
 * nodes, resolveMode / asNum validation, edge-side with neither side, and a
 * mismatched code fence in demoteHeadings.
 */
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli";
import { joinAppend, joinPrepend, inferMode, readNote, writeNote } from "../notes-fs";
import { outline } from "../format";
import { demoteHeadings } from "../export";
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
async function fresh(): Promise<{ dir: string; file: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-br-"));
  const file = path.join(dir, "d.clobmap.yaml");
  await fs.writeFile(file, FIXTURE, "utf8");
  return { dir, file };
}
const tree = (root: MindDocument["root"], title?: string): MindDocument => ({
  title: title as string,
  root,
});

describe("notes-fs — pure join + guards", () => {
  it("joinAppend: empty existing, and existing already ending in newline", () => {
    expect(joinAppend("", "x")).toBe("x");
    expect(joinAppend("a\n", "b")).toBe("a\nb"); // no doubled newline
    expect(joinAppend("a", "b")).toBe("a\nb");
  });
  it("joinPrepend: empty existing, and text already ending in newline", () => {
    expect(joinPrepend("", "x")).toBe("x");
    expect(joinPrepend("a", "b\n")).toBe("b\na"); // text ends in newline — no doubled newline
    expect(joinPrepend("a", "b")).toBe("b\na");
  });
  it("inferMode is inline when notes exist but point outside the folder", () => {
    const t = tree({ id: "n1", text: "R", notes: "other/x.md", children: [] });
    expect(inferMode(t, "notelets")).toBe("inline");
  });
  it("readNote / writeNote throw on an unknown node id", async () => {
    const { file } = await fresh();
    const doc = tree({ id: "n1", text: "R", children: [] });
    await expect(readNote(doc, "nope", file)).rejects.toThrow(/Node not found/);
    await expect(writeNote(doc, "nope", "x", file, { mode: "inline", folder: "notelets" })).rejects.toThrow(
      /Node not found/,
    );
  });
});

describe("format — outline branches", () => {
  it("falls back to (untitled) and renders a plain node", () => {
    const out = outline(tree({ id: "n1", text: "Solo", children: [] }));
    expect(out).toBe("(untitled)\nSolo [n1]");
  });
  it("shows tags and color when present", () => {
    const out = outline(
      tree({ id: "n1", text: "Root", color: "#abc", tags: ["a", "b"], children: [] }, "T"),
    );
    expect(out).toBe("T\nRoot [n1]  #a #b  (#abc)");
  });
});

describe("cli — validation branches", () => {
  it("resolveMode rejects an invalid --notes-mode", async () => {
    const { file } = await fresh();
    const r = await run(["note-set", file, "n2", "--text", "x", "--notes-mode", "bogus"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--notes-mode must be 'inline' or 'folder'/);
  });
  it("asNum rejects a non-numeric --max-width", async () => {
    const { file } = await fresh();
    const r = await run(["size", file, "n2", "--max-width", "abc"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--max-width must be a number/);
  });
  it("edge-side errors when neither --from nor --to is given", async () => {
    const { file } = await fresh();
    const r = await run(["edge-side", file, "n2"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--from and\/or --to is required/);
  });
});

describe("demoteHeadings — mismatched fence", () => {
  it("a different fence marker inside a fence does not close it", () => {
    // Inside a ``` fence, a ~~~ line must NOT end the fence, so the heading
    // after it stays inside the fence and is left untouched.
    const body = ["```", "~~~", "# still code", "```", "# real"].join("\n");
    const out = demoteHeadings(body).split("\n");
    expect(out[2]).toBe("# still code"); // untouched (inside fence)
    expect(out[4]).toBe("## real"); // demoted (outside fence)
  });
});

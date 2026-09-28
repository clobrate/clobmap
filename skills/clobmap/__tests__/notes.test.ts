import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli";
import { loadDoc } from "../core";
import { findById } from "../../../src/model";

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

async function fresh(content = FIXTURE): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-"));
  const p = path.join(dir, "d.clobmap.yaml");
  await fs.writeFile(p, content, "utf8");
  return p;
}
async function notesOf(p: string, id: string): Promise<string | undefined> {
  return findById((await loadDoc(p)).tree, id)?.notes;
}

describe("cli — notes (inline mode)", () => {
  it("note-set stores content inline (default infer → inline)", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "Reception booked"]);
    expect(await notesOf(p, "n2")).toBe("Reception booked");
  });

  it("note-get returns the content", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "hello"]);
    const r = await run(["note-get", p, "n2"]);
    expect(r.out).toBe("hello");
  });

  it("note-append adds to the end on a new line", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "line1"]);
    await run(["note-append", p, "n2", "--text", "line2"]);
    expect(await notesOf(p, "n2")).toBe("line1\nline2");
  });

  it("note-prepend adds to the start", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "body"]);
    await run(["note-prepend", p, "n2", "--text", "# Title"]);
    expect(await notesOf(p, "n2")).toBe("# Title\nbody");
  });

  it("note-clear removes an inline note", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "x"]);
    await run(["note-clear", p, "n2"]);
    expect(await notesOf(p, "n2")).toBeUndefined();
  });
});

describe("cli — notes (folder mode)", () => {
  it("note-set writes a per-node .md file and stores its rel path", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "Hello", "--notes-mode", "folder"]);
    expect(await notesOf(p, "n2")).toBe("./notelets/n2-Venue.md");
    const file = path.join(path.dirname(p), "notelets", "n2-Venue.md");
    expect(await fs.readFile(file, "utf8")).toBe("Hello");
  });

  it("infers folder mode once a node points at a folder file", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "a", "--notes-mode", "folder"]);
    // No --notes-mode now → should infer folder and keep writing to the file.
    await run(["note-append", p, "n2", "--text", "b"]);
    const file = path.join(path.dirname(p), "notelets", "n2-Venue.md");
    expect(await fs.readFile(file, "utf8")).toBe("a\nb");
    expect(await notesOf(p, "n2")).toBe("./notelets/n2-Venue.md");
  });

  it("note-clear keeps an empty reusable file in folder mode", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "x", "--notes-mode", "folder"]);
    await run(["note-clear", p, "n2"]);
    const file = path.join(path.dirname(p), "notelets", "n2-Venue.md");
    expect(await fs.readFile(file, "utf8")).toBe("");
    expect(await notesOf(p, "n2")).toBe("./notelets/n2-Venue.md");
  });
});

describe("cli — notes safety + dry-run", () => {
  it("refuses to read a note file outside the document's folder", async () => {
    const p = await fresh(FIXTURE.replace("children: []", 'notes: "../secret.md"\n      children: []'));
    const r = await run(["note-get", p, "n2"]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/outside the document/i);
  });

  it("--dry-run writes no file and does not change the doc", async () => {
    const p = await fresh();
    const before = await fs.readFile(p, "utf8");
    await run(["note-set", p, "n2", "--text", "X", "--notes-mode", "folder", "--dry-run"]);
    expect(await fs.readFile(p, "utf8")).toBe(before); // doc untouched
    await expect(fs.access(path.join(path.dirname(p), "notelets", "n2-Venue.md"))).rejects.toThrow(); // no file
  });
});

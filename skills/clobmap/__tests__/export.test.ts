import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../cli";

const FIXTURE = `title: Test
version: 1
root:
  id: n1
  text: Root
  children:
    - id: n2
      text: Venue
      children: []
    - id: n3
      text: Guests
      children: []
`;

async function fresh(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clob-"));
  const p = path.join(dir, "d.clobmap.yaml");
  await fs.writeFile(p, FIXTURE, "utf8");
  return p;
}

describe("cli — export-notes", () => {
  it("emits the app's section format (title/id, tags, color, body)", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "Booked the hall"]);
    await run(["tag-add", p, "n2", "--tags", "work,urgent"]);
    await run(["color-set", p, "n2", "--color", "#f59e0b"]);
    const r = await run(["export-notes", p]);
    expect(r.code).toBe(0);
    // Node with content, tags, color.
    expect(r.out).toContain("# Venue (n2)\n\ntags: work, urgent\ncolor: #f59e0b\n\nBooked the hall\n");
    // Node without notes/tags → placeholder + <none>, no color line.
    expect(r.out).toContain("# Guests (n3)\n\ntags: <none>\n\n__ no notes found __\n");
    expect(r.out).not.toContain("# Guests (n3)\n\ntags: <none>\ncolor:");
  });

  it("demotes headings inside the note body", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "# Heading\n\nbody"]);
    const r = await run(["export-notes", p]);
    expect(r.out).toContain("## Heading");
  });

  it("--out writes the markdown to a file", async () => {
    const p = await fresh();
    await run(["note-set", p, "n2", "--text", "hi"]);
    const out = path.join(path.dirname(p), "notes.md");
    await run(["export-notes", p, "--out", out]);
    const md = await fs.readFile(out, "utf8");
    expect(md).toContain("# Venue (n2)");
    expect(md).toContain("hi");
  });
});

describe("cli — find", () => {
  it("finds by text substring", async () => {
    const r = await run(["find", await fresh(), "--text", "ven"]);
    expect(r.out).toBe("Venue [n2]");
  });

  it("finds by tag (--json)", async () => {
    const p = await fresh();
    await run(["tag-add", p, "n3", "--tags", "vip"]);
    const r = await run(["find", p, "--tag", "vip", "--json"]);
    expect(JSON.parse(r.out).matches).toEqual([{ id: "n3", text: "Guests" }]);
  });

  it("errors when no filter is given", async () => {
    const r = await run(["find", await fresh()]);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/--text.*--tag.*--color/);
  });
});

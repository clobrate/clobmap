import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLiveYaml, parseYaml } from "../parse";
import { serializeLiveYaml, serializeYaml } from "../serialize";

const FIXTURES_DIR = join(fileURLToPath(new URL("./fixtures/", import.meta.url)));

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f: string) => f.endsWith(".yaml"))
    .sort();
}

describe("parseYaml", () => {
  it("parses a minimal document", () => {
    const r = parseYaml(loadFixture("01-minimal.yaml"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.title).toBe("Minimal");
    expect(r.value.root.id).toBe("n1");
    expect(r.value.root.children).toEqual([]);
  });

  it("captures optional fields", () => {
    const r = parseYaml(loadFixture("04-optional-fields.yaml"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.version).toBe(1);
    expect(r.value.root.note).toBe("This is the root node");
    expect(r.value.root.color).toBe("#ff0000");
    expect(r.value.root.collapsed).toBe(false);
    expect(r.value.root.children[0].collapsed).toBe(true);
  });

  it("rejects malformed YAML with line/col info", () => {
    const r = parseYaml("title: foo\nroot:\n  id: [unclosed\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/.+/);
    expect(r.error.line).toBeGreaterThan(0);
    expect(r.error.col).toBeGreaterThan(0);
  });

  it("rejects missing title", () => {
    const r = parseYaml("root:\n  id: n1\n  text: x\n  children: []\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/title/);
  });

  it("rejects missing id on a node", () => {
    const r = parseYaml(`title: x
root:
  text: missing id
  children: []
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/id/);
  });

  it("rejects unknown top-level fields", () => {
    const r = parseYaml(`title: x
mystery: 1
root:
  id: n1
  text: x
  children: []
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/mystery/);
  });

  it("rejects unknown node fields", () => {
    const r = parseYaml(`title: x
root:
  id: n1
  text: x
  unknown: nope
  children: []
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/unknown/);
  });

  it("rejects duplicate ids", () => {
    const r = parseYaml(`title: x
root:
  id: n1
  text: x
  children:
    - id: n2
      text: a
      children: []
    - id: n2
      text: b
      children: []
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/duplicate/i);
  });

  it("rejects non-array children", () => {
    const r = parseYaml(`title: x
root:
  id: n1
  text: x
  children: 5
`);
    expect(r.ok).toBe(false);
  });

  it("does not throw on totally invalid input", () => {
    const r = parseYaml("@@@");
    expect(r.ok).toBe(false);
  });

  it("rejects non-mapping document", () => {
    const r = parseYaml("- 1\n- 2\n");
    expect(r.ok).toBe(false);
  });
});

describe("round-trip parse → serialize → parse", () => {
  for (const name of listFixtures()) {
    it(`is stable for ${name}`, () => {
      const text = loadFixture(name);
      const a = parseYaml(text);
      expect(a.ok).toBe(true);
      if (!a.ok) return;
      const reserialized = serializeYaml(a.value);
      const b = parseYaml(reserialized);
      expect(b.ok).toBe(true);
      if (!b.ok) return;
      expect(b.value).toEqual(a.value);
    });
  }
});

describe("parseLiveYaml + serializeLiveYaml round-trips text", () => {
  for (const name of listFixtures()) {
    it(`preserves text for ${name}`, () => {
      const text = loadFixture(name);
      const r = parseLiveYaml(text);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const out = serializeLiveYaml(r.value.doc);
      const reparsed = parseYaml(out);
      expect(reparsed.ok).toBe(true);
      if (!reparsed.ok) return;
      expect(reparsed.value).toEqual(r.value.tree);
    });
  }
});

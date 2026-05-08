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

  it("rejects missing text on a node", () => {
    const r = parseYaml(`title: x
root:
  id: n1
  children: []
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/text/);
  });

  it("rejects a child entry that is not a mapping", () => {
    const r = parseYaml(`title: x
root:
  id: n1
  text: root
  children:
    - just a string
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/expected mapping/);
  });

  it("rejects a document missing the root field", () => {
    const r = parseYaml(`title: x
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/root/);
  });

  it("treats explicit null children as an empty list", () => {
    const r = parseYaml(`title: x
root:
  id: n1
  text: root
  children: ~
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.root.children).toEqual([]);
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

  it("accepts maxWidth and maxHeight as positive numbers", () => {
    const r = parseYaml(`
title: T
root:
  id: n1
  text: Root
  maxWidth: 320
  maxHeight: 180
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.root.maxWidth).toBe(320);
    expect(r.value.root.maxHeight).toBe(180);
  });

  it("ignores non-positive maxWidth / maxHeight", () => {
    const r = parseYaml(`
title: T
root:
  id: n1
  text: Root
  maxWidth: 0
  maxHeight: -10
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.root.maxWidth).toBeUndefined();
    expect(r.value.root.maxHeight).toBeUndefined();
  });

  it("preserves multi-line text via YAML literal block scalar", () => {
    const r = parseYaml(`
title: T
root:
  id: n1
  text: |
    line one
    line two
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // YAML's `|` literal scalar preserves newlines but typically appends one
    // trailing newline; we just confirm both lines round-tripped.
    expect(r.value.root.text).toContain("line one");
    expect(r.value.root.text).toContain("line two");
  });

  it("accepts top-level layoutMode", () => {
    const r = parseYaml(`
title: T
layoutMode: manual
root:
  id: n1
  text: Root
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.layoutMode).toBe("manual");
  });

  it("rejects invalid layoutMode values gracefully (treats as absent)", () => {
    const r = parseYaml(`
title: T
layoutMode: garbage
root:
  id: n1
  text: Root
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.layoutMode).toBeUndefined();
  });

  it("accepts per-node position with finite x/y numbers", () => {
    const r = parseYaml(`
title: T
layoutMode: manual
root:
  id: n1
  text: Root
  position:
    x: 100
    y: 200
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.root.position).toEqual({ x: 100, y: 200 });
  });

  it("ignores position when x or y is missing / non-numeric", () => {
    const r = parseYaml(`
title: T
root:
  id: n1
  text: Root
  position:
    x: 100
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.root.position).toBeUndefined();
  });

  it("accepts per-node sourceHandle / targetHandle", () => {
    const r = parseYaml(`
title: T
root:
  id: n1
  text: Root
  sourceHandle: bottom
  targetHandle: top
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.root.sourceHandle).toBe("bottom");
    expect(r.value.root.targetHandle).toBe("top");
  });

  it("ignores invalid handle sides (treats as absent)", () => {
    const r = parseYaml(`
title: T
root:
  id: n1
  text: Root
  sourceHandle: diagonal
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.root.sourceHandle).toBeUndefined();
  });

  it("round-trips sourceHandle / targetHandle through serialize", () => {
    const original = parseYaml(`
title: T
root:
  id: n1
  text: Root
  sourceHandle: bottom
  targetHandle: top
  children: []
`);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const reserialized = serializeYaml(original.value);
    const reparsed = parseYaml(reserialized);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.root.sourceHandle).toBe("bottom");
    expect(reparsed.value.root.targetHandle).toBe("top");
  });

  it("round-trips layoutMode + position through serialize", () => {
    const original = parseYaml(`
title: T
layoutMode: manual
root:
  id: n1
  text: Root
  position:
    x: 100
    y: 200
  children: []
`);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const reserialized = serializeYaml(original.value);
    const reparsed = parseYaml(reserialized);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.layoutMode).toBe("manual");
    expect(reparsed.value.root.position).toEqual({ x: 100, y: 200 });
  });

  it("round-trips maxWidth / maxHeight through serialize", () => {
    const original = parseYaml(`
title: T
root:
  id: n1
  text: Root
  maxWidth: 320
  maxHeight: 180
  children: []
`);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const reserialized = serializeYaml(original.value);
    const reparsed = parseYaml(reserialized);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.root.maxWidth).toBe(320);
    expect(reparsed.value.root.maxHeight).toBe(180);
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

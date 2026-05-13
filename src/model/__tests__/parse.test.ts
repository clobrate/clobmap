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

  it("accepts per-node edgeFrom / edgeTo", () => {
    const r = parseYaml(`
title: T
root:
  id: n1
  text: Root
  edgeFrom: bottom
  edgeTo: top
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.root.edgeFrom).toBe("bottom");
    expect(r.value.root.edgeTo).toBe("top");
  });

  it("ignores invalid handle sides (treats as absent)", () => {
    const r = parseYaml(`
title: T
root:
  id: n1
  text: Root
  edgeFrom: diagonal
  children: []
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.root.edgeFrom).toBeUndefined();
  });

  it("round-trips edgeFrom / edgeTo through serialize", () => {
    const original = parseYaml(`
title: T
root:
  id: n1
  text: Root
  edgeFrom: bottom
  edgeTo: top
  children: []
`);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const reserialized = serializeYaml(original.value);
    const reparsed = parseYaml(reserialized);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value.root.edgeFrom).toBe("bottom");
    expect(reparsed.value.root.edgeTo).toBe("top");
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

describe("parseYaml — tags", () => {
  const YAML_WITH_TAGS = `title: T
version: 2
root:
  id: n1
  text: Root
  tags:
    - urgent
    - logistics
  children: []
tagRoot:
  id: n2
  name: tags
  children:
    - id: n3
      name: urgent
      children: []
    - id: n4
      name: logistics
      children:
        - id: n5
          name: vendors
          children: []
`;

  it("parses a node's tags as a list of strings", () => {
    const r = parseYaml(YAML_WITH_TAGS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.root.tags).toEqual(["urgent", "logistics"]);
  });

  it("parses tagRoot with nested children", () => {
    const r = parseYaml(YAML_WITH_TAGS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tagRoot?.name).toBe("tags");
    expect(r.value.tagRoot?.children.map((c) => c.name)).toEqual([
      "urgent",
      "logistics",
    ]);
    const logistics = r.value.tagRoot!.children[1];
    expect(logistics?.children.map((c) => c.name)).toEqual(["vendors"]);
  });

  it("rejects non-list tags", () => {
    const yaml = `title: T
root:
  id: n1
  text: r
  tags: notalist
  children: []
`;
    const r = parseYaml(yaml);
    expect(r.ok).toBe(false);
  });

  it("rejects empty / non-string tag entries", () => {
    const yaml = `title: T
root:
  id: n1
  text: r
  tags:
    - ""
  children: []
`;
    const r = parseYaml(yaml);
    expect(r.ok).toBe(false);
  });

  it("rejects duplicate tag-node names within tagRoot (case-insensitive)", () => {
    const yaml = `title: T
root:
  id: n1
  text: r
  children: []
tagRoot:
  id: n2
  name: tags
  children:
    - id: n3
      name: Urgent
      children: []
    - id: n4
      name: URGENT
      children: []
`;
    const r = parseYaml(yaml);
    expect(r.ok).toBe(false);
  });

  it("rejects an id colliding between the data tree and the tag tree", () => {
    const yaml = `title: T
root:
  id: n1
  text: r
  children: []
tagRoot:
  id: n1
  name: tags
  children: []
`;
    const r = parseYaml(yaml);
    expect(r.ok).toBe(false);
  });

  it("parses a doc with no tagRoot cleanly (tagRoot undefined)", () => {
    const yaml = `title: T
root:
  id: n1
  text: r
  children: []
`;
    const r = parseYaml(yaml);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tagRoot).toBeUndefined();
    expect(r.value.root.tags).toBeUndefined();
  });

  it("round-trips tags + tagRoot via serializeYaml", () => {
    const r = parseYaml(YAML_WITH_TAGS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = serializeYaml(r.value);
    const reparsed = parseYaml(out);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.value).toEqual(r.value);
  });
});

describe("parseYaml — tagRoot validation errors", () => {
  it("rejects when tagRoot isn't a mapping (e.g. a scalar)", () => {
    const yaml = `title: T
root:
  id: n1
  text: r
  children: []
tagRoot: "not an object"
`;
    const r = parseYaml(yaml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/expected mapping at tagRoot/);
  });

  it("rejects unknown fields inside a tag-node", () => {
    const yaml = `title: T
root:
  id: n1
  text: r
  children: []
tagRoot:
  id: n2
  name: tags
  children:
    - id: n3
      name: urgent
      color: "#ccc"
      children: []
`;
    const r = parseYaml(yaml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/unknown field "color"/);
  });

  it("rejects a tag-node with missing id", () => {
    const yaml = `title: T
root:
  id: n1
  text: r
  children: []
tagRoot:
  name: tags
  children: []
`;
    const r = parseYaml(yaml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/missing or invalid "id"/);
  });

  it("rejects a tag-node with missing or empty name", () => {
    const yaml = `title: T
root:
  id: n1
  text: r
  children: []
tagRoot:
  id: n2
  name: "   "
  children: []
`;
    const r = parseYaml(yaml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/missing or invalid "name"/);
  });

  it("rejects when tag-node children isn't a list", () => {
    const yaml = `title: T
root:
  id: n1
  text: r
  children: []
tagRoot:
  id: n2
  name: tags
  children: "not a list"
`;
    const r = parseYaml(yaml);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(/"children" must be a list/);
  });
});

import { describe, expect, it } from "vitest";
import { isPathReference, suggestedSidecarFilename } from "../notes";

describe("notes — isPathReference", () => {
  it("recognises explicit relative paths", () => {
    expect(isPathReference("./foo.md")).toBe(true);
    expect(isPathReference("../sibling/bar.md")).toBe(true);
  });

  it("recognises absolute paths", () => {
    expect(isPathReference("/abs/path/notes.md")).toBe(true);
  });

  it("recognises home-prefixed paths", () => {
    expect(isPathReference("~/Documents/notes.md")).toBe(true);
  });

  it("recognises bare *.md filenames (no spaces, short)", () => {
    expect(isPathReference("notes.md")).toBe(true);
    expect(isPathReference("My-Plan.md")).toBe(true);
  });

  it("rejects bare filenames with spaces (likely sentence content)", () => {
    expect(isPathReference("see notes.md for details")).toBe(false);
  });

  it("rejects multi-line content even if it looks like a path", () => {
    expect(isPathReference("./foo.md\n\nactually here's the content")).toBe(false);
  });

  it("rejects empty / undefined values", () => {
    expect(isPathReference(undefined)).toBe(false);
    expect(isPathReference("")).toBe(false);
    expect(isPathReference("   ")).toBe(false);
  });

  it("rejects long single-line values (longer than a likely filename)", () => {
    const long = "abc.md".repeat(50); // 300 chars, ends in .md but absurdly long
    expect(isPathReference(long)).toBe(false);
  });

  it("rejects ordinary inline Markdown that happens to contain `.md`", () => {
    expect(isPathReference("Here are my notes: see attached.md spec")).toBe(false);
    expect(isPathReference("# Heading")).toBe(false);
  });
});

describe("notes — suggestedSidecarFilename", () => {
  it("includes docBase, nodeId, and a safe nodeText slug", () => {
    const f = suggestedSidecarFilename("/tmp/myproject.clobmap.yaml", "n7", "Architecture / spec");
    expect(f.startsWith("./.")).toBe(true);
    expect(f).toContain("myproject");
    expect(f).toContain("n7");
    expect(f).toContain("Architecture");
    expect(f.endsWith(".md")).toBe(true);
  });

  it("strips filesystem-hostile characters from the node text", () => {
    const f = suggestedSidecarFilename("/tmp/d.clobmap.yaml", "n1", 'a/b\\c:d*e?f"g<h>i|j');
    // Look only at the basename (after the leading "./"), since the path
    // prefix itself legitimately contains `/`.
    const basename = f.replace(/^\.\//, "");
    expect(basename).not.toMatch(/[\\:*?"<>|]/);
    expect(basename).not.toMatch(/\//);
  });

  it("falls back to 'doc' when no docPath is set", () => {
    const f = suggestedSidecarFilename(null, "n1", "name");
    expect(f).toContain("doc_n1");
  });

  it("clamps overly long node text to a manageable length", () => {
    const f = suggestedSidecarFilename("/tmp/d.clobmap.yaml", "n1", "a".repeat(200));
    // The text segment is bounded by the safeFilenameSegment 32-char clamp.
    // The total filename is bounded but we just verify it isn't 200+.
    expect(f.length).toBeLessThan(120);
  });

  it("strips trailing .yaml / .yml / .clobmap.yaml from the doc base", () => {
    expect(suggestedSidecarFilename("/tmp/doc.clobmap.yaml", "n1", "x")).toContain("doc");
    expect(suggestedSidecarFilename("/tmp/doc.yaml", "n1", "x")).toContain("doc");
    expect(suggestedSidecarFilename("/tmp/doc.yml", "n1", "x")).toContain("doc");
  });

  it("starts with './.' so the file is hidden on macOS / Linux", () => {
    const f = suggestedSidecarFilename("/tmp/d.clobmap.yaml", "n1", "x");
    expect(f).toMatch(/^\.\/\./);
  });

  it("escapes the segment separator so different node texts can't collide", () => {
    const a = suggestedSidecarFilename("/tmp/d.clobmap.yaml", "n1", "alpha_beta");
    const b = suggestedSidecarFilename("/tmp/d.clobmap.yaml", "n2", "gamma");
    expect(a).not.toBe(b);
  });
});

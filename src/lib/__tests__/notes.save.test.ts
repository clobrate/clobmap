import { describe, it, expect, vi, beforeEach } from "vitest";

// Pretend we're on desktop (Tauri) so the folder/sidecar branches run.
vi.mock("../env", () => ({ isTauri: () => true, isMobile: () => false }));
// Mock the FS chokepoint so no real disk access happens.
vi.mock("../fsAdapter", () => ({
  writeTextFile: vi.fn(async () => {}),
  readTextFile: vi.fn(async () => ""),
  mkdirp: vi.fn(async () => {}),
  exists: vi.fn(async () => false),
}));

import * as fs from "../fsAdapter";
import { saveNotes, NOTES_INLINE_LIMIT } from "../notes";

const DOC = "/tmp/proj/plan.clobmap.yaml";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveNotes — folder mode", () => {
  const opts = { noteStorage: "folder" as const, notesFolder: "notelets" };

  it("writes a new per-node file and stores its relative path", async () => {
    const r = await saveNotes("hello", undefined, DOC, "n1", "My Node", opts);
    expect(r.fieldValue).toBe("./notelets/n1-My-Node.md");
    expect(r.wroteSidecar).toBe(true);
    expect(fs.mkdirp).toHaveBeenCalledWith("/tmp/proj/notelets");
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n1-My-Node.md", "hello");
  });

  it("writes irrespective of size (no inline cap in folder mode)", async () => {
    const big = "x".repeat(NOTES_INLINE_LIMIT + 500);
    const r = await saveNotes(big, undefined, DOC, "n2", "Big", opts);
    expect(r.fieldValue).toBe("./notelets/n2-Big.md");
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n2-Big.md", big);
  });

  it("honors a custom (validated) folder name", async () => {
    const r = await saveNotes("hi", undefined, DOC, "n3", "X", {
      noteStorage: "folder",
      notesFolder: "./docs/notes/",
    });
    expect(r.fieldValue).toBe("./docs/notes/n3-X.md");
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/docs/notes/n3-X.md", "hi");
  });

  it("falls back to the default folder when the setting is invalid", async () => {
    const r = await saveNotes("hi", undefined, DOC, "n4", "X", {
      noteStorage: "folder",
      notesFolder: "../escape",
    });
    expect(r.fieldValue).toBe("./notelets/n4-X.md");
  });

  it("empty content on a node already linked to a file keeps an EMPTY file", async () => {
    const r = await saveNotes("", "./notelets/n1-My-Node.md", DOC, "n1", "My Node", opts);
    expect(r.fieldValue).toBe("./notelets/n1-My-Node.md");
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n1-My-Node.md", "");
  });

  it("empty content with no existing file drops the field (nothing to keep)", async () => {
    const r = await saveNotes("", undefined, DOC, "n1", "My Node", opts);
    expect(r.fieldValue).toBeUndefined();
    expect(fs.writeTextFile).not.toHaveBeenCalled();
  });

  it("keeps writing to an existing file link (shared-sidecar path)", async () => {
    const r = await saveNotes("updated", "./notelets/n9-Old.md", DOC, "n9", "New Title", opts);
    // field stays the existing path (not re-derived from the new title)
    expect(r.fieldValue).toBe("./notelets/n9-Old.md");
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n9-Old.md", "updated");
  });

  it("throws if the document hasn't been saved (no path to resolve against)", async () => {
    await expect(saveNotes("hi", undefined, null, "n1", "X", opts)).rejects.toThrow(
      /Save the document first/,
    );
  });
});

describe("saveNotes — inline mode (default) is unchanged", () => {
  it("stores short content inline", async () => {
    const r = await saveNotes("short note", undefined, DOC, "n1", "X");
    expect(r.fieldValue).toBe("short note");
    expect(r.wroteSidecar).toBe(false);
    expect(fs.writeTextFile).not.toHaveBeenCalled();
  });

  it("empty content deletes the field", async () => {
    const r = await saveNotes("", undefined, DOC, "n1", "X");
    expect(r.fieldValue).toBeUndefined();
  });

  it("auto-extracts to a sidecar when content overflows the cap", async () => {
    const big = "y".repeat(NOTES_INLINE_LIMIT + 1);
    const r = await saveNotes(big, undefined, DOC, "n1", "X", { noteStorage: "inline" });
    expect(r.wroteSidecar).toBe(true);
    expect(r.fieldValue?.startsWith("./.")).toBe(true); // hidden dotfile sidecar
    expect(fs.writeTextFile).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from "vitest";

// Web build: no Tauri. Path-referenced notes (folder-mode or sidecar) can't be
// read, so they surface read-only — folder mode is inert here.
vi.mock("../env", () => ({ isTauri: () => false, isMobile: () => false }));
vi.mock("../fsAdapter", () => ({
  readTextFile: vi.fn(async () => "should not be read"),
  pathIsWithin: vi.fn(async () => true),
  writeTextFile: vi.fn(async () => {}),
  mkdirp: vi.fn(async () => {}),
  exists: vi.fn(async () => false),
  remove: vi.fn(async () => {}),
  rename: vi.fn(async () => {}),
  readDir: vi.fn(async () => [] as string[]),
}));

import * as fs from "../fsAdapter";
import { loadNotes } from "../notes";

describe("loadNotes — web build", () => {
  it("shows a folder/sidecar note as read-only and never reads the file", async () => {
    const r = await loadNotes("./notelets/n1-Root.md", "/tmp/proj/plan.clobmap.yaml");
    expect(r.readOnly).toBe(true);
    expect(r.isPathRef).toBe(true);
    expect(r.content).toBe("");
    expect(fs.readTextFile).not.toHaveBeenCalled();
  });

  it("still returns inline notes normally", async () => {
    const r = await loadNotes("inline body", "/tmp/proj/plan.clobmap.yaml");
    expect(r.readOnly).toBe(false);
    expect(r.content).toBe("inline body");
  });
});

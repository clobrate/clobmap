import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../env", () => ({ isTauri: () => true, isMobile: () => false }));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: async () => "/home/user" }));
vi.mock("../fsAdapter", () => ({
  readTextFile: vi.fn(async () => "file content"),
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

const DOC = "/tmp/proj/plan.clobmap.yaml";

beforeEach(() => vi.clearAllMocks());

describe("loadNotes — trust boundary (desktop)", () => {
  it("reads a relative note inside the document's folder", async () => {
    const r = await loadNotes("./notelets/n1-Root.md", DOC);
    expect(r.readOnly).toBe(false);
    expect(r.content).toBe("file content");
    expect(fs.readTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n1-Root.md");
  });

  it("refuses an absolute path outside the folder (never reads it)", async () => {
    const r = await loadNotes("/etc/passwd", DOC);
    expect(r.readOnly).toBe(true);
    expect(r.content).toBe("");
    expect(r.message).toMatch(/outside the document/i);
    expect(fs.readTextFile).not.toHaveBeenCalled();
  });

  it("refuses a `../` escape", async () => {
    const r = await loadNotes("./../../etc/passwd", DOC);
    expect(r.readOnly).toBe(true);
    expect(fs.readTextFile).not.toHaveBeenCalled();
  });

  it("refuses a `~`-expanded path outside the folder", async () => {
    const r = await loadNotes("~/secrets.md", DOC);
    expect(r.readOnly).toBe(true);
    expect(fs.readTextFile).not.toHaveBeenCalled();
  });

  it("refuses when the native symlink check says outside (defence in depth)", async () => {
    vi.mocked(fs.pathIsWithin).mockResolvedValueOnce(false);
    const r = await loadNotes("./notelets/n1-Root.md", DOC);
    expect(r.readOnly).toBe(true);
    expect(fs.readTextFile).not.toHaveBeenCalled();
  });

  it("returns inline content unchanged (no boundary check on non-paths)", async () => {
    const r = await loadNotes("just some inline note", DOC);
    expect(r.isPathRef).toBe(false);
    expect(r.content).toBe("just some inline note");
    expect(fs.readTextFile).not.toHaveBeenCalled();
  });
});

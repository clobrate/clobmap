import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../env", () => ({ isTauri: () => true, isMobile: () => false }));
vi.mock("../fsAdapter", () => ({
  writeTextFile: vi.fn(async () => {}),
  readTextFile: vi.fn(async () => ""),
  mkdirp: vi.fn(async () => {}),
  exists: vi.fn(async () => false),
  remove: vi.fn(async () => {}),
  rename: vi.fn(async () => {}),
  readDir: vi.fn(async () => [] as string[]),
}));

import * as fs from "../fsAdapter";
import type { MindDocument, MindNode } from "../../model";
import {
  planDeleteArchive,
  planTidy,
  archiveNoteFile,
  tidyNotesFolder,
} from "../notesLifecycle";

const DOC_PATH = "/tmp/proj/plan.clobmap.yaml";
const ISO = "2026-09-27T10:00:00.000Z";

function node(id: string, text: string, notes?: string, children: MindNode[] = []): MindNode {
  return { id, text, children, ...(notes !== undefined ? { notes } : {}) };
}
function doc(root: MindNode): MindDocument {
  return { title: "T", root };
}

beforeEach(() => vi.clearAllMocks());

describe("planDeleteArchive (pure)", () => {
  it("plans a hidden archive rename in the same folder for a file-backed note", () => {
    const plan = planDeleteArchive(node("n1", "Root", "./notelets/n1-Root.md"), ISO);
    expect(plan).toEqual({
      from: "./notelets/n1-Root.md",
      to: "./notelets/.Deleted-n1-Root-2026-09-27T10-00-00-000Z.md",
    });
  });

  it("archives legacy root sidecars in place (dir '.')", () => {
    const plan = planDeleteArchive(node("n1", "Root", "./.plan_n1_Root.md"), ISO);
    expect(plan?.to).toBe("./.Deleted-n1-Root-2026-09-27T10-00-00-000Z.md");
  });

  it("returns null for inline or absent notes (nothing on disk)", () => {
    expect(planDeleteArchive(node("n1", "Root", "inline text"), ISO)).toBeNull();
    expect(planDeleteArchive(node("n1", "Root"), ISO)).toBeNull();
  });

  it("archives a bare-filename note ref in the current directory", () => {
    const plan = planDeleteArchive(node("n1", "Root", "n1-Root.md"), ISO);
    expect(plan?.to).toBe("./.Deleted-n1-Root-2026-09-27T10-00-00-000Z.md");
  });
});

describe("planTidy (pure)", () => {
  const tree = doc(
    node("n1", "Root", "./notelets/n1-Root.md", [node("n2", "Child", "./notelets/n2-Child.md")]),
  );

  it("removes archives and orphans, keeps referenced files", () => {
    const toDelete = planTidy(tree, "notelets", [
      "n1-Root.md",
      "n2-Child.md",
      "orphan.md",
      ".Deleted-n9-Old-2026-01-01T00-00-00-000Z.md",
    ]);
    expect(toDelete.sort()).toEqual(
      [".Deleted-n9-Old-2026-01-01T00-00-00-000Z.md", "orphan.md"].sort(),
    );
  });

  it("keeps an empty-but-referenced file", () => {
    // n1-Root.md is referenced even if empty on disk → not tidied.
    expect(planTidy(tree, "notelets", ["n1-Root.md"])).toEqual([]);
  });

  it("ignores nodes whose note ref is outside the folder when computing orphans", () => {
    // A node still pointing at a legacy sidecar doesn't protect any in-folder
    // file, so an unreferenced in-folder file is still an orphan.
    const t = doc(node("n1", "Root", "./.legacy.md"));
    expect(planTidy(t, "notelets", ["stray.md"])).toEqual(["stray.md"]);
  });
});

describe("archiveNoteFile (executor)", () => {
  it("renames the file to its hidden archive", async () => {
    const ok = await archiveNoteFile(node("n1", "Root", "./notelets/n1-Root.md"), DOC_PATH, ISO);
    expect(ok).toBe(true);
    expect(fs.rename).toHaveBeenCalledWith(
      "/tmp/proj/notelets/n1-Root.md",
      "/tmp/proj/notelets/.Deleted-n1-Root-2026-09-27T10-00-00-000Z.md",
    );
  });

  it("no-ops for inline notes (nothing to archive)", async () => {
    const ok = await archiveNoteFile(node("n1", "Root", "inline"), DOC_PATH, ISO);
    expect(ok).toBe(false);
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it("returns false when the path can't be resolved (no doc path)", async () => {
    const ok = await archiveNoteFile(node("n1", "Root", "./notelets/n1-Root.md"), "", ISO);
    expect(ok).toBe(false);
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it("returns false when the rename fails", async () => {
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error("EPERM"));
    const ok = await archiveNoteFile(node("n1", "Root", "./notelets/n1-Root.md"), DOC_PATH, ISO);
    expect(ok).toBe(false);
  });
});

describe("tidyNotesFolder (executor)", () => {
  it("deletes archives + orphans and returns the count", async () => {
    vi.mocked(fs.readDir).mockResolvedValueOnce([
      "n1-Root.md",
      "orphan.md",
      ".Deleted-n9-Old-2026-01-01T00-00-00-000Z.md",
    ]);
    const tree = doc(node("n1", "Root", "./notelets/n1-Root.md"));
    const count = await tidyNotesFolder(tree, DOC_PATH, "notelets");
    expect(count).toBe(2);
    expect(fs.remove).toHaveBeenCalledWith("/tmp/proj/notelets/orphan.md");
    expect(fs.remove).toHaveBeenCalledWith(
      "/tmp/proj/notelets/.Deleted-n9-Old-2026-01-01T00-00-00-000Z.md",
    );
    expect(fs.remove).not.toHaveBeenCalledWith("/tmp/proj/notelets/n1-Root.md");
  });

  it("returns 0 when there is no document path", async () => {
    const count = await tidyNotesFolder(doc(node("n1", "Root")), "", "notelets");
    expect(count).toBe(0);
    expect(fs.readDir).not.toHaveBeenCalled();
  });

  it("returns 0 when the folder can't be listed", async () => {
    vi.mocked(fs.readDir).mockRejectedValueOnce(new Error("ENOENT"));
    const count = await tidyNotesFolder(doc(node("n1", "Root")), DOC_PATH, "notelets");
    expect(count).toBe(0);
  });

  it("still counts a file even if its individual delete fails", async () => {
    vi.mocked(fs.readDir).mockResolvedValueOnce([".Deleted-x-2026-01-01T00-00-00-000Z.md"]);
    vi.mocked(fs.remove).mockRejectedValueOnce(new Error("EPERM"));
    const count = await tidyNotesFolder(doc(node("n1", "Root")), DOC_PATH, "notelets");
    expect(count).toBe(1);
  });
});

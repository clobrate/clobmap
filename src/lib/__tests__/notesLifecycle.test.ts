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
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../env", () => ({ isTauri: () => true, isMobile: () => false }));
vi.mock("../fsAdapter", () => ({
  writeTextFile: vi.fn(async () => {}),
  readTextFile: vi.fn(async () => "sidecar body"),
  mkdirp: vi.fn(async () => {}),
  exists: vi.fn(async () => false),
  remove: vi.fn(async () => {}),
}));

import * as fs from "../fsAdapter";
import { findById, type MindDocument, type MindNode } from "../../model";
import { planMigration, migrateDocToFolder } from "../notesMigration";

const DOC_PATH = "/tmp/proj/plan.clobmap.yaml";

function node(id: string, text: string, notes?: string, children: MindNode[] = []): MindNode {
  return { id, text, children, ...(notes !== undefined ? { notes } : {}) };
}
function doc(root: MindNode): MindDocument {
  return { title: "Test", root };
}

beforeEach(() => vi.clearAllMocks());

describe("planMigration (pure)", () => {
  it("plans inline notes → files", () => {
    const root = node("n1", "Root", "some inline note", [node("n2", "Child", "more")]);
    const ops = planMigration(doc(root), "notelets");
    expect(ops).toEqual([
      { nodeId: "n1", action: "inline-to-file", newField: "./notelets/n1-Root.md", content: "some inline note" },
      { nodeId: "n2", action: "inline-to-file", newField: "./notelets/n2-Child.md", content: "more" },
    ]);
  });

  it("plans legacy sidecar refs → re-home", () => {
    const root = node("n1", "Root", "./.plan_n1_Root.md");
    const ops = planMigration(doc(root), "notelets");
    expect(ops).toEqual([
      {
        nodeId: "n1",
        action: "sidecar-to-file",
        newField: "./notelets/n1-Root.md",
        sourceField: "./.plan_n1_Root.md",
      },
    ]);
  });

  it("skips notes already under the folder (idempotent)", () => {
    const root = node("n1", "Root", "./notelets/n1-Root.md");
    expect(planMigration(doc(root), "notelets")).toEqual([]);
  });

  it("skips empty / missing notes", () => {
    const root = node("n1", "Root", undefined, [node("n2", "Empty", "   "), node("n3", "None")]);
    expect(planMigration(doc(root), "notelets")).toEqual([]);
  });

  it("honors a custom (normalized) folder", () => {
    const root = node("n1", "Root", "inline");
    expect(planMigration(doc(root), "./docs/notes/")[0]!.newField).toBe("./docs/notes/n1-Root.md");
  });

  it("re-running on an already-migrated tree yields no ops", () => {
    const migrated = node("n1", "Root", "./notelets/n1-Root.md", [
      node("n2", "C", "./notelets/n2-C.md"),
    ]);
    expect(planMigration(doc(migrated), "notelets")).toEqual([]);
  });
});

describe("migrateDocToFolder (executor)", () => {
  it("writes inline content to files and repoints the fields", async () => {
    const root = node("n1", "Root", "hello", [node("n2", "Child", "world")]);
    const { doc: tree, changed } = await migrateDocToFolder(doc(root), DOC_PATH, "notelets");
    expect(changed).toBe(true);
    expect(fs.mkdirp).toHaveBeenCalledWith("/tmp/proj/notelets");
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n1-Root.md", "hello");
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n2-Child.md", "world");
    expect(findById(tree, "n1")?.notes).toBe("./notelets/n1-Root.md");
    expect(findById(tree, "n2")?.notes).toBe("./notelets/n2-Child.md");
  });

  it("moves a legacy sidecar (copy then delete the old file)", async () => {
    const root = node("n1", "Root", "./.plan_n1_Root.md");
    const { doc: tree } = await migrateDocToFolder(doc(root), DOC_PATH, "notelets");
    expect(fs.readTextFile).toHaveBeenCalledWith("/tmp/proj/.plan_n1_Root.md");
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n1-Root.md", "sidecar body");
    expect(fs.remove).toHaveBeenCalledWith("/tmp/proj/.plan_n1_Root.md");
    expect(findById(tree, "n1")?.notes).toBe("./notelets/n1-Root.md");
  });

  it("migrates a sidecar shared by two nodes, reading once and deleting once", async () => {
    const root = node("n1", "Root", "./.shared.md", [node("n2", "Child", "./.shared.md")]);
    const { doc: tree } = await migrateDocToFolder(doc(root), DOC_PATH, "notelets");
    // Read the shared source once; each node gets its own copy.
    expect(vi.mocked(fs.readTextFile).mock.calls.filter((c) => c[0] === "/tmp/proj/.shared.md")).toHaveLength(1);
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n1-Root.md", "sidecar body");
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n2-Child.md", "sidecar body");
    // Deleted exactly once (dedup), only after both copies.
    expect(vi.mocked(fs.remove).mock.calls.filter((c) => c[0] === "/tmp/proj/.shared.md")).toHaveLength(1);
    expect(findById(tree, "n1")?.notes).toBe("./notelets/n1-Root.md");
    expect(findById(tree, "n2")?.notes).toBe("./notelets/n2-Child.md");
  });

  it("does NOT delete anything for inline-only migration", async () => {
    const root = node("n1", "Root", "inline content");
    await migrateDocToFolder(doc(root), DOC_PATH, "notelets");
    expect(fs.remove).not.toHaveBeenCalled();
  });

  it("is a no-op when nothing needs migrating", async () => {
    const root = node("n1", "Root", "./notelets/n1-Root.md");
    const { changed } = await migrateDocToFolder(doc(root), DOC_PATH, "notelets");
    expect(changed).toBe(false);
    expect(fs.writeTextFile).not.toHaveBeenCalled();
  });

  it("migrates an unreadable legacy sidecar as empty rather than aborting", async () => {
    vi.mocked(fs.readTextFile).mockRejectedValueOnce(new Error("gone"));
    const root = node("n1", "Root", "./.plan_n1_Root.md");
    const { doc: tree } = await migrateDocToFolder(doc(root), DOC_PATH, "notelets");
    expect(fs.writeTextFile).toHaveBeenCalledWith("/tmp/proj/notelets/n1-Root.md", "");
    expect(findById(tree, "n1")?.notes).toBe("./notelets/n1-Root.md");
  });

  it("completes even if deleting a migrated legacy sidecar fails", async () => {
    vi.mocked(fs.remove).mockRejectedValueOnce(new Error("EPERM"));
    const root = node("n1", "Root", "./.plan_n1_Root.md");
    const { doc: tree, changed } = await migrateDocToFolder(doc(root), DOC_PATH, "notelets");
    expect(changed).toBe(true);
    expect(findById(tree, "n1")?.notes).toBe("./notelets/n1-Root.md");
  });

  it("writes nothing when paths can't be resolved (no doc path)", async () => {
    const root = node("n1", "Root", "inline content");
    const { changed } = await migrateDocToFolder(doc(root), "", "notelets");
    // Ops were planned but nothing resolves without a doc path → no writes.
    expect(changed).toBe(true);
    expect(fs.writeTextFile).not.toHaveBeenCalled();
  });
});

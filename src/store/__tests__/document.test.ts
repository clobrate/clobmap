import { beforeEach, describe, expect, it } from "vitest";
import { Document } from "yaml";
import { useDocumentStore } from "../document";
import {
  addChild,
  createIdGenerator,
  parseLiveYaml,
  type MindDocument,
  type ParseError,
} from "../../model";

const sampleDoc: MindDocument = {
  title: "Sample",
  version: 1,
  root: { id: "n1", text: "Root", children: [] },
};

const sampleError: ParseError = { message: "boom", line: 3, col: 5 };

const SAMPLE_YAML = `title: Sample
version: 1
root:
  id: n1
  text: Root
  children: []
`;

function freshLiveDoc(): { tree: MindDocument; doc: Document } {
  const result = parseLiveYaml(SAMPLE_YAML);
  if (!result.ok) throw new Error("fixture failed to parse");
  return { tree: result.value.tree, doc: result.value.doc };
}

describe("document store", () => {
  beforeEach(() => {
    useDocumentStore.getState().reset("", null);
  });

  it("setYamlText updates text and dirty state", () => {
    useDocumentStore.getState().reset("original", sampleDoc);
    useDocumentStore.getState().setYamlText("changed");
    const s = useDocumentStore.getState();
    expect(s.yamlText).toBe("changed");
    expect(s.isDirty).toBe(true);
  });

  it("setYamlText to original text clears dirty", () => {
    useDocumentStore.getState().reset("original", sampleDoc);
    useDocumentStore.getState().setYamlText("changed");
    useDocumentStore.getState().setYamlText("original");
    expect(useDocumentStore.getState().isDirty).toBe(false);
  });

  it("setYamlText with identical text is a no-op", () => {
    useDocumentStore.getState().reset("same", sampleDoc);
    const before = useDocumentStore.getState();
    useDocumentStore.getState().setYamlText("same");
    const after = useDocumentStore.getState();
    expect(after).toBe(before);
  });

  it("applyParseError keeps the last valid parsed doc", () => {
    useDocumentStore.getState().reset("text", sampleDoc);
    useDocumentStore.getState().applyParseError(sampleError);
    const s = useDocumentStore.getState();
    expect(s.parseError).toEqual(sampleError);
    expect(s.parsedDoc).toEqual(sampleDoc);
  });

  it("applyValidParse stores tree and live doc, clears parse error", () => {
    useDocumentStore.getState().reset("text", null);
    useDocumentStore.getState().applyParseError(sampleError);
    const liveDoc = new Document();
    useDocumentStore.getState().applyValidParse(sampleDoc, liveDoc);
    const s = useDocumentStore.getState();
    expect(s.parseError).toBeNull();
    expect(s.parsedDoc).toEqual(sampleDoc);
    expect(s.yamlDoc).toBe(liveDoc);
  });

  it("reset establishes a new clean baseline and clears history", () => {
    const live = freshLiveDoc();
    useDocumentStore.getState().reset(SAMPLE_YAML, live.tree, live.doc);
    useDocumentStore
      .getState()
      .applyTreeChange(addChild(live.tree, "n1", "Child", createIdGenerator(10)).doc);
    useDocumentStore.getState().reset("baz", sampleDoc);
    const s = useDocumentStore.getState();
    expect(s.yamlText).toBe("baz");
    expect(s.originalText).toBe("baz");
    expect(s.isDirty).toBe(false);
    expect(s.parseError).toBeNull();
    expect(s.undoStack).toEqual([]);
    expect(s.redoStack).toEqual([]);
  });

  describe("applyTreeChange", () => {
    it("updates parsedDoc and yamlText, marks dirty, pushes undo", () => {
      const live = freshLiveDoc();
      useDocumentStore.getState().reset(SAMPLE_YAML, live.tree, live.doc);

      const next = addChild(live.tree, "n1", "Hello", createIdGenerator(10)).doc;
      useDocumentStore.getState().applyTreeChange(next);

      const s = useDocumentStore.getState();
      expect(s.parsedDoc).toEqual(next);
      expect(s.yamlText).toContain("Hello");
      expect(s.isDirty).toBe(true);
      expect(s.undoStack).toHaveLength(1);
      expect(s.redoStack).toHaveLength(0);
    });

    it("preserves comments via the live AST when serializing", () => {
      const yamlWithComment = `# top comment
title: Sample
root:
  id: n1
  text: Root
  children: []
`;
      const live = parseLiveYaml(yamlWithComment);
      if (!live.ok) throw new Error("fixture parse failed");
      useDocumentStore.getState().reset(yamlWithComment, live.value.tree, live.value.doc);

      const next = addChild(live.value.tree, "n1", "Child", createIdGenerator(10)).doc;
      useDocumentStore.getState().applyTreeChange(next);

      expect(useDocumentStore.getState().yamlText).toContain("# top comment");
      expect(useDocumentStore.getState().yamlText).toContain("Child");
    });

    it("clears redo stack on a new mutation", () => {
      const live = freshLiveDoc();
      useDocumentStore.getState().reset(SAMPLE_YAML, live.tree, live.doc);
      const after = addChild(live.tree, "n1", "A", createIdGenerator(10)).doc;
      useDocumentStore.getState().applyTreeChange(after);
      useDocumentStore.getState().undo();
      expect(useDocumentStore.getState().redoStack).toHaveLength(1);
      const after2 = addChild(live.tree, "n1", "B", createIdGenerator(20)).doc;
      useDocumentStore.getState().applyTreeChange(after2);
      expect(useDocumentStore.getState().redoStack).toHaveLength(0);
    });
  });

  describe("undo / redo", () => {
    it("undo restores prior tree and yamlText; redo replays it", () => {
      const live = freshLiveDoc();
      useDocumentStore.getState().reset(SAMPLE_YAML, live.tree, live.doc);
      const baseTree = useDocumentStore.getState().parsedDoc!;
      const baseText = useDocumentStore.getState().yamlText;

      const next = addChild(live.tree, "n1", "Child", createIdGenerator(10)).doc;
      useDocumentStore.getState().applyTreeChange(next);

      useDocumentStore.getState().undo();
      expect(useDocumentStore.getState().parsedDoc).toEqual(baseTree);
      expect(useDocumentStore.getState().yamlText).toBe(baseText);
      expect(useDocumentStore.getState().undoStack).toHaveLength(0);
      expect(useDocumentStore.getState().redoStack).toHaveLength(1);

      useDocumentStore.getState().redo();
      expect(useDocumentStore.getState().parsedDoc).toEqual(next);
      expect(useDocumentStore.getState().redoStack).toHaveLength(0);
    });

    it("undo with empty stack is a no-op", () => {
      const live = freshLiveDoc();
      useDocumentStore.getState().reset(SAMPLE_YAML, live.tree, live.doc);
      const before = useDocumentStore.getState();
      useDocumentStore.getState().undo();
      expect(useDocumentStore.getState()).toBe(before);
    });

    it("redo with empty stack is a no-op", () => {
      const live = freshLiveDoc();
      useDocumentStore.getState().reset(SAMPLE_YAML, live.tree, live.doc);
      const before = useDocumentStore.getState();
      useDocumentStore.getState().redo();
      expect(useDocumentStore.getState()).toBe(before);
    });
  });
});

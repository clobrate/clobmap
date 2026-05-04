import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentStore } from "../document";
import type { MindDocument, ParseError } from "../../model";

const sampleDoc: MindDocument = {
  title: "Sample",
  version: 1,
  root: { id: "n1", text: "Root", children: [] },
};

const sampleError: ParseError = { message: "boom", line: 3, col: 5 };

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

  it("applyValidParse clears any prior parse error", () => {
    useDocumentStore.getState().reset("text", null);
    useDocumentStore.getState().applyParseError(sampleError);
    useDocumentStore.getState().applyValidParse(sampleDoc);
    const s = useDocumentStore.getState();
    expect(s.parseError).toBeNull();
    expect(s.parsedDoc).toEqual(sampleDoc);
  });

  it("reset establishes a new clean baseline", () => {
    useDocumentStore.getState().reset("foo", sampleDoc);
    useDocumentStore.getState().setYamlText("bar");
    useDocumentStore.getState().reset("baz", sampleDoc);
    const s = useDocumentStore.getState();
    expect(s.yamlText).toBe("baz");
    expect(s.originalText).toBe("baz");
    expect(s.isDirty).toBe(false);
    expect(s.parseError).toBeNull();
  });
});

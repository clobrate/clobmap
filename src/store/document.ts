import type { Document } from "yaml";
import { create } from "zustand";
import {
  applyTreeToDocument,
  parseLiveYaml,
  serializeLiveYaml,
  serializeYaml,
  type MindDocument,
  type ParseError,
} from "../model";

const HISTORY_LIMIT = 200;

export interface HistoryEntry {
  tree: MindDocument;
  yamlText: string;
}

export interface DocumentState {
  yamlText: string;
  parsedDoc: MindDocument | null;
  yamlDoc: Document | null;
  parseError: ParseError | null;
  originalText: string;
  isDirty: boolean;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  setYamlText: (text: string) => void;
  applyValidParse: (parsed: MindDocument, doc: Document) => void;
  applyParseError: (error: ParseError) => void;
  applyTreeChange: (newTree: MindDocument) => void;
  undo: () => void;
  redo: () => void;
  reset: (text: string, parsed: MindDocument | null, doc?: Document | null) => void;
}

function reSerialize(
  yamlDoc: Document | null,
  tree: MindDocument,
): {
  text: string;
  doc: Document | null;
} {
  if (yamlDoc) {
    applyTreeToDocument(yamlDoc, tree);
    return { text: serializeLiveYaml(yamlDoc), doc: yamlDoc };
  }
  return { text: serializeYaml(tree), doc: null };
}

export const useDocumentStore = create<DocumentState>((set) => ({
  yamlText: "",
  parsedDoc: null,
  yamlDoc: null,
  parseError: null,
  originalText: "",
  isDirty: false,
  undoStack: [],
  redoStack: [],

  setYamlText: (text) =>
    set((s) =>
      s.yamlText === text ? s : { ...s, yamlText: text, isDirty: text !== s.originalText },
    ),

  applyValidParse: (parsed, doc) => set({ parsedDoc: parsed, yamlDoc: doc, parseError: null }),

  applyParseError: (error) => set({ parseError: error }),

  applyTreeChange: (newTree) =>
    set((s) => {
      if (!s.parsedDoc) return s;
      const undoEntry: HistoryEntry = { tree: s.parsedDoc, yamlText: s.yamlText };
      const { text, doc } = reSerialize(s.yamlDoc, newTree);
      const undoStack = [...s.undoStack, undoEntry].slice(-HISTORY_LIMIT);
      return {
        ...s,
        parsedDoc: newTree,
        yamlDoc: doc,
        yamlText: text,
        parseError: null,
        isDirty: text !== s.originalText,
        undoStack,
        redoStack: [],
      };
    }),

  undo: () =>
    set((s) => {
      if (s.undoStack.length === 0 || !s.parsedDoc) return s;
      const top = s.undoStack[s.undoStack.length - 1]!;
      const redoEntry: HistoryEntry = { tree: s.parsedDoc, yamlText: s.yamlText };
      const live = parseLiveYaml(top.yamlText);
      return {
        ...s,
        parsedDoc: top.tree,
        yamlDoc: live.ok ? live.value.doc : null,
        yamlText: top.yamlText,
        parseError: null,
        isDirty: top.yamlText !== s.originalText,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, redoEntry].slice(-HISTORY_LIMIT),
      };
    }),

  redo: () =>
    set((s) => {
      if (s.redoStack.length === 0 || !s.parsedDoc) return s;
      const top = s.redoStack[s.redoStack.length - 1]!;
      const undoEntry: HistoryEntry = { tree: s.parsedDoc, yamlText: s.yamlText };
      const live = parseLiveYaml(top.yamlText);
      return {
        ...s,
        parsedDoc: top.tree,
        yamlDoc: live.ok ? live.value.doc : null,
        yamlText: top.yamlText,
        parseError: null,
        isDirty: top.yamlText !== s.originalText,
        undoStack: [...s.undoStack, undoEntry].slice(-HISTORY_LIMIT),
        redoStack: s.redoStack.slice(0, -1),
      };
    }),

  reset: (text, parsed, doc) =>
    set({
      yamlText: text,
      originalText: text,
      parsedDoc: parsed,
      yamlDoc: doc ?? null,
      parseError: null,
      isDirty: false,
      undoStack: [],
      redoStack: [],
    }),
}));

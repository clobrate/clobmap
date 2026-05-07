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
  currentFilePath: string | null;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  setYamlText: (text: string) => void;
  applyValidParse: (parsed: MindDocument, doc: Document) => void;
  applyParseError: (error: ParseError) => void;
  applyTreeChange: (newTree: MindDocument) => void;
  undo: () => void;
  redo: () => void;
  reset: (
    text: string,
    parsed: MindDocument | null,
    doc?: Document | null,
    filePath?: string | null,
  ) => void;
  markSavedAt: (path: string) => void;
}

/**
 * Plain-object snapshot of the per-document fields. Used by the tabs store
 * to swap entire documents in/out without rebuilding parse trees.
 */
export type DocumentSnapshot = Pick<
  DocumentState,
  | "yamlText"
  | "parsedDoc"
  | "yamlDoc"
  | "parseError"
  | "originalText"
  | "isDirty"
  | "currentFilePath"
  | "undoStack"
  | "redoStack"
>;

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
  currentFilePath: null,
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

  reset: (text, parsed, doc, filePath) =>
    set({
      yamlText: text,
      originalText: text,
      parsedDoc: parsed,
      yamlDoc: doc ?? null,
      parseError: null,
      isDirty: false,
      currentFilePath: filePath ?? null,
      undoStack: [],
      redoStack: [],
    }),

  markSavedAt: (path) =>
    set((s) => ({
      ...s,
      currentFilePath: path,
      originalText: s.yamlText,
      isDirty: false,
    })),
}));

/** Snapshot the current document for storage in a tab. */
export function snapshotDocument(): DocumentSnapshot {
  const s = useDocumentStore.getState();
  return {
    yamlText: s.yamlText,
    parsedDoc: s.parsedDoc,
    yamlDoc: s.yamlDoc,
    parseError: s.parseError,
    originalText: s.originalText,
    isDirty: s.isDirty,
    currentFilePath: s.currentFilePath,
    undoStack: s.undoStack,
    redoStack: s.redoStack,
  };
}

/** Replace the live document with a previously-captured snapshot. */
export function loadDocumentSnapshot(snap: DocumentSnapshot): void {
  useDocumentStore.setState({
    yamlText: snap.yamlText,
    parsedDoc: snap.parsedDoc,
    yamlDoc: snap.yamlDoc,
    parseError: snap.parseError,
    originalText: snap.originalText,
    isDirty: snap.isDirty,
    currentFilePath: snap.currentFilePath,
    undoStack: snap.undoStack,
    redoStack: snap.redoStack,
  });
}

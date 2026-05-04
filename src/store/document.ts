import { create } from "zustand";
import type { MindDocument, ParseError } from "../model";

export interface DocumentState {
  yamlText: string;
  parsedDoc: MindDocument | null;
  parseError: ParseError | null;
  originalText: string;
  isDirty: boolean;
  setYamlText: (text: string) => void;
  applyValidParse: (parsed: MindDocument) => void;
  applyParseError: (error: ParseError) => void;
  reset: (text: string, parsed: MindDocument | null) => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  yamlText: "",
  parsedDoc: null,
  parseError: null,
  originalText: "",
  isDirty: false,
  setYamlText: (text) =>
    set((s) =>
      s.yamlText === text ? s : { ...s, yamlText: text, isDirty: text !== s.originalText },
    ),
  applyValidParse: (parsed) => set({ parsedDoc: parsed, parseError: null }),
  applyParseError: (error) => set({ parseError: error }),
  reset: (text, parsed) =>
    set({
      yamlText: text,
      originalText: text,
      parsedDoc: parsed,
      parseError: null,
      isDirty: false,
    }),
}));

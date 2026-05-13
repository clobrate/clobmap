/**
 * All user-facing English strings, in one place. The keys form the i18n
 * vocabulary; future languages plug in by providing the same shape.
 *
 * Components should import { strings } from "../i18n/strings" and reference
 * properties — never inline a literal that a translator would touch.
 */
export const strings = {
  app: {
    name: "clobmap",
    titleSuffix: " — clobmap",
    untitled: "Untitled",
  },
  view: {
    label: "View mode",
    yaml: "YAML",
    split: "Split",
    mindmap: "Mind-map",
    cycleHint: "Cycle view (YAML → Split → Mind-map)",
  },
  file: {
    menu: "File",
    open: "Open…",
    save: "Save",
    saveAs: "Save As…",
    recent: "Recent",
    newDefaultName: "untitled.clobmap.yaml",
  },
  status: {
    valid: "Valid",
    invalidPrefix: "Invalid",
    modified: "● modified",
    saved: "saved",
    waitingValidYaml: "Waiting for valid YAML…",
    noDocument: "No document",
  },
  settings: {
    title: "Settings",
    autoSave: "Auto-save",
    autoSaveSub: "Save on the fly when YAML is valid",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    fontSize: "Font size",
    splitOrientation: "Split orientation",
    sideBySide: "Side-by-side",
    stacked: "Stacked",
  },
  context: {
    rename: "Rename",
    editNote: "Edit note…",
    color: "Color",
    clearColor: "Clear color",
    addChild: "Add child",
    addSibling: "Add sibling",
    duplicate: "Duplicate",
    cut: "Cut",
    pasteHere: "Paste here",
    delete: "Delete",
    expand: "Expand",
    collapse: "Collapse",
  },
  dialog: {
    discardTitle: "Unsaved changes",
    discardBody: "Discard unsaved changes?",
    discardOk: "Discard",
    keepEditing: "Keep editing",
    discardAndQuit: "Discard and quit",
    externalChangeTitle: "External change",
    externalChangeBody: "The file changed on disk. Reload and discard your unsaved changes?",
    externalChangeOk: "Reload",
    leavePageWeb: "You have unsaved changes. Leave anyway?",
  },
  rename: {
    placeholder: "Optional longer description…",
    save: "Save",
    cancel: "Cancel",
  },
} as const;

export type Strings = typeof strings;

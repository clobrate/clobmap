import { describe, it, expect } from "vitest";
import {
  coerceNotesFolder,
  DEFAULT_NOTES_FOLDER,
  deletedArchiveName,
  isNoteStorageMode,
  noteFilename,
  noteRelPath,
  slugify,
  validateNotesFolder,
} from "../notesFolder";

describe("isNoteStorageMode", () => {
  it("accepts the two valid modes", () => {
    expect(isNoteStorageMode("inline")).toBe(true);
    expect(isNoteStorageMode("folder")).toBe(true);
  });
  it("rejects anything else", () => {
    for (const v of ["Folder", "", null, undefined, 1, {}]) {
      expect(isNoteStorageMode(v)).toBe(false);
    }
  });
});

describe("slugify", () => {
  it("keeps simple text, collapsing whitespace to dashes", () => {
    expect(slugify("Reception plan")).toBe("Reception-plan");
  });
  it("strips path-dangerous characters", () => {
    expect(slugify('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j");
  });
  it("drops leading dots and dashes", () => {
    expect(slugify("...hidden")).toBe("hidden");
    expect(slugify("--dashy")).toBe("dashy");
  });
  it("caps length at 32 characters", () => {
    expect(slugify("x".repeat(50))).toHaveLength(32);
  });
  it("falls back to 'node' for empty/degenerate input", () => {
    expect(slugify("")).toBe("node");
    expect(slugify("///")).toBe("node");
    expect(slugify("   ")).toBe("node");
  });
});

describe("noteFilename", () => {
  it("is `<nodeId>-<slug>.md`", () => {
    expect(noteFilename("n7", "Ceremony details")).toBe("n7-Ceremony-details.md");
  });
  it("sanitizes an unsafe id without truncating it", () => {
    expect(noteFilename("a/b:c", "Note")).toBe("a-b-c-Note.md");
  });
  it("does not slice the id (uniqueness preserved)", () => {
    const longId = "id" + "9".repeat(40);
    expect(noteFilename(longId, "x")).toBe(`${longId}-x.md`);
  });
  it("falls back to 'node' id when the id is all-unsafe", () => {
    expect(noteFilename("///", "T")).toBe("node-T.md");
  });
});

describe("deletedArchiveName", () => {
  it("is hidden, id+slug keyed, with a filesystem-safe timestamp", () => {
    expect(deletedArchiveName("n3", "Old note", "2026-09-26T20:00:00.000Z")).toBe(
      ".Deleted-n3-Old-note-2026-09-26T20-00-00-000Z.md",
    );
  });
  it("keeps distinct timestamps distinct (no collision)", () => {
    const a = deletedArchiveName("n1", "x", "2026-09-26T20:00:00.000Z");
    const b = deletedArchiveName("n1", "x", "2026-09-26T20:00:01.000Z");
    expect(a).not.toBe(b);
  });
});

describe("noteRelPath", () => {
  it("builds a leading-./ forward-slash relative path", () => {
    expect(noteRelPath("notelets", "n1-Root.md")).toBe("./notelets/n1-Root.md");
  });
  it("normalizes backslashes, leading ./, and trailing slashes", () => {
    expect(noteRelPath(".\\notelets\\", "n1.md")).toBe("./notelets/n1.md");
    expect(noteRelPath("docs/notes/", "n2.md")).toBe("./docs/notes/n2.md");
  });
});

describe("validateNotesFolder", () => {
  it("accepts a simple relative folder", () => {
    const r = validateNotesFolder("notelets");
    expect(r.ok && r.value).toBe("notelets");
  });
  it("accepts a nested relative folder and normalizes it", () => {
    const r = validateNotesFolder("./docs/notes/");
    expect(r.ok && r.value).toBe("docs/notes");
  });
  it("normalizes backslashes", () => {
    const r = validateNotesFolder("docs\\notes");
    expect(r.ok && r.value).toBe("docs/notes");
  });
  it("rejects empty / whitespace", () => {
    expect(validateNotesFolder("").ok).toBe(false);
    expect(validateNotesFolder("   ").ok).toBe(false);
    expect(validateNotesFolder("./").ok).toBe(false);
  });
  it("rejects absolute POSIX paths", () => {
    expect(validateNotesFolder("/etc/notes").ok).toBe(false);
  });
  it("rejects absolute Windows drive paths", () => {
    expect(validateNotesFolder("C:\\notes").ok).toBe(false);
  });
  it("rejects home (~) paths", () => {
    expect(validateNotesFolder("~/notes").ok).toBe(false);
  });
  it("rejects `..` escapes", () => {
    expect(validateNotesFolder("../notes").ok).toBe(false);
    expect(validateNotesFolder("a/../../b").ok).toBe(false);
  });
  it("rejects empty or `.` interior segments", () => {
    expect(validateNotesFolder("a//b").ok).toBe(false);
    expect(validateNotesFolder("a/./b").ok).toBe(false);
  });
});

describe("coerceNotesFolder", () => {
  it("returns the normalized folder for valid input", () => {
    expect(coerceNotesFolder("./notes/")).toBe("notes");
  });
  it("falls back to the default for invalid or missing input", () => {
    expect(coerceNotesFolder("../escape")).toBe(DEFAULT_NOTES_FOLDER);
    expect(coerceNotesFolder("/abs")).toBe(DEFAULT_NOTES_FOLDER);
    expect(coerceNotesFolder(null)).toBe(DEFAULT_NOTES_FOLDER);
    expect(coerceNotesFolder(42)).toBe(DEFAULT_NOTES_FOLDER);
  });
  it("default is 'notelets'", () => {
    expect(DEFAULT_NOTES_FOLDER).toBe("notelets");
  });
});

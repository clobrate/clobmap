/**
 * Per-session draft persistence. Saves the in-progress YAML text to
 * localStorage so closing the tab / quitting the app never loses work.
 * Independent of the file-on-disk concept: on next launch the draft becomes
 * the initial document state.
 */
const KEY = "clobmap-draft";
const VERSION = 1;

interface Draft {
  v: number;
  yamlText: string;
  savedAt: number;
}

function isDraft(v: unknown): v is Draft {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return d.v === VERSION && typeof d.yamlText === "string" && typeof d.savedAt === "number";
}

export function saveDraft(yamlText: string): void {
  try {
    const draft: Draft = { v: VERSION, yamlText, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // localStorage can fail in private mode or when quota is full — non-fatal.
  }
}

export function loadDraft(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed)) return null;
    return parsed.yamlText;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // non-fatal
  }
}

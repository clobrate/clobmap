/**
 * The single chokepoint for note-file I/O (desktop / Tauri only). Everything
 * that touches the disk for notes goes through here, so the logic in
 * `notes.ts` / `notesFolder.ts` stays unit-testable (mock this module) and the
 * trust boundary has one place to enforce later (Phase 4). Thin wrappers over
 * `@tauri-apps/plugin-fs`, dynamically imported so web/iOS bundles never pull
 * it into the hot path.
 */

export async function writeTextFile(path: string, content: string): Promise<void> {
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await writeTextFile(path, content);
}

export async function readTextFile(path: string): Promise<string> {
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return readTextFile(path);
}

/** Recursively create a directory (mkdir -p). */
export async function mkdirp(path: string): Promise<void> {
  const { mkdir } = await import("@tauri-apps/plugin-fs");
  await mkdir(path, { recursive: true });
}

export async function exists(path: string): Promise<boolean> {
  const { exists } = await import("@tauri-apps/plugin-fs");
  return exists(path);
}

export async function remove(path: string): Promise<void> {
  const { remove } = await import("@tauri-apps/plugin-fs");
  await remove(path);
}

export async function rename(from: string, to: string): Promise<void> {
  const { rename } = await import("@tauri-apps/plugin-fs");
  await rename(from, to);
}

/** Names of the regular files directly in `path` (not recursive). */
export async function readDir(path: string): Promise<string[]> {
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const entries = await readDir(path);
  return entries.filter((e) => e.isFile).map((e) => e.name);
}


import { isTauri } from "./env";

/**
 * Open a URL in the user's default browser. On the web, that's just
 * window.open in a new tab. On desktop, plain anchor tags get blocked
 * inside the Tauri webview, so we route through the shell plugin which
 * delegates to the OS.
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

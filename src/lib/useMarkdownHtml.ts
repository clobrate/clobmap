import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { openExternal } from "./openExternal";

/**
 * Shared Markdown → HTML renderer. Lazily loads micromark and re-renders on
 * every content change (even off-screen, so toggling to a preview is
 * instant). micromark output is CommonMark; raw user HTML is escaped by
 * default, matching the product decision that Notelets/notes render markdown
 * only and never execute embedded HTML.
 *
 * Also returns `onLinkClick`: anchor clicks inside rendered output must
 * escape the in-app webview and hand off to the system browser, or the URL
 * would navigate this very window and replace the app. Only safe schemes
 * (http/https/mailto) are honored; anything else (e.g. javascript:) is
 * dropped.
 *
 * Extracted from NotesPopup so the popup and the Notelets view share one
 * render + link-handling path.
 */
export function useMarkdownHtml(content: string): {
  html: string;
  onLinkClick: (e: MouseEvent<HTMLElement>) => void;
} {
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { micromark } = await import("micromark");
        if (cancelled) return;
        setHtml(micromark(content));
      } catch (err) {
        if (cancelled) return;
        setHtml(
          `<p style="color:#dc2626">Preview failed: ${escapeHtml(
            err instanceof Error ? err.message : String(err),
          )}</p>`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [content]);

  const onLinkClick = useCallback((e: MouseEvent<HTMLElement>): void => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    e.preventDefault();
    if (!href) return;
    if (/^(https?:|mailto:)/i.test(href)) void openExternal(href);
  }, []);

  return { html, onLinkClick };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

import { useState } from "react";
import { useDocumentStore } from "../store/document";

const STORAGE_KEY = "clobmap.welcomeBannerDismissed";

function readDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Ignore quota / private-mode errors.
  }
}

/**
 * One-time educational banner for first-time users. Explains in one line
 * what a mind map is and how to interact, then disappears forever once
 * the user dismisses it OR makes their first edit.
 */
export function WelcomeBanner() {
  const [dismissed, setDismissed] = useState(readDismissed);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const currentFilePath = useDocumentStore((s) => s.currentFilePath);

  // Hide once any of these become true. We don't auto-write the dismiss
  // flag for these cases — if the user explicitly dismissed via × we
  // remember; otherwise the banner naturally won't apply again because
  // they'll have a file path or unsaved edits going forward.
  if (dismissed) return null;
  if (isDirty || currentFilePath) return null;

  const onDismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
      <span className="leading-snug">
        A mind map breaks a topic into branches. Click any node and press{" "}
        <kbd className="rounded border border-emerald-300 bg-white px-1 py-px font-mono text-[11px] dark:border-emerald-800 dark:bg-emerald-900/60">
          Tab
        </kbd>{" "}
        to add a child, or{" "}
        <kbd className="rounded border border-emerald-300 bg-white px-1 py-px font-mono text-[11px] dark:border-emerald-800 dark:bg-emerald-900/60">
          Enter
        </kbd>{" "}
        for a sibling.
      </span>
      <button
        type="button"
        aria-label="Dismiss welcome message"
        onClick={onDismiss}
        className="shrink-0 rounded px-2 py-0.5 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-100"
      >
        ×
      </button>
    </div>
  );
}

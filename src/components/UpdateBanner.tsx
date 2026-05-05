import { useState } from "react";
import type { UpdatePayload } from "../store/ui";

interface Props {
  update: UpdatePayload;
  onDismiss: () => void;
}

export function UpdateBanner({ update, onDismiss }: Props) {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      await update.install();
      // install() relaunches the app on success — we won't reach this.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setInstalling(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">Update available — v{update.version}</div>
          {update.body && (
            <div className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs opacity-80">
              {update.body}
            </div>
          )}
          {error && (
            <div className="mt-1 text-xs text-red-600 dark:text-red-400">
              Install failed: {error}
            </div>
          )}
          {installing && !error && (
            <div className="mt-1 text-xs opacity-80">Downloading and installing…</div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={installing}
            className="rounded px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-200/60 disabled:opacity-50 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
          >
            Later
          </button>
          <button
            type="button"
            onClick={onInstall}
            disabled={installing}
            className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {installing ? "Installing…" : "Install & Relaunch"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useDocumentStore } from "../store/document";

export function StatusBar() {
  const parseError = useDocumentStore((s) => s.parseError);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const parsedDoc = useDocumentStore((s) => s.parsedDoc);

  const status = parseError
    ? `Invalid: line ${parseError.line} — ${parseError.message}`
    : parsedDoc
      ? "Valid"
      : "—";

  const tone = parseError
    ? "text-red-600 dark:text-red-400"
    : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="flex items-center justify-between border-t border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
      <span className={tone} aria-live="polite">
        {status}
      </span>
      <span className="tabular-nums">{isDirty ? "● modified" : "saved"}</span>
    </div>
  );
}

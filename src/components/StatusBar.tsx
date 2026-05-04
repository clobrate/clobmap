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

  const tone = parseError ? "text-red-400" : "text-emerald-400";

  return (
    <div className="flex items-center justify-between border-t border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400">
      <span className={tone}>{status}</span>
      <span className="tabular-nums">{isDirty ? "● modified" : "saved"}</span>
    </div>
  );
}

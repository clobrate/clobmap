import { useCallback, useRef, type ReactNode } from "react";
import type { SplitOrientation } from "../store/ui";

interface Props {
  orientation: SplitOrientation; // "horizontal" = side-by-side, "vertical" = stacked
  ratio: number; // 0.2..0.8 (first pane's share)
  onRatioChange: (next: number) => void;
  onRatioCommit?: (final: number) => void;
  first: ReactNode;
  second: ReactNode;
}

const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const KEYBOARD_STEP = 0.05;

function clamp(n: number): number {
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, n));
}

export function SplitPanes({
  orientation,
  ratio,
  onRatioChange,
  onRatioCommit,
  first,
  second,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isStacked = orientation === "vertical";

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const previousCursor = document.body.style.cursor;
      document.body.style.cursor = isStacked ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        const pct = isStacked
          ? (ev.clientY - rect.top) / rect.height
          : (ev.clientX - rect.left) / rect.width;
        onRatioChange(clamp(pct));
      };
      const onUp = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        onRatioCommit?.(ratio);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [isStacked, onRatioChange, onRatioCommit, ratio],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (isStacked) {
      if (e.key === "ArrowUp") next = ratio - KEYBOARD_STEP;
      else if (e.key === "ArrowDown") next = ratio + KEYBOARD_STEP;
    } else {
      if (e.key === "ArrowLeft") next = ratio - KEYBOARD_STEP;
      else if (e.key === "ArrowRight") next = ratio + KEYBOARD_STEP;
    }
    if (e.key === "Home") next = 0.5;
    if (next !== null) {
      e.preventDefault();
      const clamped = clamp(next);
      onRatioChange(clamped);
      onRatioCommit?.(clamped);
    }
  };

  const dividerClass = isStacked
    ? "h-1 w-full cursor-row-resize bg-neutral-200 hover:bg-emerald-400/60 dark:bg-neutral-800"
    : "w-1 h-full cursor-col-resize bg-neutral-200 hover:bg-emerald-400/60 dark:bg-neutral-800";

  return (
    <div ref={containerRef} className={`flex h-full w-full min-h-0 ${isStacked ? "flex-col" : ""}`}>
      <div style={{ flex: `${ratio} 1 0`, minHeight: 0, minWidth: 0 }}>{first}</div>
      <div
        role="separator"
        aria-orientation={isStacked ? "horizontal" : "vertical"}
        aria-valuemin={MIN_RATIO * 100}
        aria-valuemax={MAX_RATIO * 100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label="Resize split panes"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className={`${dividerClass} focus:outline-none focus-visible:bg-emerald-500`}
      />
      <div style={{ flex: `${1 - ratio} 1 0`, minHeight: 0, minWidth: 0 }}>{second}</div>
    </div>
  );
}

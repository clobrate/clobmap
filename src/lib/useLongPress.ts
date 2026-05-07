import { useCallback, useEffect, useRef } from "react";

const MOVE_TOLERANCE_PX = 12;

/**
 * Touch-only long-press detector. Returns handlers to spread onto the target
 * element. The callback fires after `delayMs` of a single-finger hold; finger
 * drift up to MOVE_TOLERANCE_PX is forgiven (real fingers wobble), beyond
 * that the gesture is treated as a pan and cancels. Used on iOS where there's
 * no `contextmenu` event and the system long-press shows the platform menu
 * we don't want.
 */
export function useLongPress(
  callback: (x: number, y: number) => void,
  delayMs = 500,
) {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      firedRef.current = false;
      cancel();
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!t) return;
      const x = t.clientX;
      const y = t.clientY;
      startRef.current = { x, y };
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true;
        cbRef.current(x, y);
      }, delayMs);
    },
    [cancel, delayMs],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (timerRef.current === null) return;
      const start = startRef.current;
      if (!start) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (dx * dx + dy * dy > MOVE_TOLERANCE_PX * MOVE_TOLERANCE_PX) {
        cancel();
      }
    },
    [cancel],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      cancel();
      if (firedRef.current) {
        // Long-press handled — eat the trailing tap so it doesn't also
        // register as a click (which would re-select / dismiss the menu).
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [cancel],
  );

  const onTouchCancel = useCallback(() => cancel(), [cancel]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';

/**
 * Long-press detector for a button that also has a normal click action.
 * Hold `holdMs` → `onLongPress` fires immediately (no confirm) and the
 * trailing click event is swallowed so the normal action doesn't ALSO run.
 * `holding` is true while the finger/pointer is down and the timer is armed —
 * drive the charge-up visual off it.
 */
export function useLongPress(onLongPress: () => void, holdMs = 600) {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const [holding, setHolding] = useState(false);

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHolding(false);
  };

  const handlers = {
    onPointerDown: (event: ReactPointerEvent) => {
      // Primary button / touch only.
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      firedRef.current = false;
      setHolding(true);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        setHolding(false);
        onLongPress();
      }, holdMs);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    // Long-tap on touch opens the browser context menu — kill it here.
    onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
    // The click that follows pointerup after a fired long-press must not run
    // the button's normal action.
    onClickCapture: (event: ReactMouseEvent) => {
      if (firedRef.current) {
        firedRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };

  return { holding, handlers };
}

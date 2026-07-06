import { useCallback, useRef } from 'react';

// Makes a horizontally-scrolling container usable on desktop: mouse wheel scrolls
// it sideways, and (optionally) click-and-drag pans it. Touch is left to native
// scrolling. When drag is enabled, a drag that actually moves swallows the click
// so it doesn't also fire the button underneath.
export function useDragScroll({ drag = true }: { drag?: boolean } = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const state = useRef<{ startX: number; scrollLeft: number; active: boolean; moved: boolean } | null>(
    null
  );

  const onWheel = useCallback((event: React.WheelEvent) => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    // Vertical wheel → horizontal scroll (use whichever delta is larger).
    el.scrollLeft += Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!drag || event.pointerType === 'touch' || (event.button && event.button !== 0)) return;
      const el = ref.current;
      if (!el) return;
      state.current = { startX: event.clientX, scrollLeft: el.scrollLeft, active: true, moved: false };
    },
    [drag]
  );

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const s = state.current;
    const el = ref.current;
    if (!s?.active || !el) return;
    const dx = event.clientX - s.startX;
    if (Math.abs(dx) > 4) s.moved = true;
    el.scrollLeft = s.scrollLeft - dx;
  }, []);

  const endDrag = useCallback(() => {
    if (state.current) state.current.active = false;
  }, []);

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (state.current?.moved) {
      event.preventDefault();
      event.stopPropagation();
      state.current.moved = false;
    }
  }, []);

  const handlers = drag
    ? { onWheel, onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerLeave: endDrag, onClickCapture }
    : { onWheel };

  return { ref, handlers };
}

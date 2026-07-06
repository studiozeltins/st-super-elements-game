import { useCallback, useRef, useState } from 'react';

// Unified pointer-based drag for the team page. Works for both mouse and touch
// from ONE code path (HTML5 drag-and-drop doesn't fire on touch):
//   • mouse  — drag starts after a small move threshold.
//   • touch  — press-and-hold (long press) starts the drag + a short vibration;
//              moving before the hold fires is treated as a list scroll, not a drag.
// A short press with no movement is reported as a tap (opens the detail sheet).

export interface DragGhost {
  x: number;
  y: number;
  letter: string;
  color: string;
}

interface TeamDragOptions {
  onAssign(characterId: string, slotIndex: number): void;
  onTap(characterId: string): void;
}

const LONG_PRESS_MS = 280;
const MOVE_THRESHOLD = 9;

function slotUnder(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y);
  const slot = el?.closest('[data-slot]') as HTMLElement | null;
  if (!slot) return null;
  const index = Number(slot.dataset.slot);
  return Number.isNaN(index) ? null : index;
}

export function useTeamDrag({ onAssign, onTap }: TeamDragOptions) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overSlot, setOverSlot] = useState<number | null>(null);
  const [ghost, setGhost] = useState<DragGhost | null>(null);

  const stateRef = useRef<{
    id: string;
    letter: string;
    color: string;
    startX: number;
    startY: number;
    isTouch: boolean;
    active: boolean;
    timer: number | null;
    el: HTMLElement;
    pointerId: number;
  } | null>(null);

  const activate = useCallback((x: number, y: number) => {
    const s = stateRef.current;
    if (!s || s.active) return;
    s.active = true;
    s.el.setPointerCapture?.(s.pointerId);
    if (s.isTouch && typeof navigator.vibrate === 'function') navigator.vibrate(25);
    setDragId(s.id);
    setGhost({ x, y, letter: s.letter, color: s.color });
  }, []);

  const reset = useCallback(() => {
    const s = stateRef.current;
    if (s?.timer != null) clearTimeout(s.timer);
    stateRef.current = null;
    setDragId(null);
    setOverSlot(null);
    setGhost(null);
  }, []);

  const onPointerDown = useCallback(
    (characterId: string, letter: string, color: string) => (event: React.PointerEvent) => {
      if (event.button && event.button !== 0) return;
      const el = event.currentTarget as HTMLElement;
      const isTouch = event.pointerType === 'touch';
      const timer = isTouch
        ? window.setTimeout(() => activate(event.clientX, event.clientY), LONG_PRESS_MS)
        : null;
      stateRef.current = {
        id: characterId,
        letter,
        color,
        startX: event.clientX,
        startY: event.clientY,
        isTouch,
        active: false,
        timer,
        el,
        pointerId: event.pointerId,
      };
    },
    [activate]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const s = stateRef.current;
      if (!s) return;
      const dist = Math.hypot(event.clientX - s.startX, event.clientY - s.startY);
      if (!s.active) {
        if (!s.isTouch && dist > MOVE_THRESHOLD) {
          activate(event.clientX, event.clientY);
        } else if (s.isTouch && dist > MOVE_THRESHOLD && s.timer != null) {
          // Moved before the hold fired → it's a scroll, abandon the drag intent.
          reset();
        }
        return;
      }
      setGhost({ x: event.clientX, y: event.clientY, letter: s.letter, color: s.color });
      setOverSlot(slotUnder(event.clientX, event.clientY));
    },
    [activate, reset]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const s = stateRef.current;
      if (!s) return;
      if (s.active) {
        const slot = slotUnder(event.clientX, event.clientY);
        if (slot != null) onAssign(s.id, slot);
      } else {
        const dist = Math.hypot(event.clientX - s.startX, event.clientY - s.startY);
        if (dist < MOVE_THRESHOLD) onTap(s.id);
      }
      reset();
    },
    [onAssign, onTap, reset]
  );

  // Handlers to spread onto each draggable chip.
  const chipHandlers = useCallback(
    (characterId: string, letter: string, color: string) => ({
      onPointerDown: onPointerDown(characterId, letter, color),
      onPointerMove,
      onPointerUp,
      onPointerCancel: reset,
    }),
    [onPointerDown, onPointerMove, onPointerUp, reset]
  );

  return { dragId, overSlot, ghost, isDragging: dragId != null, chipHandlers };
}

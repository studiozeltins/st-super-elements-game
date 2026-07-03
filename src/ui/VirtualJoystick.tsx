import { useRef, useState } from 'react';

const JOYSTICK_RADIUS_PX = 52;

interface VirtualJoystickProps {
  onMove(x: number, z: number): void;
}

export function VirtualJoystick({ onMove }: VirtualJoystickProps) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });

  function updateFromPointer(event: React.PointerEvent) {
    const base = baseRef.current;
    if (!base) return;
    const bounds = base.getBoundingClientRect();
    const deltaX = event.clientX - (bounds.left + bounds.width / 2);
    const deltaY = event.clientY - (bounds.top + bounds.height / 2);
    const magnitude = Math.hypot(deltaX, deltaY);
    const clamp = magnitude > JOYSTICK_RADIUS_PX ? JOYSTICK_RADIUS_PX / magnitude : 1;
    const clampedX = deltaX * clamp;
    const clampedY = deltaY * clamp;
    setKnobOffset({ x: clampedX, y: clampedY });
    onMove(clampedX / JOYSTICK_RADIUS_PX, clampedY / JOYSTICK_RADIUS_PX);
  }

  function reset() {
    setKnobOffset({ x: 0, y: 0 });
    onMove(0, 0);
  }

  return (
    <div
      ref={baseRef}
      className="joystick"
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={event => {
        if (event.buttons > 0 || event.pointerType === 'touch') updateFromPointer(event);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      <div
        className="joystick__knob"
        style={{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)` }}
      />
    </div>
  );
}

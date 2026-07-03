export interface InputSystem {
  getMoveVector(): { x: number; z: number };
  isAttackHeld(): boolean;
  consumeJump(): boolean;
  consumeSkill(): boolean;
  consumePartySlot(): number | null;
  setTouchMove(x: number, z: number): void;
  pressTouchButton(button: 'attack' | 'skill' | 'jump'): void;
  releaseTouchButton(button: 'attack'): void;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

const MOVE_KEY_BINDINGS: Record<string, { x: number; z: number }> = {
  KeyW: { x: 0, z: -1 },
  ArrowUp: { x: 0, z: -1 },
  KeyS: { x: 0, z: 1 },
  ArrowDown: { x: 0, z: 1 },
  KeyA: { x: -1, z: 0 },
  ArrowLeft: { x: -1, z: 0 },
  KeyD: { x: 1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
};

export function createInputSystem(canvas: HTMLCanvasElement): InputSystem {
  const pressedKeys = new Set<string>();
  const touchMove = { x: 0, z: 0 };
  let touchAttackHeld = false;
  let jumpQueued = false;
  let skillQueued = false;
  let partySlotQueued: number | null = null;
  let mouseAttackHeld = false;
  let isEnabled = true;

  function handleKeyDown(event: KeyboardEvent) {
    if (!isEnabled || event.repeat) return;
    pressedKeys.add(event.code);
    if (event.code === 'Space') jumpQueued = true;
    if (event.code === 'KeyQ' || event.code === 'KeyE' || event.code === 'KeyK') {
      skillQueued = true;
    }
    const digitMatch = /^Digit([1-4])$/.exec(event.code);
    if (digitMatch) partySlotQueued = Number(digitMatch[1]) - 1;
  }

  function handleKeyUp(event: KeyboardEvent) {
    pressedKeys.delete(event.code);
  }

  function handlePointerDown(event: PointerEvent) {
    if (!isEnabled) return;
    if (event.pointerType === 'mouse' && event.button === 0) mouseAttackHeld = true;
  }

  function handlePointerUp() {
    mouseAttackHeld = false;
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  canvas.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointerup', handlePointerUp);

  return {
    getMoveVector() {
      let x = touchMove.x;
      let z = touchMove.z;
      for (const [keyCode, direction] of Object.entries(MOVE_KEY_BINDINGS)) {
        if (!pressedKeys.has(keyCode)) continue;
        x += direction.x;
        z += direction.z;
      }
      const magnitude = Math.hypot(x, z);
      if (magnitude <= 1) return { x, z };
      return { x: x / magnitude, z: z / magnitude };
    },
    isAttackHeld() {
      return mouseAttackHeld || touchAttackHeld || pressedKeys.has('KeyJ');
    },
    consumeJump() {
      const wasQueued = jumpQueued;
      jumpQueued = false;
      return wasQueued;
    },
    consumeSkill() {
      const wasQueued = skillQueued;
      skillQueued = false;
      return wasQueued;
    },
    consumePartySlot() {
      const queuedSlot = partySlotQueued;
      partySlotQueued = null;
      return queuedSlot;
    },
    setTouchMove(x, z) {
      touchMove.x = x;
      touchMove.z = z;
    },
    pressTouchButton(button) {
      if (button === 'attack') touchAttackHeld = true;
      if (button === 'skill') skillQueued = true;
      if (button === 'jump') jumpQueued = true;
    },
    releaseTouchButton() {
      touchAttackHeld = false;
    },
    setEnabled(enabled) {
      isEnabled = enabled;
      if (enabled) return;
      pressedKeys.clear();
      touchMove.x = 0;
      touchMove.z = 0;
      touchAttackHeld = false;
      mouseAttackHeld = false;
      jumpQueued = false;
      skillQueued = false;
      partySlotQueued = null;
    },
    dispose() {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    },
  };
}

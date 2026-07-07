// Two-tap inline confirmations shared by the party-management sheet: a compact
// ✓/✕ pair for member-row actions (RowConfirm) and a footer button that swaps
// in-place into a labelled ✓/✕ confirm (InlineAction). Both reuse the round Frost
// .party-toast__btn glyph buttons so every confirm in the party UI looks alike.

// Inline ✓/✕ pair shown in a member row while an action (promote/kick) is armed.
export function RowConfirm({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <span className="party-sheet__confirm" role="group" aria-label={label}>
      <button
        type="button"
        className="party-toast__btn party-toast__btn--accept"
        aria-label={`Apstiprināt: ${label}`}
        onClick={onConfirm}
      >
        ✓
      </button>
      <button
        type="button"
        className="party-toast__btn party-toast__btn--decline"
        aria-label="Atcelt"
        onClick={onCancel}
      >
        ✕
      </button>
    </span>
  );
}

// A footer action that swaps in-place between its label button and an inline
// ✓/✕ confirm — same two-tap pattern as the per-member promote.
export function InlineAction({
  label,
  confirmLabel,
  active,
  variant,
  onArm,
  onCancel,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  active: boolean;
  variant: 'danger' | 'ghost';
  onArm(): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  if (!active) {
    return (
      <button
        type="button"
        className={`party-sheet__action party-sheet__action--${variant}`}
        onClick={onArm}
      >
        {label}
      </button>
    );
  }
  return (
    <span className="party-sheet__confirm-row" role="group" aria-label={confirmLabel}>
      <span className="party-sheet__confirm-label">{confirmLabel}</span>
      <button
        type="button"
        className="party-toast__btn party-toast__btn--accept"
        aria-label="Apstiprināt"
        onClick={onConfirm}
      >
        ✓
      </button>
      <button
        type="button"
        className="party-toast__btn party-toast__btn--decline"
        aria-label="Atcelt"
        onClick={onCancel}
      >
        ✕
      </button>
    </span>
  );
}

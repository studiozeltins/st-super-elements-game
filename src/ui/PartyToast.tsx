import { useToastCountdown } from './useToastCountdown';

/** One positive action on a toast (accept / merge / poach / forward / promote). The
 *  parent decides which apply to a given invite; decline is always rendered. */
export interface ToastAction {
  key: string;
  /** Single glyph shown in the round button. */
  icon: string;
  /** Accessible label (also the tooltip). */
  label: string;
  onClick(): void;
}

interface PartyToastProps {
  /** Human name of the other party (inviter, or the joiner asking / requesting). */
  inviterName: string;
  /** Ready-rendered action line (e.g. "aicina barā", "lūdz iecelt par vadoni"). */
  message: string;
  inviteId: bigint;
  /** Positive actions (1–2). Rendered before the always-present decline (✕). */
  actions: readonly ToastAction[];
  onDecline(inviteId: bigint): void;
  /** Client-only ~10s expiry — removes the toast WITHOUT any reducer call (D-08). */
  onExpire(inviteId: bigint): void;
}

// ~10s client-side auto-dismiss (D-07); pause/expiry logic lives in useToastCountdown.
const DISMISS_MS = 10_000;

// Slim Frost strip (top-center header) for one incoming invite / request. A green
// name tag, a short action label, then round icon buttons — one per positive action
// plus a decline — and a thin depleting countdown. role="status" + aria-live keep
// it from stealing focus. Buttons meet the 44px touch target (usability).
export function PartyToast({
  inviterName,
  message,
  inviteId,
  actions,
  onDecline,
  onExpire,
}: PartyToastProps) {
  const { leaving, paused, pauseHandlers } = useToastCountdown(DISMISS_MS, () => onExpire(inviteId));

  return (
    <div
      className={`party-toast ${leaving ? 'party-toast--leaving' : ''}`}
      role="status"
      aria-live="polite"
      {...pauseHandlers}
    >
      <span className="party-toast__tag">{inviterName}</span>
      <span className="party-toast__msg">{message}</span>
      {actions.map(action => (
        <button
          key={action.key}
          type="button"
          className="party-toast__btn party-toast__btn--accept"
          onClick={action.onClick}
          aria-label={action.label}
          title={action.label}
        >
          {action.icon}
        </button>
      ))}
      <button
        type="button"
        className="party-toast__btn party-toast__btn--decline"
        onClick={() => onDecline(inviteId)}
        aria-label="Noraidīt"
        title="Noraidīt"
      >
        ✕
      </button>
      <span
        className="party-toast__timer"
        style={{ animationPlayState: paused || leaving ? 'paused' : 'running' }}
        aria-hidden="true"
      />
    </div>
  );
}

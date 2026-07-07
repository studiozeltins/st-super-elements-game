import { useToastCountdown } from './useToastCountdown';

interface PartyToastProps {
  /** Display-only invite kind: 'invite' = a leader invited me; 'request' = someone
   *  asked to join my party (I'm the recipient/leader). Drives the message copy only. */
  kind: 'invite' | 'request';
  /** Human name of the other party (inviter, or the joiner asking to join). */
  inviterName: string;
  /** The invite row id — passed back verbatim to the accept/decline reducers. */
  inviteId: bigint;
  onAccept(inviteId: bigint): void;
  onDecline(inviteId: bigint): void;
  /** Client-only ~10s expiry. Removes the toast from view WITHOUT any reducer call —
   *  the invite persists server-side (D-08) and stays in the Settings missed list. */
  onExpire(inviteId: bigint): void;
}

// ~10s client-side auto-dismiss (D-07); pause/expiry logic lives in useToastCountdown.
const DISMISS_MS = 10_000;

// Slim Frost strip (top-center header) for one incoming invite/join-request:
// a green clickable-style name tag, a short action label, round icon-only
// accept/decline buttons, and a thin depleting countdown bar. Announces via
// role="status" + aria-live="polite" so it never steals focus (Pitfall 5).
export function PartyToast({
  kind,
  inviterName,
  inviteId,
  onAccept,
  onDecline,
  onExpire,
}: PartyToastProps) {
  const { leaving, paused, pauseHandlers } = useToastCountdown(DISMISS_MS, () => onExpire(inviteId));
  const action = kind === 'request' ? 'lūdz pievienoties' : 'aicina barā';

  return (
    <div
      className={`party-toast ${leaving ? 'party-toast--leaving' : ''}`}
      role="status"
      aria-live="polite"
      {...pauseHandlers}
    >
      <span className="party-toast__tag">{inviterName}</span>
      <span className="party-toast__msg">{action}</span>
      <button
        type="button"
        className="party-toast__btn party-toast__btn--accept"
        onClick={() => onAccept(inviteId)}
        aria-label="Pieņemt"
      >
        ✓
      </button>
      <button
        type="button"
        className="party-toast__btn party-toast__btn--decline"
        onClick={() => onDecline(inviteId)}
        aria-label="Noraidīt"
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

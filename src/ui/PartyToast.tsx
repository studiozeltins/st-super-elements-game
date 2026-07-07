import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

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

// ~10s client-side auto-dismiss (D-07). Hover/focus PAUSES the countdown so a
// keyboard user is never timed out mid-read.
const DISMISS_MS = 10_000;
// Matches the .party-toast exit keyframe duration (0.3s) — keep in sync with CSS.
const EXIT_MS = 300;

// Right-edge transient for a single incoming invite/join-request. Announces via
// role="status" + aria-live="polite" so it never steals focus (Pitfall 5). The
// 10s timer is client-only: on expiry the toast slides out and is removed from
// view, but NO reducer is called — the invite lives on server-side (D-08) and
// remains actionable from Settings' missed-invites list.
export function PartyToast({
  kind,
  inviterName,
  inviteId,
  onAccept,
  onDecline,
  onExpire,
}: PartyToastProps) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Remaining time so hover/focus truly PAUSES (not restarts) the countdown.
  const remainingRef = useRef(DISMISS_MS);

  // Countdown: runs while not paused and not already leaving. On timeout we begin
  // the exit animation rather than removing immediately.
  useEffect(() => {
    if (paused || leaving) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => setLeaving(true), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [paused, leaving]);

  // After the exit animation plays, drop the toast from view (no reducer call).
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onExpire(inviteId), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, inviteId, onExpire]);

  const message =
    kind === 'request'
      ? `${inviterName} lūdz pievienoties tavam baram`
      : `${inviterName} aicina tevi savā barā`;

  return (
    <div
      className={`party-toast ${leaving ? 'party-toast--leaving' : ''}`}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className="party-toast__msg">{message}</p>
      <div className="party-toast__actions">
        <Button variant="primary" onClick={() => onAccept(inviteId)}>
          Pieņemt
        </Button>
        <Button variant="ghost" onClick={() => onDecline(inviteId)}>
          Noraidīt
        </Button>
      </div>
    </div>
  );
}

// Pure party-rule decisions, kept dependency-free so they can be unit-tested
// directly under the client's vitest runner (same pattern as deathPenalty.ts).
// No ctx, no db, no dependencies, no random, no time — this preserves the calling reducer's
// determinism (CLAUDE.md rule 2) and keeps promotion/eligibility
// server-authoritative: the caller (Plan 02's reducer) maps its already-authorized,
// server-read rows into these primitives before deciding — never a client value.
//
// nextLeader promotes the oldest-joined member (D-05); ties break on the
// lexicographically smallest identityHex so a reducer replaying identical
// ctx.timestamp values always promotes the same member (reproducible, not
// insertion-order dependent).
//
// canAccept's branch ORDER is load-bearing (mitigates T-05-04): the
// already-partied check runs BEFORE the cap check, so a player already in a party
// is rejected with a stable 'already_partied' reason regardless of roster fullness.
// The DB unique() constraint (Plan 02) is the atomic backstop; this is the decision.

export interface Member {
  identityHex: string;
  joinedAtMicros: bigint;
}

export interface AcceptDecision {
  ok: boolean;
  reason: string | null;
}

// Returns the identityHex of the member who should lead the party: the one with
// the smallest joinedAtMicros (oldest-joined), breaking ties on the smallest
// identityHex. Returns null for an empty roster (caller disbands). (D-05)
export function nextLeader(members: Member[]): string | null {
  return members.reduce<Member | null>((best, candidate) => {
    if (best === null) return candidate;
    if (candidate.joinedAtMicros < best.joinedAtMicros) return candidate;
    if (
      candidate.joinedAtMicros === best.joinedAtMicros &&
      candidate.identityHex < best.identityHex
    ) {
      return candidate;
    }
    return best;
  }, null)?.identityHex ?? null;
}

// Decides whether a joiner may be accepted into a party. Gates in priority order:
// (1) already in a party → reject 'already_partied' (checked FIRST);
// (2) else roster at/over cap → reject 'full';
// (3) else accept. (D-06)
export function canAccept(
  rosterSize: number,
  joinerAlreadyPartied: boolean,
  cap: number
): AcceptDecision {
  if (joinerAlreadyPartied) {
    return { ok: false, reason: 'already_partied' };
  }
  if (rosterSize >= cap) {
    return { ok: false, reason: 'full' };
  }
  return { ok: true, reason: null };
}

# Phase 5: Multiplayer party - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 5-Multiplayer party
**Areas discussed:** Grouping mechanism, Disconnect behavior, Leader-leaves policy, Invite notification UX, Party panel UI

---

## Grouping mechanism (join code format → invite flow)

| Option | Description | Selected |
|--------|-------------|----------|
| Invite-only | Tap player → invite → accept. No codes. | ✓ |
| Invite + join code | Fortnite parity, shareable code for off-screen friends. | |
| Invite + online-list | Invite-only but with an online-players list. | |

**User's choice:** Invite-only, NO codes. Tap a player → slide-out sheet with "invite to my
party" or "ask to join their party". If the target has no party, one is created — and for the
ask-to-join case, the **other player (target) becomes leader**.
**Notes:** Symmetric accept flow — recipient always Accepts/Declines. "Invite to my party" =
I lead; "ask to join their party" = they lead.

---

## Disconnect behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Persist | Keep membership on disconnect; remove only on explicit Leave. | ✓ |
| Kick on disconnect | Remove in clientDisconnected (phase-file literal). | |

**User's choice:** Persist.
**Notes:** A blip / relog must not break the raid party. Roster shows offline via `player.online`.

---

## Leader-leaves policy

| Option | Description | Selected |
|--------|-------------|----------|
| Promote next member | Oldest-joined remaining member becomes leader. | ✓ |
| Disband party | Leader leaving nukes the party. | |

**User's choice:** Promote next member. Disband only when the last member leaves.

---

## Invite notification UX

| Option | Description | Selected |
|--------|-------------|----------|
| 15s auto-dismiss + missed list | 15s toast, server-expires, missed panel. | |
| 10s auto-dismiss + missed list | 10s toast, missed panel. | ✓ |
| No expiry, dismissable | Invite stays valid, toast auto-hides. | |

**User's choice:** 10s toast (client-side) + missed-invites list. Toast slides in from the
side, Accept/Decline, non-intrusive; missed ones recoverable under menu/settings. Invite
invalidated by state (party full / disband / already partied), not a hard server timer.

---

## Party panel UI

**User's choice (freeform):** Tap/click a player → sheet slides out (rounded, accessibility
in mind) with Fortnite-style buttons. Recipient gets a small side-sliding notification with
Accept/Cancel. Roster shows active character + role badge (+ leader crown, online dot).
**Notes:** Feeds /gsd-ui-phase — this is a UI-heavy phase.

---

## Claude's Discretion

- Tap-target implementation: on-screen 3D avatar raycast (user's described intent) vs. an
  online-players list fallback — research to resolve.
- Exact table/reducer names, `party_invite` columns, and mount point of the missed-invites list.

## Deferred Ideas

- Shareable text join code for off-screen / cross-device friends — rejected for this phase.
- Configurable / longer missed-invite retention under settings — future polish.

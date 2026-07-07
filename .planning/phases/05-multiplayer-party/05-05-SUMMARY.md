---
phase: 05-multiplayer-party
plan: 05
subsystem: multiplayer-party
tags: [client, party, toast, roster, settings, react, css, a11y]
requires:
  - Plan 04 client wiring — recipient-filtered party_invite subscription, myInvites/myRoster derivations, and the 5 reducer callers (invitePlayer/requestJoin/acceptInvite/declineInvite/leaveParty)
  - approved 05-UI-SPEC toast / missed-invites / roster contract
provides:
  - PartyToast — right-edge invite/request transient, 10s client-only auto-dismiss (paused on hover/focus), accept/decline
  - PartyRoster — live member panel with online dot + name + active character + role badge + leader crown
  - NOKAVĒTIE AICINĀJUMI missed-invites section under Settings (calm fallback for dismissed/expired toasts)
  - completed two-client receive loop (send-side shipped in Plan 04)
affects:
  - Plan 06 (two-client playtest of the full invite/accept/leave loop)
tech-stack:
  added: []
  patterns:
    - Client-only pausable countdown via a remainingRef decremented on cleanup (true pause, not restart) so hover/focus never times out a keyboard user
    - Exit animation on timeout via a transient `leaving` state → CSS keyframe → deferred onExpire (no reducer call; invite persists server-side, D-08)
    - Single invitesWithNames derivation (kind + resolved name + Latvian message) shared by the toast AND the Settings missed list — one copy source
    - Presentational PartyRoster rendered inside the existing Pulks Modal (title keeps n/4) above the online-players tap surface, rather than owning its own Modal
key-files:
  created:
    - src/ui/PartyToast.tsx
    - src/ui/PartyRoster.tsx
  modified:
    - src/App.tsx
    - src/ui/SettingsScreen.tsx
    - src/index.css
decisions:
  - "PartyRoster is presentational (roster rows + empty state only) and renders INSIDE the existing Pulks Modal, above the online-players tap surface. Rationale: the plan allows 'reuse Modal size=sm OR an in-HUD panel'; the Modal already carries the `Pulks · n/4` title and the online-players list is the send-side invite surface. Keeping both in one cohesive panel avoids two competing party surfaces and preserves the Plan 04 invite flow."
  - "The temporary SAŅEMTIE AICINĀJUMI list added to the Pulks Modal in Plan 04 was removed (migrated). The live toast now covers the receive path and the Settings NOKAVĒTIE AICINĀJUMI section covers missed/dismissed invites — no two competing invite UIs (prior-wave note honored)."
  - "Toast hover-pause requires pointer events on the toast body, which conflicts with the literal 'pointer-events only on buttons'. Resolved by making the .party-toast-stack pointer-passive (never blocks the lower-left joystick/action cluster) while each small top-right .party-toast is interactive so hover pauses its timer. The must-have hover/focus-pause a11y requirement takes precedence."
  - "Toast timer is a real pause (remainingRef decremented on effect cleanup), and expiry plays a 0.3s exit keyframe via a `leaving` state before calling onExpire — which only removes the toast from view, never a reducer (D-08)."
metrics:
  duration: 14 min
  completed: 2026-07-07
status: complete
---

# Phase 05 Plan 05: Party Receive-Side (Toast + Missed-Invites) + Roster Summary

Delivered the "receive" half of the Pulks party loop plus the live roster, completing
the two-client flow whose send-side shipped in Plan 04. An incoming invite/join-request
now surfaces as a non-intrusive right-edge **PartyToast** (`role="status"` /
`aria-live="polite"`, ~10s client-only auto-dismiss that pauses on hover/focus,
`Pieņemt` / `Noraidīt`). On expiry the toast leaves the view only — no reducer fires, so
the invite persists server-side (D-08) and stays actionable in a calm **NOKAVĒTIE
AICINĀJUMI** section under Settings. The **PartyRoster** panel (opened from the HUD Pulks
chip) lists each member with an online dot, name, active character in its element color,
a role badge, and the leader crown — leader first, offline rows dimmed. The temporary
received-invites list from Plan 04 was migrated away. `pnpm build` is green.

## What Was Built

### Task 1 — PartyToast + App render wiring (commit `48071d6`)
- **`src/ui/PartyToast.tsx`:** right-edge transient for a single invite/request.
  `role="status"` + `aria-live="polite"` (announce without stealing focus). Message copy
  from `kind` (display only): invite → `{vārds} aicina tevi savā pulkā`, request →
  `{vārds} lūdz pievienoties tavam pulkam`. `Pieņemt` (primary) / `Noraidīt` (ghost),
  each ≥44px. A **real** ~10s pausable countdown (`remainingRef` decremented on effect
  cleanup) — hover (`onMouseEnter/Leave`) and focus (`onFocus/Blur`, which bubble) pause
  it. On timeout a `leaving` state plays a 0.3s exit keyframe, then `onExpire` removes the
  toast from view **without any reducer call** (invite persists, D-08).
- **App.tsx:** newest-first `myPendingInvites` sort; a single `invitesWithNames` derivation
  (kind + resolved other-player name + ready Latvian message) reused by both surfaces;
  `toastInvites` = pending minus toast-dismissed ids; `dismissToast` callback. Renders a
  `.party-toast-stack` from `toastInvites` with `key={id}` remount-per-toast. Accept/Decline
  call the Plan 04 callers and dismiss.
- **Migration:** removed the temporary SAŅEMTIE AICINĀJUMI block (and the now-unused
  `Button` import) from the Pulks Modal.
- **CSS:** `.party-toast-stack` (positioned, pointer-passive) + `.party-toast`
  (translateX enter/exit, interactive) with the mandatory `prefers-reduced-motion`
  fade-only block.

### Task 2 — PartyRoster panel (commit `52f335b`)
- **`src/ui/PartyRoster.tsx`:** one `.party-roster__row` per member — online dot
  (`●`/`○` + `Tiešsaistē`/`Nesaistē` aria-label), name, active character in element color,
  role badge reusing `ROLE_META` + `.sheet__role` (no new server field), leader crown `♛`
  (`var(--gold)`, `aria-label="Pulka vadonis"`). Leader rendered first, then members by
  `joinedAt`; offline rows `opacity:0.5` + hollow dot. Empty state
  (`Tu neesi nevienā pulkā` + hint) when in no party.
- **App.tsx:** mounted inside the Pulks Modal (title already shows `Pulks · n/4`), above the
  online-players tap surface. Props are `readonly` to match `useTable`'s readonly rows.
- **CSS:** `.party-roster` / `.party-roster__row` (+ offline/empty variants) reusing the
  shipped panel row box. No new tokens.

### Task 3 — Missed-invites section in Settings (commit `12d06e0`)
- **`src/ui/SettingsScreen.tsx`:** new `NOKAVĒTIE AICINĀJUMI` section listing ALL pending
  invites (incl. dismissed/expired-toast) with `Pieņemt` / `Noraidīt` wired to the same
  `acceptInvite` / `declineInvite` reducers; empty-state `Nav nokavētu aicinājumu.`. New
  `missedInvites` / `onAcceptInvite` / `onDeclineInvite` props threaded from App.
- **CSS:** `.missed-invites` / `.missed-invites__item` reusing the `.settings__section`
  kicker + panel row box.

## Verification

- `pnpm build` (tsc -b + vite build) → **EXIT 0** for all three tasks (`✓ built in ~5s`).
  The >500 kB chunk warning is pre-existing and unrelated.
- **T-05-05 (Information Disclosure):** `myInvites` is consumed ONLY via `myPendingInvites`,
  which filters `recipientIdentity === myIdentityHex`; the subscription itself is
  `.where(row => row.recipientIdentity.eq(myCanonicalIdentity))` (App.tsx:134). Grep confirms
  no unfiltered invite iteration for other recipients (App.tsx:160/320–321).
- Toast/roster/missed-list are all wired to the Plan 04 accept/decline callers; no new
  reducer or actor-trusting path introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — readonly type mismatch] PartyRoster props typed `readonly`**
- **Found during:** Task 2.
- **Issue:** `useTable(tables.player)` returns a `readonly` array; passing it to a `Player[]`
  prop failed `tsc` (TS4104).
- **Fix:** Typed `players`/`myRoster` props as `readonly` (they are only read).
- **Files modified:** src/ui/PartyRoster.tsx. **Commit:** `52f335b`.

**2. [Rule 3 — dead import] Removed unused `Button` import from App.tsx**
- **Found during:** Task 1.
- **Issue:** Migrating the temporary received-invites list left `Button` unused in App.tsx,
  a hard error under `noUnusedLocals`.
- **Fix:** Removed the import (Button now lives in PartyToast / SettingsScreen).
- **Files modified:** src/App.tsx. **Commit:** `48071d6`.

### Design decisions (not deviations, but worth flagging)
- **PartyRoster composition:** rendered inside the existing Pulks Modal rather than owning
  its own Modal — see Decisions. Keeps the online-players send surface reachable and the
  `Pulks · n/4` title in one place.
- **Toast pointer-events:** the stack is pointer-passive; each toast is interactive so hover
  pauses the timer — see Decisions.

## Threat Surface

- **T-05-05 (Information Disclosure — invites):** Mitigated. Recipient-filtered subscription
  + `recipientIdentity === myIdentityHex` guard on every derived surface (toast, roster is
  party-scoped, missed-list). No cross-player invite is ever rendered.
- **T-05-02 (Elevation of Privilege — accept/decline):** Mitigated. The UI supplies only
  `inviteId`; the server (Plan 02) re-verifies actor == recipient. No client-trusted actor
  path added.

No new security-relevant surface (client subscription + UI only; no endpoints/auth paths).

## Known Stubs

- None. All three surfaces are fully functional and wired to live server rows.

## Self-Check: PASSED
- FOUND: src/ui/PartyToast.tsx
- FOUND: src/ui/PartyRoster.tsx
- FOUND: src/ui/SettingsScreen.tsx (NOKAVĒTIE AICINĀJUMI section)
- FOUND: src/index.css (.party-toast / .party-roster / .missed-invites + reduced-motion)
- FOUND commit 48071d6 (feat: party invite toast)
- FOUND commit 52f335b (feat: party roster panel)
- FOUND commit 12d06e0 (feat: missed-invites section in Settings)
- pnpm build EXIT 0

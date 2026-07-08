---
phase: 05-multiplayer-party
plan: 04
subsystem: multiplayer-party
tags: [client, party, subscription, react, radix-dialog, hud, css]
requires:
  - regenerated bindings exposing party/partyMember/partyInvite + 5 reducers (Plan 03)
  - approved 05-UI-SPEC player-sheet / party-chip contract
provides:
  - client subscription to party + partyMember + party_invite (recipient-filtered)
  - 5 wired reducer callers (invitePlayer/requestJoin/acceptInvite/declineInvite/leaveParty)
  - canonical party-state derivations (myPartyId/myRoster/isPartyFull/leader)
  - PlayerSheet slide-out (send-side invite/ask-to-join/leave)
  - online-players tap surface + received-invites list in a Pulks Modal
  - .hud__party-chip entry point
affects:
  - Plan 05 (receive-side toasts + missed-invites-in-settings + roster panel refine this surface)
  - Plan 06 (two-client playtest of the full invite/accept/leave loop)
tech-stack:
  added: []
  patterns:
    - Recipient-filtered subscription via .where(row => row.recipientIdentity.eq(canonical)) (Info-Disclosure mitigation)
    - Canonical-identity resolution hoisted above the subscription effect so the invite filter binds to the real recipient
    - Radix Dialog primitives used directly (not the Modal wrapper) for a right-docked slide-out with focus-trap/ESC/ARIA
    - Store tap-target by canonical hex; re-derive the live row so the sheet stays reactive
key-files:
  created:
    - src/ui/PlayerSheet.tsx
  modified:
    - src/App.tsx
    - src/ui/Hud.tsx
    - src/index.css
decisions:
  - "Received-invites list added to the Pulks Modal in Plan 04. Rationale: tsconfig noUnusedLocals=true makes an unused acceptInvite/declineInvite/myInvites a hard tsc error, and the plan (Task 1) mandates wiring all five callers. A minimal receive surface keeps every caller live, makes the loop testable now, and Plan 05 will migrate it to the toast + Settings missed-invites surfaces."
  - "PlayerSheet uses Radix Dialog primitives directly (Dialog.Root/Portal/Overlay/Content) rather than the centered Modal component, because the sheet is right-docked. Focus-trap/ESC/ARIA still come from Radix (UI-SPEC/pattern-map explicitly allow the Dialog structure); the leave-confirm reuses the Modal component."
  - "Canonical-identity resolution (accountLink useTable + myLink/myIdentityHex/myCanonicalIdentity) moved above the subscription effect and the effect keyed on myIdentityHex, so the party_invite filter (re)binds once the canonical id resolves without a per-render resubscribe churn."
  - "Chip label uses RAID_PARTY_SIZE (imported into Hud) for PULKS n/4; the chip is a separate left-cluster text chip, never the ⚑ Komanda character-team button."
metrics:
  duration: 12 min
  completed: 2026-07-07
status: complete
---

# Phase 05 Plan 04: Party Client Wiring + Player Sheet (Send-Side) Summary

Wired the client to the party backend and shipped the "send" half of the Fortnite-style
party flow. App.tsx now subscribes `party` / `partyMember` and a **recipient-filtered**
`party_invite` (a player only ever receives invites addressed to their canonical identity —
T-05-05), exposes all five party reducer callers, and derives party state (`myPartyId`,
`myRoster`, `isPartyFull`, leader) from the canonical identity. A new right-docked
`PlayerSheet` slide-out (Radix Dialog: focus-trap / ESC / ARIA, no hand-rolled focus) carries
the symmetric `Aicināt manā pulkā` / `Lūgt pievienoties pulkam` actions plus a
confirm-gated `Pamest pulku`, opened from an online-players tap surface. A `.hud__party-chip`
(`PULKS` / `PULKS n/4`) is the HUD entry point, distinct from the ⚑ character-team button.
`pnpm build` is green.

## What Was Built

### Task 1 — App.tsx: subscriptions + reducer callers + canonical party state (commit `7b883ac`)
- **Subscription:** extended the existing `.subscribe([...])` with `tables.party`,
  `tables.partyMember`, and `tables.partyInvite.where(row => row.recipientIdentity.eq(myCanonicalIdentity))`,
  mirroring the shipped `accountLink.where(...)` idiom. The canonical identity
  (`accountLink` → `myLink.canonicalIdentity`) is resolved **before** the effect; the effect
  is keyed on `myIdentityHex` so the invite filter binds once the canonical id resolves.
- **Reactive reads:** `parties`, `partyMembers`, `myInvites` via `useTable`.
- **Reducer callers:** `invitePlayer`, `requestJoin`, `acceptInvite`, `declineInvite`,
  `leaveParty` — each supplies only `targetIdentity`/`inviteId` as a lookup (actor resolved
  server-side from `ctx.sender`, T-05-01).
- **Derivations:** `myMembership`/`myPartyId`/`myRoster`/`myPartyCount`/`isInParty`/`isPartyFull`,
  `iAmLeader` + `leaveConfirmBody`, `onlinePlayers`, `sheetTarget` (re-derived from live rows),
  `sharesPartyWithTarget`, `myPendingInvites`. All identity comparisons use `.toHexString()`
  against `myIdentityHex` (canonical), never the device identity.

### Task 2 — PlayerSheet slide-out + online-players tap surface (commit `7b883ac`)
- **`src/ui/PlayerSheet.tsx`:** right-docked `.player-sheet__panel` via Radix Dialog primitives.
  Header (name 18px/700), active character name + element color, role badge via
  `ROLE_META[CHARACTERS[id].role]` reusing the shipped `.sheet__role` box (no new server field),
  online dot (`●`/`○` + `Tiešsaistē`/`Nesaistē` aria-label). Action stack (gap 16px): D-02
  visibility — invite + ask-to-join when unrelated (invite disabled with `Pulks ir pilns (4/4)`
  when full), only `Pamest pulku` (danger, behind a `Modal` confirm) when sharing a party. First
  enabled action auto-focused via `onOpenAutoFocus`; each action ≥44px.
- **Tap surface (App.tsx):** the Pulks `Modal` lists `onlinePlayers` (online, excluding self by
  canonical hex); tapping a row sets `sheetTargetHex` and mounts `<PlayerSheet>`.

### Task 3 — HUD party chip + .player-sheet CSS (commit `c61721f`)
- **`src/ui/Hud.tsx`:** `.hud__party-chip` in `.hud__meta-row` — `PULKS {n}/4` when partied
  (using imported `RAID_PARTY_SIZE`) else `PULKS`; opens the party surface via `onOpenParty`.
  Explicitly a separate text chip, not the ⚑ "Komanda" button.
- **`src/index.css`:** `.player-sheet__scrim` (inset:0; z-index:14; `rgba(4,7,5,0.82)`;
  click-to-close) + `.player-sheet__panel` (right-docked; `min(360px,92vw)`;
  `border-radius:12px 0 0 12px`; `var(--panel)`; `border-left`) with a `translateX(100%)→0`
  enter (`cubic-bezier(0.2,0.9,0.2,1) 0.22s`, matching `.modal__panel`). Mandatory
  `@media (prefers-reduced-motion: reduce)` fade-only block. Chip + online-players +
  received-invites list styles. No new color tokens.

## Verification

- `./node_modules/.bin/tsc -b --pretty false` → **EXIT 0** (Tasks 1 & 2 gate).
- `pnpm build` (tsc -b + vite build) → **EXIT 0**, `✓ built in 7.12s` (Task 3 gate). The
  >500 kB chunk warning is pre-existing and unrelated.
- `party_invite` subscription confirmed `.where(...recipientIdentity...)` filtered
  (`src/App.tsx:129`).
- All five reducer callers present via `connection.reducers.*` (`src/App.tsx:361–384`).
- `.hud__party-chip` present (`src/ui/Hud.tsx:174`); does not reuse the ⚑ button.

## Deviations from Plan

### Auto-added functionality

**1. [Rule 2/3 — noUnusedLocals compile gate] Minimal received-invites list added to the Pulks Modal**
- **Found during:** Task 1 (wiring the 5 reducer callers).
- **Issue:** `tsconfig` sets `noUnusedLocals: true` and `noUnusedParameters: true`, and the build
  gate is `tsc -b` + `vite build` (no ESLint). Declaring `acceptInvite`, `declineInvite`, and the
  `myInvites` read with **no consumer** (the receive-side toast/missed-invites are Plan 05) is a
  hard `tsc` error — so the plan's own Task 1 requirement ("all five reducer callers wired") could
  not compile as written.
- **Fix:** Added a compact "SAŅEMTIE AICINĀJUMI" section to the Pulks `Modal` that lists
  `myPendingInvites` with `Pieņemt` / `Noraidīt` calling `acceptInvite` / `declineInvite`. This
  keeps every caller live, makes the full invite/accept/leave loop testable in Plan 04, and is a
  minimal precursor that Plan 05 will migrate into the spec'd toast + Settings missed-invites
  surfaces.
- **Files modified:** src/App.tsx.
- **Commit:** `7b883ac`.

**2. [Rule 3 — right-docked layout] PlayerSheet uses Radix Dialog primitives directly**
- **Found during:** Task 2.
- **Issue:** The shipped `Modal` component hardcodes the centered `.modal__panel` styling; the
  UI-SPEC requires a right-docked slide-out.
- **Fix:** Used Radix `Dialog.Root/Portal/Overlay/Content` directly with the `.player-sheet__*`
  classes (still Radix focus-trap/ESC/ARIA — pattern-map §PlayerSheet explicitly allows the Dialog
  structure; UI-SPEC says "Radix Dialog wrapper OR replicate its trap"). The leave-confirm reuses
  the `Modal` component unchanged.
- **Files modified:** src/ui/PlayerSheet.tsx.
- **Commit:** `7b883ac`.

**3. [Rule 3 — hook ordering] Canonical-identity resolution hoisted above the subscription effect**
- **Found during:** Task 1.
- **Issue:** The filtered `party_invite` subscription needs the canonical `Identity` object, but
  `accountLink`/`myLink`/`myIdentityHex` were derived *after* the subscription effect. Referencing
  a `const` in the effect's dependency list before its declaration would hit the TDZ.
- **Fix:** Moved the `accountLink` `useTable` + `myLink`/`myIdentityHex`/`myCanonicalIdentity`
  derivation above the subscription effect (a consistent, unconditional hook reorder) and keyed the
  effect on the stable `myIdentityHex` string to avoid per-render resubscribe churn. The old
  declaration site was replaced with the three party `useTable` reads.
- **Files modified:** src/App.tsx.
- **Commit:** `7b883ac`.

## Threat Surface

- **T-05-05 (Information Disclosure — party_invite):** Mitigated. The subscription is
  `.where(row => row.recipientIdentity.eq(myCanonicalIdentity))`, so a client only ever receives
  invites addressed to its canonical identity. `myPendingInvites` re-filters on the canonical hex
  as belt-and-braces.
- **T-05-01 (Spoofing — reducer callers):** Mitigated. Every caller passes only
  `targetIdentity`/`inviteId` as data; no client-trusted actor path is introduced (actor is
  `ctx.sender` server-side, Plan 02).

No new security-relevant surface introduced (client subscription + UI only; no new endpoints or
auth paths).

## Known Stubs

- None that block the plan's goal. The received-invites list is a functional (not stub) minimal
  surface; the polished toast auto-dismiss + Settings missed-invites list + roster panel are
  explicit Plan 05 scope, not stubs.

## Self-Check: PASSED
- FOUND: src/ui/PlayerSheet.tsx
- FOUND: src/App.tsx (party subscriptions + 5 reducer callers + derivations)
- FOUND: src/ui/Hud.tsx (.hud__party-chip)
- FOUND: src/index.css (.player-sheet + reduced-motion)
- FOUND commit 7b883ac (feat: party subscriptions, reducer callers + player sheet)
- FOUND commit c61721f (feat: HUD Pulks chip + player-sheet styles)
- tsc -b EXIT 0; pnpm build EXIT 0

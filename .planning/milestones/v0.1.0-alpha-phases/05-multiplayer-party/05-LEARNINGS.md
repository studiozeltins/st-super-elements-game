---
phase: 5
phase_name: "Multiplayer party"
project: "super-elements"
generated: "2026-07-08"
counts:
  decisions: 9
  lessons: 7
  patterns: 6
  surprises: 5
missing_artifacts: []
---

# Phase 5 Learnings: Multiplayer party

## Decisions
### Distinct `RAID_PARTY_SIZE` constant, never reuse `PARTY_SIZE`
Introduced a separate `RAID_PARTY_SIZE = 4` (server + mirrored client const, regex parity-asserted) for the player-party cap instead of reusing the existing `PARTY_SIZE = 4` character-team cap.

**Rationale:** Both are 4 today, so reuse "works" and the coupling is invisible — a later tune to one would silently break the other. Two unrelated concepts must not share a constant.
**Source:** 05-01-SUMMARY.md / 05-RESEARCH.md

### Model invites as joiner/recipient, not from/to
`party_invite` carries `joinerIdentity` (who is added on accept) and `recipientIdentity` (who must accept); `kind` ('invite'|'request') is display copy only.

**Rationale:** Makes the security-critical accept path fully symmetric — it always adds `joinerIdentity` after verifying `actor == recipientIdentity`, with no branch on `kind`. Fewer code paths in the authz-sensitive reducer means less room for an access-control bug.
**Source:** 05-RESEARCH.md / 05-02-SUMMARY.md

### Enforce cap + one-party-per-player at accept time, backed by a DB unique constraint
Roster-cap and double-join checks live in `acceptInvite` (via `canAccept`), not at send time; `party_member.identity` is `.unique()` as the atomic backstop.

**Rationale:** Checking capacity at send time ignores concurrent pending invites (3 members + 3 invites could overflow to 6). The `.unique()` constraint is atomic and race-free where an app-level scan is redundant and race-prone. `canAccept` also checks already-partied BEFORE cap so the rejection reason is stable regardless of fullness.
**Source:** 05-RESEARCH.md / 05-01-SUMMARY.md / 05-02-SUMMARY.md

### Persist membership on disconnect; leave `onDisconnect` untouched
`clientDisconnected` only toggles `online: false` — it never removes `party_member` rows, overriding the phase-file/REQUIREMENTS "clean up membership on disconnect".

**Rationale:** A network blip or relog must not drop a player from their party before a raid. The roster shows disconnected members offline via the existing `player.online` flag instead.
**Source:** 05-CONTEXT.md (D-04) / 05-02-SUMMARY.md

### State-based invite invalidation, no scheduled-expiry table
Pending invites are cleared inline inside the mutating reducers (party full, disband, joiner now partied) rather than by a timer/`scheduleAt` table. The 10s toast dismiss is a client-only timer; the invite persists server-side into the missed-invites list.

**Rationale:** Inline invalidation is atomic and deterministic within the same transaction that changes state; a timer table is unnecessary machinery. Missed invites stay actionable under Settings.
**Source:** 05-CONTEXT.md (D-08) / 05-RESEARCH.md

### Online-players list as the tap target, not 3D avatar raycast
The slide-out sheet is opened from an online-players list derived from the already-subscribed `player` table, not by raycasting the on-screen avatar.

**Rationale:** A left-click on an avatar collides with the existing desktop left-click-to-attack binding; disambiguation needs a modifier/long-press and input-routing changes. The list is conflict-free, needs zero game-loop changes, and opens the identical trigger-agnostic sheet. Raycast left as an optional later enhancement.
**Source:** 05-RESEARCH.md

### Additive migrate-publish, never `--delete-data`
Deployed the new tables with `spacetime publish ... --server local --yes` and no wipe flag; maincloud deferred to Phase 7.

**Rationale:** `account`/`account_link` are NOT in the backup set, so `-c`/`--delete-data` destroys all logins with no restore path. The schema change is purely additive, so an in-place migrate preserves real accounts and players.
**Source:** 05-03-SUMMARY.md / 05-RESEARCH.md

### PlayerSheet uses Radix Dialog primitives directly, not the Modal wrapper
The right-docked slide-out uses `Dialog.Root/Portal/Overlay/Content` with `.player-sheet__*` classes; only the leave-confirm reuses the centered `Modal` component.

**Rationale:** The shipped `Modal` hardcodes centered `.modal__panel` styling, but the sheet must dock to the right edge. Radix still supplies focus-trap/ESC/ARIA, satisfying the a11y mandate without hand-rolled focus management.
**Source:** 05-04-SUMMARY.md / 05-UI-SPEC.md

### Roster composed into the existing Pulks Modal, not its own surface
The roster is presentational and renders inside the existing party Modal (which already carries the `n/4` title), above the online-players tap surface.

**Rationale:** Avoids two competing party surfaces and keeps the send-side invite flow reachable in one cohesive panel. (Note: this later left the standalone `PartyRoster.tsx` orphaned — see Surprises.)
**Source:** 05-05-SUMMARY.md

---

## Lessons
### `noUnusedLocals` is a hard compile gate that reshapes plan sequencing
Wiring all five reducer callers in Plan 04 could not compile as written: `acceptInvite`/`declineInvite`/`myInvites` had no consumer (receive-side was Plan 05), and `noUnusedLocals: true` + a `tsc -b` build gate (no ESLint) made that a hard error. A minimal received-invites list had to be added early, then migrated away in Plan 05.

**Context:** When the build gate is strict TS with no lint layer, a "declare now, consume next wave" plan split will not build — either wire a minimal consumer immediately or reorder the waves.
**Source:** 05-04-SUMMARY.md / 05-05-SUMMARY.md

### This SDK registers reducers by snake_case; camelCase accessors are type-level only
A plan verify step grepping `src/module_bindings/` for the literal `invitePlayer` could never pass — codegen registers `invite_player` and derives `connection.reducers.invitePlayer(...)` at the type level. The real gate is `tsc -b` clean + registry presence.

**Context:** Don't assert generated-binding correctness by grepping for camelCase reducer names; verify via type-check plus the snake_case registry entry.
**Source:** 05-03-SUMMARY.md

### Resolve canonical identity BEFORE the subscription effect (hook ordering / TDZ)
The recipient-filtered `party_invite` subscription needs the canonical `Identity`, but `accountLink`/`myIdentityHex` were derived after the effect — referencing them in the dependency list hit the temporal dead zone. Fix: hoist the canonical-identity derivation above the subscription effect and key it on the stable `myIdentityHex` string to avoid resubscribe churn.

**Context:** Filtered subscriptions that depend on derived identity must have that identity resolved unconditionally above the effect that uses it.
**Source:** 05-04-SUMMARY.md

### Compare canonical hex, never the raw device identity
`party_member.identity` is the canonical identity (via `accountLink`), so all roster/target comparisons must use `myIdentityHex` (canonical) `.toHexString()`, not the device `ctx.sender` identity.

**Context:** In an account-linked app, membership rows key off canonical identity; comparing the device identity silently mismatches.
**Source:** 05-04-SUMMARY.md / 05-PATTERNS.md

### A "pointer-events only on buttons" spec conflicts with hover-to-pause a toast
Pausing the auto-dismiss on hover/focus requires pointer events on the toast body, which the UI-SPEC's literal "pointer-events only on the buttons" forbids. Resolved by making the `.party-toast-stack` pointer-passive (never blocks the joystick/action cluster) while each small toast is interactive.

**Context:** The must-have a11y requirement (don't time out a keyboard/hover user mid-read) takes precedence over the literal non-intrusive pointer rule; scope the passivity to the stack, not the individual toast.
**Source:** 05-05-SUMMARY.md

### STDB reducers cannot run in vitest — wire behavior is validated only by a human two-client playtest
Reducers execute inside the live WASM module against a real DB. The whole phase's rule correctness (promotion, cap, invalidation, authz) was made unit-testable only by extracting pure helpers (`partyRules.ts`); the wired reducers + live subscriptions were gated on a mandatory two-client playtest.

**Context:** For server-authoritative multiplayer logic, push all decidable rules into pure helpers for vitest and treat the multi-client playtest as the authoritative validation of wiring.
**Source:** 05-VALIDATION.md / 05-06-SUMMARY.md

### `useTable` returns readonly arrays — type consuming props `readonly`
Passing a `useTable(tables.player)` result into a `Player[]` prop failed `tsc` (TS4104); props that only read the rows must be typed `readonly`.

**Context:** Cheap, recurring friction — any component consuming subscription rows should declare readonly props.
**Source:** 05-05-SUMMARY.md

---

## Patterns
### Pure dependency-free decision helper, unit-tested cross-package
Security-critical rules (`nextLeader` promotion, `canAccept` eligibility) live in `spacetimedb/src/partyRules.ts` with zero imports and are tested from the client vitest runner across the package boundary, exactly mirroring the Phase 3 `deathPenalty.ts` precedent. The reducer maps STDB `Identity`/`Timestamp` rows into primitives (`identityHex: string`, `joinedAtMicros: bigint`) before calling.

**When to use:** Any server-authoritative rule logic that must be tested but can't run in vitest — extract the decision, keep it pure, test it directly.
**Source:** 05-01-SUMMARY.md / 05-PATTERNS.md

### Client/server constant mirror with regex parity assertion
Declare a server const in one-line `const NAME = N;` form, mirror it in `constants.ts`, and append `['NAME', NAME]` to the `serverSync.test.ts` `it.each` list so `extractServerConstant` regex-verifies equality (INV-5).

**When to use:** Any value that must stay identical on both tiers (caps, payouts, sizes).
**Source:** 05-01-SUMMARY.md / 05-PATTERNS.md

### Recipient-filtered subscription for information-disclosure control
Subscribe `tables.partyInvite.where(row => row.recipientIdentity.eq(myCanonicalIdentity))` so a client only ever receives invites addressed to it, re-filtering on the canonical hex in every derived surface as belt-and-braces.

**When to use:** Any per-user private stream where clients must not see other players' rows.
**Source:** 05-04-SUMMARY.md / 05-RESEARCH.md

### Actor is always `requirePlayer(ctx)`; passed identity is a lookup only
Every reducer resolves the actor from `ctx.sender → accountIdentity(ctx)`; `targetIdentity`/`inviteId` arguments are only lookup targets, never the authenticated actor. Accept/decline additionally guard `inv.recipientIdentity.equals(me.identity)`.

**When to use:** Every multiplayer reducer that mutates state affecting other players.
**Source:** 05-PATTERNS.md / 05-02-SUMMARY.md

### Real pausable countdown via a ref decremented on cleanup
The toast's ~10s timer is a true pause, not a restart: `remainingRef` is decremented on each effect cleanup so hover/focus never resets it; on timeout a `leaving` state plays the exit keyframe before `onExpire` removes it from view — with no reducer call (invite persists server-side).

**When to use:** Auto-dismissing transient UI that must pause for accessibility without losing elapsed time.
**Source:** 05-05-SUMMARY.md

### Phase-gate plan: run full suite + build, then STOP at a human-verify checkpoint
The final validation plan runs the full vitest suite + production build automatically, then surfaces the two-client playtest as a blocking `checkpoint:human-verify` rather than self-approving live multi-client behavior. Downstream bookkeeping (PROGRESS.md record) is deferred until the human approves.

**When to use:** Closing out a phase whose core behavior can only be exercised live/multi-client.
**Source:** 05-06-SUMMARY.md

---

## Surprises
### Delivered scope grew well beyond the plan
Verification found reducers never planned — `kickMember`, `promoteLeader`, `disbandParty`, `forwardRequest`, `acceptMerge`, `acceptPoach` — plus new `PartyFrames.tsx` and `PartySheet.tsx` surfaces the UI-SPEC never contracted (it specified `PartyRoster`).

**Impact:** The feature is richer than the phase goal (management actions, party frames), but the plan artifacts no longer describe what shipped; the UI-SPEC's `PartyRoster` was superseded in practice.
**Source:** 05-VERIFICATION.md

### The composition decision left two artifacts as dead code
Because the roster was folded into the Pulks Modal and PartySheet grew its own in-party roster, `PartyRoster.tsx` (the component carrying the standalone role pill) is never imported, and `.hud__party-chip` CSS is never rendered in any TSX.

**Impact:** Two orphaned artifacts flagged against the CLAUDE.md "never keep dead code" rule; also the in-party PartySheet roster ends up omitting a standalone role pill (role is conveyed elsewhere).
**Source:** 05-VERIFICATION.md

### User-facing terminology drifted from "Pulks" to "Bars"
The UI-SPEC and CONTEXT fixed the Latvian party noun as "Pulks" (BARS-free), but the shipped/UAT copy uses "Bars"/"BARS n/4" ("Uzaicināt savā barā", "Pamest baru", "Izformēt baru").

**Impact:** Copy contract in the UI-SPEC no longer matches the product; a downstream reader trusting the spec would use the wrong noun.
**Source:** 05-UAT.md vs 05-UI-SPEC.md

### The invite toast was judged too intrusive in UAT
Functionally passing, but the user flagged the toast UI/UX as too intrusive and requested a redesign to a slim Frost strip in the top-center header (name-tag + round icon-only accept/decline + countdown).

**Impact:** Tracked as follow-up polish, not a functional gap — but the shipped toast placement/design differs from the intended end state.
**Source:** 05-UAT.md

### Leave/disband was undiscoverable when the other member was offline
UAT surfaced a major usability gap: no visible way to exit the party (especially when the teammate was offline). Fixed by moving the leave affordance onto every teammate's PlayerSheet ("Pamest baru" always; leaders also get "Izformēt baru" + "Izmest no bara").

**Impact:** A core lifecycle action was reachable in code but not in the UI — only caught by the human playtest, not by any automated gate.
**Source:** 05-UAT.md

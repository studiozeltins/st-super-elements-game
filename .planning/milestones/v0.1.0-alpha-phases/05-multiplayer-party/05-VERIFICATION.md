---
phase: 05-multiplayer-party
verified: 2026-07-08T02:20:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
notes:
  - "Human two-client playtest already DONE and user-confirmed (05-UAT.md, 6/6 PASS, 0 issues). Not re-run here — the wired STDB reducers/subscriptions cannot execute in vitest by design (05-VALIDATION.md)."
  - "Non-blocking follow-ups (do not affect goal achievement): (1) orphaned .hud__party-chip CSS in src/index.css never rendered in any TSX; (2) orphaned PartyRoster.tsx never imported (PartySheet renders its own in-party roster); (3) the in-party PartySheet roster shows each member's active character + crown + online dot but no standalone role pill — the role badge is surfaced on PlayerSheet (tap-to-invite) and in the unused PartyRoster; (4) 05-06 Task 3 (PROGRESS.md 'party shipped' record) was gated on playtest approval and is still pending — PROGRESS.md line 17/40 still show Phase 5 as ⬜ TODO. All four are CLAUDE.md dead-code / bookkeeping items, not goal failures."
---

# Phase 5: Multiplayer Party Verification Report

**Phase Goal:** Players can form a party of up to four by invite / ask-to-join (invite-only, no open join), with party roster/frames, leader promotion, disband, and membership that persists across disconnect. (ROADMAP: form a party of up to `RAID_PARTY_SIZE = 4` and see a live roster of each member's active character and role.)
**Verified:** 2026-07-08T02:20:00Z
**Status:** passed
**Re-verification:** No — initial (canonical) verification; the phase's UAT + VALIDATION were already green, only the VERIFICATION.md artifact was missing.

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | A player can invite another player (or ask to join theirs) by tapping them; the recipient accepts, forming a party up to `RAID_PARTY_SIZE = 4` (SC-1, D-01/02/03) | ✓ VERIFIED | Server: `invitePlayer` (index.ts:1213) + `requestJoin` (:1260) each `requirePlayer(ctx)`, cap-guard `roster.length >= RAID_PARTY_SIZE` (:1240,:1282), dedupe, insert a pending `party_invite`; `acceptInvite` (:1302) recipient-only guard + `canAccept(...)` then inserts the `party_member` row. Client: `PlayerSheet.tsx` (App.tsx:926) calls `invitePlayer`/`requestJoin`; `acceptInvite` wired (App.tsx:451). Invite-only is the sole path — no `joinParty(rawId)` reducer exists. UAT #1/#3 PASS. |
| 2 | Party roster/frames render each member's active character, role, leader crown ♛, and online dot; a left frames panel shows name + HP per teammate (SC-4) | ✓ VERIFIED | `PartyFrames.tsx` (App.tsx:829): per-teammate row with element-colored initial, name, ♛ crown on leader, HP num + fill bar, offline dim. `PartySheet.tsx:83–133` in-party roster: initial, name, crown, HP, online dot, promote/kick. Active character shown on both; role badge surfaced on `PlayerSheet.tsx:83` via `ROLE_META`. Human UAT #2 PASS (role badge + crown + online dot confirmed). Note: the in-party PartySheet omits a standalone role pill (see notes). |
| 3 | Leaving promotes the oldest-joined member when the leader leaves; last-leave disbands (party + pending invites); a disconnect PERSISTS membership and shows offline (SC-2, D-04/05) | ✓ VERIFIED | `leaveParty` (index.ts:1522) deletes the actor's member row; empty roster → disband party + its invites (:1530–1536); leaving leader → `nextLeader(...)` promotes oldest-joined, tie on smallest identityHex (:1541–1550). `disbandParty` (:1607) leader-only full dissolve. `onDisconnect` unchanged — membership row survives; `player.online` flips (roster dims). UAT #5/#6 PASS. |
| 4 | One identity cannot be in two parties or double-join, enforced at accept time (SC-3, D-06) | ✓ VERIFIED | `party_member.identity` is `.unique()` (index.ts:637) — atomic backstop. `acceptInvite` decides via `canAccept(rosterSize, joinerAlreadyPartied, RAID_PARTY_SIZE)` (:1320); already-partied is checked BEFORE cap (partyRules.ts:54). Cap-full sweeps remaining invites (:1341). `partyRules.test.ts` asserts both branches (10 tests). UAT #4 PASS. |
| 5 | The full vitest suite and the production build are green with all Phase 5 code integrated | ✓ VERIFIED | Re-run in this verification: `pnpm vitest run` → **386 passed / 26 files** (partyRules 10, serverSync 92). `pnpm build` (`tsc -b && vite build`) → exit 0, built in 4.75s (only the pre-existing >500 kB chunk warning). |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `spacetimedb/src/partyRules.ts` | pure `nextLeader` + `canAccept` helpers (deterministic, no ctx/db) | ✓ VERIFIED | Both exported; already-partied-before-cap ordering; tie-break on identityHex |
| `spacetimedb/src/index.ts` (tables) | `party` / `party_member` / `party_invite` public tables; `party_member.identity` UNIQUE | ✓ VERIFIED | :621/:632/:646; `.unique()` on identity :637; all `public: true` |
| `spacetimedb/src/index.ts` (reducers) | invite/request/accept/decline/leave (+ authz, cap, promotion, disband, D-08 invalidation) | ✓ VERIFIED | `invitePlayer/requestJoin/acceptInvite/declineInvite/leaveParty` present, plus `kickMember/promoteLeader/disbandParty/forwardRequest/acceptMerge/acceptPoach` (richer than plan). Actor always `requirePlayer(ctx)`; `targetIdentity` lookup-only |
| `RAID_PARTY_SIZE` constant | distinct server const (≠ PARTY_SIZE) mirrored client-side with parity asserted | ✓ VERIFIED | index.ts:88 `= 4`; constants.ts:14 `= 4`; serverSync.test.ts:157 parity assertion |
| `src/module_bindings/` | party tables + all reducers regenerated/typed | ✓ VERIFIED | `party_table.ts`, `party_member_table.ts`, `party_invite_table.ts` + `invite_player`/`request_join`/`accept_invite`/`decline_invite`/`leave_party`/`kick_member`/`promote_leader`/`disband_party` reducer bindings present |
| `src/ui/PlayerSheet.tsx` | slide-out sheet: name, active character, role badge, online dot, symmetric invite/request | ✓ VERIFIED | Consumes `ROLE_META` (:2,:42); role pill (:83), online dot (:93); invite/request actions wired (App.tsx:934/938) |
| `src/ui/PartyFrames.tsx` | left teammate panel: name + HP bar + crown + online per member | ✓ VERIFIED | Teammate rows, crown ♛ (:67), HP fill (:76), offline dim; self excluded (:27) |
| `src/ui/PartyToast.tsx` | incoming-invite toast, ~10s auto-dismiss, hover/focus pause, role=status/aria-live | ✓ VERIFIED | `DISMISS_MS = 10_000` (:28), `role="status"` + `aria-live="polite"` (:47), pauseHandlers (:49), Pieņemt/Noraidīt |
| `NOKAVĒTIE AICINĀJUMI` in `SettingsScreen.tsx` | missed/dismissed invites remain actionable | ✓ VERIFIED | Section :50; `missedInvites` list with accept/decline (:55–58); fed from App.tsx:892 |
| `.party-*` / `.hud__party-chip` CSS in `src/index.css` | party UI styling | ⚠️ PARTIAL | `.party-frames`/`.party-roster`/`.party-toast`/`.missed-invites` present and used; `.hud__party-chip` (:4459) is orphaned — never rendered in any TSX (dead CSS) |
| `src/ui/PartyRoster.tsx` | roster panel with role badge + crown + online dot | ⚠️ ORPHANED | Component is complete and correct (role badge :68, crown :77) but never imported — PartySheet renders its own in-party roster instead. Dead code per CLAUDE.md |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `App.tsx` subscription | `party` / `party_member` / `party_invite` tables | `subscriptionBuilder().subscribe([...])` | ✓ WIRED | App.tsx:129–134; `party_invite` filtered `.where(row => row.recipientIdentity.eq(myCanonicalIdentity))` (Information-Disclosure mitigation) |
| `acceptInvite` / `leaveParty` reducers | `partyRules.nextLeader` + `canAccept` | cross-module import | ✓ WIRED | index.ts:24 imports both; consumed at :1320 (canAccept) and :1541 (nextLeader) |
| `PlayerSheet` / `PartySheet` actions | `invitePlayer`/`requestJoin`/`leaveParty`/`promoteLeader`/`kickMember`/`disbandParty` | `connection?.reducers.*` callers | ✓ WIRED | App.tsx:439–500 callers; passed into sheets at :906/:927 |
| roster identity comparisons | canonical `myIdentityHex` | App.tsx:129 canonical, not raw device identity | ✓ WIRED | All roster/target `.toHexString()` comparisons key off canonical hex; invite filter on canonical Identity |
| membership entry | pending `party_invite` only | no `joinParty(rawId)` reducer, no text join code | ✓ WIRED | grep confirms no `joinParty`; a `party_member` row is only inserted inside accept-family reducers |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Party rule helpers (promotion + eligibility) | `pnpm vitest run partyRules` | 10 passed (nextLeader 4 + canAccept 6, incl. cap/double-join boundaries) | ✓ PASS |
| Client↔server constant parity (RAID_PARTY_SIZE etc.) | serverSync suite | 92 passed (incl. RAID_PARTY_SIZE parity) | ✓ PASS |
| Full suite regression | `pnpm vitest run` | 386 passed (26 files) | ✓ PASS |
| Type + production build | `pnpm build` | exit 0, built in 4.75s | ✓ PASS |
| Invite-only entry (no join code) | `grep joinParty spacetimedb/src/index.ts` | none | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| REQ-multiplayer-party | 05-01…05-06 | party tables + reducers, cap/one-party/promotion/disband, disconnect persist, roster with character + role, publish + build + two-client playtest | ✓ SATISFIED | Truths 1–5; server model + client UI wired; UAT 6/6 PASS (two-client playtest done); tests 386 + build green. NOTE: the REQUIREMENTS.md text still references a legacy "join code / joinParty" surface — superseded by CONTEXT D-01 invite-only (ROADMAP goal), which the code correctly implements (no join code). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/index.css` | 4459 | `.hud__party-chip` class never rendered in any TSX | ⚠️ Warning | Dead CSS (CLAUDE.md "never keep dead code"). No functional impact — the party surface opens by tapping a player in-world. |
| `src/ui/PartyRoster.tsx` | whole file | component never imported (orphaned) | ⚠️ Warning | Dead code. PartySheet renders its own in-party roster; PartyRoster (which carries the role pill) is unused. |
| `src/ui/PartySheet.tsx` | 83–133 | in-party roster omits a standalone role pill | ⚠️ Warning | SC-4 "role" is surfaced on PlayerSheet + PartyFrames' active character, and human UAT #2 confirmed the role badge visible; the management sheet shows active character/crown/HP/online but no role label. Minor UI inconsistency, not a goal failure. |
| `.planning/transcendence/PROGRESS.md` | 17,40 | Phase 5 still `⬜ TODO` / unchecked | ℹ️ Info | 05-06 Task 3 (record party as shipped for the Phase 6 raid consumer) was gated on playtest approval; the playtest is now approved so this bookkeeping record is now due. Not part of the roadmap success criteria. |

Debt-marker scan (`TODO/FIXME/XXX/TBD/HACK/PLACEHOLDER`) of all Phase 5 source files (server `index.ts`/`partyRules.ts`, client `PlayerSheet`/`PartyFrames`/`PartyRoster`/`PartyToast`/`PartySheet`/`App.tsx`) returned no in-code markers — no unresolved debt blockers.

### Human Verification Required

None outstanding. The mandatory two-client playtest (the only way to exercise wired STDB reducers + live subscriptions, which cannot run in vitest per 05-VALIDATION.md) was completed and user-confirmed in 05-UAT.md — all 6 acceptance tests PASS with 0 open issues (the one reported leave-affordance gap was fixed and re-confirmed PASS).

### Gaps Summary

No gaps blocking the phase goal. All four ROADMAP success criteria are verified against real source, not merely claimed: invite-only party formation to a distinct `RAID_PARTY_SIZE = 4` cap (server reducers with `requirePlayer` authz + `.unique()` one-party backstop + `canAccept`), oldest-joined leader promotion / last-leave disband / disconnect-persist membership (`leaveParty` + `nextLeader`, `onDisconnect` untouched), one-party/double-join enforced at accept time, and a live roster/frames surface showing each member's active character, crown, and online state. `pnpm vitest run` (386) and `pnpm build` re-run green in this verification; UAT is 6/6 PASS.

Four non-blocking follow-ups are recorded for cleanup (they do not affect goal achievement): the orphaned `.hud__party-chip` CSS and orphaned `PartyRoster.tsx` (both dead code per CLAUDE.md), the missing standalone role pill in the in-party PartySheet roster (role is still conveyed via the shown active character + PlayerSheet badge, human-confirmed), and the still-pending PROGRESS.md "party shipped" record (05-06 Task 3, now unblocked by playtest approval).

---

_Verified: 2026-07-08T02:20:00Z_
_Verifier: Claude (gsd-verifier)_

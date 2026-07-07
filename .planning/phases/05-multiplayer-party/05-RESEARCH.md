# Phase 5: Multiplayer party - Research

**Researched:** 2026-07-07
**Domain:** SpacetimeDB TypeScript module (server-authoritative tables + reducers) + React/Three.js client UI for player grouping
**Confidence:** HIGH (all findings verified against the live codebase this session; no external/library uncertainty)

## Summary

This phase is entirely internal: it adds three additive public tables (`party`, `party_member`, `party_invite`) and a small set of reducers to `spacetimedb/src/index.ts`, plus five client surfaces already specified in `05-UI-SPEC.md`. There are **no new external packages** — the SpacetimeDB TS SDK (`spacetimedb@2.6.*`), React 18.3, Three 0.185, and Radix Dialog/Switch are all already vendored and in daily use. Every pattern the phase needs (public table + `useTable` subscription, `accountIdentity(ctx)` authz, additive migrate-publish, extract-pure-helper-for-vitest, `serverSync.test.ts` mirror guard) is already established in this repo. `[VERIFIED: codebase]`

The one genuine open question flagged in CONTEXT — how a player taps another player — resolves cleanly. Raycasting the on-screen 3D avatar is *technically* feasible (remote players are `THREE.Group`s tracked in a `Map<identityHex, RemotePlayerView>` with a live camera), but it **collides with the existing desktop left-click-to-attack binding** (`createInputSystem.ts:57-60`). The **online-players list** — explicitly sanctioned by CONTEXT as an acceptable fallback — is the lower-risk primary surface, drives the same `.player-sheet`, and needs no input-routing changes. Recommendation below: ship the list as the guaranteed trigger; treat avatar-raycast as an optional later enhancement gated on resolving the attack-click conflict. `[VERIFIED: codebase]`

**Primary recommendation:** Model membership with `party_member.identity` **unique** (enforces one-party-per-player for free) + `partyId` **indexed** (btree). Model invites with an accept-driven `party_invite { partyId, joinerIdentity, recipientIdentity, kind }` so the accept reducer is symmetric across invite/ask-to-join. Enforce cap + uniqueness at **accept** time, not send time (D-06). Persist membership on disconnect (D-04 — do NOT touch `onDisconnect`). Drive the primary tap-target from the online-players list.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: Invite-only, NO text join codes.** Only way into a party is tapping a player and using the slide-out sheet. Drop the phase-file's "party id as join code" entirely.
- **D-02: Two symmetric actions on the player sheet:**
  - **"Aicināt manā pulkā" (Invite to my party)** → target joins *my* party. If I have no party, create one with **me** as leader, then send the invite to the target.
  - **"Lūgt pievienoties pulkam" (Ask to join their party)** → I join *their* party. If the target has no party, create one with **the target** as leader, then send a join-request to the target.
  - Rule: whoever leads the party is whoever it "belongs to" in the action — invite = I lead, ask-to-join = they lead.
- **D-03: Both actions produce a pending item the RECIPIENT accepts or declines.** Nobody is added without the receiving player's explicit Accept.
- **D-04: Disconnect persists membership.** Do NOT remove `party_member` rows in `clientDisconnected` (deviates from phase-file + REQUIREMENTS.md). A blip/relog must not drop a player from their party. Roster shows offline via the existing `player.online` flag.
- **D-05: Leader leaves → promote, don't disband.** Promote the **oldest-joined** remaining member. Disband (delete party + its pending invites) only when the LAST member leaves.
- **D-06: Enforce one-party-per-player and `RAID_PARTY_SIZE` (4) cap at accept time.** `party_member.identity` unique. Reject accepts that would exceed the cap or double-join.
- **D-07: Invite toast auto-dismisses ~10s (client-side only).** NOT hard-expired server-side. A missed/dismissed invite drops into a **missed-invites list** (mounted under Settings) actionable later.
- **D-08: Invites invalidated server-side by STATE, not a timer** — clear pending invites when the party is full, disbands, the recipient is already in a party, or the inviter/party no longer exists. No scheduled-expiry table.
- **D-09: Tap a player → slide-out sheet** from the side, rounded, accessibility-first, Fortnite-style action buttons.
- **D-10: Party roster panel** shows each member's active character + role badge (roles already server-side), a leader crown, and an online dot.

### Claude's Discretion
- Exact tap-target (on-screen 3D avatar raycast vs. online-players list) — a research/UI question. User described tapping the on-screen avatar; if raycast on player meshes proves impractical, an online-players list is an acceptable fallback surface for the same slide-out sheet. **See "Tap-Target Feasibility" below.**
- Table/reducer naming, exact `party_invite` columns, and where the missed-invites list mounts (settings vs. dedicated panel) — left to planning, consistent with PROGRESS.md naming.

### Deferred Ideas (OUT OF SCOPE)
- Cross-device / off-screen friend invites via a shareable text code — explicitly rejected. Revisit only if the online-list tap-target proves insufficient.
- Configurable / longer missed-invite retention "under settings" — keep the missed-invites list simple; treat tuning as future polish.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-multiplayer-party | New public tables `party` (id, leaderIdentity, createdAt) + `party_member` (partyId, identity, joinedAt), reducers (create/join/leave, auto-disband, cap + one-party rules, disconnect handling), client party panel + roster with each member's active character + role. **CONTEXT overrides:** invite-only (no join codes), persist on disconnect, add `party_invite` + accept/decline. | Table shapes → "Standard Stack" + "Architecture Patterns"; reducer set + authz → "Architecture Patterns"; roster data already exists (`player.online`, `player.activeCharacterId`, `CHARACTER_STATS[].role`); tests → "Validation Architecture". |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Party/membership/invite state + all mutations | **Server module** (`spacetimedb/src/index.ts`) | — | STDB is server-authoritative; all writes go through reducers. Uniqueness/cap/promotion/disband must be enforced server-side or they can be bypassed. |
| Authorization (who may accept/leave/invite) | **Server module** | — | `ctx.sender → accountIdentity(ctx)` is the only trustworthy actor. Never trust an identity passed as a reducer arg for the *actor* (INV/critical rule 5). |
| State-based invite invalidation (D-08) | **Server module** | — | Must run inside the same reducers that fill/disband/join so it is atomic and deterministic (no timer table). |
| Live roster / invite rendering | **Client React UI** (`src/ui/*`, `src/App.tsx`) | Server (subscriptions) | Clients render from `useTable`; the toast 10s auto-dismiss is a client-only timer (D-07). |
| Tap-a-player trigger | **Client React UI** (online-players list) | Client Three.js (`createGame.ts`) raycast — optional | List avoids the desktop attack-click conflict; raycast is an enhancement, not required. |
| Role/character/online display data | **Server module** (already present) | Client (`ROLE_META`) | No new server field — `player.online`, `player.activeCharacterId`, `statsFor().role` already exist. |

## Standard Stack

No new dependencies. This phase composes existing, in-repo tools only.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `spacetimedb` (server + client SDK) | `2.6.*` | Tables, reducers, subscriptions, `useTable` | The entire app is built on it; every existing table/reducer uses this API. `[VERIFIED: package.json:27]` |
| `react` / `react-dom` | `^18.3.1` | UI surfaces (sheet, toast, roster, missed-invites) | All existing UI is React. `[VERIFIED: package.json:25-26]` |
| `@radix-ui/react-dialog` | `^1.1.18` | Focus-trapped, ESC-closable, ARIA modal → reuse via `src/ui/Modal.tsx` for the sheet + leave-confirm | UI-SPEC mandates reuse; already backs `Modal`. `[VERIFIED: package.json:23]` |
| `three` | `^0.185.1` | Only if avatar-raycast enhancement is pursued (`THREE.Raycaster`) | Already the render stack. `[VERIFIED: package.json:28]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@radix-ui/react-switch` | `^1.3.2` | `src/ui/Toggle.tsx` row box model — clone for roster row parity | Roster row `11px 12px` padding matches `.toggle` (UI-SPEC). |
| `vitest` | `3.2.4` | Unit tests for extracted pure party helpers + `serverSync.test.ts` mirror | Test discipline (PROJECT.md). `[VERIFIED: package.json:49]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `party_member.identity` unique constraint | App-level scan for existing membership | Unique constraint enforces one-party-per-player atomically at the DB layer (D-06) with zero race window; a scan is redundant and race-prone. Use the constraint. |
| Online-players list tap-target | Three.js raycast on avatars | List is conflict-free and guaranteed; raycast collides with left-click-attack. See feasibility section. |
| State-based invite invalidation (D-08) | Scheduled-expiry table (`scheduleAt`) | CONTEXT D-08 explicitly forbids a timer table. Clear invites inline in the mutating reducers. |

**Installation:** none — `pnpm` install already satisfies all deps. Do NOT run `npm i` (symlink layout breaks it — PROJECT.md; use `pnpm` only). `[VERIFIED: PROJECT.md:23]`

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** All libraries used (`spacetimedb`, `react`, `three`, `@radix-ui/*`, `vitest`) are already present in `package.json` and in active production use across the codebase. No registry lookup, no legitimacy gate required.

## Architecture Patterns

### System Architecture Diagram

```
                 CLIENT (browser)
  ┌───────────────────────────────────────────────┐
  │  online-players list  ──tap──►  .player-sheet  │   (primary trigger)
  │  [optional] avatar raycast ─┘                  │
  │                                                │
  │  .player-sheet actions:                        │
  │    "Aicināt manā pulkā"  ─► reducer invitePlayer(targetIdentity)
  │    "Lūgt pievienoties.." ─► reducer requestJoin(targetIdentity)
  │    "Pamest pulku"        ─► reducer leaveParty()
  │                                                │
  │  .party-toast (recipient) Accept/Decline ─► acceptInvite(id) / declineInvite(id)
  │  .missed-invites (Settings) same reducers      │
  │                                                │
  │  useTable(party, party_member,                 │
  │           party_invite.where(recip==me),       │
  │           player)  ◄── subscriptions           │
  │       │                                        │
  │       ▼ derive roster (leader crown, role      │
  │         badge, online dot) + n/4 chip          │
  └───────────────────────────────────────────────┘
                 │ reducer calls          ▲ row updates
                 ▼                        │
                 SERVER MODULE (SpacetimeDB, index.ts)
  ┌───────────────────────────────────────────────┐
  │ actor = accountIdentity(ctx)  (never a arg)    │
  │                                                │
  │ invitePlayer(target): ensure my party (me=lead)│
  │        → insert party_invite{joiner=target,    │
  │          recipient=target, kind:'invite'}      │
  │ requestJoin(target): ensure their party        │
  │        (target=lead) → invite{joiner=me,       │
  │          recipient=target, kind:'request'}     │
  │ acceptInvite(id): actor==recipient; check cap  │
  │        + uniqueness; insert party_member;       │
  │        THEN invalidate stale invites (D-08)    │
  │ declineInvite(id): actor==recipient; delete    │
  │ leaveParty(): delete my member; promote oldest │
  │        OR disband(+invites) if last (D-05)     │
  │                                                │
  │ TABLES: party / party_member / party_invite    │
  │ onDisconnect: UNCHANGED (only toggles online)  │
  └───────────────────────────────────────────────┘
```

### Component Responsibilities

| File | Responsibility | Change |
|------|---------------|--------|
| `spacetimedb/src/index.ts` | party/member/invite tables + reducers; add to `schema({...})` (index.ts:607-627); add `RAID_PARTY_SIZE = 4` near other constants (index.ts:80-87) | ADD |
| `spacetimedb/src/partyRules.ts` (new) | Pure helpers (promotion pick, accept-eligibility) unit-tested without a DB | ADD |
| `src/game/data/constants.ts` | Mirror `RAID_PARTY_SIZE = 4` (INV-5) | ADD (~line 8-15) |
| `src/game/data/__tests__/serverSync.test.ts` | Assert `RAID_PARTY_SIZE` client/server parity (add to the `[name, value]` list at :143-160) | ADD |
| `src/App.tsx` | Subscribe new tables; wire reducer callers; host new UI state | EDIT |
| `src/ui/PlayerSheet.tsx` (new) | Slide-out `.player-sheet` (wrap `Modal` semantics) | ADD |
| `src/ui/PartyToast.tsx` (new) | `.party-toast` (role=status, 10s client timer) | ADD |
| `src/ui/PartyRoster.tsx` (new) | `.party-roster` panel | ADD |
| `src/ui/SettingsScreen.tsx` | Add `NOKAVĒTIE AICINĀJUMI` section (missed-invites) | EDIT |
| `src/ui/Hud.tsx` | `.hud__party-chip` entry point in `.hud__meta-row` | EDIT |
| `src/index.css` | New `.player-sheet`/`.party-toast`/`.party-roster` classes + reduced-motion blocks | EDIT |

### Recommended Table Shapes (server)

```typescript
// Source: mirrors existing table+index style in index.ts (e.g. ownedCharacter :446).
const party = table(
  { name: 'party', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    leaderIdentity: t.identity(),          // oldest-joined member after a promotion (D-05)
    createdAt: t.timestamp(),
  }
);

const partyMember = table(
  { name: 'party_member', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    partyId: t.u64().index('btree'),        // enumerate a party's roster; Phase 6 reads this
    identity: t.identity().unique(),        // UNIQUE ⇒ one party per player, enforced by DB (D-06)
    joinedAt: t.timestamp(),                // promotion picks the MIN of these (oldest-joined)
  }
);

const partyInvite = table(
  { name: 'party_invite', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    partyId: t.u64().index('btree'),        // for state-based invalidation on fill/disband (D-08)
    joinerIdentity: t.identity().index('btree'),   // who gets added if accepted (invite→target, request→me)
    recipientIdentity: t.identity().index('btree'),// who must Accept (always the "target"); client filters toasts on this
    kind: t.string(),                       // 'invite' | 'request' — display copy only; accept logic is symmetric
    createdAt: t.timestamp(),
  }
);
```

**Why `joiner`/`recipient` instead of `from`/`to`:** the accept reducer becomes fully symmetric — it always adds `joinerIdentity` to `partyId` after verifying `actor == recipientIdentity`. `kind` is retained only so the toast can pick the right Latvian sentence (`aicina tevi savā pulkā` vs `lūdz pievienoties tavam pulkam`). This avoids branching the security-critical accept path on kind. `[VERIFIED: codebase — matches existing table idioms]`

### Pattern 1: Reducer authz via canonical identity
**What:** Resolve the actor with `accountIdentity(ctx)` / `requirePlayer(ctx)`; never trust an identity passed as the actor.
**When to use:** Every reducer in this phase.
**Example:**
```typescript
// Source: index.ts:670-673, 726-732 (existing helpers — reuse verbatim)
function accountIdentity(ctx) { const l = ctx.db.accountLink.identity.find(ctx.sender); return l ? l.canonicalIdentity : null; }
function requirePlayer(ctx) { const c = accountIdentity(ctx); if (!c) throw new SenderError('Log in first');
  const p = ctx.db.player.identity.find(c); if (!p) throw new SenderError('Log in first'); return p; }

export const acceptInvite = spacetimedb.reducer({ inviteId: t.u64() }, (ctx, { inviteId }) => {
  const me = requirePlayer(ctx);
  const inv = ctx.db.partyInvite.id.find(inviteId);
  if (!inv) throw new SenderError('Aicinājums vairs nav spēkā');
  if (!inv.recipientIdentity.equals(me.identity)) throw new SenderError('unauthorized'); // only the recipient accepts
  // ... cap + uniqueness checks on inv.joinerIdentity, then insert party_member, then invalidate (D-08)
});
```
`targetIdentity` passed to `invitePlayer`/`requestJoin` is only ever used as a *lookup target*, never as the authenticated actor. `[VERIFIED: codebase]`

### Pattern 2: Enforce cap + uniqueness at accept time (D-06)
```typescript
// joiner must not already be in a party (unique constraint also guards this, but check for a clean error)
if (ctx.db.partyMember.identity.find(inv.joinerIdentity)) throw new SenderError('jau esi citā pulkā');
const roster = [...ctx.db.partyMember.partyId.filter(inv.partyId)];
if (roster.length >= RAID_PARTY_SIZE) throw new SenderError('pulks ir pilns'); // RAID_PARTY_SIZE = 4, NOT PARTY_SIZE
ctx.db.partyMember.insert({ id: 0n, partyId: inv.partyId, identity: inv.joinerIdentity, joinedAt: ctx.timestamp });
```

### Pattern 3: Leader promotion / disband on leave (D-05)
```typescript
// Extract the choice as a PURE helper so it unit-tests without a DB (see Validation).
// oldest-joined = min joinedAt among remaining members.
export function nextLeader(members /* {identity,joinedAt}[] after removal */) {
  if (members.length === 0) return null;            // caller disbands
  return members.reduce((a, b) => (b.joinedAt < a.joinedAt ? b : a)).identity;
}
```
On leave: delete the leaver's `party_member`; if none remain → delete the `party` row **and all its `party_invite` rows** (D-08); else if the leaver was leader → `party.id.update({ ...party, leaderIdentity: nextLeader(remaining) })`.

### Pattern 4: State-based invite invalidation (D-08, no timer)
Run inline in the mutating reducers:
- **On accept** that fills the party (roster == 4): delete all remaining `party_invite` rows for that `partyId`.
- **On any accept**: delete other pending invites where `joinerIdentity == the newly-joined player` (they now have a party).
- **On disband**: delete all `party_invite` for that `partyId`.
- **On send**: if the target `joinerIdentity` is already in a party (invalid request) reject; optionally dedupe an existing identical pending invite.

`party_invite` is a tiny table, so enumerate via the `partyId` / `joinerIdentity` btree indexes. `[VERIFIED: codebase — same filter idiom as ownedCharacter :735]`

### Pattern 5: Client subscription + reducer call
```typescript
// Subscribe (App.tsx, extend the existing block ~:96-104). party tables are tiny → subscribe fully.
conn.subscriptionBuilder().subscribe([
  tables.party, tables.partyMember,
  tables.partyInvite.where(r => r.recipientIdentity.eq(myIdentity)), // only MY pending items
  // tables.player already subscribed (:114)
]);
// Call (App.tsx idiom, :250-363):
connection?.reducers.invitePlayer({ targetIdentity: target.identity });
connection?.reducers.acceptInvite({ inviteId });
```
Roster row data needs no new server field: `player.online` (dot), `player.activeCharacterId` (character name/element), `statsFor(activeCharacterId).role` → `ROLE_META` badge. `[VERIFIED: index.ts:293-318, 42-64; App.tsx:114]`

### Anti-Patterns to Avoid
- **Reusing `PARTY_SIZE` for the cap.** `PARTY_SIZE = 4` (index.ts:72) is the personal 4-**character** team. Introduce a separate `RAID_PARTY_SIZE = 4`. Mixing them silently couples two unrelated concepts.
- **Removing `party_member` in `onDisconnect`.** REQUIREMENTS.md/phase-file say "clean up membership on disconnect" — CONTEXT D-04 **overrides** this. Leave `onDisconnect` (index.ts:2526-2532) toggling `online` only.
- **Trusting a client-passed identity as the actor.** Always `accountIdentity(ctx)`. A client could pass any `targetIdentity`; that's fine as a lookup, never as "who is acting".
- **Branching the accept path on `kind`.** Model joiner/recipient explicitly so accept is one code path (less room for an authz bug).
- **Publishing with `-c` / `--delete-data`.** This is an **additive** migrate. `--delete-data` destroys real accounts (`account`/`account_link` are NOT in the backup set — CLAUDE.md warning). Drop `-c`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| One-party-per-player | App-level "is this player already in a party" scan on every insert | `party_member.identity.unique()` | DB constraint is atomic and race-free (D-06). |
| Focus trap / ESC / ARIA for the sheet + leave-confirm | Hand-rolled focus management | `src/ui/Modal.tsx` (Radix Dialog) | Already solved, a11y-audited; UI-SPEC mandates reuse. |
| Role badge label/color/aria | New badge component | `ROLE_META` + `.sheet__role` box (`characters.ts`, `CharacterSheet.tsx`) | Shipped in Phase 4; roster must match. |
| Live player set (online, activeCharacterId) | New subscription | `useTable(tables.player)` (App.tsx:114) | Already streamed. |
| Auto-dismiss toast keyframes | New animation system | `.shard-toast` precedent in `src/index.css` | Existing panel-backed in/out keyframe. |
| Invite expiry | Scheduled-expiry table | State-based invalidation in reducers (D-08) | CONTEXT forbids a timer table; state invalidation is atomic. |
| Client/server constant drift | Manual double-check | Add `RAID_PARTY_SIZE` to `serverSync.test.ts` list (:143-160) | INV-5; the test regex-extracts the server value and asserts equality. |

**Key insight:** The whole phase is composition, not construction. The scarce risk is in *rule correctness* (promotion, cap, invalidation, authz), which is exactly why those belong in small pure helpers with unit tests, not inline in reducers.

## Tap-Target Feasibility (CONTEXT Claude's-Discretion resolution)

**Question:** Tap the on-screen 3D avatar (raycast) vs. an online-players list?

**Findings (all `[VERIFIED: codebase]`):**
- Remote players ARE addressable 3D objects: `syncRemotePlayers` (createGame.ts:933-978) keeps a `Map<identityHex, RemotePlayerView>` (`:266`), each with `model.group` (a `THREE.Group`) added to the scene. A `THREE.Raycaster` from the camera through the pointer's NDC, intersecting `[...remotePlayers.values()].map(v => v.model.group)` recursively, would map a hit back to `identityHex`. The pixel render-target does not interfere (raycasting uses camera + canvas client-rect NDC, independent of internal render resolution).
- **BLOCKING CONFLICT (desktop):** `createInputSystem.ts:57-60` already queues an **attack** on canvas `pointerdown` with mouse button 0. A left-click on an avatar would both swing and open the sheet. Disambiguating requires a modifier/right-click/long-press or a dedicated "social" mode — added input-routing complexity and UX ambiguity.
- **Mobile:** a plain canvas tap currently does nothing (movement = `VirtualJoystick`, attack = HUD button), so raycast-tap is conflict-free there — but still needs deliberate-tap detection.
- The **online-players list** derives directly from the already-subscribed `useTable(tables.player)` set (filter `online && identity != me`), opens the identical `.player-sheet` (UI-SPEC: the sheet is trigger-agnostic), and needs **zero** changes to input routing or the game loop.

**Recommendation (MEDIUM-HIGH confidence):** Ship the **online-players list as the primary, guaranteed tap surface** for this phase — it is explicitly an acceptable fallback (CONTEXT), lowest-risk, and unblocks planning. Keep avatar-raycast as an **optional enhancement** behind a resolved input scheme (e.g. long-press on touch / right-click on desktop) — do NOT let the phase's success criteria depend on it. This matches UI-SPEC's "spec the sheet identically regardless of trigger."

## Common Pitfalls

### Pitfall 1: `PARTY_SIZE` vs `RAID_PARTY_SIZE` collision
**What goes wrong:** Reusing the existing `PARTY_SIZE = 4` for the player-party cap silently couples the personal character-team size to the raid-party size; a later tune to one breaks the other.
**Why it happens:** Both are 4 today, so it "works" and the collision is invisible.
**How to avoid:** Add a distinct `RAID_PARTY_SIZE = 4` (server index.ts + client constants.ts + serverSync test). Never reference `PARTY_SIZE` in party code.
**Warning signs:** grep for `PARTY_SIZE` in new party reducers returns hits.

### Pitfall 2: Publishing with `--delete-data` on a DB with real accounts
**What goes wrong:** `account`/`account_link` are NOT in the backup set (CLAUDE.md). `-c`/`--delete-data` destroys all logins with no restore path.
**Why it happens:** PROGRESS.md's example deploy line shows `-c -y`; that's only safe on a throwaway local DB.
**How to avoid:** This phase is additive (new tables) → migrate-publish, **drop `-c`**: `spacetime publish 2d-impact-game-fr9ti --module-path spacetimedb --server local --yes`. Maincloud deferred to Phase 7.
**Warning signs:** any `--delete-data` in the deploy step.

### Pitfall 3: Enforcing cap/uniqueness at send time instead of accept time
**What goes wrong:** A party with 3 members + 3 pending invites; if all accept, it overflows to 6. Or a player receives two invites and accepts both.
**Why it happens:** Checking capacity when the invite is *sent* ignores concurrent pending invites.
**How to avoid:** D-06 — validate the roster count and the `unique` identity constraint at **accept**. The `party_member.identity.unique()` constraint is the atomic backstop.
**Warning signs:** roster length checks only appear in `invitePlayer`, not `acceptInvite`.

### Pitfall 4: Regenerating bindings forgotten after schema change
**What goes wrong:** Client calls a reducer/table the generated `src/module_bindings/` doesn't know → "no such reducer" or missing table type.
**Why it happens:** New tables/reducers require `pnpm run spacetime:generate` after publish.
**How to avoid:** Deploy order is fixed: publish (migrate) → `pnpm run spacetime:generate` → `pnpm build`. (CLAUDE.md notes the `spacetime:publish` npm scripts point at the wrong `server` path — ignore them; module path is `./spacetimedb`.)
**Warning signs:** client type errors on `tables.party` / `conn.reducers.invitePlayer`.

### Pitfall 5: Toast auto-dismiss stealing focus / timing out a keyboard user
**What goes wrong:** `role="status"`/`aria-live="polite"` toast that grabs focus, or a 10s timer that fires while a keyboard user is reading.
**How to avoid:** UI-SPEC contract — `aria-live="polite"` (announce without stealing focus); hover/focus pauses the 10s timer. Timer is client-only (D-07); the invite persists server-side into the missed-invites list.

## Runtime State Inventory

Not a rename/refactor phase — greenfield additive tables. Section omitted per protocol.

## Code Examples

### Ensure-my-party then invite (D-02 invite branch)
```typescript
// Source: composed from index.ts idioms (requirePlayer :726, table insert :700, filter :735)
export const invitePlayer = spacetimedb.reducer({ targetIdentity: t.identity() }, (ctx, { targetIdentity }) => {
  const me = requirePlayer(ctx);
  if (me.identity.equals(targetIdentity)) throw new SenderError('Nevar aicināt sevi');
  const target = ctx.db.player.identity.find(targetIdentity);
  if (!target) throw new SenderError('Spēlētājs nav atrasts');
  if (ctx.db.partyMember.identity.find(targetIdentity)) throw new SenderError(`${target.name} jau ir citā pulkā`);

  // ensure I have a party, me = leader
  let mine = ctx.db.partyMember.identity.find(me.identity);
  let partyId: bigint;
  if (mine) { partyId = mine.partyId; }
  else {
    const p = ctx.db.party.insert({ id: 0n, leaderIdentity: me.identity, createdAt: ctx.timestamp });
    partyId = p.id;
    ctx.db.partyMember.insert({ id: 0n, partyId, identity: me.identity, joinedAt: ctx.timestamp });
  }
  const roster = [...ctx.db.partyMember.partyId.filter(partyId)];
  if (roster.length >= RAID_PARTY_SIZE) throw new SenderError('Pulks ir pilns (4/4)');

  ctx.db.partyInvite.insert({ id: 0n, partyId, joinerIdentity: targetIdentity,
    recipientIdentity: targetIdentity, kind: 'invite', createdAt: ctx.timestamp });
});
```
(The `requestJoin` branch is the mirror: ensure the *target's* party with target=leader, then `joinerIdentity = me`, `recipientIdentity = targetIdentity`, `kind = 'request'`.)

### serverSync mirror addition
```typescript
// Source: serverSync.test.ts:143-160 — append to the [name, value] list:
['RAID_PARTY_SIZE', RAID_PARTY_SIZE],   // must equal server const RAID_PARTY_SIZE = 4
```

## State of the Art

| Old Approach (phase-file / REQUIREMENTS) | Current Approach (CONTEXT) | When Changed | Impact |
|------------------------------------------|----------------------------|--------------|--------|
| Party id as text join code | Invite-only tap-a-player + accept/decline | 2026-07-07 discuss | Adds `party_invite` table + 4 invite reducers + 3 new UI surfaces |
| Remove membership on disconnect | Persist membership; toggle `online` only | 2026-07-07 discuss | `onDisconnect` untouched; roster shows offline members |
| Disband when empty (only) | Promote oldest-joined; disband only when last leaves | 2026-07-07 discuss | Leave path gains promotion logic |
| Timer-based invite expiry | State-based invalidation, no schedule table | 2026-07-07 discuss | No `scheduleAt` table; invalidation inline in reducers |

**Deprecated/outdated:** the literal phase-5-party.md "Client: party panel — create, show join code, join by code" is superseded by CONTEXT D-01. Do not implement join codes.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Online-players list is the accepted primary tap-target for this phase (raycast deferred) | Tap-Target Feasibility | LOW — CONTEXT explicitly sanctions the list as a fallback; if the user insists on avatar-tap, plan adds the input-disambiguation work (right-click/long-press) as an extra task. |
| A2 | Subscribing the full `party` + `party_member` tables (unfiltered) is acceptable at current scale | Pattern 5 | LOW — tables are tiny (≤ a few parties on LAN); if scale grows, filter to the viewer's party. No correctness impact. |
| A3 | `RAID_PARTY_SIZE` needs a client mirror (chip shows n/4, sheet disables at 4/4) → belongs in serverSync test | Component Responsibilities / Validation | LOW — even if only used client-side for display, mirroring it satisfies INV-5 and is cheap. |

*All other claims are `[VERIFIED: codebase]` against files read this session.*

## Open Questions

1. **Where does the missed-invites list ultimately live?**
   - What we know: UI-SPEC contract default = a `NOKAVĒTIE AICINĀJUMI` section inside `SettingsScreen.tsx` (`.settings__section`).
   - What's unclear: whether a dedicated small panel is wanted later (CONTEXT leaves it to planning; deferred as polish).
   - Recommendation: ship in Settings (contract default); do not build a dedicated panel this phase.

2. **Should an identical pending invite be deduped, or allowed to stack?**
   - What we know: D-08 invalidates by state; nothing mandates dedupe.
   - Recommendation: dedupe on send (one pending invite per `(partyId, joinerIdentity)`), so the recipient doesn't get duplicate toasts. Low effort, better UX.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `spacetime` CLI | publish + generate bindings | ✓ (used every prior phase) | — | — |
| local SpacetimeDB (`2d-impact-game-fr9ti`) | migrate-publish + two-client playtest | ✓ | — | — |
| `pnpm` | build/test/generate | ✓ | — | — (never `npm`) |
| `cargo` (`gen-bindings`) | alt binding generator (`pnpm run generate`) | ✓ (prior phases) | — | `pnpm run spacetime:generate` (CLI path) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** binding generation has two paths (`generate` via cargo, `spacetime:generate` via CLI) — CLAUDE.md documents `spacetime:generate` as canonical.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `3.2.4` |
| Config file | vitest config in the Vite setup (existing; tests run via `pnpm test`) |
| Quick run command | `pnpm test` (vitest run) |
| Full suite command | `pnpm test` then `pnpm build` (tsc -b && vite build) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-multiplayer-party | `nextLeader()` picks oldest-joined; null when empty | unit (pure) | `pnpm test partyRules` | ❌ Wave 0 (`spacetimedb/src/partyRules.ts` + test) |
| REQ-multiplayer-party | accept eligibility: reject when full (≥ RAID_PARTY_SIZE) or joiner already partied | unit (pure) | `pnpm test partyRules` | ❌ Wave 0 |
| REQ-multiplayer-party | `RAID_PARTY_SIZE` client==server | unit | `pnpm test serverSync` | ✅ extend existing (:143-160) |
| REQ-multiplayer-party | create/join/leave/disband, cap, no double-join, disconnect persists | integration (2-client playtest) | manual (webapp-testing) | manual-only — reducers need a live DB (STDB reducers can't run in vitest) |

**Manual-only justification:** STDB reducers execute inside the WASM module against a live DB; they are not unit-testable in vitest. The project convention (PROGRESS.md) is to **extract pure helpers** (`partyRules.ts`) for unit coverage and validate the wired reducers via the mandatory two-client Playwright playtest. Mirror the Phase 3 pattern (`deathPenalty.ts` pure + playtest).

### Sampling Rate
- **Per task commit:** `pnpm test` (fast; pure helpers + serverSync)
- **Per wave merge:** `pnpm test` + `pnpm build`
- **Phase gate:** full suite green + two-client playtest (form party, both see roster, leave promotes/disbands, cap/double-join rejected, disconnect keeps membership + flips online dot) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `spacetimedb/src/partyRules.ts` — pure `nextLeader()` + accept-eligibility helpers (covers REQ-multiplayer-party rule logic)
- [ ] `spacetimedb/src/partyRules.test.ts` (or under existing test dir) — unit coverage for the above
- [ ] Extend `src/game/data/__tests__/serverSync.test.ts` — `RAID_PARTY_SIZE` parity
- [ ] No framework install needed — vitest already present.

## Security Domain

**`security_enforcement: true`, ASVS level 1.** This phase adds multiplayer state mutations that affect *other* players (join/leave changes another player's party), so access control is the core concern.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (reuses existing account/session; nothing new) | `accountIdentity(ctx)` already gates identity |
| V3 Session Management | no | existing `claimSession` / account_link unchanged |
| V4 Access Control | **yes** | Every reducer resolves the actor via `accountIdentity(ctx)`; `acceptInvite`/`declineInvite` require `actor == recipientIdentity`; `leaveParty` acts only on the actor's own membership; `invitePlayer`/`requestJoin` use the actor as inviter, `targetIdentity` only as a lookup. |
| V5 Input Validation | **yes** | Validate `targetIdentity`/`inviteId` resolve to real rows; reject self-invite; reject invite to an already-partied player; enforce cap + unique at accept. |
| V6 Cryptography | no | no crypto in this phase |

### Known Threat Patterns for a SpacetimeDB multiplayer reducer

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client passes someone else's identity to act as them | Spoofing | Actor is always `ctx.sender → accountIdentity(ctx)`; passed identities are lookup targets only (critical rule 5). |
| Accept an invite that was addressed to another player | Elevation of Privilege | `acceptInvite` verifies `inv.recipientIdentity.equals(actor)` before adding anyone. |
| Force-join a party you weren't invited to | Tampering | Membership only ever inserted from a matching pending `party_invite`; no `joinParty(partyId)` reducer that trusts a raw id (drop the phase-file's `joinParty({partyId})`). |
| Overflow the party past 4 via concurrent accepts / double-join | Tampering | Cap check + `party_member.identity.unique()` atomic backstop at accept. |
| Invite spam / toast flood | Denial of Service (mild) | Dedupe pending invites per `(partyId, joinerIdentity)`; toast is `aria-live=polite` and non-blocking. Low severity at LAN scale. |
| Leaking who invited whom | Information Disclosure | Client subscribes `party_invite.where(recipientIdentity == me)` so a player only sees invites addressed to them. |

`security_block_on: high` — the access-control items (V4) are the ones that would block; all are mitigated by the reduce-through-`accountIdentity` pattern already proven in `attackPlayer`/`transcendCharacter`.

## Sources

### Primary (HIGH confidence — codebase, verified this session)
- `spacetimedb/src/index.ts` — player table (:293-318), CHARACTER_STATS/role (:32-64), PARTY_SIZE (:72), transcend constants block (:80-87), account/accountLink (:577-605), schema export (:607-627), accountIdentity/requirePlayer (:670-673, :726-732), init/onConnect/onDisconnect (:2500-2532), table+index idioms (:446, :735)
- `src/App.tsx` — subscription block (~:96-104), useTable(player) (:114), reducer-call idioms (:250-363)
- `src/game/createGame.ts` — remotePlayers Map (:266), syncRemotePlayers (:933-978)
- `src/game/systems/createInputSystem.ts` — desktop attack-on-pointerdown (:57-60)
- `src/ui/Modal.tsx`, `src/ui/SettingsScreen.tsx` — Radix reuse + settings section pattern
- `src/game/data/constants.ts` (:8-15), `src/game/data/__tests__/serverSync.test.ts` (:143-160) — mirror pattern
- `package.json` — dependency versions
- `.planning/` — CONTEXT (D-01..D-10), UI-SPEC, PROJECT (INV-1..5, naming), PROGRESS (shared contracts), REQUIREMENTS, phase-5/phase-6 specs, config.json (nyquist + security toggles)

### Secondary / Tertiary
- None — no external or web sources required; phase is fully internal.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all verified in package.json + live use.
- Architecture / table+reducer shapes: HIGH — modeled directly on existing idioms; only naming is discretionary.
- Tap-target recommendation: MEDIUM-HIGH — technical feasibility verified; the list-vs-raycast choice is a UX/risk judgment (A1).
- Pitfalls / security: HIGH — each mitigation maps to an existing proven pattern.

**Research date:** 2026-07-07
**Valid until:** 2026-08-06 (stable internal codebase; re-verify line numbers if `index.ts` drifts significantly before planning).

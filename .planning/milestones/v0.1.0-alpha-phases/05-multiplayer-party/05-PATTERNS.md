# Phase 05: Multiplayer party - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 11 (2 new server, 1 new server test, 5 new client, 3 edited client, + edited server module)
**Analogs found:** 11 / 11 (all internal — zero greenfield surfaces without a codebase precedent)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `spacetimedb/src/index.ts` (EDIT) | model + reducers (STDB module) | CRUD + event-driven | itself — `player`/`ownedCharacter` tables, `setParty`/`transcendCharacter` reducers, `onConnect`/`onDisconnect` | exact (same file) |
| `spacetimedb/src/partyRules.ts` (NEW) | utility (pure helper) | transform | `spacetimedb/src/deathPenalty.ts` | exact |
| `spacetimedb/src/partyRules.test.ts` (NEW) | test (vitest unit) | request-response | `src/game/data/__tests__/deathPenalty.test.ts` | exact |
| `src/game/data/constants.ts` (EDIT) | config (client mirror) | — | itself — `RAID_SHARD_PAYOUT` mirror line | exact (same file) |
| `src/game/data/__tests__/serverSync.test.ts` (EDIT) | test (parity guard) | transform | itself — the `[name, value]` list :144-158 | exact (same file) |
| `src/App.tsx` (EDIT) | provider/store (subscription + reducer wiring) | request-response + streaming | itself — subscription block :84-104, reducer calls :250-374 | exact (same file) |
| `src/ui/PlayerSheet.tsx` (NEW) | component (slide-out sheet) | request-response | `src/ui/CharacterSheet.tsx` (overlay+card+role badge) / `src/ui/Modal.tsx` (Radix a11y) | role-match |
| `src/ui/PartyToast.tsx` (NEW) | component (transient status) | event-driven | `.shard-toast` in `src/App.tsx` :518-522 + `src/index.css` :1160-1195 | role-match |
| `src/ui/PartyRoster.tsx` (NEW) | component (panel) | request-response | `src/ui/CharacterSheet.tsx` role-badge + `src/ui/Hud.tsx` `.hud__meta-row` :160 | role-match |
| `src/ui/SettingsScreen.tsx` (EDIT) | component (settings section) | request-response | itself — `.settings__section` blocks :33/:51/:60 | exact (same file) |
| `src/ui/Hud.tsx` (EDIT) | component (HUD entry point) | request-response | itself — `.hud__meta-row` :160 | exact (same file) |

## Pattern Assignments

### `spacetimedb/src/index.ts` — party/member/invite tables (model, CRUD)

**Analog:** existing `ownedCharacter` table (`index.ts:418-436`) for the autoInc-id + `.index('btree')` idiom; `player` table (`index.ts:293-318`) for `t.identity()` PK + `t.timestamp()`. Multi-column named-index idiom lives in `characterActivation` (`index.ts:442-454`).

**Table shape pattern to copy** (from `ownedCharacter` :418-436):
```typescript
const ownedCharacter = table(
  { name: 'owned_character', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    characterId: t.string(),
    ...
  }
);
```
Apply verbatim structure to `party` (id autoInc PK, `leaderIdentity: t.identity()`, `createdAt: t.timestamp()`), `party_member` (`identity: t.identity().unique()` for the one-party-per-player backstop — D-06; `partyId: t.u64().index('btree')`; `joinedAt: t.timestamp()`), and `party_invite` (btree indexes on `partyId`/`joinerIdentity`/`recipientIdentity`). Table `name` MUST be snake_case (`'party_member'`), accessor is camelCase (`ctx.db.partyMember`).

**Schema registration** (`index.ts:607-627`) — append the three new tables to the single `schema({...})` object:
```typescript
const spacetimedb = schema({
  account, accountLink, player, gemDrop, shardDrop, enemy, goliath,
  ownedCharacter, characterActivation, skillCast, bannerPity, weaponItem,
  pullResult, pvpHit, rangedAttack, healEvent, regenTimer, worldTimer,
  // + party, partyMember, partyInvite
});
export default spacetimedb;
```

**Constant placement** — add `const RAID_PARTY_SIZE = 4;` in the tunables block near `index.ts:72-87` (where `PARTY_SIZE = 4` and `RAID_SHARD_PAYOUT = 6` live). Do NOT reference `PARTY_SIZE` (index.ts:72) in party code — see Anti-Patterns.

---

### `spacetimedb/src/index.ts` — party reducers (reducers, CRUD)

**Analog:** `transcendCharacter` (`index.ts:1105-1132`) and `setParty` (`index.ts:1136-1153`) — both show the canonical `requirePlayer(ctx)` → validate → `SenderError` → mutate shape. `attackPlayer` (:995) shows a `targetIdentity` arg used purely as a lookup, never as the actor.

**Imports** (`index.ts:1`):
```typescript
import { schema, t, table, SenderError } from 'spacetimedb/server';
import { ScheduleAt, Identity } from 'spacetimedb';
```

**Reducer skeleton to copy** (from `transcendCharacter` :1105-1132):
```typescript
export const transcendCharacter = spacetimedb.reducer(
  { characterId: t.string() },
  (ctx, { characterId }) => {
    const currentPlayer = requirePlayer(ctx);   // actor from ctx.sender, never an arg
    const owned = findOwnedRow(ctx, currentPlayer, characterId);
    if (!owned) throw new SenderError('Character not owned');
    // ...pure-helper decision, then ctx.db.*.update / .insert
    ctx.db.ownedCharacter.id.update({ ...owned, transcendLevel: result.nextLevel });
  }
);
```
Apply to `invitePlayer`, `requestJoin`, `acceptInvite`, `declineInvite`, `leaveParty`. For `acceptInvite`/`declineInvite`, add the authz guard `if (!inv.recipientIdentity.equals(me.identity)) throw new SenderError('unauthorized');` (the recipient is the only one who may accept — V4 access control). Arg type for identity targets: `{ targetIdentity: t.identity() }` / `{ inviteId: t.u64() }`.

**Authz helpers to reuse verbatim** (`index.ts:670-673`, `:726-732`):
```typescript
function accountIdentity(ctx) {
  const link = ctx.db.accountLink.identity.find(ctx.sender);
  return link ? link.canonicalIdentity : null;
}
function requirePlayer(ctx) {
  const canonical = accountIdentity(ctx);
  if (!canonical) throw new SenderError('Log in first');
  const existingPlayer = ctx.db.player.identity.find(canonical);
  if (!existingPlayer) throw new SenderError('Log in first');
  return existingPlayer;
}
```

**Filter/insert idiom** (from `setParty` :1142-1144 + `ownsCharacter` :735):
```typescript
const roster = [...ctx.db.partyMember.partyId.filter(partyId)];   // spread iterator → Array
if (roster.length >= RAID_PARTY_SIZE) throw new SenderError('Pulks ir pilns');
ctx.db.partyMember.insert({ id: 0n, partyId, identity: joiner, joinedAt: ctx.timestamp });
```

---

### `spacetimedb/src/index.ts` — onDisconnect (lifecycle hook — DO NOT CHANGE)

**Analog / target:** `onDisconnect` (`index.ts:2526-2532`). Per D-04, leave this EXACTLY as-is (only toggles `online: false`). Do NOT add `party_member` removal here.
```typescript
export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const canonical = accountIdentity(ctx);
  if (!canonical) return;
  const existingPlayer = ctx.db.player.identity.find(canonical);
  if (!existingPlayer) return;
  ctx.db.player.identity.update({ ...existingPlayer, online: false });
});
```

---

### `spacetimedb/src/partyRules.ts` (utility, transform)

**Analog:** `spacetimedb/src/deathPenalty.ts` (whole file). Pure, dependency-free (no `ctx`/`db`/import/random/time) so it unit-tests directly under the client's vitest runner across the package boundary. Exports typed interfaces + a pure function with load-bearing branch order.

**Pattern to copy** (from `deathPenalty.ts:14-33`):
```typescript
export interface DeathShardPenalty { shardsLost: number; /* ...typed result */ }

export function applyDeathShardPenalty(
  transcendShards: number, transcendLevel: number, constellation: number, loss: number
): DeathShardPenalty {
  if (transcendShards > 0) { return { /* branch 1 */ }; }
  ...
}
```
Apply to: `nextLeader(members: {identity, joinedAt}[]): Identity | null` (returns min-`joinedAt` identity, `null` when empty → caller disbands) and an accept-eligibility helper (e.g. `canAccept(rosterLength, joinerAlreadyPartied, cap): { ok, reason }`). Keep every rule pure; the reducer supplies rows, the helper decides. Note determinism header comment style of `deathPenalty.ts:1-12`.

---

### `spacetimedb/src/partyRules.test.ts` (test, vitest unit)

**Analog:** `src/game/data/__tests__/deathPenalty.test.ts` (whole file). Imports the real server helper across the package boundary; one `it()` per branch; `toEqual` on the full result object.

**Pattern to copy** (from `deathPenalty.test.ts:1-19`):
```typescript
import { describe, expect, it } from 'vitest';
// Import the REAL helper across the package boundary (server module → client vitest runner)
import { applyDeathShardPenalty } from '../../../../spacetimedb/src/deathPenalty';
import { SHARD_DEATH_LOSS } from '../constants';

describe('applyDeathShardPenalty', () => {
  it('has-shards branch: spends shards, erodes nothing', () => {
    expect(applyDeathShardPenalty(2, 3, 6, SHARD_DEATH_LOSS)).toEqual({ /* full object */ });
  });
});
```
Note: tests live under the CLIENT test dir (`src/game/data/__tests__/`), NOT beside the server file — vitest cwd is project root. RESEARCH names `spacetimedb/src/partyRules.test.ts`, but the established convention (deathPenalty) places the test in `src/game/data/__tests__/partyRules.test.ts` importing `../../../../spacetimedb/src/partyRules`. Planner should confirm placement against the vitest include glob; the deathPenalty pair is the authoritative precedent.

---

### `src/game/data/constants.ts` (config mirror) + `serverSync.test.ts` (parity guard)

**Analog:** the `RAID_SHARD_PAYOUT` mirror line (`constants.ts:13`) + its parity assertion (`serverSync.test.ts:155`).

**Client mirror** (from `constants.ts:7-13` style):
```typescript
export const RAID_PARTY_SIZE = 4; // server — player-party cap, distinct from PARTY_SIZE (character team)
```

**Parity test addition** (append to the `it.each([...])` list at `serverSync.test.ts:144-158`):
```typescript
['RAID_PARTY_SIZE', RAID_PARTY_SIZE],   // must equal server const RAID_PARTY_SIZE = 4
```
`extractServerConstant` (:69-73) regex-extracts `const RAID_PARTY_SIZE = 4;` from the server source — the server declaration MUST match `const NAME = <number>;` on one line for the regex to find it.

---

### `src/App.tsx` (provider/store — subscription + reducer wiring)

**Analog:** itself — subscription block :84-104 and reducer-call handlers :250-374.

**Subscription pattern** (`App.tsx:84-104`) — extend the existing `subscribe([...])` array:
```typescript
const subscription = connection.subscriptionBuilder()
  .onApplied(() => setIsSubscribed(true))
  .subscribe([
    tables.accountLink.where(row => row.identity.eq(identity)),
    tables.player, tables.ownedCharacter, /* ... */
    // + tables.party, tables.partyMember,
    // + tables.partyInvite.where(r => r.recipientIdentity.eq(<myCanonicalIdentity>))
  ]);
```
Note the `.where(row => ...eq(identity))` filtered-subscription idiom already used for `accountLink` :89 — reuse for `party_invite` so a player only receives invites addressed to them (Information Disclosure mitigation).

**useTable reactive read** (`App.tsx:114-123`):
```typescript
const [players] = useTable(tables.player);
// + const [parties] = useTable(tables.party);
// + const [partyMembers] = useTable(tables.partyMember);
// + const [myInvites] = useTable(tables.partyInvite);
```

**Reducer call idiom** (`App.tsx:250-374`, e.g. `:257`, `:358`):
```typescript
connection?.reducers.setParty({ characterIds });
connection.reducers.attackPlayer({ targetIdentity: target.identity, damage });
// + connection?.reducers.invitePlayer({ targetIdentity });
// + connection?.reducers.acceptInvite({ inviteId });
```

**Canonical identity for comparisons** (`App.tsx:128-129`): resolve `myIdentityHex` via the `accountLink` canonical mapping, then compare with `.toHexString()` — do NOT compare the raw device `identity` to `party_member.identity` (which is canonical).

---

### `src/ui/PlayerSheet.tsx` (NEW — component, slide-out sheet)

**Analog:** `src/ui/CharacterSheet.tsx` (overlay + card + close + role badge, :73-105) for the visual shell; `src/ui/Modal.tsx` (Radix Dialog: focus trap, ESC, ARIA) for the a11y-mandated wrapper.

**Overlay-card + click-outside-to-close pattern** (`CharacterSheet.tsx:73-83`):
```tsx
<div className="sheet" onClick={onClose}>
  <div className="sheet__card"
    style={{ '--element-color': element.cssColor } as React.CSSProperties}
    onClick={event => event.stopPropagation()}>
    <button className="sheet__close" onClick={onClose} aria-label="Aizvērt">✕</button>
    ...
```

**Radix a11y shell** (`Modal.tsx:16-35`) — reuse `Modal` (or its Radix `Dialog.Root/Portal/Overlay/Content` structure) for focus-trap + ESC + `aria-modal`. UI-SPEC mandates reuse; do not hand-roll focus management.

**Action buttons** — mirror `.sheet__actions` / `.sheet__set` (`CharacterSheet.tsx:218-231`) with Latvian copy: "Aicināt manā pulkā" → `invitePlayer`, "Lūgt pievienoties pulkam" → `requestJoin`, "Pamest pulku" → `leaveParty`.

---

### `src/ui/PartyToast.tsx` (NEW — component, event-driven transient)

**Analog:** the `.shard-toast` precedent — render in `App.tsx:518-522` + keyframes `src/index.css:1160-1195` (`shard-toast-in`).

**Render pattern** (`App.tsx:518-522`):
```tsx
{shardToast && (
  <div className="shard-toast" role="status" key={shardToast.key}>
    <span className="shard-toast__glyph">◈</span> {shardToast.text}
  </div>
)}
```
For the invite toast: use `role="status"` + `aria-live="polite"` (announce without stealing focus — Pitfall 5), a client-only 10s dismiss timer (D-07, NOT server-side), Accept/Decline buttons calling `acceptInvite`/`declineInvite`, and hover/focus pauses the timer. Copy the `key={...}` re-mount trick to restart the in-animation. New CSS class `.party-toast` cloning the `.shard-toast` in/out keyframe block.

---

### `src/ui/PartyRoster.tsx` (NEW — component, panel)

**Analog:** role-badge block in `CharacterSheet.tsx:93-101`; panel-row spacing from `Hud.tsx` `.hud__meta-row` :160; `ROLE_META` source in `characters.ts:14-31`.

**Role badge pattern** (`CharacterSheet.tsx:93-101`) — reuse verbatim, no new server field:
```tsx
{ROLE_META[character.role] && (
  <span className="sheet__role"
    style={{ color: `var(${ROLE_META[character.role].token})` }}
    aria-label={`Loma: ${ROLE_META[character.role].aria}`}>
    {ROLE_META[character.role].label}
  </span>
)}
```
Per roster row, derive from already-subscribed `player`: `player.online` → online dot, `player.activeCharacterId` → character name/element + `ROLE_META[CHARACTERS[id].role]` badge, `party.leaderIdentity.equals(member.identity)` → leader crown. Show `n/4` chip against `RAID_PARTY_SIZE`.

---

### `src/ui/SettingsScreen.tsx` (EDIT — missed-invites section)

**Analog:** itself — the `.settings__section` label + content pattern (`SettingsScreen.tsx:33-63`).

**Section pattern to copy** (`SettingsScreen.tsx:60-63`):
```tsx
<p className="settings__section">KONTS</p>
<Button variant="danger" block onClick={onLogout}>IZIET NO KONTA</Button>
```
Add a `<p className="settings__section">NOKAVĒTIE AICINĀJUMI</p>` section listing pending `party_invite` rows (recipient == me) with Accept/Decline actions wired to the same `acceptInvite`/`declineInvite` reducers. This is the contract-default mount for the missed-invites list (Open Question 1).

---

### `src/ui/Hud.tsx` (EDIT — party-chip entry point)

**Analog:** itself — `.hud__meta-row` (`Hud.tsx:160`). Add a `.hud__party-chip` inside the existing meta row as the entry point that opens the online-players list / roster.

---

## Shared Patterns

### Authentication / Authorization (actor resolution)
**Source:** `spacetimedb/src/index.ts:670-673` (`accountIdentity`), `:726-732` (`requirePlayer`)
**Apply to:** EVERY new reducer (`invitePlayer`, `requestJoin`, `acceptInvite`, `declineInvite`, `leaveParty`)
```typescript
const me = requirePlayer(ctx);              // actor is ctx.sender → canonical, never an arg
// acceptInvite/declineInvite additionally:
if (!inv.recipientIdentity.equals(me.identity)) throw new SenderError('unauthorized');
```
`targetIdentity` passed by the client is ONLY ever a lookup target, never the authenticated actor (Critical Rule 5 / Spoofing mitigation).

### Error handling (SenderError)
**Source:** `spacetimedb/src/index.ts:1` (import), used throughout reducers (e.g. `:1110`, `:1121-1123`, `:1147`)
**Apply to:** all new reducers — validation failures throw `new SenderError('<Latvian message>')`. Client-facing copy is Latvian (e.g. `'Pulks ir pilns'`, `'Aicinājums vairs nav spēkā'`, `'jau esi citā pulkā'`). Reducers are transactional: a throw rolls back the whole call.

### Pure-helper + vitest discipline
**Source:** `spacetimedb/src/deathPenalty.ts` + `src/game/data/__tests__/deathPenalty.test.ts`
**Apply to:** all rule logic (`nextLeader`, accept-eligibility) — extract to `partyRules.ts`, unit-test across the package boundary. STDB reducers can't run in vitest, so wired-reducer behavior is validated by the mandatory two-client playtest.

### Client/server constant parity
**Source:** `src/game/data/constants.ts:13` mirror + `serverSync.test.ts:144-158` `it.each` list
**Apply to:** `RAID_PARTY_SIZE` — declare `const RAID_PARTY_SIZE = 4;` server-side (one-line `const NAME = N;` form for the regex), mirror in `constants.ts`, add `['RAID_PARTY_SIZE', RAID_PARTY_SIZE]` to the parity list (INV-5).

### Radix a11y for dialogs
**Source:** `src/ui/Modal.tsx:16-35` (Radix Dialog: focus trap, ESC, scroll-lock, ARIA)
**Apply to:** `PlayerSheet` and any leave-confirm — do NOT hand-roll focus management (UI-SPEC mandate).

### Role badge (no new server field)
**Source:** `src/game/data/characters.ts:14-31` (`ROLE_META`) + `src/ui/CharacterSheet.tsx:93-101` render
**Apply to:** `PartyRoster` — role is already in server `CHARACTER_STATS[].role` (`index.ts:36`, `:42-64`) and mirrored client-side; render via `ROLE_META[CHARACTERS[activeCharacterId].role]`.

## Anti-Patterns to Avoid (from RESEARCH, load-bearing)

| Anti-pattern | Rule |
|--------------|------|
| Reusing `PARTY_SIZE` (index.ts:72) for the player-party cap | Introduce distinct `RAID_PARTY_SIZE = 4`; never reference `PARTY_SIZE` in party code. |
| Removing `party_member` in `onDisconnect` | D-04 override — leave `onDisconnect` (:2526-2532) toggling `online` only. |
| Trusting a client-passed identity as the actor | Always `accountIdentity(ctx)`; passed `targetIdentity` is a lookup only. |
| Branching the accept path on `kind` | Model `joinerIdentity`/`recipientIdentity` explicitly; accept is one symmetric code path. |
| Enforcing cap/uniqueness at send time | Enforce at ACCEPT time (D-06); `party_member.identity.unique()` is the atomic backstop. |
| Publishing with `-c`/`--delete-data` | Additive migrate only — `--delete-data` destroys `account`/`account_link` (not in backup set). |
| A `joinParty(partyId)` reducer that trusts a raw id | Membership only ever inserted from a matching pending `party_invite` (Tampering mitigation). |

## No Analog Found

None. Every surface has an internal precedent (verified this session). The two "new" concepts with the thinnest precedent are both covered:
- **State-based invite invalidation (D-08)** — no dedicated analog, but it is inline `ctx.db.partyInvite.partyId.filter(...).delete(...)` using the same filter/delete idiom as `ownsCharacter` (`index.ts:735`) and `claimSession` (`index.ts:682-688`).
- **Client-only 10s toast timer (D-07)** — the `.shard-toast` (App.tsx:518, index.css:1160) covers the visual/keyframe; the auto-dismiss `setTimeout` + hover-pause is net-new but trivial React state.

## Metadata

**Analog search scope:** `spacetimedb/src/` (module + pure helpers + tests), `src/ui/`, `src/App.tsx`, `src/game/data/` (constants + tests + ROLE_META), `src/index.css` (toast keyframes)
**Files scanned:** ~14 (index.ts targeted sections, deathPenalty.ts, deathPenalty.test.ts, serverSync.test.ts, Modal.tsx, CharacterSheet.tsx, SettingsScreen.tsx, App.tsx sections, characters.ts, constants.ts, plus Glob/Grep sweeps)
**Pattern extraction date:** 2026-07-07

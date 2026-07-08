# Phase 5: Multiplayer party - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Let PLAYERS group into a party — the foundation for the co-op raid (Phase 6) and for
ganging a whale. This is a group of **players**, NOT the existing `PARTY_SIZE = 4`
character party (that stays untouched). Use `RAID_PARTY_SIZE = 4` for the player-party cap.

**Scope delta vs `phase-5-party.md`:** the discussion replaced the phase file's bare
"create + join-by-code + roster" with an **invite-based, tap-a-player flow** (Fortnite-style).
That adds a `party_invite` table + accept/decline reducers + a slide-out player sheet +
an invite toast + a missed-invites list. Still within the phase domain ("players group up") —
it is the interaction design of grouping, not a new capability. Downstream planning must
honor the decisions below over the literal phase-file wording where they differ (notably:
NO text join codes; disconnect does NOT remove membership).

</domain>

<decisions>
## Implementation Decisions

### Grouping mechanism
- **D-01: Invite-only, NO text join codes.** The only way into a party is by tapping a
  player on screen and using the slide-out sheet. Drop the phase file's "party id as join
  code" entirely.
- **D-02: Two symmetric actions on the player sheet.**
  - **"Invite to my party"** → target joins *my* party. If I have no party, one is created
    with **me** as leader, then the invite is sent to the target.
  - **"Ask to join their party"** → I join *their* party. If the target has no party, one is
    created with **the target** as leader, then a join-request is sent to the target.
  - Rule of thumb: whoever *owns/leads* the party is whoever the party "belongs to" in the
    action — invite = I lead, ask-to-join = they lead.
- **D-03: Both actions produce a pending item the RECIPIENT accepts or declines.** Nobody is
  added to a party without the receiving player's explicit Accept. (Invite → target accepts;
  join-request → target/owner accepts.)

### Membership lifecycle
- **D-04: Disconnect persists membership.** Do NOT remove `party_member` rows in
  `clientDisconnected` (this deviates from the phase file). A network blip / relog must not
  drop a player from their party before a raid. Roster shows them offline via the existing
  `player.online` flag.
- **D-05: Leader leaves → promote, don't disband.** When the leader leaves and other members
  remain, promote the **oldest-joined** remaining member to leader. Disband (delete party +
  its pending invites) only when the LAST member leaves.
- **D-06: Enforce one-party-per-player and the `RAID_PARTY_SIZE` (4) cap** at accept time.
  `party_member.identity` is unique (one party per player). Reject accepts that would exceed
  the cap or double-join.

### Invite notification UX
- **D-07: Invite toast auto-dismisses at ~10s (client-side only).** The toast slides in from
  the side, offers Accept / Decline, and hides after 10s — but the invite itself is NOT hard-
  expired server-side by a timer. A dismissed/missed invite drops into a **missed-invites
  list** the player can act on later from a calm location (menu / settings). Non-intrusive.
- **D-08: Invites are invalidated (server-side) by state, not a timer** — clear pending
  invites when the party is full, the party disbands, the recipient is already in a party, or
  the inviter/party no longer exists. (No scheduled-expiry table needed.)

### UI design intent (feeds /gsd-ui-phase)
- **D-09: Tap/click a player → slide-out sheet.** Sheet slides from the side, rounded,
  accessibility-first (keyboard/focus + touch reachable). Fortnite-style action buttons.
- **D-10: Party roster panel** shows each member's active character + **role badge**
  (roles already live server-side), a leader crown, and an online dot.

### Claude's Discretion
- Exact tap-target for a player (on-screen 3D avatar raycast vs. an online-players list) is a
  research/UI question — user described "tap on the player" (the on-screen avatar). If raycast
  hit-testing on player meshes proves impractical, an online-players list is an acceptable
  fallback surface for the same slide-out sheet. Flag for research.
- Table/reducer naming, exact `party_invite` columns, and where the missed-invites list mounts
  (settings vs. a dedicated small panel) are left to planning, consistent with the shared
  naming contract in PROGRESS.md.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec + contracts
- `.planning/transcendence/phase-5-party.md` — the phase spec (tables/reducers/DoD). Honor
  CONTEXT.md decisions where they deviate (no join codes; persist on disconnect).
- `.planning/transcendence/PROGRESS.md` — Shared contracts every phase MUST honor (naming,
  invariants, `RAID_PARTY_SIZE`, workflow/deploy steps).
- `.planning/transcendence/phase-6-raid.md` — downstream consumer; the raid is party-gated and
  reads party membership + contributor tracking. Party shape must support it.
- `.planning/PROJECT.md` — locked naming contract + design invariants (INV-1..INV-5).

### Code to reuse / extend
- `spacetimedb/src/index.ts:270` — `player` table (identity PK, `online`, `activeCharacterId`).
- `spacetimedb/src/index.ts:36-63` — `CHARACTER_STATS[].role` (roles already server-side; roster reads these).
- `spacetimedb/src/index.ts:2466-2498` — `init` / `clientConnected` / `clientDisconnected` (`online` toggle; do NOT add party removal here per D-04).
- `spacetimedb/src/index.ts:72` — existing `PARTY_SIZE = 4` (CHARACTER party — do NOT collide; add separate `RAID_PARTY_SIZE`).
- `src/App.tsx:114` — `useTable(tables.player)` already subscribed (reuse for player list / tap targets).
- `src/ui/Modal.tsx`, `src/ui/Hud.tsx`, `src/ui/CharacterScreen.tsx` — existing slide-out / panel + role-badge patterns to match for the party sheet and roster.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useTable(tables.player)` (App.tsx:114) — live player set already streamed to client; source for online players / tap targets and roster online dots.
- Server `role` on `CHARACTER_STATS` — roster role badge needs no new server field; read `statsFor(activeCharacterId).role`.
- `player.online` bool + `activeCharacterId` — everything the roster row needs beyond party linkage already exists.
- Latvian display-copy + role-badge UI from Phase 4 (`CharacterScreen.tsx` / `CharacterSheet.tsx`) — match for the roster.

### Established Patterns
- Public tables + `useTable` subscription; reducers mutate, clients render (STDB model).
- `accountIdentity(ctx)` is the canonical player identity — use it for `party_member.identity`, invite from/to, and all authz (`ctx.sender` → canonical).
- Additive schema → migrate publish (drop `-c`), regenerate bindings, build. New `party` / `party_member` / `party_invite` tables are additive.

### Integration Points
- New public tables `party`, `party_member`, `party_invite` + reducers
  (`invitePlayer`, `requestJoin`/ask-to-join, `acceptInvite`, `declineInvite`, `leaveParty`).
- `clientDisconnected` stays as-is (online toggle only) per D-04.
- Client: subscribe new tables; slide-out player sheet; invite toast; missed-invites list; roster panel.
- Phase 6 will read `party` + `party_member` to gate `summonRaid` and split payout.

</code_context>

<specifics>
## Specific Ideas

- "Like Fortnite": tap a player → slide-out sheet with "invite to my party" / "ask to join
  their party"; recipient gets a small notification with Accept / Cancel(Decline).
- Toast slides in from the opposite side, ~10s, then disappears; missed ones recoverable under
  a menu/settings surface — "shouldn't be intrusive."
- Rounded, accessibility in mind.

</specifics>

<deferred>
## Deferred Ideas

- Cross-device / off-screen friend invites via a shareable text code — explicitly rejected for
  this phase (invite-only). Revisit only if an online-list tap-target proves insufficient.
- Configurable / longer missed-invite retention "under settings" — user floated it as "maybe";
  keep the missed-invites list simple for now, treat tuning as future polish.

</deferred>

---

*Phase: 5-Multiplayer party*
*Context gathered: 2026-07-07*

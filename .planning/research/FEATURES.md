# Feature Research

**Domain:** Telegraphed dodgeable enemy attacks + per-character crit + poise/interrupt for a top-down action multiplayer game (Soulslike / Genshin / MOBA-telegraph hybrid)
**Researched:** 2026-07-08
**Confidence:** HIGH (established, well-documented action-game conventions; crit ranges cross-checked against Genshin sources; tuning numbers are starting points for a feel pass, not authoritative constants)

---

## Scope note (read first)

This milestone (v0.2.0-alpha "Combat Depth") replaces the **undodgeable per-tick contact drain**
on server-authoritative enemies with **discrete, telegraphed, dodgeable strikes**, and adds a
**real per-character crit system** plus a **poise/interrupt** mechanic. **Enemies only** —
heroes keep the current client swing. The SPEC already fixes the architecture (unit-agnostic
`unit_attack` FSM, `ATTACKS` registry, `windup→strike→recovery`, damage resolved once at the
strike frame vs LIVE positions). This document sorts the *behavior/feel* features into table
stakes / differentiators / anti-features with complexity, dependencies, and concrete tuning
ranges — it does not re-litigate the schema.

The three genre reference points and what each contributes:
- **Soulslike** — the readability contract: obvious windup, commit/recovery frames, dodge as the
  reactive answer, i-frame/positional escape windows, punish-the-recovery loop.
- **Genshin** — the crit stat model: base 5% CR / 50% CDMG, ~1:2 CR:CDMG scaling, floated crit
  numbers, and elemental/burst-style ground telegraphs.
- **MOBA (Dota/LoL)** — the *ground telegraph* language: circle / cone / lane (line) shapes with
  a cast-time fill that communicates both **where** and **when**, resolved at a discrete cast point.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing these and the combat feels either unfair (undodgeable) or unreadable (no telegraph).

| Feature | Why Expected | Complexity | Notes / tuning |
|---------|--------------|------------|-------|
| **Windup → strike → recovery phases** | The core readability contract of every action game; without it "dodgeable" is meaningless | MEDIUM | FSM already specced. Phases: idle·windup·strike·recovery. Strike = 1 tick (~150 ms) or a short active window (1–2 ticks). |
| **Readable windup duration** | Player must *see* the attack coming with time to react. Too short = feels unfair; too long = trivial | LOW (tuning) | **Readable-but-fair band: ~0.4–1.0 s.** Fast/close pokes ~0.35–0.5 s (`swordSwing` 0.45 s), committal AOEs 0.8–1.2 s (`leapSlam` 0.9 s), gap-closers ~0.6 s (`shieldDash`). Under ~0.3 s at 150 ms tick = unreactable; over ~1.3 s = boring. |
| **Ground telegraph that shows shape AND timing** | MOBA/Genshin convention: the marker communicates *where* the hitbox is and *when* it fires (fill/grow animation) | MEDIUM | 3 shapes (circle / cone / lane) cover the roster. Telegraph must fill/pulse over the windup so timing is legible on the pixel filter. Contrast is the risk — see PITFALLS. |
| **Damage resolved once at the strike frame vs LIVE positions** | This is what makes attacks dodgeable — move out during windup = no hit | MEDIUM | Hitbox tested at strike instant against *current* player positions, NOT positions at cast (except intentionally locked AOEs, below). Flat burst damage, not DPS. |
| **A viable dodge/escape window** | Player needs an action that beats the attack: distance (dash out of the shape) at minimum | LOW | The dash-out-of-shape model is the baseline and needs no i-frames. Windup length *is* the dodge window. Player dash speed vs telegraph radius must leave escapable margin (leap r≈3.5 must be dashable-out-of in ~0.9 s). |
| **Attack selection by range + cooldown** | Enemies must pick a *sensible* attack (poke when close, gap-close when far) or behavior reads as random | LOW | One selection fn `(distance, cooldownUntil, available[]) → attackId`. Range bands from SPEC: far >~9 → dash; mid → leap; close → swing. Per-unit `cooldownUntil` gate. |
| **Per-unit attack cooldown / pacing** | Prevents windup-spam; gives the player breathing room to punish recovery | LOW | `cooldownMicros` per attack. Starting band **~1.5–3.5 s** between attacks (bigger AOEs longer). Recovery ~0.3–0.6 s before cooldown starts. |
| **Removal of the old contact drain** | Two damage sources (drain + strikes) double-dips and defeats the dodge fantasy | LOW | SPEC deletes goliath `damagePerTick`. Goliaths damage ONLY via strikes this milestone. Camp drain stays until camps convert. |
| **Per-character critRate / critDmg** | Genshin players expect crit as a real per-character stat, not a global coin flip | LOW | Replaces client `Math.random()<0.22 → ×1.9`. Base floor **5% CR / +50% CDMG** (Genshin convention); per-character spread. See crit ranges below. |
| **Floated crit damage number (visual)** | Standard feedback that a crit landed | LOW (exists) | `kind:'crit'` float already exists; now driven by the real per-character roll. |
| **Server awareness of crit (`isCrit`)** | The interrupt can't work if the server never learns a hit crit | LOW | Additive arg on `attackEnemies`/`attackRay`. Prerequisite plumbing for poise. |

### Differentiators (Competitive Advantage)

Where this combat becomes *deep* rather than merely fair. Align with the game's "power chase"
core value — crit and interrupts are levers players can build toward.

| Feature | Value Proposition | Complexity | Notes / tuning |
|---------|-------------------|------------|-------|
| **Poise / stagger interrupt (crit-during-windup cancels the attack)** | The signature mechanic: a well-timed crit *punishes* a telegraphed attack, turning defense into a proactive skill+build check. Rewards crit investment with tempo, not just damage | MEDIUM–HIGH | **DEPENDS on the crit system existing (Phase A).** Crit damage during windup accrues into `poise`; `poise >= poiseThreshold` → cancel + brief stagger, no strike. Non-crit hits do NOT interrupt. Threshold band: **~1–3 crits worth of a character's damage** (tune so it's achievable but not guaranteed). |
| **Attack chaining / combos (swing → swirl)** | Enemies feel like they have *intent*; a dodged poke isn't safe if it chains into an AOE. Teaches players to respect recovery | MEDIUM | `swordSwing` (cone, close) chains into `swordSwirl` (360° circle). Chain fires a second windup immediately after the first recovery, shorter cooldown. Keep chains ≤2–3 links so they stay learnable. |
| **Locked vs live-tracked AOE (leap lands where you WERE)** | Mixing "dodge by moving" (live) with "dodge by pre-committing" (locked landing) creates real decision variety | MEDIUM | `leapSlam` locks its landing at cast (dodge = don't be there when it lands); `swordSwing`/`swirl` resolve vs live pos. This *mix* is what makes reads interesting — a differentiator over "all attacks track you." |
| **Distinct attack silhouettes per archetype** | Different goliath sizes → different attack lists → readable enemy identity | LOW–MEDIUM | `UNIT_ATTACKS[unitKind][archetype]`. Data-only; a big goliath's list differs from a small one. Free variety once the registry exists. |
| **Per-attack strike VFX/audio on an event table** | Juicy, discrete feedback at the moment of impact (vs continuous drain's mush) | MEDIUM | `attack_strike` event broadcasts the strike instant for one-shot VFX/SFX. Mirrors existing `skill_cast`/`ranged_attack` pattern. |
| **Gap-closer with a moving hitbox (lane dash)** | `shieldDash` charges along a lane — a moving capsule hitbox reads differently from a static circle, adds spacing tension | MEDIUM | Lane/capsule (halfWidth ~1.2) resolved along the charge path. Higher complexity because the hitbox travels; do it last (SPEC slice 3). |
| **Crit-ratio build tension (Genshin 1:2 CR:CDMG)** | Long-term build depth: players optimize CR vs CDMG, feeding the power chase | LOW (data) | Follow the **1:2 CR:CDMG** convention when authoring per-character values so future weapon/constellation crit sources slot in naturally. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real rigid-body / continuous-collision physics engine** | "Physics feel," knockback that pushes bodies | Massive determinism + perf cost on a 150 ms server tick; desyncs; overkill for the goal | **Hitboxes resolved at the strike instant vs current positions — NO continuous collision.** "Physics feel" = discrete overlap test, not a physics sim. (Explicit SPEC non-goal.) |
| **Continuous / per-tick contact damage kept alongside strikes** | "Standing in fire should hurt," safety net | Double-dips with strikes, re-introduces the exact undodgeable drain this milestone removes; kills the dodge fantasy | Delete goliath contact drain. Damage comes ONLY from telegraphed strikes. (Camp drain deferred, not blended.) |
| **Attacks that track the player through the entire windup (perfect homing)** | "Smart" enemies that always connect | Undodgeable in practice → same feel as the old drain; frustrating | Lock the target at a defined moment (leap = at cast) OR resolve vs live pos with a windup long enough to *leave* the shape. Never re-aim on the strike frame. |
| **Unblockable/undodgeable "true damage" telegraphs** | Difficulty via unavoidable hits | Violates the readability contract; players feel cheated, not challenged | Every attack must have a counterplay (move out, or interrupt via crit-poise). Difficulty comes from *pattern density/speed*, not from removing outs. |
| **Sub-0.3 s "gotcha" windups** | "Fast, aggressive" enemies | At a 150 ms tick the player literally can't react; reads as random damage | Keep windups ≥ ~0.35 s (≈2+ ticks visible). Make enemies feel fast via *chaining* and short cooldowns, not unreactable single hits. |
| **Global/shared crit roll (the status quo)** | Simpler, one constant | Not per-character, uses `Math.random`, server never learns crit → blocks poise interrupt | Per-character `critRate`/`critDmg` + `isCrit` sent to server. (This milestone's Phase A.) |
| **Full client-side crit authority with no server signal** | Client already sends damage; "trust the client" | Interrupt logic lives server-side and needs to know crit happened; silent client-only crit can't drive poise | Keep the *roll* client-side (matches existing trust model) but *forward* `isCrit` to the server. |
| **Deep poise/stagger meters with tiers, hyperarmor states, break animations** | "Souls-accurate" stagger system | Scope explosion for a first pass; hard to read on a pixel filter; needs animation work heroes don't have yet | Binary interrupt: accrue crit-damage poise during windup, cross threshold → cancel + brief stun. One threshold, one stagger. Expand later. |
| **Parry / perfect-dodge i-frame timing windows (heroes)** | Souls players want parries/i-frame rolls | Heroes have NO attack FSM this milestone; i-frames need hero-side state + tight netcode. Out of scope | Dodge = **positional** (dash out of the shape). Windup length is the window. Defer true i-frames/parry to a hero-combat milestone. |
| **Damage falloff / partial hits inside a telegraph** | "Realism," edge-of-blast chip damage | Adds resolution complexity and muddy feedback ("did I dodge or not?") | Binary in/out of shape at strike. Clean yes/no read. |

---

## Feature Dependencies

```
[Per-character crit stats (critRate/critDmg)]   ← Phase A, FOUNDATION
        └──enables──> [isCrit forwarded to server]
                          └──requires──> [Poise / crit interrupt]   ← Phase B, needs A

[unit_attack FSM: windup→strike→recovery]        ← Phase B core
        ├──requires──> [ATTACKS registry (shape/timing/damage)]
        ├──requires──> [attack selection fn (range/cooldown)]
        ├──enables───> [ground telegraph rendering (circle/cone/lane)]
        ├──enables───> [attack_strike event VFX]
        └──enables───> [attack chaining (swing→swirl)]

[Remove contact drain] ──conflicts──> [keep per-tick drain]   (mutually exclusive)

[Live-position strike resolution] ──contrast-pairs-with──> [locked-landing leap]
        (the MIX is the differentiator; both ride the same FSM)
```

### Dependency Notes

- **Poise interrupt REQUIRES the crit system first.** The interrupt is defined as "a *crit* landing
  during windup accrues poise." Without per-character crit + `isCrit` reaching the server, there is
  nothing to accrue. Phase A (crit) MUST precede Phase B's interrupt slice. This is the single
  hardest ordering constraint — do not plan the interrupt before crit is live.
- **Telegraph rendering ENHANCES the FSM but is client-only.** Server owns the FSM; the client reads
  `attackId/phase/startedAt/targetX/Z` and mirrors `ATTACKS` durations. New *shape* = new renderer;
  new *attack reusing a shape* = free on the client.
- **Attack chaining DEPENDS on windup→recovery existing.** A chain is just "on recovery-end, start a
  second windup" — build the single-attack loop first (SPEC slice 1: leapSlam), then combos (slice 2).
- **Remove-drain CONFLICTS with keep-drain.** These cannot coexist on goliaths without double-dipping;
  the milestone deletes the drain. Camp enemies keep drain only because they aren't converted yet.
- **Locked-landing vs live-tracking are complementary, not conflicting** — both are `move`/resolution
  flags on the same registry entry; shipping both is what creates decision variety.

---

## MVP Definition

### Launch With (v1 — this milestone)

- [ ] **Per-character critRate/critDmg** replacing the global roll — foundation for everything crit.
- [ ] **`isCrit` forwarded to server** — plumbing the interrupt needs.
- [ ] **`unit_attack` FSM** (windup→strike→recovery) on the world tick — the core.
- [ ] **`ATTACKS` registry + selection fn** (range/cooldown) — data-driven, unit-agnostic.
- [ ] **`leapSlam` end-to-end** (server circle hitbox + client ring telegraph) — proves the loop.
- [ ] **Remove goliath contact drain** — goliaths damage only via strikes.
- [ ] **Damage resolved at strike vs live positions** — the dodgeable contract.
- [ ] **`swordSwing → swordSwirl` combo** (cone + circle) — proves chaining.
- [ ] **`shieldDash` lane** (moving hitbox) — proves the third shape.
- [ ] **Poise / crit interrupt** wired to `isCrit` — the differentiator (LAST, needs crit live).

### Add After Validation (v1.x)

- [ ] **Convert camp enemies** to the same FSM (zero schema change) — trigger: goliath feel is dialed in.
- [ ] **Knockback / brief stun on player hit** — trigger: strikes feel weightless without it (open question in SPEC).
- [ ] **Weapon/constellation crit contributions** — trigger: base per-character crit validated.
- [ ] **Per-archetype attack lists** (small vs big goliath silhouettes) — trigger: roster expands.

### Future Consideration (v2+)

- [ ] **Hero attack FSM + i-frame/parry dodge** — deferred; heroes stay on the client swing this milestone.
- [ ] **Tiered poise / hyperarmor / break animations** — needs animation depth; binary interrupt first.
- [ ] **Elemental-reactive telegraphs** — ties into the deferred elemental resistance system.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Per-character crit (critRate/critDmg) | HIGH | LOW | P1 |
| `isCrit` → server | MEDIUM | LOW | P1 |
| windup→strike→recovery FSM | HIGH | MEDIUM | P1 |
| ATTACKS registry + selection fn | HIGH | MEDIUM | P1 |
| Ground telegraph (circle/cone/lane) | HIGH | MEDIUM | P1 |
| Live-position strike resolution | HIGH | MEDIUM | P1 |
| Remove contact drain | HIGH | LOW | P1 |
| Poise / crit interrupt | HIGH | MEDIUM–HIGH | P1 (last — depends on crit) |
| Attack chaining (swing→swirl) | MEDIUM | MEDIUM | P2 |
| Locked-landing leap AOE | MEDIUM | LOW | P1 (part of leapSlam) |
| Moving lane hitbox (shieldDash) | MEDIUM | MEDIUM | P2 |
| attack_strike VFX/SFX | MEDIUM | MEDIUM | P2 |
| Knockback/stun on hit | MEDIUM | MEDIUM | P3 |
| Camp-enemy conversion | MEDIUM | LOW | P3 (next milestone) |
| Hero i-frame/parry dodge | HIGH | HIGH | P3 (future milestone) |

---

## Concrete Tuning Ranges (starting points for the feel pass)

These are **opening values**, not locked constants — hand them to a playtest tuning pass. Tick is
~150 ms, so round windows to tick multiples.

**Telegraph / attack timing**

| Param | Band | Rationale |
|---|---|---|
| Fast poke windup (`swordSwing`) | 0.35–0.5 s | Close-range, reactable but tight; SPEC 0.45 s |
| Gap-closer windup (`shieldDash`) | 0.5–0.7 s | Must be seen at range; SPEC 0.6 s |
| Committal AOE windup (`leapSlam`) | 0.8–1.2 s | Big payoff, big tell; SPEC 0.9 s |
| Chain follow-up windup (`swordSwirl`) | 0.4–0.6 s | Faster than a fresh attack (already committed); SPEC 0.5 s |
| Strike active window | 1–2 ticks (0.15–0.3 s) | One-shot resolution; short |
| Recovery | 0.3–0.6 s | The punish window |
| Cooldown between attacks | 1.5–3.5 s | Bigger AOEs longer; gives dodge/punish rhythm |
| Absolute min windup | ~0.35 s (≥2 ticks) | Below this = unreactable on a 150 ms tick |

**Telegraph shapes (from SPEC, sane starting radii)**

| Attack | Shape | Size | Resolution |
|---|---|---|---|
| `swordSwing` | cone | ±60°, reach ~3.0 | live positions |
| `swordSwirl` | circle | r ≈ 3.2 (360°) | live positions |
| `leapSlam` | circle | r ≈ 3.5 | **locked** landing at cast |
| `shieldDash` | lane/capsule | halfWidth ~1.2 along charge | live along path |

**Damage (flat burst, dodgeable — not DPS)**

| Attack | Dmg band |
|---|---|
| `swordSwing` | ~100–140 (SPEC 120) |
| `swordSwirl` | ~130–170 (SPEC 150) |
| `leapSlam` | ~180–260 (SPEC 220) — biggest tell, biggest hit |
| `shieldDash` | ~110–150 (SPEC 130) |

**Crit (Genshin-style)**

| Param | Band | Note |
|---|---|---|
| Base CRIT Rate | 5% floor, characters ~5–35% | Genshin base 5%; per-character spread |
| Base CRIT DMG | +50% floor, ~+50–120% | Genshin base 50% (×1.5) |
| CR : CDMG authoring ratio | ~1:2 | Genshin optimal-scaling convention; keeps future crit sources balanced |
| Existing global (to replace) | 22% / ×1.9 | Current `Math.random()<0.22 → ×1.9` — a reasonable *average* to distribute across characters |

**Poise / interrupt**

| Param | Band | Note |
|---|---|---|
| Poise threshold | ~1–3 character-crits worth of damage | Achievable with crit investment, not guaranteed; tune per attack (big AOEs harder to interrupt) |
| Stagger on interrupt | 0.5–1.0 s stun / cooldown bump | Brief reward window; not a full lockdown |
| Poise reset | on attack end (per windup) | Non-crit hits never contribute |
| Interrupt trigger | crit only | Non-crit hits do not accrue poise |

---

## Competitor Feature Analysis

| Feature | Soulslike (Dark Souls/Elden Ring) | MOBA (Dota/LoL) | Genshin | Our Approach |
|---------|-----------------------------------|-----------------|---------|--------------|
| Telegraph | Animation windup (no ground marker) | Ground shape (circle/cone/line) with cast fill | Ground marker + windup anim | Ground shape + windup fill (MOBA-legible on top-down) + enemy anim |
| Dodge | i-frame roll OR spacing | Move out of shape before cast point | Dash/sprint out; some i-frames | **Positional** (dash out); windup = window; no i-frames this milestone |
| Hit resolution | Active-frame hitbox vs live pos | Discrete at cast point | At skill resolution | Once at strike frame vs live pos (+ locked leap) |
| Interrupt | Poise/stance break, stagger | Stuns/silences | Elemental reactions, some stagger | Crit-during-windup → poise → cancel + stagger |
| Crit | Critical/backstab multipliers | Crit chance items | Per-char CR/CDMG, 1:2 scaling | Per-character CR/CDMG (Genshin model), forwarded to server |
| Physics | Ragdoll/knockback (cosmetic-ish) | No rigid-body; scripted displacement | Scripted knockback | **No physics sim** — discrete overlap test only |

---

## Sources

- [Genshin CRIT Rate & CRIT DMG guide — game8.co](https://game8.co/games/Genshin-Impact/archives/318629) — base 5% CR / 50% CDMG, benchmarks (HIGH)
- [Why 1:2 CR:CDMG is optimal — HoYoLAB](https://www.hoyolab.com/article/1380428) — the 1:2 scaling convention (HIGH)
- [CRIT Hit — Genshin Impact Wiki (Fandom)](https://genshin-impact.fandom.com/wiki/CRIT_Hit) — crit formula/base values (HIGH)
- [The Dark Souls Dodge Roll: Immediacy in Player Action — Parry Everything](https://parryeverything.com/2021/07/30/the-dark-souls-dodge-roll-immediacy-in-player-action/) — dodge as reactive answer to telegraphed windups (MEDIUM)
- [The Unwritten Rules of Soulslikes Explained — Game Rant](https://gamerant.com/soulslikes-unwritten-rules-explained-builds-parrying-dodging-weapons-enemy-movement/) — windup/i-frame/recovery framing, pattern learning (MEDIUM)
- Project SPEC: `.planning/transcendence/combat-telegraphed-attacks-SPEC.md` — roster, timings, schema (HIGH, canonical for this milestone)
- Project context: `.planning/PROJECT.md` — milestone scope, invariants (HIGH)

---
*Feature research for: telegraphed dodgeable enemy attacks + crit + poise (v0.2.0-alpha Combat Depth)*
*Researched: 2026-07-08*

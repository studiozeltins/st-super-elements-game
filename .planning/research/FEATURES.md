# Feature Research

**Domain:** World-ambiance polish for a stylized top-down 3D browser game (v0.3.0-alpha "Living World" — client-only)
**Researched:** 2026-07-13
**Confidence:** MEDIUM (cross-verified web sources: GDC talks, three.js docs/forums, game-audio references, Xbox Accessibility Guidelines; specific numeric magnitudes for camera feel are informed estimates → LOW where flagged)

Reference games studied: Genshin Impact, Zelda BotW/TotK, Ghost of Tsushima (GDC 2021 wind/grass talks), Tunic, Sable, V Rising (top-down camera comparisons).

---

## How Polished Games Do Each Feature (Expected Behavior)

### 1. Ambient audio bed — alive vs annoying

What separates "alive" from "annoying" in shipped stylized games:

- **Structure: 2–3 continuous layers + a one-shot pool.** A base bed (filtered wind noise), one texture layer (grass rustle / leaves), and a pool of randomized spot one-shots (bird chirps, distant grunts). More simultaneous loops = mud, not life. The one-shot pool is where "alive" comes from, not the bed.
- **Randomization is non-negotiable.** Every one-shot needs randomized interval (the planned 5–15s window is exactly the standard pattern), plus per-trigger pitch (±10–20%), volume, and stereo-pan variation. A chirp at a fixed interval or fixed pitch becomes a metronome the player consciously notices within minutes — this is THE failure mode.
- **The bed itself must never expose a loop seam.** Procedural synthesis (this project's approach) sidesteps the loop-seam problem entirely — a filtered-noise wind bed with a slowly modulated cutoff/amplitude never repeats. This is an advantage over asset-based ambience.
- **Ducking during combat: YES, and it's two moves, not one.** Polished games (a) *remove* specific elements — songbirds stop when combat starts (also diegetically correct: birds flee fights), and (b) *duck* the remaining bed −6 to −12 dB with a ~0.5–1s fade, restoring over ~2–3s after combat ends. Never hard-cut.
- **Sidechain to world state.** Wind bed amplitude should follow the same gust envelope as the grass sway (Tsushima's core lesson, see §3); grass-rustle layer keyed to player sprint through grass cells; goliath grunts distance-attenuated by camp proximity. Ambience that *correlates with what you see* reads as alive; uncorrelated ambience reads as a radio playing.
- **Day/night variation of the bed** (birds by day, crickets/owl at night) is the single cheapest "the world has a schedule" signal and pairs directly with feature 5.

### 2. Distance fog + sky gradient — tuning for top-down cameras

- **Fog color = horizon/sky color, always, from one shared source.** The universal stylized trick: distant geometry dissolves *into* the sky instead of into a grey wall. In three.js this means `scene.fog.color` and the sky/clear color driven from the same variable — which under feature 5 must be the day/night-blended color, not a constant.
- **Linear `THREE.Fog`, not `FogExp2`, for a top-down camera.** With a high three-quarter camera the visible ground plane is close; exponential fog eats gameplay-radius contrast before it helps the horizon. Set `near` comfortably *beyond* the combat readability radius (telegraphs, enemies, gem drops must stay at ~full contrast), `far` at/just past the world edge so the edge disappears. Fog in top-down games is a *horizon device*, not an atmosphere device.
- **Sky gradient:** for this camera a full skybox is wasted; a large background gradient (or two-color mix in a cheap sky dome/quad only visible at the horizon) whose bottom color equals the fog color is sufficient and is what top-down games ship.
- **Known interaction to check:** fog is applied per-material in three.js — custom shaders (the grass field, telegraph drapes) need `fog: true` + fog shader chunks or they will pop against fogged neighbors; conversely, telegraphs may *deliberately* opt out to stay readable.

### 3. Coherent wind — global phase vs spatial gust waves

Ghost of Tsushima (GDC 2021) is the definitive reference: grass, trees, cloth, smoke, and particles all sample **one shared wind simulation**, and that single fact — not the quality of any individual system — is what sells wind. Most games fake wind per-system and it reads as incoherent.

- **Minimum viable coherence = one global wind module** exposing `{direction, baseStrength, time, gustEnvelope(t)}` as shared uniforms; every swaying system (grass `uTime`, flags, canopies, smoke drift, and the audio wind-bed gain) reads from it. This alone captures ~80% of the Tsushima effect.
- **Global phase alone has a tell:** everything bows *in unison*, which reads as "the world is breathing," not wind. The standard fix is a **traveling gust wave** — phase-offset each element by `dot(worldPos, windDir) / gustWavelength` so gusts visibly *sweep across* the field. This is one extra term in shaders that already have world position; it is the difference between "synced" and "wind."
- **Per-system character on top of the shared phase:** flags flap at higher frequency than grass sways; smoke gets lateral drift not oscillation; canopies get low-amplitude low-frequency sway. Same phase source, different transfer functions — this is how Tsushima layers "vorticle" detail over the global field, scaled down.
- **Local disturbances stay separate:** groundInfluence (player disturbance) already handles the footfall-level detail Tsushima models; it layers *on top of* the global wind, it does not replace it.

### 4. Wildlife — how much AI is enough

Survey answer across stylized games and ambience mods: **almost none**. Ambient wildlife is near-zero-AI particles/billboards gated by time-of-day and proximity:

- **Butterflies:** wander noise (2–3 summed sines or cheap value noise) over grass cells, daylight-gated, despawn/respawn near the player rather than simulated persistently. No pathfinding, no goals. Instanced quads with a 2-frame flap is the shipped standard (Stardew, BotW's insects are barely more).
- **Birds: the flush IS the feature.** A bird idling on the ground is set dressing; a covey **bursting up when the player sprints through grass** is a *reaction to the player* and is disproportionately memorable (BotW's grass birds are the canonical example). Minimum: hidden "bird cells" in grass; on player-velocity trigger within radius → spawn 2–4 instanced quads on a scripted rising arc + wing one-shot, despawn at height. No landing behavior needed — flush-and-gone is enough.
- **Fireflies:** dusk/night-gated drifting points with individual on/off glow pulse (randomized phase). A handful get real pooled lights (lightPool) near the player; the rest are emissive points. Fireflies + night are a proven pair — they're the reward that makes the dark phase worth having.
- **The population rule:** wildlife density should be sparse enough that encountering it is an event, not wallpaper. A field with 6 butterflies reads better than 60.
- **Sound binding:** chirp one-shots (feature 1) should emit *from bird/tree positions* when possible — audio-visual co-location is what makes both systems read as one world (Garden Life deep dive).

### 5. Day/night lite — color scripting without sun movement

Fixed-sun day/night is a well-trodden pattern (isometric/fixed-view games do exactly this):

- **4 key phases: dawn → day → dusk → night**, with keyed colors for sky/fog, hemisphere (sky+ground), and sun tint+intensity per phase. Blend with smoothstep between keys, never linear (linear reads mechanical at transitions).
- **Asymmetric timing.** Do not split the cycle evenly: for a ~20min cycle, weight ~55–60% day, ~10% dusk, ~20–25% night, ~10% dawn. Dusk/dawn are the *pretty* phases — short enough to feel special; night long enough to matter but not to fatigue.
- **What NOT to change (critical list):**
  - **Sun/shadow direction** — locked (fights the texel-snapped shadow basis). Shipped games with fixed cameras do this and nobody notices; players track color, not shadow angle.
  - **Combat readability floor** — night keeps a blue ambient floor (never below ~40–50% of day exposure, never below the point where telegraph fills and goliath silhouettes lose contrast). "Night is dark blue, not dark" is the standard note (reference darkest-night values are RGB(0,0,10)-style *tints* on top of a readable floor, not literal darkness).
  - **Gameplay values** — no spawn/damage/visibility mechanics keyed to time in this milestone; day/night is mood-only.
- **Contrast is what sells night, not darkness:** warm points (plaza lanterns via lightPool, campfires already warm) against the cool blue ambient. Lanterns fading in at dusk is the highest-value single beat of the whole cycle.
- **Continuity rule:** each phase's end color equals the next phase's start color — the blend must be C0-continuous or players see "the tick."
- **Sync:** phase = `f(serverTimestamp mod cycleLength)` — deterministic, zero server work, all LAN players agree. The already-subscribed timestamp satisfies this.
- **Fog dependency:** fog color (feature 2) MUST be a day/night-blended output or night will have a daytime horizon — fog and day/night are one color pipeline, not two features.

### 6. Lived-in props + wear — storytelling minimums

- **Wear encodes history along real traffic lines.** Worn footpaths must run where players/NPCs *actually walk* — camp↔camp, plaza↔bridge. A path in a random place is decoration; a path on the route you already take is storytelling. Implementation: suppress/thin grass placement along path splines + a ground tint/decal strip (grassPlacement already has exclusion machinery).
- **Prop arrangement > prop count.** Crates near the plaza market edge, a fence with a gap where the path crosses, lanterns along the path — each prop should answer "who put this here and why." Random scatter reads as clutter.
- **Reactive wear closes loops the game already opened:** scorch marks that *regrow* (scorchMap decay over minutes) turn an existing FX into "the world heals"; the ~2s grass-bend trail (groundInfluence persistence extension) turns movement into presence. These reuse existing systems and are the highest wear-per-effort items.
- **Dust puffs on footsteps** are a movement-feel item as much as a wear item — small, 2–4 sprite puffs on sprint steps on dirt/path cells, pooled. Standard in every polished top-down game; absence is felt more than presence is noticed.

### 7. Camera micro-feel — polish vs motion sickness

The accessibility literature (Xbox Accessibility Guideline 117) is unambiguous about the nausea triggers: sustained visual motion the body didn't perform — head bob, camera shake, sway, motion blur, auto camera-angle changes. Top-down/third-person is far more tolerant than first-person, but the rules still bind:

- **Animate the CHARACTER, not the camera, for continuous motion.** "Idle breathing sway" must live on the character model (scale/rotation micro-oscillation) — a continuously oscillating *camera* is the classic nausea source even in third person. This matches the milestone's framing (idle sway *on characters*) — keep it there.
- **Run lean:** tilt the character (or its rig root) 2–4° into run direction with a spring; optionally ≤1° camera roll if any. Beyond ~5° reads cartoonish; camera roll beyond ~1–2° sustained is a sickness vector. *(magnitudes: informed estimates — LOW confidence, tune by playtest)*
- **FOV kick:** small and brief — +2–5° (or dolly-equivalent for a framed top-down camera), attack in ~50–80ms, spring back over ~200–400ms. Instant-on/slow-off is the shape that reads as impact. Persistent FOV change is the offender, not the kick. *(magnitudes: LOW confidence, tune by playtest)*
- **Frequency discipline:** FOV kick only on *rare, big* events (burst damage / crit / max-boost fanfare tier) — kicking on every hit habituates and nauseates simultaneously.
- **Toggle:** one "reduce camera motion" setting that zeroes lean/roll/FOV-kick is the accessibility baseline (XAG 117). Cheap now, painful retrofit.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing these, the "Living World" milestone doesn't deliver its own premise.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Wind/ambience audio bed with randomized one-shots | Silence between fights is the #1 "dead world" tell; every reference game has a bed | MEDIUM | audioCore synth (pullSounds pattern); 1 noise bed + one-shot pool with pitch/interval/pan jitter |
| Combat ducking of ambience | Bed fighting combat SFX/fanfares reads amateur; contrast is expected | LOW | Gain node on the bed bus; birds stop, bed −6..−12dB, ~1s in / ~3s out |
| Fog color = sky color, single source | Mismatched fog/sky horizon line is instantly visible | LOW | `scene.fog` linear; near beyond combat radius; shared color var with sky + day/night |
| Shared wind phase across grass/flags/canopy/smoke | Once flags exist, desynced wind is *worse* than no flags | MEDIUM | Extract wind module from createGrassField `uTime`; all systems consume its uniforms |
| Night keeps combat readable (blue floor) | Players will fight at night; unreadable telegraphs = gameplay regression | LOW | Clamp min ambient; verify telegraph/goliath contrast at darkest key |
| Day/night phase from server timestamp | LAN players must agree on time of day | LOW | Pure function of subscribed timestamp; zero server change |
| Plaza lanterns fade in at night | Dark plaza with no warm light breaks the safe-zone feel; warm-vs-cool is what sells night | LOW–MEDIUM | lightPool; fade keyed to dusk phase; budget pooled lights vs fireflies |
| Footstep dust puffs | Standard movement feedback; absence felt in every polished comparison | LOW | Pooled sprite puffs on sprint steps; reuse existing FX pooling patterns |
| "Reduce camera motion" toggle | Accessibility baseline (XAG 117) once ANY camera motion ships | LOW | One flag zeroing lean/roll/FOV kick |

### Differentiators (Where This Milestone Actually Shines)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Traveling gust wave (spatial phase offset) | The difference between "synced sway" and *wind you can see move across the field* — Tsushima's core insight at 1% of the cost | LOW (on top of wind module) | `dot(worldPos, windDir)/gustWavelength` phase term in each consumer |
| Audio bed sidechained to gust envelope | Wind you *hear* swell as the grass bows — audio-visual correlation is the strongest "alive" signal available | LOW (on top of both) | Wind-bed gain follows gustEnvelope(t); loose coupling is enough |
| Startle-flush birds | A world that *reacts* to the player beats any amount of passive decoration; BotW's most-cited ambient moment | MEDIUM | groundInfluence/velocity trigger → scripted arc, 2–4 instanced quads + wing one-shot, no landing AI |
| Dusk fireflies (mostly emissive, few pooled lights) | Makes night the phase players *want*; pairs with lanterns for warm-night identity | MEDIUM | Time-gated; glow phase randomized per instance; lightPool for nearest handful only |
| Scorch regrowth | Turns existing combat FX into "the world heals" — wear the players caused | LOW | Decay term in createScorchMap over minutes |
| Grass-bend trail (~2s) | Presence: you can see where anyone just ran; multiplayer-legible | MEDIUM | Extend groundInfluence persistence/fade; watch texture-update cost |
| Distant goliath grunts by camp proximity | Diegetic threat radar; ambience doing gameplay-legible work | LOW | Synth grunt one-shots, gain by nearest-camp distance, long random intervals |
| Worn footpaths on real routes | Wear that encodes actual traffic = environmental storytelling, not decoration | MEDIUM | grassPlacement exclusion along splines + ground tint strip; static, baked at world build |
| FOV kick on burst damage only | Rare-event kick reads as premium juice; every-hit kick reads as noise | LOW | +2–5°, ~60ms in / ~300ms out, spring; behind motion toggle |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fixed-interval or fixed-pitch bird chirps | Easiest ambience to add | Becomes a consciously-noticed metronome in minutes — the canonical ambience failure | Randomize interval (5–15s), pitch ±10–20%, pan; stop entirely in combat |
| Loud continuous wind loop | "More wind = more alive" | Listening fatigue; masks combat SFX; players mute the game | Quiet bed + gust swells synced to visuals; ducking discipline |
| Dense/exponential fog | "Atmosphere" | Eats telegraph & enemy contrast inside combat radius; top-down cameras have no distance to spend | Linear fog, near > combat radius; fog is a horizon device here |
| Per-system independent wind | Each system is easier standalone | Desynced sway is *more* wrong-looking than static props (Tsushima's whole point) | One wind module first; every swayer consumes it |
| Full wind fluid sim / vorticles | "Do it like Tsushima" | Weeks of work for detail invisible at this camera + art style | Global vector + gust envelope + traveling wave + per-system transfer functions |
| Wildlife with real AI (pathfinding, flocking, persistence) | "Believable animals" | CPU + complexity for behavior nobody inspects; violates frozen-matrix/no-alloc rules | Wander noise, time gating, spawn-near-player, scripted flush arcs |
| Sun/shadow movement | "Real day/night" | Fights the texel-snapped shadow basis; shadow-crawl artifacts; explicitly excluded | Color/intensity/fog drift only — proven sufficient in fixed-view games |
| Pitch-black night | "Night should be dark" | Combat unreadability = gameplay regression; players just wait it out | Blue ambient floor + warm lantern/firefly contrast; night = palette, not darkness |
| Gameplay keyed to time (night spawns/buffs) | Emergent-feeling | Balance scope creep; forces server work in a client-only milestone | Mood-only cycle now; revisit post-milestone |
| Camera bob / continuous camera sway | "More game feel" | Sustained camera oscillation = the documented motion-sickness trigger, even third-person | Animate the character; camera gets only brief spring events + toggle |
| Screen shake on every hit + big FOV kicks | Juice | Habituation + nausea; devalues the big moments | Reserve kick/shake for rare high-tier events |
| Weather (rain, puddles) | Natural extension | Real but expensive (already ruled) | Deferred — explicitly out of scope |

---

## Feature Dependencies

```
[Wind module (global phase + gust envelope)]         ← extract from createGrassField uTime
    ├──feeds──> [Grass sway (existing)]
    ├──feeds──> [Flags / canopies / smoke sway]
    └──feeds──> [Ambient audio bed gain (gust swells)]

[Day/night phase fn (server timestamp)]
    ├──drives──> [Sky/fog/hemisphere/sun color blend]      ← ONE color pipeline with fog
    ├──gates──>  [Fireflies (dusk/night)]
    ├──gates──>  [Plaza lanterns fade (lightPool)]
    └──varies──> [Audio bed content (birds day / crickets night)]

[Fog + sky gradient] ──consumes──> [day/night color pipeline]
[Fireflies] ──requires──> [lightPool] + [day/night phase]
[Lanterns]  ──requires──> [lightPool] + [day/night phase]   (shared light budget!)
[Birds flush] ──requires──> [groundInfluence / player velocity hook] + [audio one-shot pool]
[Grass-bend trail] ──extends──> [createGroundInfluence]
[Scorch regrowth]  ──extends──> [createScorchMap]
[Footpaths] ──extends──> [grassPlacement] (+ terrain tint)
[Combat ducking] ──requires──> [ambient bed bus] + existing combat-state signal
[Camera feel] ──independent── (do last; needs motion toggle in settings UI)

[Fireflies] ──competes-for-budget──> [Lanterns]  (pooled lights near plaza at night)
```

### Dependency Notes

- **The wind module is the keystone:** flags/canopy/smoke sway, gust-synced audio, and the traveling gust wave all consume it. Build it first by extracting the grass field's `uTime` into a shared module (grass keeps rendering identically) — then every new consumer is additive.
- **Fog and day/night are one color pipeline, not two features.** If fog ships first with a constant color, it must be refactored the moment day/night lands. Ship fog with its color already read from a (initially constant) day/night blend function.
- **lightPool budget conflict:** fireflies and lanterns are both night-gated pooled-light consumers near the plaza. Decide the split up front (e.g., lanterns get guaranteed slots, fireflies use leftovers with emissive-only fallback).
- **Camera feel is genuinely independent** — no shared systems — which is why "do last" is correct; it also needs the settings toggle, a UI touch.

---

## MVP Definition

### Launch With (v0.3.0 core)

- [ ] Wind module + flags/canopy/smoke consumers + traveling gust wave — keystone; everything visual hangs off it
- [ ] Fog + sky gradient reading from the day/night color function — biggest visual win per LOC
- [ ] Day/night lite (4-key blend, asymmetric timing, blue night floor, lantern fade) — the milestone's identity feature
- [ ] Ambient audio bed (wind bed + randomized chirps + rustle + combat ducking, gust-sidechained) — kills the silence
- [ ] Footstep dust puffs — table stakes, trivial

### Add After Core Works (v0.3.x within milestone)

- [ ] Butterflies + fireflies — once day/night gating exists they're mostly instancing work
- [ ] Startle-flush birds — after the audio one-shot pool + groundInfluence hook exist
- [ ] Scorch regrowth + grass-bend trail — extensions of existing systems, low risk
- [ ] Worn footpaths + plaza props — static content, no runtime dependencies
- [ ] Distant goliath grunts — after the bed's bus/ducking architecture is proven
- [ ] Camera feel (lean, idle character sway, FOV kick) + motion toggle — last, per plan

### Future Consideration (post-milestone)

- [ ] Weather (rain, puddles, wet surfaces) — explicitly deferred; expensive
- [ ] Time-of-day gameplay hooks (night spawns, firefly catching) — needs server work + balance
- [ ] NPC ambient life (villagers, patrols) — different scope class entirely

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Wind module + coherent sway + gust wave | HIGH | MEDIUM | P1 |
| Fog + sky gradient (day/night-fed color) | HIGH | LOW | P1 |
| Day/night lite + lantern fade | HIGH | MEDIUM | P1 |
| Ambient audio bed + ducking | HIGH | MEDIUM | P1 |
| Dust puffs | MEDIUM | LOW | P1 |
| Fireflies | HIGH | MEDIUM | P2 |
| Startle-flush birds | HIGH | MEDIUM | P2 |
| Butterflies | MEDIUM | LOW | P2 |
| Scorch regrowth | MEDIUM | LOW | P2 |
| Grass-bend trail | MEDIUM | MEDIUM | P2 |
| Footpaths + plaza props | MEDIUM | MEDIUM | P2 |
| Goliath grunt proximity layer | MEDIUM | LOW | P2 |
| Camera feel + motion toggle | MEDIUM | LOW–MEDIUM | P3 (do last) |

---

## Competitor Feature Analysis

| Feature | Genshin / BotW | Ghost of Tsushima | Tunic / Sable / V Rising (top-down/stylized) | Our Approach |
|---------|----------------|-------------------|-----------------------------------------------|--------------|
| Ambient audio | Sparse musical beds + heavily randomized nature one-shots; birds silence in combat | Wind audio tied to the wind gameplay system | Tunic: minimal, tone-first; V Rising: biome beds + night variants | Procedural synth bed (no assets), gust-sidechained, one-shot pool, combat duck |
| Wind | BotW: visible grass waves + cloth | ONE simulation feeds grass/trees/cloth/particles (GDC 2021) | Mostly per-asset sway (and it shows) | Shared wind module + traveling gust wave — Tsushima's principle, minimum machinery |
| Fog/sky | Full atmospheric scattering | Atmospheric + wind-blown particulates | Simple depth fog matched to palette | Linear `scene.fog` = sky/horizon color from day/night blend |
| Wildlife | BotW: flush birds/crickets, catchable critters | Birds as literal guides; foxes | Sable: beetles/birds as set dressing; V Rising: prey animals | Zero-AI instanced quads: wander butterflies, scripted flush birds, gated fireflies |
| Day/night | Full sun cycle + time-gated content | Full cycle | V Rising: night = core mechanic; Tunic: mostly static | Color/intensity/fog drift only, fixed sun, server-synced ~20min, mood-only |
| Wear/lived-in | Hand-placed wear everywhere | Trails players follow through fields | Tunic: overgrown-ruin identity | Footpaths on real routes, scorch regrowth, bend trails — wear tied to actual traffic |
| Camera feel | Subtle FOV/impact framing on bursts | Cinematic camera, minimal bob | Mostly static cameras + shake on impact | Character-side lean/sway, rare FOV kick, XAG-117 toggle |

---

## Sources

- Game Audio Learning — [How To Make Ambiences For Games](https://www.gameaudiolearning.com/knowledgebase/how-to-make-ambiences-for-games); Bugnet — [How to Design Ambient Sound Layers](https://bugnet.io/blog/how-to-design-ambient-sound-layers); Splice — [Audio soundscape for video games](https://splice.com/blog/audio-soundscape-for-video-games/); A Sound Effect — [Immersion + reducing repetition](https://www.asoundeffect.com/game-audio-immersion/) — MEDIUM (cross-verified)
- GDC Vault — [Blowing from the West: Simulating Wind in Ghost of Tsushima](https://gdcvault.com/play/1027124/Blowing-from-the-West-Simulating), [Procedural Grass in Ghost of Tsushima](https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass); Game Developer — [Using vorticles to simulate wind](https://www.gamedeveloper.com/design/using-vorticles-to-simulate-wind-in-i-ghost-of-tsushima-i-) — MEDIUM–HIGH (primary conference material)
- three.js — [Fog docs](https://threejs.org/docs/pages/Fog.html), [Fog manual](https://threejs.org/manual/en/fog.html); forum threads [52018](https://discourse.threejs.org/t/matching-fog-color-with-the-sky-shader/52018), [32789](https://discourse.threejs.org/t/the-best-way-to-match-fog-color-with-sky-shader-example/32789); [Three.js Fog Hacks (Belkhale)](https://snayss.medium.com/three-js-fog-hacks-fc0b42f63386) — MEDIUM
- Wildlife patterns — [Steam Workshop: Butterflies & Fireflies](https://steamcommunity.com/sharedfiles/filedetails/?id=1710344555); [Ambient Birds (BitQuest)](https://bitqueststudio.itch.io/ambient-birds); [Giant Bomb: Ambient Wildlife concept](https://www.giantbomb.com/ambient-wildlife/3015-4660/games/); Game Developer — [Garden Life sound design deep dive](https://www.gamedeveloper.com/audio/deep-dive-sound-design-garden-life) — MEDIUM
- Day/night — [Sea Otter Games: Setting a mood with a Day/Night cycle](https://seaotter.games/blog/setting-a-mood-with-a-day-night-cycle); [sine.space wiki: Day/night cycles](https://wiki.sine.space/index.php?title=Day/night_cycles) — MEDIUM
- Environmental storytelling — [Toxigon: How games tell stories without saying a word](https://toxigon.com/using-environmental-storytelling-in-games); [Beyond Extent: Storytelling and Details in Props](https://www.beyondextent.com/articles/storytelling-and-details-in-props); [Mulholland: Environmental Storytelling](https://medium.com/@johnmulholland/game-design-environmental-storytelling-3574aff0ff2b) — MEDIUM
- Camera/motion sickness — [Xbox Accessibility Guideline 117](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117); [Bugnet: Camera FOV & motion sickness](https://bugnet.io/blog/how-to-fix-camera-fov-causing-motion-sickness); [Switchblade: settings that reduce motion sickness](https://www.switchbladegaming.com/game-settings/reduce-motion-sickness-gaming/) — MEDIUM (XAG is authoritative); specific lean/FOV magnitudes are informed estimates — LOW
- Codebase grounding: `src/game/audio/audioCore.ts`, `src/game/world/createGrassField.ts` (uTime), `src/game/systems/createScorchMap.ts`, `createLightPool.ts`, `createGroundInfluence.ts`, `src/game/world/grassPlacement.ts`, `assets/createCampfire.ts`, `createCanopyTree.ts`, `createPlazaStructures.ts` — HIGH (verified in repo)

---
*Feature research for: v0.3.0-alpha Living World ambiance polish*
*Researched: 2026-07-13*

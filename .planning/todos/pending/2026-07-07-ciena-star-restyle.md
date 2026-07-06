---
created: 2026-07-07T00:00:00.000Z
title: CIEŅA constellation star visuals — stylish + powerful restyle
area: ui
files:
  - src/ui/CharacterScreen.tsx
  - src/ui/ConstellationRing.tsx
  - src/index.css
---

## Problem

The constellation system was renamed ZVAIGZNES → CIEŅA (commit bf00802). The
user wants the CIEŅA stars themselves given the same "stylish and powerful"
treatment the BŪSTS orbit got — right now the constellation stars (the C1–C6
ring + the con-list) are the original plain visuals. This is the counterpart to
the BŪSTS orbit VFX work: make the gold CIEŅA stars feel as alive and premium as
the purple BŪSTS stars.

## Solution

TBD. Likely scope:
- Restyle the constellation ring / star glyphs (ConstellationRing.tsx +
  `.con-item` / `.cchar__ring` CSS) with motion + glow, gold (`--gold`) energy
  mirroring the purple (`--shard`) BŪSTS language.
- Optionally an in-world gold orbit/aura counterpart to createBoostOrbit for
  active constellations (parallels the BŪSTS orbit).
- Keep gold vs purple as the two distinct power tracks (established this session).

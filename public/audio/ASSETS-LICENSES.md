# Audio Assets — Provenance & Licenses

**Every** audio file under `public/audio/` MUST be **CC0 / public-domain** or from the
**YouTube Audio Library** (royalty-free) or **freesound.org (CC0)**. Never commit ripped
or arbitrary copyrighted tracks — "free from YouTube" means the *YouTube Audio Library*, not
a music video (D-07 / D-16). Fill in the Source URL + License for each file when you drop it in.

Format: `.ogg` (Vorbis), served same-origin from `public/audio/{ambient,music,creatures}/`
and decoded once via `createSampleCache` (D-14 / D-15). Loops (music) must be authored as
true, click-free loops — trim to zero crossings, prefer Vorbis over MP3 (RESEARCH Pitfall 3).

Status legend: **PENDING** = expected filename, not yet sourced (layer no-ops / uses synth
fallback until dropped). **PRESENT** = file committed and licensed below.

---

## Creatures (`creatures/`) — day birds, night crickets/owl, distant goliath grunt

Recordings are the default per the user directive (D-04). Until a file is dropped the layer
is silent (no error). The goliath grunt additionally has a procedural **synth fallback**
(D-06), so it is audible even with no recording.

| Filename                     | Layer            | Status  | Source URL | License |
| ---------------------------- | ---------------- | ------- | ---------- | ------- |
| `bird-chirp-1.ogg`           | day birds        | PENDING | TODO       | TODO    |
| `bird-chirp-2.ogg`           | day birds        | PENDING | TODO       | TODO    |
| `bird-chirp-3.ogg`           | day birds        | PENDING | TODO       | TODO    |
| `cricket-1.ogg`              | night crickets   | PENDING | TODO       | TODO    |
| `cricket-2.ogg`              | night crickets   | PENDING | TODO       | TODO    |
| `owl-hoot.ogg`               | night owl        | PENDING | TODO       | TODO    |
| `goliath-grunt.ogg`          | distant goliath  | PENDING | TODO       | TODO    | <!-- optional: synth fallback covers this (D-06) -->

## Ambient bed (`ambient/`)

The continuous wind bed is **procedural** (filtered noise sidechained to the live gust
envelope, D-05) — it needs **no sample**. This directory exists for any future recorded
ambient layers; none are required for Phase 10.

| Filename        | Layer          | Status  | Source URL | License |
| --------------- | -------------- | ------- | ---------- | ------- |
| *(none needed)* | wind bed (proc)| N/A     | —          | —       |

## Music (`music/`) — region + combat loops (Phase 10-06, MUSIC-01/02)

Music has **NO synth fallback** — these two loops MUST be sourced for MUSIC-01/02 to pass.

| Filename           | Layer               | Status  | Source URL | License |
| ------------------ | ------------------- | ------- | ---------- | ------- |
| `region-loop.ogg`  | exploration music   | PENDING | TODO       | TODO    |
| `combat-loop.ogg`  | combat music        | PENDING | TODO       | TODO    |

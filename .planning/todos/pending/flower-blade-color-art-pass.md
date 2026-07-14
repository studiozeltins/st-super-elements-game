---
created: 2026-07-14
source: 08-UAT test 4 (phase 8 wind-core playtest)
severity: cosmetic
---

# Tune flower blade color (beige blades read out of place)

`FLOWER_COLOR = 0xfff0a8` in `src/game/world/grassPlacement.ts:41` renders cream/beige blades among green grass. User: "they look out of place, should be maybe darker green with gradient". Pre-existing art (predates phase 8).

Options: tune FLOWER_COLOR toward field palette, or make flowers read as flowers (warmer head on green stem). Art pass, not wind work.

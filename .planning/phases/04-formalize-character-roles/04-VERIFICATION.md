---
phase: 04-formalize-character-roles
verified: 2026-07-07T13:25:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "Open the CharacterScreen (full-page) and the CharacterSheet (character card) for characters of each role."
    expected: "A role pill is visible — CharacterScreen in the .cchar__id stack ordered AKTĪVS VARONIS -> role -> transcend; CharacterSheet in the .sheet__meta row before the level chip (not stranded flush-right). Correct Latvian uppercase label (SARGS/UZBRUCĒJS/DZIEDNIEKS/ATBALSTS) with the matching per-role outline color, box model matching the sibling active tag."
    why_human: "Visual placement, per-role color rendering, and pixel-parity with the existing HUD tags cannot be asserted programmatically (04-VALIDATION.md manual-only UAT). Code is present and wired; only the rendered appearance needs a human eye."
---

# Phase 4: Formalize Character Roles Verification Report

**Phase Goal:** Every character carries a server-visible combat role (tank/dps/healer/support) that the raid can later enforce.
**Verified:** 2026-07-07T13:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Every character has exactly one valid role, seeded per the locked plan (healer×4, tank×4, support×2, dps×7) | ✓ VERIFIED | `characters.ts` has `role` on all 17 entries; id→role mapping matches REQ verbatim (marina/nereida/lapa/rasa=healer, glacia/terron/ignis/petra=tank, aeris/zefs=support, rest=dps incl. silva=dps). `serverSync.test.ts` "%s has a valid role" asserts membership for all 17 ids and passes. |
| 2 | Role is stored server-side (mirrored in `CHARACTER_STATS`) and covered by `serverSync.test.ts` | ✓ VERIFIED | `spacetimedb/src/index.ts`: `role` on `CharacterStat` interface (L36), all 17 single-line `CHARACTER_STATS` entries (L43–63), and `statsFor` fallback `role:'dps'` (L151). `serverSync.test.ts` "%s role matches server CHARACTER_STATS" asserts client===server per id (INV-5); 91/91 serverSync tests green, all client roles equal server roles. |
| 3 | A role badge is visible on the character sheet / character screen | ✓ VERIFIED (visual quality → human) | Badge rendered + wired on both surfaces: `CharacterScreen.tsx` L331–339 (between active-tag and transcend-tag), `CharacterSheet.tsx` L93–101 (before `.sheet__level`). Both consume the single `ROLE_META`, set inline color `var(--role-*)`, aria-label `Loma: {aria}`. Guard `{ROLE_META[character.role] && (...)}` is truthy for all 17 valid roles so it always renders. Pixel/color visual parity routed to human UAT. |
| 4 | `pnpm test` and `pnpm build` are green | ✓ VERIFIED | Re-run in this verification: `pnpm test` = 373 passed (25 files); `pnpm build` = built in 5.18s, no errors. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/game/data/characters.ts` | `Role` type, required `role` on interface + 17 entries, exported `ROLE_META` | ✓ VERIFIED | `Role` union L7; `role: Role` required field L49; `ROLE_META` with label/token/aria L11–16; 17 role entries confirmed |
| `spacetimedb/src/index.ts` | `role` on `CharacterStat` + 17 single-line `CHARACTER_STATS` + `statsFor` fallback | ✓ VERIFIED | Interface L36, all entries single-line (regex-parseable), fallback L151 `role:'dps' as const` |
| `src/game/data/__tests__/serverSync.test.ts` | `ServerStat.role`, role in `extractServerStats`, `VALID_ROLES`, two `it.each` role blocks | ✓ VERIFIED | `ServerStat.role` L34, `readField(body,'role')` L59, `VALID_ROLES` L40, valid-role block L106, equality block L113 |
| `src/index.css` | Four `--role-*` tokens + `.cchar__role-tag` + `.sheet__role` rules | ✓ VERIFIED | Tokens L27–30 exact UI-SPEC hex; `.cchar__role-tag` L3059 (border currentColor, no color); `.sheet__role` L3070 (no align-self/margin-top) |
| `src/ui/CharacterScreen.tsx` | Role badge span in `.cchar__id` between active/transcend | ✓ VERIFIED | L331–339, imports `ROLE_META` L2 |
| `src/ui/CharacterSheet.tsx` | Role badge span in `.sheet__meta` before `.sheet__level` | ✓ VERIFIED | L93–101, imports `ROLE_META` L2 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `characters.ts` role | server `CHARACTER_STATS` role | serverSync `extractServerStats` reads source text; per-id equality assertion | ✓ WIRED | `readField(body,'role')` parses single-line literals; equality test green for all 17 |
| `ROLE_META` (characters.ts) | CharacterScreen + CharacterSheet badges | import + inline `color/label/aria` derivation | ✓ WIRED | Both surfaces import the one `ROLE_META`; no per-character hard-coding |
| `ROLE_META[role].token` | CSS `--role-*` tokens | inline `style color: var(--role-*)` + border `currentColor` | ✓ WIRED | Token strings in `ROLE_META` match the four `:root` tokens |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Role parity + validity | `pnpm test serverSync` | 91 passed (incl. 34 role assertions: 17 valid-role + 17 client↔server equality) | ✓ PASS |
| Full suite regression | `pnpm test` | 373 passed (25 files) | ✓ PASS |
| Type + build | `pnpm build` | built in 5.18s, no errors | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| REQ-combat-roles | 04-01, 04-02 | role on every character + server mirror + serverSync coverage + badge UI | ✓ SATISFIED | Truths 1–4 above; id→role mapping matches REQ text exactly; commits `7776f78`, `7d8a410`, `8fa0827`, `5c40b0b` present |

### Anti-Patterns Found

None. Debt-marker scan of all 5 modified files returned no `TODO/FIXME/XXX/TBD/HACK/PLACEHOLDER`. The `{ROLE_META[character.role] && (...)}` guard is the intentional, spec'd render-nothing fallback (not a stub); no stub returns, no hollow props, no empty data source (role is compile-time const data).

### Human Verification Required

**1. Role badge visual appearance (04-VALIDATION.md manual-only UAT / coverage item D2)**

- **Test:** Open the CharacterScreen and CharacterSheet for characters of each role (tank/dps/healer/support).
- **Expected:** Role pill visible — CharacterScreen `.cchar__id` stack ordered active → role → transcend; CharacterSheet `.sheet__meta` row before the level chip (not stranded flush-right). Correct Latvian uppercase label + matching per-role outline color, box model matching the sibling active tag.
- **Why human:** Visual placement, per-role color rendering, and pixel-parity are not programmatically assertable. Code is present and correctly wired; only rendered appearance needs a human eye. This is a deferred manual UAT item, not a failure.

### Gaps Summary

No gaps. All four ROADMAP success criteria are met in the codebase, not merely claimed: role is an intrinsic required field on all 17 characters client-side, mirrored 1:1 on the server `CHARACTER_STATS` const (client↔server lockstep enforced by 34 passing serverSync assertions), and surfaced as a badge on both character surfaces wired to a single `ROLE_META` source. `pnpm test` (373) and `pnpm build` re-run green in this verification. The sole open item is the visual badge appearance, which is inherently human-judgment (routed to UAT). Note: plan truth "running local module carries role" (D4) is a deploy step — the module source carries `role` and the publish is additive (const data, no table/migration), so it is verified at source level; the actual local publish is a procedural claim not independently re-verifiable via SQL since role is const data, not a table field. maincloud publish is explicitly deferred to Phase 7.

---

_Verified: 2026-07-07T13:25:00Z_
_Verifier: Claude (gsd-verifier)_

---
phase: 13
slug: camera-feel
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-21
---

# Phase 13 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| (none new — 13-01/02/03) | Pure client-side camera math, render projection, and model animation. No network, storage, or user input crosses in. | none |
| localStorage → App state (13-04) | Persisted `settings.reduceMotion` string read on load; attacker-controllable only via same-origin local tampering. | `'0'`/`'1'` flag string (non-sensitive) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-13-01a | Tampering | `cameraFeelMath` pure fns | low | accept | No external input; deterministic numeric helpers, no side effects. Accepted risk. | closed |
| T-13-02a | Denial of Service | ungated `updateProjectionMatrix` / FOV strobe | low | mitigate | D-07 projection gate — `updateProjectionMatrix()` rebuilt in one auditable spot (`createCameraFeel.ts:75,113`), not per-frame; `KICK_COOLDOWN_S` rate gate. | closed |
| T-13-03a | Denial of Service | idle breathing pixel-crawl | low | mitigate | Positional (non-rotational) `breatheOffset` sway + conservative `PIXEL_SCALE` (`cameraFeelMath.ts:46,73`); validated at 13-04 playtest. | closed |
| T-13-04a | Tampering | `localStorage settings.reduceMotion` read | low | mitigate | `saved === '1'` coercion (`App.tsx:102`); absent key → OS `prefers-reduced-motion`; any other value → off. No eval/deserialize, no injection path. | closed |
| T-13-04b | Denial of Service | FOV strobe on multi-crit AoE frame | low | mitigate | `KICK_COOLDOWN_S` rate gate via `canKick` (`cameraFeelMath.ts:141`, `createCameraFeel.ts`); playtest step 4 confirms non-strobing. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-13-01 | T-13-01a | Pure client-side deterministic math module; no input crosses any trust boundary, no side effects. No attacker-reachable path. | Rolands | 2026-07-21 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-21 | 5 | 5 | 0 | gsd-secure-phase (L1 grep-depth, ASVS 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-21

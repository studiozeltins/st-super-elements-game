---
phase: 12
slug: wildlife
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-20
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

This is a **client-only, cosmetic** phase (ambient wildlife: butterflies +
fireflies). It adds no network calls, no reducers, no auth, no persistence, and no
input parsing. The only external input is the `?nobugs` / `?nofireflies` URL flags —
boolean presence checks that disable a cosmetic system (established `?no*` bisect
convention). The butterfly wing texture is painted on an in-process canvas (no
remote asset). No third-party model/asset is loaded at runtime: the crow GLTF
experiment (and the transient GLTFLoader path) was removed this phase (commit
705117c), so no untrusted-asset fetch/parse surface remains. Every threat is
low/medium and either accepted (no surface) or mitigated in shipped, tested code.
ASVS L1 grep-depth verification.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| URL query string → client | `?nobugs` / `?nofireflies` presence read at load | boolean flag (no privilege/state) |

No server/client, auth, or persistence boundary is touched this phase.

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-12-01 | Tampering | pure cosmetic factories (butterfly/firefly) + wildlifeMath (no external input) | low | accept | Pure functions over fixed in-repo tunables + seeded/cosmetic RNG; wing texture painted on an in-process canvas; no external input surface. | closed |
| T-12-02 | Denial of Service | per-frame butterfly + firefly pools | medium | mitigate | Hard-capped pools (BUTTERFLY_POOL_SIZE=8; firefly pool cap), zero-alloc per-frame day/night gate + slot-recycle (pool-cap unit tests); one draw call each; `?nobugs`/`?nofireflies` bisect + `scripts/fps_playtest.py` gate. | closed |
| T-12-03 | Untrusted asset | 3D model load (removed) | low | accept | The crow GLTF + GLTFLoader path was removed this phase (705117c); no runtime remote/asset fetch or parse remains. Butterfly art is a procedural canvas texture. | closed |
| T-12-SC | Tampering | package installs (supply chain) | low | accept | Zero packages installed (milestone-locked zero-new-dependencies; existing three + addons only). | closed |

*Status: closed · closed · closed · closed — no open threats*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-12-01 | T-12-01 | Pure cosmetic client geometry/motion over fixed data; no attacker-reachable input surface. | Rolands | 2026-07-20 |
| R-12-03 | T-12-03 | Bird/crow GLTF experiment removed; wildlife ships with no runtime asset load. | Rolands | 2026-07-20 |
| R-12-SC | T-12-SC | Zero new dependencies (milestone-locked); no supply-chain surface. | Rolands | 2026-07-20 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-20 | 4 | 4 | 0 | Claude (secure-phase, L1 short-circuit — 0 open ≥ high, register authored at verify time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-20

---
phase: 11
slug: lived-in-props-wear
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-18
---

# Phase 11 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

This is a **client-only, cosmetic** phase (world visuals + tuning). It adds no
network calls, no reducers, no auth, no persistence, and no input parsing. The
only external input is the `?nodust` URL flag — a boolean presence check that
disables a cosmetic system (established `?no*` bisect convention). Every threat is
low/medium and either accepted (no surface) or mitigated in shipped, tested code.
Register authored at plan time; ASVS L1 grep-depth verification.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| URL query string → client | `?nodust` presence read at load | boolean flag (no privilege/state) |

No server/client, auth, or persistence boundary is touched this phase.

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-11-01 | Tampering | pure cosmetic factories / classifiers (no external input) | low | accept | Pure functions over fixed in-repo data + seeded RNG; no external input surface. | closed |
| T-11-02 | Denial of Service | per-frame dust + surface cost | medium | mitigate | Dust pool hard-capped at DUST_POOL_SIZE=24 (slot-claim scan, pool-cap unit test); `surfaceAt` is one pure zero-alloc call/frame shared by dust+audio; `?nodust` bisect + `scripts/fps_playtest.py` gate. | closed |
| T-11-SC | Tampering | package installs (supply chain) | low | accept | Zero packages installed (locked zero-new-dependencies; existing three + BufferGeometryUtils addon only). | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-11-01 | T-11-01 | Pure cosmetic client geometry/classification over fixed data; no attacker-reachable input surface. | Rolands | 2026-07-18 |
| R-11-SC | T-11-SC | Zero new dependencies (milestone-locked); no supply-chain surface. | Rolands | 2026-07-18 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-18 | 3 | 3 | 0 | Claude (secure-phase, L1 short-circuit — 0 open ≥ high, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-18

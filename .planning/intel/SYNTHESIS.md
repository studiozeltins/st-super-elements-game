# Synthesis Summary

Single entry point for `gsd-roadmapper`. Summarizes what was synthesized from the
ingested planning docs.

Mode: new (fresh bootstrap). Precedence: ADR > SPEC > PRD > DOC (default).

---

## Doc counts by type

- PRD: 1 (docs/TRANSCENDENCE_PLAN.md — "Transcendence Loop — Phased Build Plan")
- ADR: 0
- SPEC: 0
- DOC: 0
- UNKNOWN / low-confidence: 0

## Decisions locked (9)

Source for all: docs/TRANSCENDENCE_PLAN.md. See intel/decisions.md.
- DEC-naming-unification — two-tier gem/shard economy naming
- DEC-wipe-not-migrate — destructive primogems→gems rename accepted as full wipe (Phase A)
- DEC-pve-death-shard-ground-collectible — PVE death shard spills to ground; PVP transfers to killer
- DEC-branch-feat-transcendence — all work on feat/transcendence, cut from master
- INV-1 — installed C0–C6 is the protected PVE floor
- INV-2 — shards must be scarce (dupe / PVP theft / raid payout only)
- INV-3 — shards must buy real power (transcendence)
- INV-4 — a ganked non-payer must be able to recover via raid faucet
- INV-5 — keep client/server number mirrors in sync (serverSync.test.ts)

Note: the source is a PRD with doc-level `locked: false`; its in-doc locked contract was
preserved as LOCKED per ingest direction.

## Requirements extracted (9)

See intel/requirements.md. Ordered by dependency.
- REQ-gem-rename (Phase A)
- REQ-lock-constants (Phase 0)
- REQ-shard-currency-mint (Phase 1)
- REQ-transcend-install (Phase 2)
- REQ-shard-risk (Phase 3)
- REQ-combat-roles (Phase 4)
- REQ-multiplayer-party (Phase 5)
- REQ-raid-boss (Phase 6)
- REQ-raid-roles-balance (Phase 7)

## Constraints (6)

See intel/constraints.md.
- schema: 1 (CON-naming-contract — verbatim identifier contract)
- nfr: 2 (CON-tunables — locked tunable numbers; CON-test-discipline)
- protocol: 3 (CON-additive-schema; CON-deploy-procedure; CON-package-manager)

## Context topics (5)

See intel/context.md.
- Goal / vision
- The core loop this builds
- Phase structure
- Suggested execution order
- Cross-reference targets (implementation surface)

## Conflicts

- Blockers: 0
- Competing variants: 0
- Auto-resolved: 0
- Info: 1 (single-source, no cross-doc conflict possible)

Detail: ../INGEST-CONFLICTS.md

## Per-type intel files

- Decisions: intel/decisions.md
- Requirements: intel/requirements.md
- Constraints: intel/constraints.md
- Context: intel/context.md

## Status

READY — no blockers, no competing variants. Safe to route to gsd-roadmapper.

# Phase 4 — Formalize character roles

> Part of Transcendence. Contracts + tracker: [PROGRESS.md](./PROGRESS.md) · Full plan:
> [../../docs/TRANSCENDENCE_PLAN.md](../../docs/TRANSCENDENCE_PLAN.md)

**Status:** ⬜ TODO · **Depends on:** Phase 0 (can run parallel with 1–3)

Read the **Shared contracts** in PROGRESS.md.

## Goal
Tag every character with a combat role so the raid (Phase 6) can reward roles.

## Data
- Add `role: 'tank' | 'dps' | 'healer' | 'support'` to every character in
  `src/game/data/characters.ts` AND mirror server-side in `CHARACTER_STATS`
  (`spacetimedb/src/index.ts:38-60`) so the raid can read it server-authoritatively.
- Seed from current design:
  - healer: Marina, Nereida (nereida), Lapa, Rasa
  - tank: Glacia (glacia), Terron (terron), Ignis (ignis), Petra
  - support: Aeris (aeris), Zefs (zefs)
  - dps: everyone else (volta, silva, sarma, vesper, zibo, dzirkste, stindzis)

## Client
- Show a role badge in `CharacterSheet.tsx` / `CharacterScreen.tsx`.

## Tests
- Unit: every character has a valid role (no missing/invalid).
- `serverSync.test.ts`: role field matches between client and server.

## Validation
- `pnpm test` + `pnpm build`. Publish local if role is stored server-side (recommended so
  Phase 6 can enforce it) — additive to `CHARACTER_STATS`, migrate publish.

## Commit
`feat(roles): tag every character with a combat role`

## Definition of done
- [ ] role on all characters, client + server, in sync
- [ ] role badge in UI
- [ ] tests green; build green
- [ ] committed; PROGRESS.md updated

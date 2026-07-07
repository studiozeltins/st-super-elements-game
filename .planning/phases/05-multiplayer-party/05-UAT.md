---
status: testing
phase: 05-multiplayer-party
source:
  - 05-01-SUMMARY.md
  - 05-02-SUMMARY.md
  - 05-03-SUMMARY.md
  - 05-04-SUMMARY.md
  - 05-05-SUMMARY.md
  - 05-06-SUMMARY.md
started: 2026-07-07
updated: 2026-07-07
---

## Current Test

number: 3
name: Ask-to-join a party
expected: |
  Tap a player → "Lūgt pievienoties baram" → that player (party owner) gets a request
  toast → accepting adds you to their party.
awaiting: user response

## Tests

### 1. Form a party (invite → accept)
expected: Tap a player → "Uzaicināt savā barā" → they accept the toast → both clients show a 2-member party (BARS 2/4).
result: pass

### 2. Party roster / frames render correctly
expected: The party shows each member's active character, role badge, a leader crown ♛ on the leader, and an online dot; the left party-frames panel shows name + HP bar per teammate.
result: pass

### 3. Ask-to-join a party
expected: Tap a player → "Lūgt pievienoties baram" → that player (party owner) gets a request toast → accepting adds you to their party.
result: pass
note: Functional pass. User flagged the invite toast UI/UX as too intrusive — redesigning to a slim Frost strip in the top-center header (green clickable name-tag + round icon-only accept/decline + countdown). Tracked as a follow-up polish, not a functional gap.

### 4. Cap (4) + no double-join
expected: A full party (4/4) disables the invite action ("Bars ir pilns (4/4)"); a 5th accept is rejected; a player already in a party cannot double-join.
result: [pending]

### 5. Leave / promote / disband
expected: Leaving as a non-leader empties your membership; a leader leaving with others promotes the oldest-joined member (crown moves); the last member leaving disbands the party; a leader can "Izformēt baru" to dissolve it entirely.
result: [pending]

### 6. Disconnect persists membership
expected: A member who closes their tab shows offline (hollow dot / dimmed) in the roster but REMAINS a party member (does not get dropped); on reconnect they are back online in the same party.
result: [pending]

## Summary

total: 6
passed: 2
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]

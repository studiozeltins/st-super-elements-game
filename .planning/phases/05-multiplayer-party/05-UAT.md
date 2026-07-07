---
status: complete
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

[testing complete]

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
result: pass
note: Verified solo with dev bots (debug_spawn_bots + world-tick auto-accept). A 4th bot invite could not join a 4/4 party; invite action disabled at cap.

### 5. Leave / promote / disband
expected: Leaving as a non-leader empties your membership; a leader leaving with others promotes the oldest-joined member (crown moves); the last member leaving disbands the party; a leader can "Izformēt baru" to dissolve it entirely.
result: pass
reported: "i dont see a way to exit party when player offline also maybe if online"
resolution: "FIXED — moved the leave affordance onto every party member's sheet. Tapping any teammate now shows 'Pamest baru' (leaveParty); a leader also gets 'Izformēt baru' (disband) + 'Izmest no bara' (kick). PlayerSheet.tsx teammate branch + no PartyFrames self-row (self stays out of the panel per user). Confirmed pass after reload."

### 6. Disconnect persists membership
expected: A member who closes their tab shows offline (hollow dot / dimmed) in the roster but REMAINS a party member (does not get dropped); on reconnect they are back online in the same party.
result: pass
note: Verified via debug_set_online toggle on a bot member — went offline (dimmed, still in roster), returned online in the same party. Auto-rejoin confirmed by user.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "A player can leave their party (and a leader can disband it) via a discoverable UI action, whether the other member is online or offline."
  status: resolved
  reason: "User reported: i dont see a way to exit party when player offline also maybe if online"
  severity: major
  test: 5
  resolution: "Moved leave/disband onto every teammate's PlayerSheet ('Pamest baru' always; 'Izformēt baru' + 'Izmest no bara' for leaders). Self kept out of the party panel per user preference. Verified pass."
  artifacts:
    - path: "src/ui/PlayerSheet.tsx"
      issue: "Teammate branch now renders leave (+ leader disband/kick)."
    - path: "src/ui/PartyFrames.tsx"
      issue: "Reverted self-row experiment; teammates only."

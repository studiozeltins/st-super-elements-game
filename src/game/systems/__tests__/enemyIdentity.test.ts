import { describe, expect, it } from 'vitest';
import { getCampSites } from '../../world/camps';
import { enemyIdFor, isBossMember, MEMBERS_PER_CAMP } from '../enemyIdentity';

// The whole point of enemy ids is cross-client stability: enemies are simulated
// per-client, so their server-side hoard only lines up if every client mints the
// same id for the same camp/member. These guard that contract.
describe('enemy identity', () => {
  it('is stable for a given camp/member', () => {
    expect(enemyIdFor(0, 0)).toBe(enemyIdFor(0, 0));
    expect(enemyIdFor(3, 2)).toBe(302);
    expect(enemyIdFor(0, 4)).toBe(4);
  });

  it('assigns a unique id to every enemy across all camps', () => {
    const ids = new Set<number>();
    const camps = getCampSites();
    for (let campIndex = 0; campIndex < camps.length; campIndex++) {
      for (let memberIndex = 0; memberIndex < MEMBERS_PER_CAMP; memberIndex++) {
        ids.add(enemyIdFor(campIndex, memberIndex));
      }
    }
    expect(ids.size).toBe(camps.length * MEMBERS_PER_CAMP);
  });

  it('never lets one camp\'s members collide with the next camp', () => {
    // Member ids must stay below the camp stride, or camp N member M could equal
    // camp N+1 member 0.
    for (let memberIndex = 0; memberIndex < MEMBERS_PER_CAMP; memberIndex++) {
      expect(enemyIdFor(0, memberIndex)).toBeLessThan(enemyIdFor(1, 0));
    }
  });

  it('treats member 0 of every camp as the boss', () => {
    expect(isBossMember(0)).toBe(true);
    for (let memberIndex = 1; memberIndex < MEMBERS_PER_CAMP; memberIndex++) {
      expect(isBossMember(memberIndex)).toBe(false);
    }
  });
});

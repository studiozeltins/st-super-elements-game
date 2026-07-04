import { describe, expect, it } from 'vitest';
import type { EventContext } from '../../../module_bindings';
import { serverClockOffsetFromEvent } from '../serverClock';

// Only the shape the helper reads matters; cast a minimal fake to the union type.
const reducerEvent = (microsSinceUnixEpoch: bigint): EventContext['event'] =>
  ({ tag: 'Reducer', value: { timestamp: { microsSinceUnixEpoch } } }) as unknown as EventContext['event'];

describe('serverClockOffsetFromEvent', () => {
  it('returns server-minus-local micros for a reducer event', () => {
    expect(serverClockOffsetFromEvent(reducerEvent(5_000n), 3_000n)).toBe(2_000n);
  });

  it('computes a negative offset when the server clock is behind the local clock', () => {
    expect(serverClockOffsetFromEvent(reducerEvent(1_000n), 9_000n)).toBe(-8_000n);
  });

  it('computes large offsets without precision loss', () => {
    const serverMicros = 1_900_000_000_000_000n;
    const localMicros = 1_000_000_000_000_000n;
    expect(serverClockOffsetFromEvent(reducerEvent(serverMicros), localMicros)).toBe(
      900_000_000_000_000n
    );
  });

  it('returns null for a SubscribeApplied event (no server timestamp)', () => {
    const event = { tag: 'SubscribeApplied' } as unknown as EventContext['event'];
    expect(serverClockOffsetFromEvent(event, 3_000n)).toBeNull();
  });

  it('returns null for an Error event', () => {
    const event = { tag: 'Error', value: new Error('boom') } as unknown as EventContext['event'];
    expect(serverClockOffsetFromEvent(event, 3_000n)).toBeNull();
  });

  it('returns null when the event is undefined', () => {
    expect(serverClockOffsetFromEvent(undefined as unknown as EventContext['event'], 3_000n)).toBeNull();
  });
});

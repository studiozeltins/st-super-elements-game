import type { EventContext } from '../../module_bindings';

/**
 * The offset (server minus local, in micros) implied by a reducer-driven event,
 * or null when the event carries no server timestamp (non-reducer events).
 * Added to the local wall clock to estimate server time for cross-client timing.
 */
export function serverClockOffsetFromEvent(
  event: EventContext['event'],
  localMicros: bigint
): bigint | null {
  if (event?.tag !== 'Reducer') return null;
  return event.value.timestamp.microsSinceUnixEpoch - localMicros;
}

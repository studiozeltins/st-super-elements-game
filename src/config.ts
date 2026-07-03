/**
 * Where the client opens its SpacetimeDB socket:
 * - VITE_SPACETIMEDB_HOST override always wins.
 * - HTTPS pages must use a same-origin wss proxy (nginx → :3000), because an
 *   https page may not open an insecure ws:// socket.
 * - Plain http (vite dev on localhost, or a LAN IP like 192.168.x.x) talks to
 *   the SpacetimeDB port directly, so other machines on the network can play.
 *   The host must run SpacetimeDB reachable on :3000 (listen 0.0.0.0, firewall
 *   open) and have the module published there.
 */
function resolveSpacetimedbUri(): string {
  const { protocol, hostname, host } = window.location;
  // Host's own dev box: honor the override (defaults to loopback).
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
  }
  // HTTPS: can't open ws:// from https, so go same-origin wss (nginx → :3000).
  if (protocol === 'https:') return `wss://${host}`;
  // LAN over http: hit the host's SpacetimeDB port directly using the page's
  // host, so other machines resolve the host — never loopback.
  return `ws://${hostname}:3000`;
}

export const SPACETIMEDB_URI: string = resolveSpacetimedbUri();
export const MODULE_NAME: string =
  import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? '2d-impact-game-fr9ti';

const LOCALHOST_NAMES = ['localhost', '127.0.0.1'];

/**
 * On localhost (vite dev) talk to SpacetimeDB directly; on a real domain
 * (e.g. https://2d-genshin-top-down.test) use the same-origin nginx proxy,
 * because an https page may not open insecure ws:// sockets.
 */
function resolveSpacetimedbUri(): string {
  const { protocol, hostname, host } = window.location;
  if (LOCALHOST_NAMES.includes(hostname)) {
    return import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://127.0.0.1:3000';
  }
  const websocketProtocol = protocol === 'https:' ? 'wss' : 'ws';
  return `${websocketProtocol}://${host}`;
}

export const SPACETIMEDB_URI: string = resolveSpacetimedbUri();
export const MODULE_NAME: string =
  import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? '2d-impact-game-fr9ti';

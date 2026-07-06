// Shared config for the durable-table backup/restore pair (a poor-man's Laravel
// seeder for SpacetimeDB, which has no native seed/import). Talks straight to the
// SpacetimeDB HTTP API: /sql to read, /call/<reducer> to write. Local needs no
// auth; maincloud needs --token <bearer> (from `spacetime login`).
//
// Durable tables preserved. Ephemeral tables (gem_drop, enemy, goliath, regen_timer,
// world_timer) are intentionally skipped — they regenerate from init/worldTick.

export const TABLES = [
  {
    table: 'player',
    reducer: 'restore_players',
    // Restored verbatim; `online` + timestamps are re-minted server-side.
    keep: [
      'identity',
      'name',
      'position_x',
      'position_y',
      'position_z',
      'rotation_y',
      'active_character_id',
      'party_order',
      'gems',
      'current_health',
      'gems_from_kills',
      'gems_collected',
      'transcend_shards',
    ],
  },
  {
    table: 'owned_character',
    reducer: 'restore_owned_characters',
    keep: ['owner', 'character_id', 'current_health', 'constellation'],
  },
  {
    table: 'weapon_item',
    reducer: 'restore_weapon_items',
    keep: ['owner', 'weapon_id', 'rarity'],
  },
  {
    table: 'banner_pity',
    reducer: 'restore_banner_pity',
    keep: [
      'owner',
      'banner_id',
      'pulls_since_five_star',
      'pulls_since_four_star',
      'guaranteed_featured',
      'total_pulls',
    ],
  },
];

/** Parses `--flag value` pairs and returns { server, db, dir, token }. */
export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) opts[arg.slice(2)] = argv[++i];
  }
  return {
    server: opts.server ?? 'local',
    db: opts.db ?? '2d-impact-game-fr9ti',
    dir: opts.dir ?? 'backup',
    token: opts.token ?? process.env.SPACETIME_TOKEN ?? null,
  };
}

/** Maps a server nickname (or a raw URL) to its HTTP base. */
export function baseUrl(server) {
  if (server.startsWith('http')) return server.replace(/\/$/, '');
  if (server === 'maincloud') return 'https://maincloud.spacetimedb.com';
  return 'http://127.0.0.1:3000'; // local (default)
}

export function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { DbConnection } from '../module_bindings';
import type { Enemy, GemDrop, Goliath, ShardDrop, UnitAttack } from '../module_bindings/types';
import type { Game } from '../game/createGame';

// The five game-only tables (enemy, goliath, unit_attack, gem_drop, shard_drop)
// never touch the DOM — they only feed the three.js layer. Holding them in React
// state (useTable) made EVERY ~150ms world tick re-render the whole App tree,
// which starved the render loop exactly during combat (the 12fps golem fights).
// This hook mirrors their rows straight off the connection's table callbacks and
// flushes them into the game layer with zero React involvement.

interface MirroredRows {
  enemy: Map<bigint, Enemy>;
  goliath: Map<bigint, Goliath>;
  unitAttack: Map<bigint, UnitAttack>;
  gemDrop: Map<bigint, GemDrop>;
  shardDrop: Map<bigint, ShardDrop>;
}

export interface GameTableBridge {
  /** Pushes the currently mirrored rows into a freshly created game. */
  syncAll(game: Game): void;
}

type TableName = keyof MirroredRows;

interface TableHandle<Row> {
  iter(): Iterable<Row>;
  onInsert(cb: (ctx: unknown, row: Row) => void): void;
  removeOnInsert(cb: (ctx: unknown, row: Row) => void): void;
  onUpdate(cb: (ctx: unknown, oldRow: Row, newRow: Row) => void): void;
  removeOnUpdate(cb: (ctx: unknown, oldRow: Row, newRow: Row) => void): void;
  onDelete(cb: (ctx: unknown, row: Row) => void): void;
  removeOnDelete(cb: (ctx: unknown, row: Row) => void): void;
}

function mirror<Row extends { id: bigint }>(
  handle: TableHandle<Row>,
  map: Map<bigint, Row>,
  markDirty: () => void
): () => void {
  // Rows cached before this effect ran (reconnect, effect ordering) never fire
  // onInsert — seed from the client cache first.
  for (const row of handle.iter()) map.set(row.id, row);
  markDirty();
  const onInsert = (_ctx: unknown, row: Row) => {
    map.set(row.id, row);
    markDirty();
  };
  const onUpdate = (_ctx: unknown, _oldRow: Row, row: Row) => {
    map.set(row.id, row);
    markDirty();
  };
  const onDelete = (_ctx: unknown, row: Row) => {
    map.delete(row.id);
    markDirty();
  };
  handle.onInsert(onInsert);
  handle.onUpdate(onUpdate);
  handle.onDelete(onDelete);
  return () => {
    handle.removeOnInsert(onInsert);
    handle.removeOnUpdate(onUpdate);
    handle.removeOnDelete(onDelete);
    map.clear();
  };
}

export function useGameTableBridge(
  connection: DbConnection | null,
  gameRef: MutableRefObject<Game | null>
): GameTableBridge {
  const rowsRef = useRef<MirroredRows>({
    enemy: new Map(),
    goliath: new Map(),
    unitAttack: new Map(),
    gemDrop: new Map(),
    shardDrop: new Map(),
  });

  const flushInto = useCallback(
    (game: Game, dirty: ReadonlySet<TableName> | null) => {
      const rows = rowsRef.current;
      // A transaction updates several rows of one table at once — the sync APIs
      // take the whole row set, so the flush runs once per table per batch.
      if (!dirty || dirty.has('enemy')) game.syncEnemies([...rows.enemy.values()]);
      if (!dirty || dirty.has('goliath')) game.syncGoliaths([...rows.goliath.values()]);
      if (!dirty || dirty.has('unitAttack')) game.syncUnitAttacks([...rows.unitAttack.values()]);
      if (!dirty || dirty.has('gemDrop')) game.syncGemDrops([...rows.gemDrop.values()]);
      if (!dirty || dirty.has('shardDrop')) game.syncShardDrops([...rows.shardDrop.values()]);
    },
    []
  );

  useEffect(() => {
    if (!connection) return;
    const rows = rowsRef.current;
    const dirty = new Set<TableName>();
    let flushScheduled = false;
    let disposed = false;
    const flush = () => {
      flushScheduled = false;
      const game = gameRef.current;
      // No game yet: keep the dirty set — syncAll seeds the game on creation.
      if (disposed || !game || dirty.size === 0) return;
      flushInto(game, dirty);
      dirty.clear();
    };
    // Callbacks fire once per row, but a server transaction lands as one
    // synchronous batch — a microtask coalesces the whole batch into one flush.
    const markDirty = (table: TableName) => () => {
      dirty.add(table);
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
      }
    };
    const unregister = [
      mirror(connection.db.enemy, rows.enemy, markDirty('enemy')),
      mirror(connection.db.goliath, rows.goliath, markDirty('goliath')),
      mirror(connection.db.unitAttack, rows.unitAttack, markDirty('unitAttack')),
      mirror(connection.db.gemDrop, rows.gemDrop, markDirty('gemDrop')),
      mirror(connection.db.shardDrop, rows.shardDrop, markDirty('shardDrop')),
    ];
    return () => {
      disposed = true;
      unregister.forEach(cleanup => cleanup());
    };
  }, [connection, gameRef, flushInto]);

  return useMemo(
    () => ({
      syncAll(game: Game) {
        flushInto(game, null);
      },
    }),
    [flushInto]
  );
}

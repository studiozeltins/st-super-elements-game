// Restores the durable tables from backup/<reducer>.json after a wipe. Calls each
// restore reducer over HTTP. The reducers refuse to run into a non-empty table,
// so this is safe to run only on a fresh database.
//
//   node scripts/restore.mjs [--server local|maincloud|<url>] [--db <name>]
//                            [--dir backup] [--token <bearer>]

import { readFile } from 'node:fs/promises';
import { TABLES, parseArgs, baseUrl, authHeaders } from './snapshot.mjs';

const { server, db, dir, token } = parseArgs(process.argv.slice(2));
const base = baseUrl(server);

async function callReducer(reducer, rows) {
  const response = await fetch(`${base}/v1/database/${db}/call/${reducer}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify([rows]), // reducer takes one arg: the rows array
  });
  if (!response.ok) {
    throw new Error(`${reducer} failed (${response.status}): ${(await response.text()).trim()}`);
  }
}

for (const { reducer } of TABLES) {
  let rows;
  try {
    rows = JSON.parse(await readFile(`${dir}/${reducer}.json`, 'utf8'));
  } catch {
    console.log(`${reducer}: no backup file, skipping`);
    continue;
  }
  await callReducer(reducer, rows);
  console.log(`${reducer}: restored ${rows.length} rows`);
}

console.log(`Restore complete (${server}).`);

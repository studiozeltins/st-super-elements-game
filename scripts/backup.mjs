// Dumps the durable SpacetimeDB tables to backup/<reducer>.json so they can be
// restored after a wipe. Each file is the exact argument array its restore
// reducer expects.
//
//   node scripts/backup.mjs [--server local|maincloud|<url>] [--db <name>]
//                           [--dir backup] [--token <bearer>]

import { mkdir, writeFile } from 'node:fs/promises';
import { TABLES, parseArgs, baseUrl, authHeaders } from './snapshot.mjs';

const { server, db, dir, token } = parseArgs(process.argv.slice(2));
const base = baseUrl(server);

async function runSql(sql) {
  const response = await fetch(`${base}/v1/database/${db}/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', ...authHeaders(token) },
    body: sql,
  });
  if (!response.ok) throw new Error(`SQL failed (${response.status}): ${await response.text()}`);
  return response.json();
}

await mkdir(dir, { recursive: true });

for (const { table, reducer, keep } of TABLES) {
  const [result] = await runSql(`SELECT * FROM ${table}`);
  const columnNames = result.schema.elements.map(element => element.name.some);
  const rows = result.rows.map(values => {
    const row = {};
    columnNames.forEach((name, index) => {
      row[name] = values[index];
    });
    // Keep only the fields the restore reducer accepts (drops autoInc ids and
    // timestamps, which are re-minted on restore). Identity/owner stay as the
    // 1-element tuple SpacetimeDB returned — exactly what the reducer expects.
    return Object.fromEntries(keep.map(field => [field, row[field]]));
  });
  await writeFile(`${dir}/${reducer}.json`, JSON.stringify(rows, null, 1));
  console.log(`${table}: ${rows.length} rows → ${dir}/${reducer}.json`);
}

console.log(`Backup complete (${server}).`);

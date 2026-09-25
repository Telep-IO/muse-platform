// Minimal SQLite store. Uses Node 24's built-in node:sqlite so the
// dependency list stays exactly as specified. Production deployments
// should swap this module for Postgres (same query shapes).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export function openStore(dataDir) {
  const db = new DatabaseSync(join(dataDir, 'inksend.sqlite'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = FULL;');
  db.exec(readFileSync(join(here, '..', 'schema.sql'), 'utf8'));

  const prepared = new Map();
  const prepare = (sql) => prepared.get(sql) ?? prepared.set(sql, db.prepare(sql)).get(sql);
  return {
    db,
    get: (id) => prepare('SELECT * FROM letters WHERE id = ?').get(id),
    insert: (row) => prepare(`INSERT INTO letters
      (id, token_hash, state, message, message_sha256,
       recipient_name, recipient_line1, recipient_line2, recipient_city,
       recipient_state, recipient_zip, recipient_country,
       card, handwriting_style, amount, currency, created_at, updated_at)
      VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'usd', ?, ?)`)
      .run(row.id, row.token_hash, row.message, row.message_sha256,
           row.recipient_name, row.recipient_line1, row.recipient_line2 || null,
           row.recipient_city, row.recipient_state, row.recipient_zip,
           row.recipient_country, row.card, row.handwriting_style || null,
           row.amount, row.created_at, row.created_at),
    // Compare-and-set state transition; returns true iff the row moved.
    transition: (id, from, to, extra = {}) => {
      const sets = Object.entries(extra).map(([k]) => `${k} = ?`).join(', ');
      const result = prepare(
        `UPDATE letters SET state = ?, updated_at = ?${sets ? `, ${sets}` : ''}
         WHERE id = ? AND state = ?`).run(to, Date.now(), ...Object.values(extra), id, from);
      return result.changes === 1;
    },
    claim: (id, from, to, leaseMs) => {
      const now = Date.now();
      const result = prepare(
        `UPDATE letters SET state = ?, lease_until = ?, updated_at = ?
         WHERE id = ? AND state = ? AND (lease_until IS NULL OR lease_until < ?)`)
        .run(to, now + leaseMs, now, id, from, now);
      return result.changes === 1;
    },
    set: (id, fields) => {
      const sets = Object.entries(fields).map(([k]) => `${k} = ?`).join(', ');
      prepare(`UPDATE letters SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), id);
    },
    insertApproval: (letterId, reviewHash, evidence) =>
      prepare('INSERT INTO approvals (letter_id, review_hash, evidence, created_at) VALUES (?, ?, ?, ?)')
        .run(letterId, reviewHash, evidence, Date.now()),
    approval: (letterId) => prepare('SELECT * FROM approvals WHERE letter_id = ?').get(letterId),
    insertPolicy: (version, kind, html) =>
      prepare('INSERT INTO policies (version, kind, html, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING')
        .run(version, kind, html, Date.now()),
    policy: (version) => prepare('SELECT * FROM policies WHERE version = ?').get(version),
    dueFor: (states, olderThanMs) =>
      prepare(`SELECT * FROM letters WHERE state IN (${states.map(() => '?').join(',')})
               AND updated_at < ? AND purged = 0`).all(...states, Date.now() - olderThanMs),
    inStates: (states) =>
      prepare(`SELECT * FROM letters WHERE state IN (${states.map(() => '?').join(',')})
               AND purged = 0`).all(...states),
    unpurgedCount: () => prepare('SELECT COUNT(*) AS n FROM letters WHERE purged = 0').get().n,
    close: () => db.close(),
  };
}

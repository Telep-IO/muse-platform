// Minimal SQLite store. Uses Node 24's built-in node:sqlite so the
// dependency list stays exactly as specified. Production deployments
// should swap this module for Postgres (same query shapes).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export function openStore(dataDir) {
  const db = new DatabaseSync(join(dataDir, 'callsend.sqlite'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = FULL;');
  db.exec(readFileSync(join(here, '..', 'schema.sql'), 'utf8'));

  const prepare = sql => db.prepare(sql);
  return {
    db,
    get: (id) => prepare('SELECT * FROM calls WHERE id = ?').get(id),
    insert: (row) => prepare(`INSERT INTO calls
      (id, token_hash, state, phone_number, script, script_sha256, script_chars,
       voice, record_call, amount, currency, tod_check, created_at, updated_at)
      VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, 'usd', ?, ?, ?)`)
      .run(row.id, row.token_hash, row.phone_number, row.script, row.script_sha256,
           row.script_chars, row.voice, row.record_call ? 1 : 0, row.amount,
           row.tod_check, row.created_at, row.created_at),
    // Compare-and-set state transition; returns true iff the row moved.
    transition: (id, from, to, extra = {}) => {
      const sets = Object.entries(extra).map(([k]) => `${k} = ?`).join(', ');
      const result = prepare(
        `UPDATE calls SET state = ?, updated_at = ?${sets ? `, ${sets}` : ''}
         WHERE id = ? AND state = ?`).run(to, Date.now(), ...Object.values(extra), id, from);
      return result.changes === 1;
    },
    claim: (id, from, to, leaseMs) => {
      const now = Date.now();
      const result = prepare(
        `UPDATE calls SET state = ?, lease_until = ?, updated_at = ?
         WHERE id = ? AND state = ? AND (lease_until IS NULL OR lease_until < ?)`)
        .run(to, now + leaseMs, now, id, from, now);
      return result.changes === 1;
    },
    set: (id, fields) => {
      const sets = Object.entries(fields).map(([k]) => `${k} = ?`).join(', ');
      prepare(`UPDATE calls SET ${sets}, updated_at = ? WHERE id = ?`)
        .run(...Object.values(fields), Date.now(), id);
    },
    // Anti-bulk guard: same number + same script drafted recently.
    recentDuplicate: (phoneNumber, scriptSha256, withinMs) =>
      prepare(`SELECT id FROM calls
               WHERE phone_number = ? AND script_sha256 = ? AND purged = 0
                 AND created_at > ? LIMIT 1`)
        .get(phoneNumber, scriptSha256, Date.now() - withinMs),
    insertApproval: (callId, reviewHash, evidence) =>
      prepare('INSERT INTO approvals (call_id, review_hash, evidence, created_at) VALUES (?, ?, ?, ?)')
        .run(callId, reviewHash, evidence, Date.now()),
    approval: (callId) => prepare('SELECT * FROM approvals WHERE call_id = ?').get(callId),
    insertPolicy: (version, kind, html) =>
      prepare('INSERT INTO policies (version, kind, html, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING')
        .run(version, kind, html, Date.now()),
    policy: (version) => prepare('SELECT * FROM policies WHERE version = ?').get(version),
    dueFor: (states, olderThanMs) =>
      prepare(`SELECT * FROM calls WHERE state IN (${states.map(() => '?').join(',')})
               AND updated_at < ? AND purged = 0`).all(...states, Date.now() - olderThanMs),
    inStates: (states) =>
      prepare(`SELECT * FROM calls WHERE state IN (${states.map(() => '?').join(',')})
               AND purged = 0`).all(...states),
    unpurgedCount: () => prepare('SELECT COUNT(*) AS n FROM calls WHERE purged = 0').get().n,
    close: () => db.close(),
  };
}

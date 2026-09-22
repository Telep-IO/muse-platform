import { readConfig } from '../src/config.js';
import { openStore } from '../src/store.js';
const config = readConfig(), db = await openStore(config);
if (process.argv[2] === 'evidence') {
  const id = process.argv[3];
  const record = await db.prepare(`SELECT approvals.*, orders.session_id, orders.payment_id, orders.payment_total, orders.payment_tax, orders.state
    FROM approvals JOIN orders ON orders.id=approvals.order_id WHERE order_id=?`).get(id || '');
  if (!record) { console.error('No retained approval record for that order.'); process.exitCode = 1; }
  else console.log(JSON.stringify({ ...record, evidence: JSON.parse(record.evidence) }, null, 2));
  await db.close();
} else {
// Intentionally read-only. Ambiguous mail needs provider reconciliation, not a
// convenient resend button after the provider's idempotency window has expired.
console.table(await db.prepare(`SELECT id, state, amount, session_id, payment_id, lob_id, refund_id, attempts, error
  FROM orders WHERE state IN ('paid','sending','refund_pending','needs_review','checkout') OR error IS NOT NULL ORDER BY created_at`).all());
await db.close();
}

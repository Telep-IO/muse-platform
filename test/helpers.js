import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';
import { createOrders } from '../src/orders.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { documentDir } from '../src/documents.js';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

export const consent = order => ({ confirmed: true, review_hash: order.review_hash, terms_version: order.terms_version, privacy_version: order.privacy_version });
export async function fakePrepare(config, id) {
  const dir = documentDir(config, id); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'print.pdf'), await pdfBytes(2)); return 2;
}

export const address = { name: 'PaperSend Test', address_line1: '185 Berry St', address_line2: 'Suite 6600', address_city: 'San Francisco', address_state: 'CA', address_zip: '94107', address_country: 'US' };
export const input = { sender: address, recipient: address };
export async function pdfBytes(pages = 1) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= pages; n++) { const page = pdf.addPage([612, 792]); page.drawText(`PaperSend test document - page ${n}`, { x: 40, y: 730, size: 18, font }); page.drawText('A real letter, without the trip to the post office.', { x: 40, y: 690, size: 12, font }); }
  return Buffer.from(await pdf.save());
}
export async function fixture(t, overrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'papersend-test-'));
  const config = { mode: 'test', dataDir, baseUrl: 'http://localhost:3000', trustProxy: false, ...overrides };
  let cleanupDatabase = async () => {};
  if (process.env.TEST_DATABASE_URL && !config.databaseUrl) {
    const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.connect();
    const database = `papersend_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE "${database}"`);
    const url = new URL(process.env.TEST_DATABASE_URL); url.pathname = `/${database}`;
    config.databaseUrl = url.toString();
    // Each fixture has its own disposable database; never clear an existing one.
    cleanupDatabase = async () => { await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); await admin.end(); };
  }
  const db = await openStore(config);
  let clock = 1700000000000, sends = 0, refunds = 0, checkouts = 0;
  const sessions = new Map();
  const providers = {
    verifyAddress: async a => a,
    checkout: async o => { checkouts++; const s = { id: `cs_${o.id}`, url: `https://checkout.stripe.com/${o.id}`, status: 'open', payment_status: 'unpaid' }; sessions.set(s.id, s); return s; },
    stripe: { checkout: { sessions: { retrieve: async id => sessions.get(id) } } },
    sendLetter: async o => { sends++; return { id: `ltr_${o.id.replaceAll('-', '')}`, expected_delivery_date: '2026-09-25' }; },
    refund: async () => { refunds++; return { id: 're_test', status: 'succeeded' }; },
    letterStatus: async () => 'rendered',
  };
  const orders = await createOrders(config, db, providers, { now: () => clock, prepare: fakePrepare });
  t.after(async () => { await db.close(); await cleanupDatabase(); await rm(dataDir, { recursive: true, force: true }); });
  async function draft() { return orders.create(input, { buffer: Buffer.from('unused'), originalname: 'letter.pdf' }); }
  async function payment(order, overrides = {}) { return { id: `cs_${order.id}`, metadata: { order_id: order.id, review_hash: (await orders.approvalFor(order.id))?.review_hash }, client_reference_id: order.id, payment_intent: `pi_${order.id}`, payment_status: 'paid', mode: 'payment', currency: 'usd', amount_subtotal: order.amount, amount_total: order.amount, total_details: { amount_tax: 0 }, consent: { terms_of_service: 'accepted' }, livemode: false, ...overrides }; }
  async function paid() { const order = await draft(); await orders.checkout(order.id, order.token, consent(order)); (await orders.recordPayment(await payment(order))); return order; }
  return { config, db, providers, orders, draft, paid, payment, sessions, counts: () => ({ sends, refunds, checkouts }), advance: ms => { clock += ms; } };
}

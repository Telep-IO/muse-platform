const $ = selector => document.querySelector(selector);
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
let config, envelope, credentials, page = 1, imageUrl, polling;
const MAX_SIGNERS = 5;

function signerRow(index) {
  const row = document.createElement('div'); row.className = 'signer-row';
  row.innerHTML = `<strong>Signer ${index + 1}</strong>`;
  for (const [name, label, type] of [['name', 'Full name', 'text'], ['email', 'Email address', 'email']]) {
    const field = document.createElement('label'); field.className = 'field'; field.textContent = label;
    const input = document.createElement('input'); input.name = name; input.type = type; input.required = true; input.maxLength = name === 'name' ? 80 : 120;
    field.append(input); row.append(field);
  }
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Remove';
  remove.onclick = () => { row.remove(); renumber(); };
  row.append(remove);
  return row;
}
function renumber() { [...$('#signer-list').children].forEach((row, i) => row.querySelector('strong').textContent = `Signer ${i + 1}`); }
$('#signer-list').append(signerRow(0));
$('#add-signer').onclick = () => {
  if ($('#signer-list').children.length >= MAX_SIGNERS) { error(`No more than ${MAX_SIGNERS} signers per envelope.`); return; }
  $('#signer-list').append(signerRow($('#signer-list').children.length)); renumber();
};
function collectSigners() {
  return [...$('#signer-list').children].map(row => ({
    name: row.querySelector('input[name=name]').value.trim(),
    email: row.querySelector('input[name=email]').value.trim(),
  }));
}
function error(message) { $('#error').textContent = message; $('#error').hidden = false; $('#error').focus(); }
function clearError() { $('#error').hidden = true; }
async function request(path, options = {}) {
  const headers = { ...(credentials ? { Authorization: `Bearer ${credentials.token}` } : {}), ...options.headers };
  const response = await fetch(`/api${path}`, { ...options, headers });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'The request failed. Please try again.'); }
  return response;
}
function step(name) {
  for (const value of ['document', 'signers', 'review', 'status']) $(`#${value}-step`).hidden = value !== name;
  $('#envelope-form').hidden = ['review', 'status'].includes(name);
  const current = { document: 1, signers: 2, review: 3, status: 3 }[name];
  for (let n = 1; n <= 3; n++) { if (n === current) $(`#step-${n}`).setAttribute('aria-current', 'step'); else $(`#step-${n}`).removeAttribute('aria-current'); }
}
async function preview() {
  $('#page-label').textContent = `Page ${page} of ${envelope.pages}`;
  $('#previous-page').disabled = page === 1; $('#next-page').disabled = page === envelope.pages;
  const response = await request(`/envelopes/${envelope.id}/pages/${page}`);
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = URL.createObjectURL(await response.blob()); $('#preview').src = imageUrl;
  $('#preview').alt = `Document preview, page ${page} of ${envelope.pages}`;
}
async function review() {
  step('review');
  $('#price').textContent = money(envelope.amount);
  $('#price-description').textContent = `${envelope.signers.length} signer${envelope.signers.length === 1 ? '' : 's'}, everything included.`;
  $('#review-signers').replaceChildren();
  envelope.signers.forEach((s, i) => {
    const item = document.createElement('div');
    const h = document.createElement('h3'); h.textContent = `${i + 1}. ${s.name}`;
    const p = document.createElement('p'); p.textContent = s.email; item.append(h, p);
    $('#review-signers').append(item);
  });
  $('#confirmed').checked = false; $('#pay').disabled = true;
  $('#confirmation-text').textContent = envelope.confirmation;
  $('#review-terms').href = `/policies/terms/${envelope.terms_version}`;
  $('#review-privacy').href = `/policies/privacy/${envelope.privacy_version}`;
  $('#pay').textContent = config.mode === 'demo' ? 'Simulate payment & sending' : `Continue to pay ${money(envelope.amount)}`;
  if (config.mode === 'demo') $('#payment-note').textContent = 'Demo only. No payment will be collected and no signature request will be sent.';
  page = 1; await preview();
}
const STATUS_COPY = {
  draft: ['Draft', 'Not yet submitted for review.'], checkout: ['Checkout', 'Payment is being arranged.'],
  paid: ['Paid', 'Payment received. Preparing to send for signing.'], sending: ['Sending', 'Submitting to the signing provider.'],
  sent: ['Sent for signing', 'Signers have been notified. Waiting for signatures.'],
  signed: ['Fully signed', 'Every signer has signed.'], declined: ['Declined', 'A signer declined. A refund has been queued.'],
  expired: ['Expired', 'This draft expired before payment.'], needs_review: ['Needs review', 'Something needs a human look before proceeding.'],
  refund_pending: ['Refund pending', 'A refund is being processed.'], refunded: ['Refunded', 'The payment was refunded.'],
};
async function showStatus() {
  step('status');
  const [title, message] = STATUS_COPY[envelope.state] || [envelope.state, ''];
  $('#status-title').textContent = title; $('#status-message').textContent = message;
  $('#signer-status').replaceChildren();
  for (const s of envelope.signers) {
    const li = document.createElement('li');
    const mark = s.status === 'signed' ? '✓' : s.status === 'declined' ? '✗' : '…';
    li.textContent = `${mark} ${s.name} — ${s.email} (${s.status})`;
    $('#signer-status').append(li);
  }
}
async function poll() {
  clearInterval(polling);
  const terminal = ['signed', 'declined', 'refunded', 'expired', 'needs_review'];
  polling = setInterval(async () => {
    try { envelope = await (await request(`/envelopes/${envelope.id}`)).json(); await showStatus(); if (terminal.includes(envelope.state)) clearInterval(polling); }
    catch { /* keep polling; errors surface on manual refresh */ }
  }, 5000);
}
async function boot() {
  config = await (await fetch('/api/config')).json();
  if (config.mode !== 'live') { const b = $('#mode-banner'); b.hidden = false; b.textContent = `Demo mode — no real payment or signature requests.`; }
  $('#tax-note').hidden = !config.automaticTax;
  const hash = location.hash.match(/^#envelope=([a-f0-9-]{36})\.([A-Za-z0-9_-]+)$/);
  if (hash) { credentials = { id: hash[1], token: hash[2] }; await openEnvelope(); }
}
async function openEnvelope() {
  try { envelope = await (await request(`/envelopes/${credentials.id}`)).json(); await showStatus(); poll(); }
  catch (e) { error(e.message); }
}
$('#to-signers').onclick = () => { clearError(); const f = $('#document'); if (!f.files[0]) { error('Choose a PDF first.'); return; } step('signers'); };
$('#back-document').onclick = () => step('document');
$('#envelope-form').addEventListener('submit', async e => {
  e.preventDefault(); clearError();
  const signers = collectSigners();
  if (!signers.every(s => s.name && s.email)) { error('Every signer needs a name and an email address.'); return; }
  $('#loading').hidden = false;
  try {
    const form = new FormData();
    form.set('document', $('#document').files[0]);
    form.set('signers', JSON.stringify(signers));
    const response = await fetch('/api/envelopes', { method: 'POST', body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'The request failed.');
    credentials = { id: body.id, token: body.token };
    history.replaceState(null, '', `#envelope=${body.id}.${body.token}`);
    envelope = body; await review();
  } catch (err) { error(err.message); } finally { $('#loading').hidden = true; }
});
$('#previous-page').onclick = () => { if (page > 1) { page--; preview(); } };
$('#next-page').onclick = () => { if (page < envelope.pages) { page++; preview(); } };
$('#download').onclick = async () => {
  const response = await request(`/envelopes/${envelope.id}/document`);
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a'); a.href = url; a.download = 'signsend-document.pdf'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
$('#confirmed').onchange = e => { $('#pay').disabled = !e.target.checked; };
$('#start-over').onclick = () => { history.replaceState(null, '', '/'); location.reload(); };
$('#pay').onclick = async () => {
  clearError(); $('#pay').disabled = true;
  try {
    const body = await (await request(`/envelopes/${envelope.id}/checkout`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true, review_hash: envelope.review_hash, terms_version: envelope.terms_version, privacy_version: envelope.privacy_version }) })).json();
    if (config.mode === 'demo') { envelope = await (await request(`/envelopes/${envelope.id}`)).json(); await showStatus(); poll(); }
    else location.href = body.url;
  } catch (err) { error(err.message); $('#pay').disabled = false; }
};
$('#copy-link').onclick = async () => {
  try { await navigator.clipboard.writeText(location.href); $('#copy-status').textContent = 'Link copied.'; }
  catch { $('#copy-status').textContent = 'Copy the URL from your address bar.'; }
};
boot().catch(e => error(e.message));

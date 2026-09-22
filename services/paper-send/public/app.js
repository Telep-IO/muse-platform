const $ = selector => document.querySelector(selector);
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
let config, order, credentials, page = 1, imageUrl, polling;
const fields = [
  ['name', 'Full name or organization', 'name', 40], ['address_line1', 'Street address', 'address-line1', 64],
  ['address_line2', 'Apartment / suite (optional)', 'address-line2', 64], ['address_city', 'City', 'address-level2', 40],
  ['address_state', 'State (2 letters)', 'address-level1', 2], ['address_zip', 'ZIP code', 'postal-code', 10],
];
for (const side of ['recipient', 'sender']) {
  for (const [name, title, autocomplete, max] of fields) {
    const label = document.createElement('label'); label.className = 'field'; label.textContent = title;
    const input = document.createElement('input'); input.name = `${side}.${name}`; input.id = `${side}-${name}`;
    input.autocomplete = `section-${side} ${autocomplete}`; input.maxLength = max; input.required = name !== 'address_line2';
    if (name === 'address_state') input.pattern = '[A-Za-z]{2}';
    if (name === 'address_zip') { input.pattern = '[0-9]{5}(-[0-9]{4})?'; input.inputMode = 'numeric'; }
    label.append(input); $(`#${side}-fields`).append(label);
  }
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
  for (const value of ['document', 'addresses', 'review', 'status']) $(`#${value}-step`).hidden = value !== name;
  $('#letter-form').hidden = ['review', 'status'].includes(name);
  const current = { document: 1, addresses: 2, review: 3, status: 3 }[name];
  for (let n = 1; n <= 3; n++) { if (n === current) $(`#step-${n}`).setAttribute('aria-current', 'step'); else $(`#step-${n}`).removeAttribute('aria-current'); }
}
function updatePrice() {
  $('#price').textContent = money(order?.amount ?? 499);
  $('#price-description').textContent = order ? `${order.pages} document page${order.pages === 1 ? '' : 's'}, everything included.` : 'First page, everything included.';
  $('#extra-line').hidden = !order || order.pages === 1;
  if (order) $('#extra-price').textContent = money(order.amount - 499);
}
function addressText(address) { return [address.name, address.address_line1, address.address_line2, `${address.address_city}, ${address.address_state} ${address.address_zip}`].filter(Boolean).join('\n'); }
async function preview() {
  $('#page-label').textContent = `Page ${page} of ${order.pages}`;
  $('#previous-page').disabled = page === 1; $('#next-page').disabled = page === order.pages;
  const response = await request(`/orders/${order.id}/pages/${page}`);
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = URL.createObjectURL(await response.blob()); $('#preview').src = imageUrl;
  $('#preview').alt = `Print preview, document page ${page} of ${order.pages}`;
}
async function review() {
  step('review'); updatePrice(); $('#review-addresses').replaceChildren();
  for (const [title, address] of [['Deliver to', order.recipient], ['Return address', order.sender]]) {
    const wrapper = document.createElement('div'), heading = document.createElement('h3'), text = document.createElement('p');
    heading.textContent = title; text.textContent = addressText(address); wrapper.append(heading, text); $('#review-addresses').append(wrapper);
  }
  $('#confirmed').checked = false; $('#pay').disabled = true;
  $('#confirmation-text').textContent = order.confirmation;
  $('#review-terms').href = `/policies/terms/${order.terms_version}`;
  $('#review-privacy').href = `/policies/privacy/${order.privacy_version}`;
  $('#pay').textContent = config.mode === 'demo' ? 'Simulate payment & mailing' : `Continue to pay ${money(order.amount)}`;
  if (config.mode === 'demo') $('#payment-note').textContent = 'Demo only. No payment will be collected and no letter will be mailed.';
  page = 1; await preview();
}
const messages = {
  paid: ['Payment received.', 'Your letter is queued for our printing partner. You can close this page and return using your private link.'],
  sending: ['Preparing your mailing.', 'We’re confirming your order with the printer. Please don’t place a duplicate order.'],
  submitted: ['Your letter is with the printer.', 'Your order was accepted for printing and mailing. This confirms submission, not delivery.'],
  refund_pending: ['Your refund is being processed.', 'The printer could not accept your letter. We are returning your payment.'],
  refunded: ['Your payment has been refunded.', 'The printer could not accept your letter. The refund has been issued; your bank may take several business days to post it.'],
  needs_review: ['We’re checking your order.', 'A payment or printer response needs review. Please contact support with your order reference and do not submit the same letter again.'],
  expired: ['This order has expired.', 'No new payment will be taken. Start a new letter when you’re ready.'],
};
function showStatus() {
  step('status'); updatePrice();
  let [title, message] = messages[order.state] || ['Checking your order.', 'Please wait while we confirm its status.'];
  if (order.state === 'submitted' && config.mode !== 'live') {
    title = config.mode === 'demo' ? 'Your demo letter is complete.' : 'Your test letter was accepted.';
    message = 'No real letter was mailed and no real payment was collected. The end-to-end flow is ready to test again.';
  }
  $('#status-title').textContent = title; $('#status-message').textContent = message;
  $('#status-details').replaceChildren();
  const entries = [['Order reference', order.id], ['Letter price', money(order.amount)]];
  if (order.expected_delivery && config.mode === 'live') entries.push(['Estimated delivery (not guaranteed)', order.expected_delivery]);
  for (const [key, value] of entries) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = key; dd.textContent = value; $('#status-details').append(dt, dd); }
}
function readLink() {
  const match = location.hash.match(/^#order=([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/);
  return match ? { id: match[1], token: match[2] } : null;
}
async function loadOrder() {
  clearInterval(polling); credentials = readLink();
  if (!credentials) { order = null; step('document'); updatePrice(); return; }
  try {
    order = await (await request(`/orders/${credentials.id}`)).json();
    if (['draft', 'checkout'].includes(order.state)) await review(); else showStatus();
    polling = setInterval(async () => {
      if (!['paid', 'sending', 'refund_pending', 'checkout'].includes(order.state)) return;
      try {
        const refreshed = await (await request(`/orders/${credentials.id}`)).json();
        const changed = order.state !== refreshed.state; order = refreshed;
        if (changed && !['draft', 'checkout'].includes(order.state)) showStatus();
      } catch { /* Keep last known status; retry while this page remains open. */ }
    }, 5000);
  } catch (e) { error(e.message); }
}
$('#document').addEventListener('change', () => {
  const file = $('#document').files[0];
  $('#file-title').textContent = file?.name || 'Choose a PDF to mail';
  $('#file-detail').textContent = file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · PDF selected` : '1–5 pages · up to 10 MB';
});
$('#to-addresses').addEventListener('click', () => {
  clearError(); const file = $('#document').files[0];
  if (!file) return error('Choose a PDF first.');
  if (file.size > config.maxBytes) return error('PDF must be 10 MB or smaller.');
  step('addresses'); $('#recipient-name').focus();
});
$('#back-document').addEventListener('click', () => { clearError(); step('document'); });
$('#letter-form').addEventListener('submit', async event => {
  event.preventDefault(); clearError(); $('#prepare').disabled = true; $('#loading').hidden = false;
  const data = new FormData($('#letter-form')), addresses = {};
  for (const side of ['sender', 'recipient']) addresses[side] = Object.fromEntries(fields.map(([name]) => [name, data.get(`${side}.${name}`)]));
  const body = new FormData(); body.set('document', $('#document').files[0]); body.set('addresses', JSON.stringify(addresses));
  try {
    const created = await (await request('/orders', { method: 'POST', body })).json();
    location.hash = `order=${created.id}.${created.token}`;
    $('.flow').scrollIntoView({ block: 'start' });
  } catch (e) { error(e.message); } finally { $('#prepare').disabled = false; $('#loading').hidden = true; }
});
$('#previous-page').addEventListener('click', () => { if (page > 1) { page--; preview().catch(e => error(e.message)); } });
$('#next-page').addEventListener('click', () => { if (page < order.pages) { page++; preview().catch(e => error(e.message)); } });
$('#confirmed').addEventListener('change', () => { $('#pay').disabled = !$('#confirmed').checked; });
$('#start-over').addEventListener('click', () => { location.hash = ''; clearError(); });
$('#pay').addEventListener('click', async () => {
  clearError(); $('#pay').disabled = true;
  try {
    const result = await (await request(`/orders/${order.id}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: $('#confirmed').checked,
      review_hash: order.review_hash, terms_version: order.terms_version, privacy_version: order.privacy_version }) })).json();
    if (config.mode === 'demo') await loadOrder(); else location.assign(result.url);
  } catch (e) { error(e.message); } finally { $('#pay').disabled = !$('#confirmed').checked; }
});
$('#download').addEventListener('click', async () => {
  try { const response = await request(`/orders/${order.id}/document`), url = URL.createObjectURL(await response.blob());
    const a = document.createElement('a'); a.href = url; a.download = 'papersend-print.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) { error(e.message); }
});
$('#copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); $('#copy-status').textContent = 'Private order link copied.'; }
  catch { $('#copy-status').textContent = 'Copy the full address from your browser to save this order.'; }
});
window.addEventListener('hashchange', loadOrder);
try {
  config = await (await request('/config')).json();
  if (config.mode !== 'live') { $('#mode-banner').hidden = false; $('#mode-banner').textContent = `${config.mode === 'demo' ? 'Demo' : 'Test'} mode: try the full flow. No real charges or mail.`; }
  if (config.supportEmail) { $('#support-link').hidden = false; $('#support-link').href = `mailto:${config.supportEmail}`; }
  $('#tax-note').hidden = !config.automaticTax;
  await loadOrder();
} catch (e) { $('#to-addresses').disabled = true; error(e.message); }

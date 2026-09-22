// Thin review-page client. The agent-facing contract is docs/connector.md;
// this page is the human side: check, draft, review, pay, watch status.
const $ = id => document.getElementById(id);
const money = cents => `$${(cents / 100).toFixed(2)}`;
let current = null; // {id, token, review}

function parseHash() {
  const m = /^#domain=([^.]+)\.(.+)$/.exec(location.hash || '');
  return m ? { id: m[1], token: m[2] } : null;
}
async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}
function row(dl, term, value) {
  const dt = document.createElement('dt'); dt.textContent = term;
  const dd = document.createElement('dd'); dd.textContent = value;
  dl.append(dt, dd);
}

$('check-form').addEventListener('submit', async e => {
  e.preventDefault();
  const domain = $('check-domain').value.trim();
  const box = $('check-result');
  box.hidden = false; box.textContent = 'Checking…';
  try {
    const r = await api('/api/domains/check', { method: 'POST', body: { domain } });
    box.innerHTML = '';
    box.append(document.createTextNode(
      r.available
        ? `${r.domain} is available — ${money(r.price_per_year_cents)}/year, WHOIS privacy included.`
        : `${r.domain} is not available. Try another name.`));
    if (r.available) {
      $('draft-section').hidden = false;
      $('draft-domain').value = r.domain;
      $('draft-section').scrollIntoView();
    } else {
      $('draft-section').hidden = true;
    }
  } catch (err) { box.textContent = err.message; }
});

$('draft-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const r = await api('/api/domains', { method: 'POST', body: {
      domain: $('draft-domain').value,
      years: Number($('draft-years').value),
      registrant: { name: $('draft-name').value, email: $('draft-email').value, org: $('draft-org').value },
    }});
    location.hash = `#domain=${r.id}.${r.token}`;
  } catch (err) { alert(err.message); }
});

async function loadReview() {
  const link = parseHash();
  if (!link) return;
  $('check-section').hidden = true; $('draft-section').hidden = true;
  try {
    const r = await api(`/api/domains/${link.id}`, { token: link.token });
    current = { ...link, review: r };
    $('confirmation-text').textContent = r.confirmation;
    if (r.state === 'draft' || r.state === 'checkout') {
      $('review-section').hidden = false; $('status-section').hidden = true;
      const dl = $('review-details'); dl.innerHTML = '';
      row(dl, 'Domain', r.domain);
      row(dl, 'Term', `${r.years} year${r.years > 1 ? 's' : ''}`);
      row(dl, 'Price', `${money(r.price_per_year_cents)}/year × ${r.years} = ${money(r.amount)}`);
      row(dl, 'WHOIS privacy', 'Included free');
      row(dl, 'Registrant', `${r.registrant.name} <${r.registrant.email}>${r.registrant.org ? ` · ${r.registrant.org}` : ''}`);
      if (r.mode !== 'live') row(dl, 'Mode', r.mode);
    } else {
      showStatus(r);
    }
  } catch (err) {
    document.querySelector('main').insertAdjacentHTML('beforeend', `<p class="error">${err.message}</p>`);
  }
}

function showStatus(r) {
  $('review-section').hidden = true;
  const s = $('status-section'); s.hidden = false;
  const dl = $('status-details'); dl.innerHTML = '';
  row(dl, 'Domain', r.domain);
  row(dl, 'State', r.state);
  if (r.registered_at) row(dl, 'Registered', new Date(r.registered_at).toLocaleString());
  if (r.expires_at) row(dl, 'Expires', new Date(r.expires_at).toLocaleDateString());
  if (r.error) row(dl, 'Note', r.error);
  if (r.mode !== 'live') row(dl, 'Mode', r.mode);
}

$('pay-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errBox = $('pay-error'); errBox.hidden = true;
  try {
    const r = current.review;
    const res = await api(`/api/domains/${current.id}/checkout`, { method: 'POST', token: current.token, body: {
      confirmed: true, review_hash: r.review_hash, terms_version: r.terms_version, privacy_version: r.privacy_version,
    }});
    if (res.url.startsWith('https://checkout.stripe.com/')) location.href = res.url;
    else { const updated = await api(`/api/domains/${current.id}`, { token: current.token }); showStatus(updated); }
  } catch (err) { errBox.hidden = false; errBox.textContent = err.message; }
});

addEventListener('hashchange', () => location.reload());
void loadReview();

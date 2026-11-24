// Portal page script. All data comes from the Worker's /api routes; nothing is embedded in the page.
let D = null, ME = null, OPT = null, FAMS = [], FAMID = null, REV = null;
const $ = (id) => document.getElementById(id);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const usd = (k) => { const v = Math.round(k * 1000); return v === 0 ? '–' : (v < 0 ? '($' + (-v).toLocaleString('en-US') + ')' : '$' + v.toLocaleString('en-US')); };
const usd0 = (k) => '$' + Math.round(k * 1000).toLocaleString('en-US');
const short = (k) => '$' + (k / 1000).toFixed(1) + 'M';
const pct = (x) => (x * 100).toFixed(1) + '%';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const when = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const CLASSES = [['cash', 'Cash & equivalents', '#7DA8BA'], ['equity', 'Public equity', '#14213D'], ['fixed', 'Fixed income', '#6F8A7A'], ['private', 'Private funds', '#6D6388'], ['realestate', 'Real estate', '#B66A3C'], ['other', 'Education, charitable, other', '#CDBFA8']];
const ENTCOL = ['#14213D', '#6F8A7A', '#7DA8BA'];
let mi = 0, docCat = 'All';

/*REPORTS*/

// ---- talking to the Worker
async function api(path, payload) {
  const opt = payload === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-portal': '1' }, body: JSON.stringify(payload) };
  const res = await fetch(path, Object.assign({ credentials: 'same-origin' }, opt));
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok) throw new Error((data && data.error) || 'Something went wrong (' + res.status + '). Reload the page and try again.');
  return data;
}

// ---- classifications
const FIELD_LABEL = { bucket: 'Bucket', cls: 'Asset class', liq: 'Liquidity', inv: 'Investment type' };
const FIELD_ORDER = ['bucket', 'cls', 'liq', 'inv'];
let ACC = [], reqs = [], edits = {}, clsEnt = 'All', picked = new Set();
const isClient = () => ME && ME.role === 'client';
const changesOf = () => Object.keys(edits).flatMap((i) => Object.keys(edits[i]).map((f) => ({ i: +i, account: ACC[i].name, accountId: ACC[i].id, f, from: ACC[i].cur[f], to: edits[i][f] })));
const chgHtml = (c) => '<span class="chg"><b>' + esc(c.account) + '</b>: ' + FIELD_LABEL[c.f].toLowerCase() + ' from ' + esc(c.from) + ' to <b>' + esc(c.to) + '</b></span>';
const chgText = (c) => c.account + ': ' + FIELD_LABEL[c.f].toLowerCase() + ' from ' + c.from + ' to ' + c.to;
const stPill = (r) => r.st === 'wait' ? '<span class="pill wait">Awaiting review</span>' : (r.st === 'ok' ? '<span class="pill ok">Approved</span>' : '<span class="pill no">Declined</span>');

function renderCls() {
  const ents = ['All'].concat(D.entities.map((e) => e.name));
  $('clsfilters').innerHTML = ents.map((n) => '<button type="button" class="chip" aria-pressed="' + (n === clsEnt) + '" data-ent="' + esc(n) + '">' + esc(n) + '</button>').join('');
  const entName = (id) => D.entities.find((e) => e.id === id).name;
  const waiting = new Set(reqs.filter((r) => r.st === 'wait').map((r) => r.accountId));
  const rows = ACC.filter((a) => clsEnt === 'All' || entName(a.ent) === clsEnt), ro = !isClient();
  $('clsro').hidden = !ro;
  $('cls').innerHTML = '<thead><tr><th scope="col">Account</th><th scope="col" style="text-align:left">Entity</th><th scope="col">Balance</th>' + FIELD_ORDER.map((f) => '<th scope="col" style="text-align:left">' + FIELD_LABEL[f] + '</th>').join('') + '<th scope="col" style="text-align:left">' + (ro ? 'Client note' : 'Your note') + '</th><th scope="col" style="text-align:left">Status</th></tr></thead><tbody>' +
    rows.map((a) => '<tr><th scope="row">' + esc(a.name) + '</th><td class="l">' + esc(entName(a.ent)) + '</td><td>' + usd(a.value) + '</td>' +
      FIELD_ORDER.map((f) => { const val = (edits[a.i] && edits[a.i][f]) || a.cur[f]; return '<td class="l"><select id="c-' + a.i + '-' + f + '" data-i="' + a.i + '" data-f="' + f + '" aria-label="' + FIELD_LABEL[f] + ' for ' + esc(a.name) + '"' + (ro || waiting.has(a.id) ? ' disabled' : '') + (val !== a.cur[f] ? ' class="changed"' : '') + '>' + OPT[f].map((o) => '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></td>'; }).join('') +
      '<td class="l"><input type="text" id="n-' + a.i + '" data-note="' + a.i + '" maxlength="500" value="' + esc(a.note) + '"' + (ro ? ' disabled' : ' placeholder="Add a note"') + ' aria-label="Note for ' + esc(a.name) + '"></td>' +
      '<td class="l">' + (waiting.has(a.id) ? '<span class="pill wait">Awaiting review</span>' : (edits[a.i] ? '<span class="pill">Not sent</span>' : '')) + '</td></tr>').join('') + '</tbody>';
  const ch = changesOf();
  $('sendbar').hidden = ch.length === 0;
  $('sendcount').textContent = ch.length + (ch.length === 1 ? ' change' : ' changes') + ' not yet sent';
  $('sendlist').innerHTML = ch.map((c) => '<li>' + chgHtml(c) + '</li>').join('');
  const mine = reqs.slice().reverse();
  $('pendingtitle').textContent = ro ? 'This family’s requests' : 'Your requests';
  $('pending').innerHTML = mine.length ? mine.map((p) => '<li class="mv"><span>' + chgHtml(p) + '<br><span class="foot">Sent ' + esc(when(p.when)) + (p.note ? ' &middot; ' + esc(p.note) : '') + (p.st !== 'wait' ? '<br>Decided ' + esc(when(p.decided)) + (p.why ? ' &middot; Alethes: ' + esc(p.why) : '') : '') + '</span></span>' + stPill(p) + '</li>').join('') : '<li>No requests have been sent.</li>';
}

// ---- staff review
function renderReview() {
  if (!REV) return;
  const q = REV.requests.filter((r) => r.st === 'wait');
  [...picked].forEach((id) => { if (!q.some((r) => r.id === id)) picked.delete(id); });
  $('queue').innerHTML = '<thead><tr><th scope="col"><input type="checkbox" id="pickall" aria-label="Select all requests"' + (q.length && picked.size === q.length ? ' checked' : '') + '></th><th scope="col" style="text-align:left">Family</th><th scope="col" style="text-align:left">Requested change</th><th scope="col" style="text-align:left">Client note</th><th scope="col">Sent</th></tr></thead><tbody>' +
    (q.length ? q.map((r) => '<tr><td><input type="checkbox" id="pick-' + r.id + '" data-pick="' + r.id + '"' + (picked.has(r.id) ? ' checked' : '') + ' aria-label="Select: ' + esc(chgText(r)) + '"></td><td class="l">' + esc(r.familyName) + '</td><td class="l">' + chgHtml(r) + '</td><td class="l">' + esc(r.note || '–') + '</td><td>' + esc(when(r.when)) + '</td></tr>').join('') : '<tr><td colspan="5" class="l">Nothing is waiting.</td></tr>') + '</tbody>';
  $('approvebtn').disabled = $('declinebtn').disabled = picked.size === 0;
  $('pickcount').textContent = q.length ? picked.size + ' of ' + q.length + ' selected' : '';
  $('notelog').innerHTML = REV.notes.length ? REV.notes.map((n) => '<li><b style="color:var(--ink)">' + esc(n.familyName) + ', ' + esc(n.account) + '</b><br>' + esc(n.text || '(note cleared)') + '<br><span class="foot">' + esc(n.by) + ' &middot; ' + esc(when(n.when)) + '</span></li>').join('') : '<li>No client notes yet.</li>';
  const done = REV.requests.filter((r) => r.st !== 'wait').slice().sort((a, b) => (a.decided < b.decided ? 1 : -1));
  $('history').innerHTML = '<thead><tr><th scope="col">Decided</th><th scope="col" style="text-align:left">Family</th><th scope="col" style="text-align:left">Change</th><th scope="col" style="text-align:left">Requested by</th><th scope="col" style="text-align:left">Client’s reason</th><th scope="col" style="text-align:left">Decision</th><th scope="col" style="text-align:left">Decided by</th><th scope="col" style="text-align:left">Alethes reason</th></tr></thead><tbody>' +
    (done.length ? done.map((r) => '<tr><th scope="row">' + esc(when(r.decided)) + '</th><td class="l">' + esc(r.familyName) + '</td><td class="l w">' + chgHtml(r) + '</td><td class="l">' + esc(r.by0) + '<br><span class="foot">' + esc(when(r.when)) + '</span></td><td class="l w">' + esc(r.note || '–') + '</td><td class="l">' + stPill(r) + '</td><td class="l">' + esc(r.by) + '</td><td class="l w">' + esc(r.why || '–') + '</td></tr>').join('') : '<tr><td colspan="8" class="l">No decisions yet.</td></tr>') + '</tbody>';
}

let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 3600); }

// ---- loading and routing
function hydrate(p) {
  D = p.data; ME = p.me; OPT = p.options; FAMS = p.families || []; FAMID = p.familyId; reqs = p.requests;
  ACC = D.accounts.map((a, i) => ({ i, id: a.id, name: a.name, ent: a.ent, value: a.value, note: a.note || '', cur: { bucket: a.bucket, cls: a.cls, liq: a.liq, inv: a.inv } }));
  edits = {};
  if (mi >= D.months.length) mi = 0;
}
function paintAll() {
  $('email').textContent = ME.email;
  $('fam').textContent = D.family;
  $('month').innerHTML = D.months.map((m, i) => '<option value="' + i + '"' + (i === mi ? ' selected' : '') + '>' + esc(m.label) + '</option>').join('');
  const staff = ME.role === 'staff';
  $('switch').hidden = !staff; $('famwrap').hidden = !staff;
  if (staff) $('family').innerHTML = FAMS.map((f) => '<option value="' + esc(f.id) + '"' + (f.id === FAMID ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('');
  render(); renderFunds(); renderDocs(); renderCls(); renderReview(); route();
}
async function load(familyId) {
  const p = await api('/api/portal' + (familyId ? '?family=' + encodeURIComponent(familyId) : ''));
  hydrate(p);
  if (ME.role === 'staff') REV = await api('/api/review');
  paintAll();
}
const VIEWS = ['overview', 'estate-summary', 'allocation', 'private-investments', 'documents', 'classifications', 'review'];
function route() {
  let v = (location.hash || '').replace('#', '');
  if (!VIEWS.includes(v) || (v === 'review' && !(ME && ME.role === 'staff'))) v = 'overview';
  VIEWS.forEach((id) => $('v-' + id).classList.toggle('on', id === v));
  document.body.classList.toggle('staff', v === 'review');
  $('sw-staff').toggleAttribute('aria-current', v === 'review'); $('sw-client').toggleAttribute('aria-current', v !== 'review');
  document.querySelectorAll('.tabs a').forEach((a) => { if (a.getAttribute('href') === '#' + v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
async function act(fn) { try { await fn(); } catch (e) { toast(e.message); } }

$('month').addEventListener('change', (e) => { mi = +e.target.value; render(); });
$('family').addEventListener('change', (e) => act(() => load(e.target.value)));
document.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip'), doc = e.target.closest('.docbtn[data-doc]');
  if (chip && chip.dataset.cat) { docCat = chip.dataset.cat; renderDocs(); }
  if (chip && chip.dataset.ent) { clsEnt = chip.dataset.ent; renderCls(); }
  if (doc) toast('Documents are not loaded in this test build.');
  if (e.target.id === 'discardbtn') { edits = {}; renderCls(); }
  if (e.target.id === 'sendbtn') act(async () => {
    const ch = changesOf();
    await api('/api/requests', { changes: ch.map((c) => ({ accountId: c.accountId, field: c.f, to: c.to })), note: $('sendnote').value });
    $('sendnote').value = '';
    await load();
    toast(ch.length + (ch.length === 1 ? ' request' : ' requests') + ' sent. Your reports change after Alethes approves.');
  });
  const decision = e.target.id === 'approvebtn' ? 'approve' : (e.target.id === 'declinebtn' ? 'decline' : null);
  if (decision) act(async () => {
    const res = await api('/api/review/decide', { ids: [...picked], decision, reason: $('decnote').value });
    $('decnote').value = ''; picked.clear();
    await load(FAMID);
    toast(res.done.length + (res.done.length === 1 ? ' request ' : ' requests ') + (decision === 'approve' ? 'approved and logged.' : 'declined and logged.') + (res.skipped.length ? ' ' + res.skipped.length + ' could not be applied: ' + res.skipped[0].why : ''));
  });
});
document.addEventListener('change', (e) => {
  const s = e.target.closest('#cls select'), n = e.target.closest('[data-note]'), p = e.target.closest('[data-pick]');
  if (s) {
    const i = +s.dataset.i, f = s.dataset.f;
    edits[i] = edits[i] || {};
    if (s.value === ACC[i].cur[f]) { delete edits[i][f]; if (!Object.keys(edits[i]).length) delete edits[i]; } else edits[i][f] = s.value;
    renderCls();
  }
  if (n) act(async () => { const a = ACC[+n.dataset.note]; await api('/api/notes', { accountId: a.id, text: n.value }); a.note = n.value.trim(); toast('Note saved. Alethes can see it now.'); });
  if (p) { const id = +p.dataset.pick; if (p.checked) picked.add(id); else picked.delete(id); renderReview(); }
  if (e.target.id === 'pickall') { picked = new Set(e.target.checked ? REV.requests.filter((r) => r.st === 'wait').map((r) => r.id) : []); renderReview(); }
});
window.addEventListener('hashchange', route);
load().catch((e) => { $('loaderr').hidden = false; $('loaderr').textContent = e.message; });

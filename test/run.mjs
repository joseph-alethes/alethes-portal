// Local test: a stand-in for Cloudflare Access signs tokens; the Worker must enforce sign-in and family separation.
import http from 'node:http';
import fs from 'node:fs';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const TEAM = 'http://127.0.0.1:8799', AUD = 'test-aud', BASE = 'http://127.0.0.1:8787';
const good = await generateKeyPair('RS256'), rogue = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })); }).listen(8799);
const token = (email, o = {}) => new SignJWT({ email, type: 'app' }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(o.iss || TEAM).setAudience(o.aud || AUD).setIssuedAt().setExpirationTime(o.exp || '1h').sign(o.key || good.privateKey);
const T = { harbor: await token('harbor.test@example.com'), whitlock: await token('Whitlock.Test@example.com'), staff: await token('staff.test@example.com'), stranger: await token('nobody@example.com') };
fs.writeFileSync('test/tokens.json', JSON.stringify(T));
const call = async (path, tok, payload, extra = {}) => {
  const headers = { ...(tok ? { 'cf-access-jwt-assertion': tok } : {}), ...(payload !== undefined ? { 'content-type': 'application/json', 'x-portal': '1' } : {}), ...extra };
  for (const k of Object.keys(headers)) if (headers[k] === null) delete headers[k];
  const res = await fetch(BASE + path, { method: payload !== undefined ? 'POST' : 'GET', headers, body: payload !== undefined ? JSON.stringify(payload) : undefined });
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch {}
  return { status: res.status, text, data };
};
let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, info); } };
for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/'); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }

// 1. sign-in is required for pages and data
ok('page without token', (await call('/', null)).status === 403);
ok('data without token', (await call('/api/portal', null)).status === 403);
ok('token from another signer', (await call('/api/portal', await token('harbor.test@example.com', { key: rogue.privateKey }))).status === 403);
ok('token for another application', (await call('/api/portal', await token('harbor.test@example.com', { aud: 'other-app' }))).status === 403);
ok('token from another team', (await call('/api/portal', await token('harbor.test@example.com', { iss: 'http://127.0.0.1:1' }))).status === 403);
ok('expired token', (await call('/api/portal', await token('harbor.test@example.com', { exp: Math.floor(Date.now() / 1000) - 3600 }))).status === 403);
ok('garbage token', (await call('/api/portal', 'abc.def.ghi')).status === 403);
ok('unknown email, data', (await call('/api/portal', T.stranger)).status === 403);
const strangerPage = await call('/', T.stranger);
ok('unknown email, page', strangerPage.status === 403 && strangerPage.text.includes("isn't set up"));
ok('signed-in page loads', (await call('/', T.harbor)).status === 200 && (await call('/app.js', T.harbor)).status === 200);

// 2. each family sees only itself
const h = await call('/api/portal', T.harbor), w = await call('/api/portal', T.whitlock);
ok('harbor gets harbor', h.status === 200 && h.data.data.family === 'Harbor family' && h.data.me.role === 'client');
ok('harbor sees nothing of whitlock', !/Whitlock|Aspen Row|Tern Island|Redfern|Ranch property/.test(h.text));
ok('whitlock gets whitlock (email case ignored)', w.status === 200 && w.data.data.family === 'Whitlock family');
ok('whitlock sees nothing of harbor', !/Harbor|Cedar Ridge|North Sound|Northgate|Lake house/.test(w.text));
const sneaky = await call('/api/portal?family=whitlock', T.harbor);
ok('client cannot switch family by address', sneaky.data.data.family === 'Harbor family' && !/Whitlock/.test(sneaky.text));
ok('client gets no family list', h.data.families === undefined);
const nw = (p) => p.data.data.months[0].rows.reduce((s, r) => s + r.v.reduce((a, b) => a + b, 0), 0);
ok('harbor net worth ties', nw(h) === 40175, nw(h));
const hAcct = Object.fromEntries(h.data.data.accounts.map((a) => [a.name, a])), wAcct = Object.fromEntries(w.data.data.accounts.map((a) => [a.name, a]));

// 3. clients cannot reach staff routes
ok('client blocked from review list', (await call('/api/review', T.harbor)).status === 403);
ok('client blocked from deciding', (await call('/api/review/decide', T.harbor, { ids: [1], decision: 'approve' })).status === 403);

// 4. requests: only own accounts, only allowed values, only from the portal page
const lake = hAcct['Lake house'], ranch = wAcct['Ranch property'];
ok('cannot request on another family\'s account', (await call('/api/requests', T.harbor, { changes: [{ accountId: ranch.id, field: 'liq', to: 'Liquid' }] })).status === 400);
ok('cannot note another family\'s account', (await call('/api/notes', T.harbor, { accountId: ranch.id, text: 'x' })).status === 400);
ok('value outside the lists refused', (await call('/api/requests', T.harbor, { changes: [{ accountId: lake.id, field: 'cls', to: 'Made up class' }] })).status === 400);
ok('unknown field refused', (await call('/api/requests', T.harbor, { changes: [{ accountId: lake.id, field: 'value', to: '1' }] })).status === 400);
ok('no-op refused', (await call('/api/requests', T.harbor, { changes: [{ accountId: lake.id, field: 'liq', to: 'Illiquid' }] })).status === 400);
ok('write without portal header refused', (await call('/api/requests', T.harbor, { changes: [{ accountId: lake.id, field: 'liq', to: 'Liquid' }] }, { 'x-portal': null })).status === 403);
ok('write from another site refused', (await call('/api/requests', T.harbor, { changes: [{ accountId: lake.id, field: 'liq', to: 'Liquid' }] }, { origin: 'https://evil.example' })).status === 403);
const sent = await call('/api/requests', T.harbor, { changes: [{ accountId: lake.id, field: 'liq', to: 'Liquid' }, { accountId: hAcct['Family loan (note receivable)'].id, field: 'cls', to: 'Private equity' }], note: 'Please reclassify' });
ok('valid request accepted', sent.status === 200 && sent.data.created === 2, sent.text);
ok('second request on a waiting account refused', (await call('/api/requests', T.harbor, { changes: [{ accountId: lake.id, field: 'inv', to: 'Investment' }] })).status === 409);
ok('own note saved', (await call('/api/notes', T.harbor, { accountId: hAcct['Vehicles'].id, text: 'Sold the old truck' })).status === 200);
const h2 = await call('/api/portal', T.harbor);
ok('reports unchanged before approval', nw(h2) === 40175 && h2.data.data.accounts.find((a) => a.id === lake.id).liq === 'Illiquid');
ok('note visible to client', h2.data.data.accounts.find((a) => a.name === 'Vehicles').note === 'Sold the old truck');
ok('whitlock cannot see harbor requests', !(await call('/api/portal', T.whitlock)).text.includes('Please reclassify'));

// 5. staff: see all, pick and choose, history
ok('staff cannot file client requests', (await call('/api/requests', T.staff, { changes: [{ accountId: lake.id, field: 'liq', to: 'Liquid' }] })).status === 403);
const rv = await call('/api/review', T.staff);
ok('staff sees both families', rv.status === 200 && new Set(rv.data.requests.map((r) => r.familyName)).size === 2 && rv.data.notes.length === 1);
const waiting = rv.data.requests.filter((r) => r.st === 'wait');
const r529 = waiting.find((r) => r.account === '529 college savings plans'), rLake = waiting.find((r) => r.account === 'Lake house'), rBond = waiting.find((r) => r.account === 'Coastal bond ladder');
const ap = await call('/api/review/decide', T.staff, { ids: [r529.id], decision: 'approve', reason: 'Agreed. Owned by the trust.' });
ok('approve one of several', ap.status === 200 && ap.data.done.length === 1, ap.text);
const dc = await call('/api/review/decide', T.staff, { ids: [rBond.id], decision: 'decline', reason: 'Bonds stay fixed income.' });
ok('decline one', dc.data.done.length === 1);
ok('deciding twice is skipped', (await call('/api/review/decide', T.staff, { ids: [r529.id], decision: 'decline' })).data.skipped.length === 1);
const h3 = await call('/api/portal', T.harbor), edu = h3.data.data.months[0].rows.find((r) => r.l === 'Education accounts');
ok('approved change reaches the report', JSON.stringify(edu.v) === '[0,610,0]' && nw(h3) === 40175, JSON.stringify(edu.v));
ok('unticked request still waiting', h3.data.requests.find((r) => r.id === rLake.id).st === 'wait');
const logged = h3.data.requests.find((r) => r.id === r529.id);
ok('history records who, when, why', logged.st === 'ok' && logged.by === 'staff.test@example.com' && logged.why === 'Agreed. Owned by the trust.' && !!logged.decided && logged.by0 === 'harbor.test@example.com');
const w3 = await call('/api/portal', T.whitlock);
ok('declined change alters nothing', w3.data.data.accounts.find((a) => a.name === 'Coastal bond ladder').cls === 'Fixed income' && w3.data.requests.find((r) => r.id === rBond.id).st === 'no');
const sw = await call('/api/portal?family=whitlock', T.staff);
ok('staff can open any family', sw.data.data.family === 'Whitlock family' && sw.data.families.length === 2);
ok('bad decide input refused', (await call('/api/review/decide', T.staff, { ids: ['1'], decision: 'approve' })).status === 400 && (await call('/api/review/decide', T.staff, { ids: [1], decision: 'maybe' })).status === 400);
ok('unknown route', (await call('/api/nope', T.staff)).status === 404);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

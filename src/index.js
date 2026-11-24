// Alethes client portal Worker.
// Cloudflare Access signs every request with a token that carries the person's verified email.
// This Worker checks that token, looks the email up in the users table, and only ever returns
// the data of that user's own family. Staff can see all families and decide requests.
import { jwtVerify, createRemoteJWKSet } from 'jose';

const FIELDS = ['bucket', 'cls', 'liq', 'inv']; // also the column names in the accounts table
const OPTIONS_FIXED = { liq: ['Liquid', 'Illiquid'], inv: ['Investment', 'Non-investment'] };
const MAX_NOTE = 500;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const deny = (status, message) => json({ error: message }, status);

let jwks, jwksFor;
async function emailFromAccess(request, env) {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) return null;
  const team = env.TEAM_DOMAIN.replace(/\/+$/, '');
  if (!jwks || jwksFor !== team) { jwks = createRemoteJWKSet(new URL(team + '/cdn-cgi/access/certs')); jwksFor = team; }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: team, audience: env.POLICY_AUD });
    return typeof payload.email === 'string' && payload.email ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Changes must come from the portal page itself: JSON plus a custom header, same origin.
function isOwnWrite(request) {
  const url = new URL(request.url), origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return false;
  return (request.headers.get('content-type') || '').startsWith('application/json') && request.headers.get('x-portal') === '1';
}
async function body(request) {
  try { const b = await request.json(); return b && typeof b === 'object' ? b : null; } catch { return null; }
}

async function familyBundle(db, familyId) {
  const fam = await db.prepare('SELECT id, name, data FROM families WHERE id = ?').bind(familyId).first();
  if (!fam) return null;
  const data = JSON.parse(fam.data);
  const accounts = (await db.prepare('SELECT id, name, ent, value, bucket, cls, liq, inv, note FROM accounts WHERE family_id = ? ORDER BY pos').bind(familyId).all()).results;
  // The latest month-end is rebuilt from the accounts, so approved classification changes reach the reports.
  const latest = data.months[0];
  for (const row of latest.rows) row.v = data.entities.map((e) => accounts.filter((a) => a.cls === row.l && a.bucket === e.label).reduce((s, a) => s + a.value, 0));
  data.family = fam.name;
  data.accounts = accounts;
  const options = { bucket: data.entities.map((e) => e.label), cls: [...new Set(latest.rows.map((r) => r.l))], ...OPTIONS_FIXED };
  return { data, options, accounts };
}
const REQ_SELECT = `SELECT r.id, r.family_id AS family, f.name AS familyName, r.account_id AS accountId, a.name AS account, r.field AS f,
  r.from_value AS "from", r.to_value AS "to", r.note, r.requested_by AS by0, r.requested_at AS "when", r.status AS st,
  r.decided_at AS decided, r.decided_by AS "by", r.reason AS why
  FROM requests r JOIN accounts a ON a.id = r.account_id JOIN families f ON f.id = r.family_id`;

async function getPortal(db, user, url, env) {
  let familyId = user.family_id, families;
  if (user.role === 'staff') {
    families = (await db.prepare('SELECT id, name FROM families ORDER BY name').all()).results;
    const asked = url.searchParams.get('family');
    familyId = families.some((f) => f.id === asked) ? asked : (families[0] && families[0].id);
  }
  // A client's family always comes from the users table, never from anything the browser sends.
  if (!familyId) return deny(404, 'No family is set up for this account.');
  const bundle = await familyBundle(db, familyId);
  if (!bundle) return deny(404, 'Family not found.');
  const requests = (await db.prepare(REQ_SELECT + ' WHERE r.family_id = ? ORDER BY r.id').bind(familyId).all()).results;
  const links = user.role === 'staff' && /^https:\/\/script\.google\.com\//.test(env.TRACKER_URL || '') ? { tracker: env.TRACKER_URL } : undefined;
  return json({ me: { email: user.email, role: user.role }, links, families, familyId, data: bundle.data, options: bundle.options, requests });
}

async function postRequests(db, user, request) {
  if (user.role !== 'client') return deny(403, 'Only clients can request changes.');
  const b = await body(request);
  if (!b || !Array.isArray(b.changes) || b.changes.length < 1 || b.changes.length > 50) return deny(400, 'Send between 1 and 50 changes.');
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, MAX_NOTE) : '';
  const bundle = await familyBundle(db, user.family_id);
  if (!bundle) return deny(404, 'Family not found.');
  const waiting = new Set((await db.prepare("SELECT account_id FROM requests WHERE family_id = ? AND status = 'wait'").bind(user.family_id).all()).results.map((r) => r.account_id));
  const stmts = [], now = new Date().toISOString(), seen = new Set();
  for (const c of b.changes) {
    const acct = bundle.accounts.find((a) => a.id === c.accountId); // only this family's accounts are in the list
    if (!acct) return deny(400, 'One of the accounts is not yours to change.');
    if (!FIELDS.includes(c.field) || !bundle.options[c.field].includes(c.to)) return deny(400, 'One of the values is not an allowed choice.');
    if (acct[c.field] === c.to) return deny(400, 'One of the changes matches the current value.');
    if (waiting.has(acct.id)) return deny(409, acct.name + ' already has a request awaiting review.');
    if (seen.has(acct.id + c.field)) return deny(400, 'The same field was sent twice.');
    seen.add(acct.id + c.field);
    stmts.push(db.prepare("INSERT INTO requests (family_id, account_id, field, from_value, to_value, note, requested_by, requested_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'wait')")
      .bind(user.family_id, acct.id, c.field, acct[c.field], c.to, note, user.email, now));
  }
  await db.batch(stmts);
  return json({ ok: true, created: stmts.length });
}

async function postNote(db, user, request) {
  if (user.role !== 'client') return deny(403, 'Only clients can add notes.');
  const b = await body(request);
  if (!b || typeof b.text !== 'string' || !Number.isInteger(b.accountId)) return deny(400, 'Send an account and a note.');
  const text = b.text.trim().slice(0, MAX_NOTE), now = new Date().toISOString();
  const res = await db.prepare('UPDATE accounts SET note = ? WHERE id = ? AND family_id = ?').bind(text, b.accountId, user.family_id).run();
  if (!res.meta.changes) return deny(400, 'That account is not yours to change.');
  await db.prepare('INSERT INTO notes_log (family_id, account_id, text, noted_by, noted_at) VALUES (?, ?, ?, ?, ?)').bind(user.family_id, b.accountId, text, user.email, now).run();
  return json({ ok: true });
}

async function getReview(db) {
  const requests = (await db.prepare(REQ_SELECT + ' ORDER BY r.id').all()).results;
  const notes = (await db.prepare(`SELECT n.text, n.noted_by AS "by", n.noted_at AS "when", a.name AS account, f.name AS familyName
    FROM notes_log n JOIN accounts a ON a.id = n.account_id JOIN families f ON f.id = n.family_id ORDER BY n.id DESC LIMIT 50`).all()).results;
  return json({ requests, notes });
}

async function postDecide(db, user, request) {
  const b = await body(request);
  if (!b || !Array.isArray(b.ids) || !b.ids.length || b.ids.length > 100 || !b.ids.every(Number.isInteger)) return deny(400, 'Pick at least one request.');
  if (b.decision !== 'approve' && b.decision !== 'decline') return deny(400, 'Decision must be approve or decline.');
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, MAX_NOTE) : '';
  const now = new Date().toISOString(), done = [], skipped = [];
  for (const id of b.ids) {
    const r = await db.prepare("SELECT id, account_id, field, from_value, to_value FROM requests WHERE id = ? AND status = 'wait'").bind(id).first();
    if (!r || !FIELDS.includes(r.field)) { skipped.push({ id, why: 'Already decided.' }); continue; }
    if (b.decision === 'decline') {
      await db.prepare("UPDATE requests SET status = 'no', decided_at = ?, decided_by = ?, reason = ? WHERE id = ? AND status = 'wait'").bind(now, user.email, reason, id).run();
      done.push(id); continue;
    }
    const col = r.field; // one of FIELDS, checked above, so safe to use as a column name
    // Both statements run together. The account only changes if it still holds the value the client saw.
    const [, marked] = await db.batch([
      db.prepare(`UPDATE accounts SET ${col} = ? WHERE id = ? AND ${col} = ?`).bind(r.to_value, r.account_id, r.from_value),
      db.prepare(`UPDATE requests SET status = 'ok', decided_at = ?, decided_by = ?, reason = ? WHERE id = ? AND status = 'wait' AND (SELECT ${col} FROM accounts WHERE id = ?) = ?`)
        .bind(now, user.email, reason, id, r.account_id, r.to_value),
    ]);
    if (marked.meta.changes) done.push(id);
    else skipped.push({ id, why: 'The account was changed after this request was made. Review it again.' });
  }
  return json({ ok: true, done, skipped });
}

const notSetUp = (email) => new Response(
  `<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Alethes Client Portal</title>
<body style="font:16px/1.5 Arial,sans-serif;background:#FBF7EF;color:#26343D;max-width:560px;margin:12vh auto;padding:0 20px">
<h1 style="font:400 28px Georgia,serif;color:#14213D">This email isn't set up for the portal</h1>
<p>You signed in as ${email.replace(/[<>&"]/g, '')}, which isn't linked to a client family. Contact Alethes Financial and we'll sort it out.</p></body>`,
  { status: 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const email = await emailFromAccess(request, env);
    if (!email) return new Response('Sign-in required.', { status: 403, headers: { 'cache-control': 'no-store' } });
    const user = await env.DB.prepare('SELECT email, role, family_id FROM users WHERE email = ?').bind(email).first();
    if (!user) return url.pathname.startsWith('/api/') ? deny(403, 'This email is not set up for the portal.') : notSetUp(email);

    if (url.pathname.startsWith('/api/')) {
      const route = request.method + ' ' + url.pathname;
      if (request.method !== 'GET' && !isOwnWrite(request)) return deny(403, 'This change did not come from the portal page.');
      if (route === 'GET /api/portal') return getPortal(env.DB, user, url, env);
      if (route === 'POST /api/requests') return postRequests(env.DB, user, request);
      if (route === 'POST /api/notes') return postNote(env.DB, user, request);
      if (url.pathname.startsWith('/api/review')) {
        if (user.role !== 'staff') return deny(403, 'Staff only.');
        if (route === 'GET /api/review') return getReview(env.DB);
        if (route === 'POST /api/review/decide') return postDecide(env.DB, user, request);
      }
      return deny(404, 'Not found.');
    }
    return env.ASSETS.fetch(request);
  },
};

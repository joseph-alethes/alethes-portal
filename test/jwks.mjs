import http from 'node:http'; import fs from 'node:fs';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
const k = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(k.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
http.createServer((q, r) => { r.setHeader('content-type', 'application/json'); r.end(JSON.stringify({ keys: [jwk] })); }).listen(8799);
const t = (e) => new SignJWT({ email: e }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer('http://127.0.0.1:8799').setAudience('test-aud').setIssuedAt().setExpirationTime('1h').sign(k.privateKey);
fs.writeFileSync('test/tokens.json', JSON.stringify({ harbor: await t('harbor.test@example.com'), whitlock: await t('whitlock.test@example.com'), staff: await t('staff.test@example.com') }));
console.log('ready');

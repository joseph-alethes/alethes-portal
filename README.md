# Alethes client portal

Cloudflare Worker for the Alethes Financial client portal. **Test build: invented families only, no client data.**

- `src/index.js` – the Worker. Checks the Cloudflare Access sign-in on every request, maps the signed-in email to a family (or staff) from the `users` table, and returns only that family's data.
- `public/` – the portal pages (built by `ui/build.py`).
- `db/schema.sql` – database tables. `db/seed.sql` – two invented families for testing.
- `test/run.mjs` – sign-in, family-separation and approval tests (`wrangler dev --local` with a stand-in sign-in service).
- `wrangler.jsonc` – Cloudflare settings. `TEAM_DOMAIN` and `POLICY_AUD` come from the Cloudflare Access application; the portal refuses every request until both are set.

Real user emails are never stored in this repository. They are added to the `users` table in Cloudflare.

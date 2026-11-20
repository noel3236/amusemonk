---
name: open-work
description: amusemonk's unfinished work as of 2026-11-20 - production go-live, open product questions, unbuilt features, doc drift between CONTEXT.md and code, small loose ends
metadata:
  type: project
---

# amusemonk: open work (as of 2026-11-20)

No `TODO`/`FIXME` markers exist in `src/`, `tests/`, `deploy/`, `scripts/` or `migrations/` (grep, 2026-11-20). The
items below come from CONTEXT.md, the project log, `~/Desktop/noel/TODO.md` and reading the code.

## Blocking production
- **Rebuild AWS** (torn down 2026-11-12, D-48). User said production starts "next month", i.e. around December 2026.
  Checklist: `operations.md` → Rebuild checklist. Ask the region first.
- **Gateway URLs for the prods**: `fintech` and `galaxy` stay off until the user sends each production gateway URL
  (`/amusemonk/<env>/GATEWAY_BASE_URL`). Nothing about what those gateways are is recorded.
- **logmania agent config** must be re-created (`agents/amusemonk.conf` was deleted in logmania `e52f0d8`, 2026-11-13).
- **DNS**: Namecheap A records must be pointed at the new Elastic IP by the user.
- Before a prod goes live, CONTEXT §11 asks the product owner to confirm D-1 (`beneficiary_name` column) and the
  default limits (₹2,00,000 per payout, ₹1 crore per file, 7-day date window).

## Repo hygiene
- `README.md` is **untracked** (written 2026-11-01). Commit it (needs the user's go; noel identity, `github-work` alias).
- `~/Desktop/noel/TODO.md` (2026-11-17): move the build to GitHub Actions → GHCR (`ghcr.io/noel3236/amusemonk-<image>`)
  like opsmania, and switch `scripts/deploy.sh` to pull instead of building on the laptop. Would replace ECR.
- `.env.example` comment still says ``pnpm checks`` (now `pnpm test`).

## Open product questions (CONTEXT §11 and notes)
1. Confirm D-1 (required `beneficiary_name`).
2. Confirm default limits.
3. Should an admin be able to cancel `PENDING` payouts of a confirmed file before dispatch? Not built.
4. Sandbox vs production credentials and base URLs (prod part still open).
5. D-3: is "same account + amount + date twice" ever legitimate? If yes, add a column such as `invoice_number` to the
   fingerprint.
- Rotating VPN exit ⇒ per-user keys can't be IP-whitelisted (keys use `*`). Open since 2026-10-29.
- Feedback note: "row moving" was read as column moving; confirm with the user if rows were meant.

## Not built (deliberately deferred)
- **Webhooks** (D-31): `webhook_events` table exists (migration 0004) and CONTEXT §6.3 describes the handler
  (`POST /webhooks/gateway/payout`, HMAC over the raw body, triggers a poll only), but no route exists. Status comes
  from polling.
- **Admin revoke at the gateway** (D-24): blocked by the atlas bug in `PATCH /api/v3/gatekeeper/admin/api_keys/:id`
  (looks up `declared_params[:kid]`, always 404). Per the notes it was not yet reported to atlas's owners.
- In-app retry of an `insufficient_balance` failure: by design impossible (D-18).

## CONTEXT.md drift (legacy text from the source app, not true of the port)
CONTEXT's header says "Sections not yet re-verified against the port are marked (legacy)", but these are not marked:
- §3: sample file is `samples/payout_sample.csv` / `GET /samples/payout_sample.csv`; the port serves `/files/sample.csv`.
- §9.1.1: "Test connection in `/admin/settings`", `gateway_settings`, `credentials/sandbox.md`, `npm run samples` /
  `test-data/` — none exist in the port (no settings screen by decision). The base URL question there is answered by
  the code: UAPI is `{GATEWAY_BASE_URL}/uapi/v1/peatio`, gatekeeper is `{GATEWAY_BASE_URL}/api/v3/gatekeeper`.
- §9.2: `gateway_balance` singleton and a `/api/balance` 5 s poll; the port has per-user `user_balances`, refreshed on
  dispatch, ingest, approval and key generation, and no `/api/balance` route.
- §6.1 step 4: 401/403 → `UNKNOWN` and 503 → stay `DISPATCHING`; the code defers to `PENDING` (60 s / 2 s). Safe either
  way (nothing was created), but spec and code disagree.
- §10 still lists D-5 (Postgres), D-6 (`RUN_WORKER`), D-13, D-16 (`FOUR_EYES`) without "superseded" marks.
- §12 test count (94) predates later commits that added tests (`b934986`, `35524ae`, `622e3ba`); re-count when next run.

## Small observations from reading the code
- A password-only login calls gatekeeper's session endpoint twice (probe in `login/actions.ts`, then `authorize`).
- `approveFile` reads the live balance through the VPN while holding `FOR UPDATE` on the file row (fine at current
  volume; worth knowing if approvals get slow).
- The circuit breaker is per worker process and in memory; with several workers each learns a bad key separately.
- All environments share the instance role, so bucket separation is by configuration, not IAM (CONTEXT §14).
- The owner's IP appears in `amusemonk-project.md` (SSH rule); leave it out of anything published.

Related: [[operations]], [[decisions]], [[product]].

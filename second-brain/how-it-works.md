---
name: how-it-works
description: How amusemonk's key flows are built (sign-in, VPN egress, key generation, ingest + rules, confirm, worker dispatch/poll/reconcile, lists, deploy) with the files that implement each
metadata:
  type: project
---

# amusemonk: how it works

Paths are relative to `~/Desktop/noel/amusemonk/`. CONTEXT.md §4–§9 is the spec; this note maps it to code and flags
where the code differs from the spec.

## 1. Sign-in
1. `src/app/(auth)/login/actions.ts` `authenticate`: without an OTP it first **probes** gatekeeper
   (`gatekeeperLogin`) to learn whether 2FA is needed (`OTP_REQUIRED` → show the OTP step).
2. Then `signIn('credentials')` → `src/auth/index.ts` `authorize` calls `gatekeeperLogin` again
   (`src/auth/gatekeeper.ts`, `POST /api/v3/gatekeeper/identity/sessions`, 20 s timeout, via VPN), refuses
   non-`active` users, and upserts the local `users` row (`src/db/users.ts`).
3. The JWT keeps `userId`, gatekeeper `uid`, `role`, the gatekeeper cookie and CSRF token; the session sent to the
   browser exposes only id, email and role. `src/auth/session.ts` reads the gatekeeper creds back from the JWT for
   server-side gatekeeper calls (`gatekeeperCall`).
4. `src/app/(app)/layout.tsx` redirects to `/login` if there is no session **or the user row is gone** (e.g. after a
   database reset). `src/app/(app)/admin/layout.tsx` 404s non-super-admins. Logout also deletes the gatekeeper session.
- Note: a password-only login calls gatekeeper's session endpoint twice (probe, then `authorize`).

## 2. Egress through the VPN
- `src/lib/egress.ts` `outboundFetch` = undici `fetch` with a `ProxyAgent(EGRESS_PROXY_URL)`. It is the only outbound
  path; ESLint `no-restricted-globals` bans `fetch` elsewhere in `src/`.
- Locally the proxy is either gluetun (`docker compose --profile vpn up vpn`, Proton OpenVPN TCP, India/Singapore) or
  `direct-proxy` (tinyproxy in alpine, profile `novpn`) on `127.0.0.1:8888`. In prod the app containers use
  `http://vpn:8888` (`deploy/compose.prod.yml`, gluetun with `FIREWALL_INPUT_PORTS: '8888'`).
- S3 and RDS do not use it (D-28).

## 3. Payout key generation and storage
- UI: `src/features/api-keys/connect-card.tsx` (`GenerateKeyForm`, 2FA-first gate), `gateway-keys.tsx` (list of every
  gateway key, Revoke/Delete dialogs).
- `src/features/api-keys/actions.ts`:
  - `generateKeyAction`: 6-digit code → refuses if a key is active → `createGatewayKey` (`src/features/profile/server.ts`,
    `POST /resource/api_keys` with `otp_code`, `scope: 'uapi'`, `whitelisted_ips: ['*']`) → `storeNewKey` with
    `origin: 'generated'` → first balance read. If storing fails the key stays on the gateway unconnected (its secret
    is lost; deleting needs a fresh 2FA code), and the user is told so.
  - `revokeKeyInUseAction`: a generated key is also `DELETE /resource/api_keys/:kid` at the gateway; a pasted one is
    only marked revoked. `deleteKeyAction` deletes any other key (refuses the in-use one). Gateway 404 counts as done.
  - `revokeKeyAction` (admin): local `status = 'revoked'` only (D-24).
- `src/features/api-keys/server.ts`: `storeNewKey` revokes the current active key and inserts the new one in one
  transaction (the `active_user_id` unique key enforces one active key); `activeCredentials` decrypts with AAD
  `user_api_keys:<kid>` (`src/lib/crypto.ts`).
- 2FA and password: `src/features/profile/{server,actions}.ts` (`POST /resource/totp`, `PATCH /resource/totp/enable|disable`,
  `PUT /resource/users/password`, `GET /resource/users/me`), dialogs in `two-factor-dialog.tsx`, `password-dialog.tsx`.
  Gatekeeper error codes → messages in `gatekeeperMessage`.

## 4. Upload and the all-or-nothing ingest
- UI: `src/features/ingest/upload-dialog.tsx` → server action `uploadFileAction` (`src/features/ingest/actions.ts`):
  checks session and `.csv`/`.xlsx`, calls `ingestFile`, and on accept returns a review (first 100 rows, warnings,
  balance snapshot) that the same modal shows with `FileDecision` (`src/features/files/file-decision.tsx`).
- `src/features/ingest/service.ts` `ingestFile`, in order:
  1. empty file / over the 20 MB hard cap (`src/lib/limits.ts`) → reject;
  2. `loadRuleset(userId)` (`src/features/rules/server.ts`): enabled rules + the user's limit overrides; a rule whose
     stored params don't parse rejects every upload (`RULES_MISCONFIGURED`);
  3. `max_file_size`; user must have an active key (`NO_GATEWAY_KEY`);
  4. store raw bytes (`src/lib/storage.ts`, `uploads/<user>/<attempt>/<name>`), failure → `STORAGE_UNAVAILABLE`;
  5. `parseUpload` (`parse.ts`: CSV with BOM handling, XLSX first sheet, headers trimmed + lower-cased, trailing blank
     rows dropped, middle blank rows kept to be flagged);
  6. `validateParsedFile` (`validate.ts`): header set, row count, every row (all errors at once), in-file duplicate
     references and fingerprints, per-account count, file total, custom rules; `date_window` uses today in IST;
  7. under `GET_LOCK('amusemonk_ingest:<userId>', 30)`: cross-file checks against **this user's** files (filename,
     bytes, canonical content if enabled; reference and fingerprint always), `balance_check` (live balance − the user's
     in-flight payouts; unreadable balance ⇒ reject), look-alike warnings (`similar_files`), then one transaction
     inserting `payout_files` + `payouts` in chunks of 500. A unique-key error re-runs the cross-file check to explain it.
  8. Every outcome writes an `upload_attempts` row (errors capped at 500).
- Fingerprints (`fingerprint.ts`): payment = sha256 of `account|IFSC|paise|date`; canonical content = sha256 of the
  sorted canonical rows (so re-saved, reordered or converted files match); filename normalised (path stripped, trimmed,
  lower-case, whitespace collapsed).
- Rule catalog and param schemas: `src/features/rules/catalog.ts` (client-safe). Rules screen:
  `src/features/rules/rule-controls.tsx`, actions in `src/features/rules/actions.ts`; every change audited.

## 5. Confirm, cancel, admin reject
- `src/features/files/actions.ts` `confirmPaymentAction`: if the file carries a `SIMILAR_FILES` warning the
  "not a repeat" flag is required → `approveFile` (`src/features/files/approval.ts`): `SELECT … FOR UPDATE` on the
  file, must be the owner and `AWAITING_APPROVAL`, live balance − the user's approved in-flight payouts must cover the
  total, then `approved_at` set, status `ACCEPTED`, its PENDING payouts made due now.
- `cancelFile`: only while `AWAITING_APPROVAL`; payouts → `CANCELLED`; references stay consumed.
- `src/features/files/admin.ts` `rejectFileByAdmin`: same window; file → `REJECTED` with a reason.

## 6. Worker: dispatch (`src/worker/dispatcher.ts`)
- **Claim** (READ COMMITTED, ≤3 retries on `ER_LOCK_DEADLOCK`): `PENDING` payouts that are due, of files with
  `approved_at` set and not cancelled/rejected, users whose circuit isn't open; `FOR UPDATE OF p SKIP LOCKED`
  (locks payout rows only, never the file row). Users without an active key are pushed back 5 min
  (`BALANCE_BACKOFF_SECONDS`). Claimed rows → `DISPATCHING` with `locked_by = workerId`; an attempt row is created, or
  the current one reused if it never reached the create call (`STARTED`/`DEFERRED`).
- Per payout: circuit open → defer 60 s; **check before create** (`findByClientReference`; found ⇒ adopt and stop;
  401/403 opens the user's circuit); balance read (`refreshBalance`), minus what this batch already sent for that user;
  short ⇒ defer 5 min (reference untouched); store `request_json`; `createPayout`.
- Create outcome (`classifyCreateResponse` in `src/gateway/client.ts`) → action:
  | Gateway answer | Code does |
  |---|---|
  | 200/201 with `payout_id` | apply the payout (→ `PROCESSING` or terminal), attempt `CREATED` |
  | 422 `duplicate_reference_id` | adopt via status lookup; if not found → `UNKNOWN` (10 s) |
  | 422 `create_in_processing` | `UNKNOWN`, re-check in 10 s |
  | 422 `insufficient_balance` | `FAILED` (reference consumed, D-18) |
  | other 400/422 | `FAILED` with the codes |
  | 401/403 | open the user's 5-min circuit, **defer to `PENDING` 60 s** |
  | 503 | **defer to `PENDING` 2 s** |
  | 5xx / timeout / network / 2xx without id | `UNKNOWN` (10 s); the reconciler asks the status API |
  | our own exception after claim | row left `DISPATCHING` for the reconciler |
  Spec drift: CONTEXT §6.1 says 401/403 → `UNKNOWN` and 503 → stay `DISPATCHING`; the code's defer is safe because
  nothing was created in either case.
- Circuit breaker: `src/worker/circuit.ts`, in-memory per worker process, keyed by user, 5 minutes.
- Rate limit: token bucket per key id in `src/gateway/rate-limiter.ts` (`GATEWAY_MAX_RPS`, default 5; gateway limit 20).

## 7. Worker: poll and reconcile
- `src/worker/poller.ts` (every 30 s, ≤100 rows): `PROCESSING` rows due, plus `SUCCEEDED` rows completed within
  `REFUND_WATCH_DAYS` (3). Looks up by reference, then by gateway payout id. Not found ⇒ never guess, log loudly, back
  off. Changes recompute the file status.
- `src/worker/status.ts`: `mapGatewayStatus` (`succeed→SUCCEEDED`, `rejected→FAILED`, `refunded→REFUNDED`, anything else
  `PROCESSING`); `applyGatewayPayout` stores the full JSON (`gateway_response_json`), status code/message, UTR, sets
  next poll (SUCCEEDED: +1 day while watching for refunds; other terminal: never; else backoff
  `min(600, 30·2^min(failures,5))` s); `recomputeFileStatus` derives the file status in one SQL `UPDATE … JOIN`
  (keeps `AWAITING_APPROVAL`/`CANCELLED`/`REJECTED`; `ACCEPTED` while nothing was touched; then PROCESSING /
  COMPLETED / FAILED / COMPLETED_WITH_FAILURES).
- `src/worker/reconciler.ts` (every 60 s, ≤50 rows): `UNKNOWN` rows due and `DISPATCHING` rows locked longer than
  `STUCK_AFTER_SECONDS` (120). Found at the gateway ⇒ adopt; empty answer ⇒ back to `PENDING` with the **same**
  reference (so even a late create is caught by the gateway's idempotency).
- `src/worker/main.ts`: `setInterval` loops that never overlap themselves; SIGTERM/SIGINT waits up to 25 s for in-flight
  jobs (compose `stop_grace_period: 30s`).
- "Fetch status" button: `fetchPayoutStatusAction` → `src/worker/refresh.ts` `refreshPayout` (read-only, owner only).
  "Raw": `payoutRawAction` returns the latest status JSON plus every initiate attempt (owner or super admin).

## 8. Lists, filters, tables, time
- Each list is described once by a `ListSpec` (`src/features/files/specs.ts`: `PAYOUTS_SPEC`, `FILE_PAYOUTS_SPEC`,
  `FILES_SPEC`, `ADMIN_FILES_SPEC`, `USERS_SPEC`) read by both the query (`src/features/files/lists.ts`,
  `src/features/users/admin.ts`; parsing in `src/lib/list-params.ts`) and the controls
  (`src/ui/filters/list-filters.tsx`, URL state via `use-url-filters.ts`). Unknown values are dropped; LIKE is escaped.
- `src/ui/data/data-table.tsx` + `use-column-prefs.ts`: pinned/ordered columns in `localStorage`
  (`amusemonk:pinned:<table>`, `amusemonk:order:<table>`).
- Time: `src/lib/timezones.ts` (zones, `BUSINESS_ZONE = Asia/Kolkata`, cookie `amusemonk-tz`), `src/lib/viewer-zone.ts`,
  `src/ui/time/` (`<Time>`, zone picker, provider). Header refresh = `router.refresh()` (`src/ui/shell/refresh-button.tsx`);
  pages auto-refresh with `src/ui/auto-refresh.tsx` (file page 3 s while paying, dashboard 20 s while in flight).

## 9. Downloads
Route handlers check access themselves (`src/features/files/access.ts`; the layout redirect doesn't cover them):
`files/[id]/status.csv` (original columns + status, UTR, gateway id, codes, attempts, last update in IST),
`files/[id]/original` (stored bytes), `uploads/[id]/errors.csv`, `files/sample.csv`. `src/lib/csv.ts` quotes per RFC
4180, prefixes `'` on cells starting with `= + - @ tab CR` (formula injection), adds a BOM, `Cache-Control: no-store`.

## 10. Migrations
`src/db/migrate.ts` (`pnpm migrate`; in prod run inside the worker image with the admin URL): `GET_LOCK('amusemonk_migrate', 60)`,
creates `schema_migrations`, applies `migrations/*.sql` not yet recorded in name order with `multipleStatements`, and
records a file only after all of it succeeded. MySQL DDL isn't transactional: a half-applied file must be repaired by
hand. Forward-only; no down migrations.

## 11. Build and deploy pipeline
- `Dockerfile`: `deps` (pnpm frozen lockfile) → `build` (`next build` with a placeholder `AUTH_SECRET`) → `web`
  (standalone server, user `node`) and `worker` (node_modules + `src` + `migrations`, run by `tsx`). Both carry
  `org.opencontainers.image.revision` and `APP_REVISION`.
- `scripts/deploy.sh <env>` (laptop, AWS creds in env, `REGION=us-east-1`): refuses a dirty tree except
  `ALLOW_DIRTY=1` for sandbox (`<sha>-dirty`); sandbox builds arm64 images with buildx and pushes to ECR
  `amusemonk-web`/`amusemonk-worker:<sha12>`; prods only check the images exist (so they went to sandbox first);
  bundles `deploy/` (`git archive`, or `tar` with root uid/gid for dirty) to `s3://<DEPLOY_BUCKET>/deploy/<rev>.tgz`;
  finds the instance by tag `Name=amusemonk`; runs it via SSM `AWS-RunShellScript` and waits.
- `deploy/box-deploy.sh <env> <rev>` (on the box, IMDSv2): writes `<env>.env` from SSM `/amusemonk/<env>/` (refuses if
  `GATEWAY_BASE_URL` is missing ⇒ env stays off), updates `revisions` (one `<ENV>_REVISION=` line per deployed env),
  writes `.env` (shared VPN params, registry, revisions, `COMPOSE_PROFILES` = deployed envs), writes
  `caddy/routes/<env>.caddy` (`reverse_proxy <env>-web:3400` or `respond "Not live yet." 503`), pulls, runs migrations
  with `/amusemonk/admin/<env>/MIGRATE_DATABASE_URL`, `up -d`, `caddy reload`, then fails unless both containers carry
  the expected revision label.
- `deploy/caddy/Caddyfile`: shared security headers, scanner-probe 404s (`/.env*`, `/.git*`, `*.php`, `/actuator*`, …),
  `X-Robots-Tag: noindex` on sandbox, strict CSP for the landing site, `www` → apex 301.

## 12. Tests
`vitest.config.mts` forces `DATABASE_URL = TEST_DATABASE_URL` (or deletes it), runs files serially, sets local storage
in the OS temp dir. `tests/helpers/global-setup.ts` migrates the test DB; `tests/helpers/db.ts` `requireTestDatabase()`
refuses any other DB and makes run-unique fixtures; `tests/helpers/fake-gateway.ts` is an in-memory UAPI following the
sandbox's first-digit rule (0–2 succeed, 3 processing forever, 4/5/6/9 fail) with injectable faults (500 created /
not created, timeout created / not created, crash after create, gateway insufficient). Coverage map: CONTEXT §12.

## 13. Landing page
`deploy/caddy/site/` (`index.html`, `site.css`, `demo.js`, self-hosted Manrope + Plex Mono). The demo is pure
client-side JS formatting USD; it never calls an environment. Preview locally with the `landing` launch entry (:3401).

Related: [[architecture]], [[operations]], [[decisions]].
